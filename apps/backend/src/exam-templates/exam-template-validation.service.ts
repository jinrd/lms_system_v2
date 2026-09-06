import { Injectable, NotFoundException } from '@nestjs/common';
import { ExamPartType, ExamScope } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { checkQuestionStructure } from '../questions/question-structure';

/** 활성화를 막는 결함 한 건이다. */
export type ExamTemplateValidationIssue = {
  /** 기계 판독용 사유 코드다. */
  code:
    | 'SCOPE_SUBJECT_COUNT'
    | 'SUBJECT_INACTIVE'
    | 'NO_PARTS'
    | 'WRITTEN_NO_QUESTIONS'
    | 'WRITTEN_SCORE_MISMATCH'
    | 'PRACTICAL_NO_CRITERIA'
    | 'PRACTICAL_SCORE_MISMATCH'
    | 'QUESTION_STRUCTURE_INVALID'
    | 'QUESTION_INACTIVE';
  /** 관련 파트 유형이다. 파트와 무관한 결함(과목 등)은 `null`이다. */
  part: ExamPartType | null;
  /** 관련 문제 식별자다. 문제와 무관한 결함은 `null`이다. */
  questionId: string | null;
  /** 사람이 읽는 사유다. 몇 점이 모자란지 등 수치를 담는다. */
  message: string;
};

export type ExamTemplateValidationResult = {
  templateId: string;
  valid: boolean;
  issues: ExamTemplateValidationIssue[];
};

const VALIDATION_INCLUDE = {
  subjects: {
    include: { subject: { select: { id: true, name: true, active: true } } },
  },
  parts: {
    include: {
      questions: {
        include: {
          question: {
            select: {
              id: true,
              type: true,
              active: true,
              prompt: true,
              options: { select: { isCorrect: true } },
              acceptedAnswers: { select: { id: true } },
            },
          },
        },
      },
      practicalCriteria: { select: { id: true, maxScore: true } },
    },
  },
} as const;

/** 소수 둘째 자리까지만 남긴다. Decimal(6,2) 합산의 부동소수 오차를 없앤다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function partLabel(type: ExamPartType): string {
  return type === ExamPartType.WRITTEN ? '필기' : '실기';
}

/**
 * 시험 템플릿을 활성화해도 되는지 기획안 §13.6 전체 항목으로 검사한다.
 *
 * 접근 권한은 여기서 보지 않는다. 호출자(활성화 API, 이후 실제 시험 예약·복제
 * 작업)가 각자 권한을 확인한 뒤 이 순수 검증을 부른다. 실패 사유는 "어느 파트의
 * 무엇이 몇 점 모자란지"까지 담은 항목별 배열로 돌려준다.
 */
@Injectable()
export class ExamTemplateValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(templateId: string): Promise<ExamTemplateValidationResult> {
    const template = await this.prisma.examTemplate.findUnique({
      where: { id: templateId },
      include: VALIDATION_INCLUDE,
    });
    if (!template) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const issues: ExamTemplateValidationIssue[] = [];

    // 1. scope 규칙과 과목 활성 여부
    const subjectCount = template.subjects.length;
    if (template.scope === ExamScope.SUBJECT && subjectCount !== 1) {
      issues.push({
        code: 'SCOPE_SUBJECT_COUNT',
        part: null,
        questionId: null,
        message: `과목형 템플릿은 과목이 정확히 1개여야 하는데 ${subjectCount}개입니다.`,
      });
    }
    if (template.scope === ExamScope.COMPREHENSIVE && subjectCount < 1) {
      issues.push({
        code: 'SCOPE_SUBJECT_COUNT',
        part: null,
        questionId: null,
        message: '종합형 템플릿은 과목이 1개 이상이어야 합니다.',
      });
    }
    for (const link of template.subjects) {
      if (!link.subject.active) {
        issues.push({
          code: 'SUBJECT_INACTIVE',
          part: null,
          questionId: null,
          message: `비활성 과목 "${link.subject.name}"이(가) 포함되어 있습니다.`,
        });
      }
    }

