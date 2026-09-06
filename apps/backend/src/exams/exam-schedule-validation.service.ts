import { Injectable, NotFoundException } from '@nestjs/common';
import { ExamPartType, ExamScope } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { checkQuestionStructure } from '../questions/question-structure';
import {
  PRACTICAL_MAX_FILES,
  PRACTICAL_MAX_TOTAL_SIZE_BYTES,
} from './dto/upsert-exam-part.dto';

/** 예약을 막는 결함 한 건이다. */
export type ExamScheduleValidationIssue = {
  code:
    | 'SCOPE_SUBJECT_COUNT'
    | 'SUBJECT_INACTIVE'
    | 'NO_CLASS_TARGETS'
    | 'CLASS_TARGET_OUTSIDE_OFFERING'
    | 'NO_PARTS'
    | 'WRITTEN_NO_QUESTIONS'
    | 'WRITTEN_SCORE_MISMATCH'
    | 'PRACTICAL_NO_CRITERIA'
    | 'PRACTICAL_SCORE_MISMATCH'
    | 'QUESTION_STRUCTURE_INVALID'
    | 'PRACTICAL_FILE_LIMIT_EXCEEDS_POLICY';
  part: ExamPartType | null;
  questionId: string | null;
  message: string;
};

export type ExamScheduleValidationResult = {
  examId: string;
  valid: boolean;
  issues: ExamScheduleValidationIssue[];
};

const VALIDATION_INCLUDE = {
  subjects: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: { select: { id: true, name: true, active: true } },
        },
      },
    },
  },
  classTargets: { select: { classId: true } },
  parts: {
    include: {
      questions: {
        select: {
          id: true,
          type: true,
          prompt: true,
          score: true,
          options: { select: { isCorrect: true } },
          acceptedAnswers: { select: { id: true } },
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
 * 시험을 `DRAFT`에서 예약 상태로 바꿔도 되는지 기획안 §14.9 항목으로 검사한다.
 *
 * 접근 권한은 여기서 보지 않는다. 호출자(예약 API, 이후 취소 시험 복제)가 각자
 * 권한을 확인한 뒤 이 순수 검증을 부른다. 실패 사유는 "어느 파트의 무엇이 몇
 * 점 모자란지"까지 담은 항목별 배열로 돌려준다.
 *
 * 실제 시험의 `opens_at`·`closes_at`을 파트 봉투에 맞추는 일은 예약 API가
 * 트랜잭션 안에서 처리하므로(§14.4 "맞춘다") 여기서는 검사하지 않는다.
 */
@Injectable()
export class ExamScheduleValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(examId: string): Promise<ExamScheduleValidationResult> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: VALIDATION_INCLUDE,
    });
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    const issues: ExamScheduleValidationIssue[] = [];

    // 1. scope 규칙과 과목 활성 여부
    const subjectCount = exam.subjects.length;
    if (exam.scope === ExamScope.SUBJECT && subjectCount !== 1) {
      issues.push({
        code: 'SCOPE_SUBJECT_COUNT',
        part: null,
        questionId: null,
        message: `과목형 시험은 과목이 정확히 1개여야 하는데 ${subjectCount}개입니다.`,
      });
    }
    if (exam.scope === ExamScope.COMPREHENSIVE && subjectCount < 1) {
      issues.push({
        code: 'SCOPE_SUBJECT_COUNT',
        part: null,
        questionId: null,
        message: '종합형 시험은 과목이 1개 이상이어야 합니다.',
      });
    }
    for (const link of exam.subjects) {
      if (!link.courseOfferingSubject.subject.active) {
        issues.push({
          code: 'SUBJECT_INACTIVE',
          part: null,
          questionId: null,
          message: `비활성 과목 "${link.courseOfferingSubject.subject.name}"이(가) 포함되어 있습니다.`,
        });
      }
    }

    // 2. 대상 반 1개 이상, 모두 시험의 개설 강의 소속
    if (exam.classTargets.length === 0) {
      issues.push({
        code: 'NO_CLASS_TARGETS',
        part: null,
        questionId: null,
        message: '대상 반이 최소 1개 필요합니다.',
      });
    } else {
      const classIds = exam.classTargets.map((target) => target.classId);
      const linked = await this.prisma.classProgram.count({
        where: {
          courseOfferingId: exam.courseOfferingId,
          classId: { in: classIds },
        },
      });
      if (linked !== classIds.length) {
        issues.push({
          code: 'CLASS_TARGET_OUTSIDE_OFFERING',
          part: null,
          questionId: null,
          message: '시험의 개설 강의에 속하지 않은 대상 반이 있습니다.',
        });
      }
    }

    // 3. 필기 또는 실기 파트가 1개 이상
    if (exam.parts.length === 0) {
      issues.push({
        code: 'NO_PARTS',
        part: null,
        questionId: null,
        message: '필기 또는 실기 파트가 최소 1개 필요합니다.',
      });
    }

    const writtenPart = exam.parts.find(
      (part) => part.type === ExamPartType.WRITTEN,
    );
    const practicalPart = exam.parts.find(
      (part) => part.type === ExamPartType.PRACTICAL,
    );

    // 4. 필기 파트: 문제 1개 이상, 배점 합계 = 총점, 유형별 구조
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

      for (const question of writtenPart.questions) {
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
            message: `"${this.previewPrompt(question.prompt)}" 문제가 유형 규칙에 어긋납니다: ${structureError}`,
          });
        }
      }
    }

    // 5. 실기 파트: 평가 항목 1개 이상, 최대 점수 합계 = 총점
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

      // 6. 실기 파일 제한이 시스템 정책 상한을 넘지 않는다(파일당 크기는 CHECK가 고정).
      const maxFiles = practicalPart.maxFiles ?? PRACTICAL_MAX_FILES;
      const maxTotal =
        practicalPart.maxTotalSizeBytes === null
          ? PRACTICAL_MAX_TOTAL_SIZE_BYTES
          : Number(practicalPart.maxTotalSizeBytes);
      if (
        maxFiles > PRACTICAL_MAX_FILES ||
        maxTotal > PRACTICAL_MAX_TOTAL_SIZE_BYTES
      ) {
        issues.push({
          code: 'PRACTICAL_FILE_LIMIT_EXCEEDS_POLICY',
          part: ExamPartType.PRACTICAL,
          questionId: null,
          message: `실기 파일 제한이 시스템 정책 상한(최대 ${PRACTICAL_MAX_FILES}장, 총 ${PRACTICAL_MAX_TOTAL_SIZE_BYTES}바이트)을 넘습니다.`,
        });
      }
    }

    return { examId, valid: issues.length === 0, issues };
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