    // 2. 필기 또는 실기 파트가 1개 이상
    if (template.parts.length === 0) {
      issues.push({
        code: 'NO_PARTS',
        part: null,
        questionId: null,
        message: '필기 또는 실기 파트가 최소 1개 필요합니다.',
      });
    }

    const writtenPart = template.parts.find(
      (part) => part.type === ExamPartType.WRITTEN,
    );
    const practicalPart = template.parts.find(
      (part) => part.type === ExamPartType.PRACTICAL,
    );

    // 3. 필기 파트: 문제 1개 이상, 배점 합계 = 총점, 유형 규칙, 문제 활성
    if (writtenPart) {
      const total = Number(writtenPart.totalScore);
      if (writtenPart.questions.length === 0) {
        issues.push({
          code: 'WRITTEN_NO_QUESTIONS',
          part: ExamPartType.WRITTEN,
          questionId: null,
          message: '필기 파트에 담긴 문제가 없습니다.',
        });
      } else {
        const sum = round2(
          writtenPart.questions.reduce(
            (acc, entry) => acc + Number(entry.score),
            0,
          ),
        );
        if (sum !== total) {
          issues.push({
            code: 'WRITTEN_SCORE_MISMATCH',
            part: ExamPartType.WRITTEN,
            questionId: null,
            message: this.scoreMismatchMessage(
              ExamPartType.WRITTEN,
              sum,
              total,
            ),
          });
        }
      }

      for (const entry of writtenPart.questions) {
        const { question } = entry;
        const structureError = checkQuestionStructure({
          type: question.type,
          optionCount: question.options.length,
          correctOptionCount: question.options.filter(
            (option) => option.isCorrect,
          ).length,
          acceptedAnswerCount: question.acceptedAnswers.length,
        });
        if (structureError) {
          issues.push({
            code: 'QUESTION_STRUCTURE_INVALID',
            part: ExamPartType.WRITTEN,
            questionId: question.id,
            message: `"${this.previewPrompt(question.prompt)}" 문제가 문제은행 규칙에 어긋납니다: ${structureError}`,
          });
        }
        if (!question.active) {
          issues.push({
            code: 'QUESTION_INACTIVE',
            part: ExamPartType.WRITTEN,
            questionId: question.id,
            message: `"${this.previewPrompt(question.prompt)}" 문제가 비활성 상태입니다.`,
          });
        }
      }
    }

    // 4. 실기 파트: 평가 항목 1개 이상, 최대 점수 합계 = 총점
    if (practicalPart) {
      const total = Number(practicalPart.totalScore);
      if (practicalPart.practicalCriteria.length === 0) {
        issues.push({
          code: 'PRACTICAL_NO_CRITERIA',
          part: ExamPartType.PRACTICAL,
          questionId: null,
          message: '실기 파트에 평가 항목이 없습니다.',
        });
      } else {
        const sum = round2(
          practicalPart.practicalCriteria.reduce(
            (acc, criterion) => acc + Number(criterion.maxScore),
            0,
          ),
        );
        if (sum !== total) {
          issues.push({
            code: 'PRACTICAL_SCORE_MISMATCH',
            part: ExamPartType.PRACTICAL,
            questionId: null,
            message: this.scoreMismatchMessage(
              ExamPartType.PRACTICAL,
              sum,
              total,
            ),
          });
        }
      }
    }

    return { templateId, valid: issues.length === 0, issues };
  }

  private scoreMismatchMessage(
    type: ExamPartType,
    sum: number,
    total: number,
  ): string {
    const diff = round2(sum - total);
    const direction = diff < 0 ? `${round2(-diff)}점 부족` : `${diff}점 초과`;
    return `${partLabel(type)} 파트 배점 합계가 ${sum}점으로 총점 ${total}점과 다릅니다 (${direction}).`;
  }

  private previewPrompt(prompt: string): string {
    const trimmed = prompt.trim();
    return trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed;
  }
}
