import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import {
  ANSWER_NORMALIZATION_VERSION,
  normalizeAnswer,
} from '../src/common/answer-normalizer';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  SYSTEM_SETTING_DEFAULTS,
  SYSTEM_SETTING_DESCRIPTIONS,
  type SystemSettingKey,
} from '../src/common/system-settings';
import {
  DifficultyLevel,
  EnrollmentStatus,
  EnrollmentType,
  ExamPartType,
  ExamScope,
  ExamStage,
  ExamStatus,
  InquiryStatus,
  InquiryType,
  NoticeScope,
  NoticeType,
  QuestionType,
  SubjectMode,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/** 하루를 밀리초로. 실제 시험 시드에서 파트 시각을 계산할 때 쓴다. */
const DAY_MS = 86_400_000;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL 환경변수가 필요합니다.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const credentials = [
  {
    loginId: 'admin',
    password: 'admin1234',
    name: '관리자',
    role: UserRole.ADMIN,
  },
  {
    loginId: 'manager01',
    password: 'manager1234',
    name: '실장',
    role: UserRole.MANAGER,
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    loginId: `instructor${String(index + 1).padStart(2, '0')}`,
    password: 'instructor1234',
    name: `강사 ${index + 1}`,
    role: UserRole.INSTRUCTOR,
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    loginId: `student${String(index + 1).padStart(2, '0')}`,
    password: 'student1234',
    name: `학생 ${index + 1}`,
    role: UserRole.STUDENT,
  })),
];

/** 문제 유형별 예제와 필기·실기 파트를 갖춘 활성 시험 템플릿 1개를 만든다. */
type QuestionSeed = {
  subjectKey: string;
  type: QuestionType;
  prompt: string;
  difficulty: DifficultyLevel;
  defaultScore: number;
  explanation?: string;
  options?: { content: string; isCorrect: boolean }[];
  acceptedAnswers?: string[];
};

const questionSeeds: QuestionSeed[] = [
  {
    subjectKey: '피부:피부 이론',
    type: QuestionType.SINGLE_CHOICE,
    prompt: '피부의 가장 바깥층은 무엇인가?',
    difficulty: DifficultyLevel.EASY,
    defaultScore: 10,
    explanation: '피부는 바깥에서부터 표피, 진피, 피하지방으로 이루어진다.',
    options: [
      { content: '표피', isCorrect: true },
      { content: '진피', isCorrect: false },
      { content: '피하지방', isCorrect: false },
    ],
  },
  {
    subjectKey: '피부:피부 이론',
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: '진피를 구성하는 단백질 섬유를 모두 고르시오.',
    difficulty: DifficultyLevel.NORMAL,
    defaultScore: 10,
    options: [
      { content: '콜라겐', isCorrect: true },
      { content: '엘라스틴', isCorrect: true },
      { content: '케라틴', isCorrect: false },
      { content: '멜라닌', isCorrect: false },
    ],
  },
  {
    subjectKey: '피부:피부 이론',
    type: QuestionType.SHORT_ANSWER,
    prompt: '표피에서 각질을 만들어 내는 세포의 이름은?',
    difficulty: DifficultyLevel.HARD,
    defaultScore: 10,
    acceptedAnswers: ['각질형성세포', '각질 형성 세포', 'keratinocyte'],
  },
  {
    subjectKey: '피부:각질 제거',
    type: QuestionType.SINGLE_CHOICE,
    prompt: '물리적 각질 제거 방법에 해당하는 것은?',
    difficulty: DifficultyLevel.EASY,
    defaultScore: 10,
    options: [
      { content: '스크럽', isCorrect: true },
      { content: 'AHA 필링', isCorrect: false },
      { content: 'BHA 필링', isCorrect: false },
    ],
  },
  {
    subjectKey: '피부:각질 제거',
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: '화학적 각질 제거에 쓰이는 성분을 모두 고르시오.',
    difficulty: DifficultyLevel.NORMAL,
    defaultScore: 10,
    options: [
      { content: 'AHA', isCorrect: true },
      { content: 'BHA', isCorrect: true },
      { content: 'PHA', isCorrect: true },
      { content: '정제수', isCorrect: false },
    ],
  },
  {
    subjectKey: '피부:각질 제거',
    type: QuestionType.SHORT_ANSWER,
    prompt: '홈 케어에서 각질 제거는 보통 주 몇 회를 권장하는가? (숫자만)',
    difficulty: DifficultyLevel.HARD,
    defaultScore: 10,
    acceptedAnswers: ['1', '1회', '주 1회'],
  },
];

async function seedQuestionBankAndExamTemplate(
  subjectIds: Map<string, string>,
  adminId: string,
): Promise<void> {
  const questionIdsByKey = new Map<string, string[]>();

  for (const item of questionSeeds) {
    const subjectId = subjectIds.get(item.subjectKey)!;

    const data = {
      subjectId,
      type: item.type,
      prompt: item.prompt,
      explanation: item.explanation ?? null,
      defaultScore: item.defaultScore,
      difficulty: item.difficulty,
      active: true,
      createdById: adminId,
    };

    // 문제 본체 + 보기 + 허용 정답을 한 트랜잭션으로 만든다. 유형별 보기·정답
    // 개수 지연 제약 트리거가 커밋 시점에 완성된 상태를 보게 하기 위함이다.
    const questionId = await prisma.$transaction(async (tx) => {
      const existing = await tx.questionBank.findFirst({
        where: { subjectId, prompt: item.prompt },
        select: { id: true },
      });

      // 이미 있으면 그대로 둔다. 진행 중인 시험에 출제된 문제는 편집 잠금
      // 트리거가 막으므로 재실행 시 덮어쓰지 않는 것이 안전하고 멱등하다.
      if (existing) {
        return existing.id;
      }

      const created = await tx.questionBank.create({ data });
      const id = created.id;

      if (item.options) {
        await tx.questionOption.createMany({
          data: item.options.map((option, index) => ({
            questionId: id,
            content: option.content,
            displayOrder: index,
            isCorrect: option.isCorrect,
          })),
        });
      }
      if (item.acceptedAnswers) {
        await tx.questionAcceptedAnswer.createMany({
          data: item.acceptedAnswers.map((answer, index) => ({
            questionId: id,
            answerText: answer,
            normalizedAnswer: normalizeAnswer(answer),
            displayOrder: index,
          })),
        });
      }

      return id;
    });

    const list = questionIdsByKey.get(item.subjectKey) ?? [];
    list.push(questionId);
    questionIdsByKey.set(item.subjectKey, list);
  }

  // 시험 템플릿 1개: 피부 이론 필기. 템플릿은 배점을 갖지 않는다(실제 시험 생성 시 결정).
  const templateName = '피부 이론 정기 시험 (예제)';
  const theoryQuestionIds = questionIdsByKey.get('피부:피부 이론')!;

  const existingTemplate = await prisma.examTemplate.findFirst({
    where: { name: templateName },
    select: { id: true },
  });

  if (existingTemplate) {
    await prisma.examTemplatePart.deleteMany({
      where: { examTemplateId: existingTemplate.id },
    });
    await prisma.examTemplateSubject.deleteMany({
      where: { examTemplateId: existingTemplate.id },
    });
  }

  const templateData = {
    name: templateName,
    description: '문제은행 예제 문제로 구성한 템플릿 샘플이다.',
    scope: ExamScope.SUBJECT,
    stage: ExamStage.REGULAR,
    defaultOpenDays: 7,
    createdById: adminId,
  };
  const template = existingTemplate
    ? await prisma.examTemplate.update({
        where: { id: existingTemplate.id },
        data: templateData,
      })
    : await prisma.examTemplate.create({ data: templateData });

  await prisma.examTemplateSubject.create({
    data: {
      examTemplateId: template.id,
      subjectId: subjectIds.get('피부:피부 이론')!,
    },
  });

  const writtenPart = await prisma.examTemplatePart.create({
    data: {
      examTemplateId: template.id,
      type: ExamPartType.WRITTEN,
      durationMinutes: 60,
      defaultOpenOffsetDays: 0,
      defaultOpenDays: 7,
      instructions: '전 문항 필수 응답이다.',
    },
  });
  await prisma.examTemplateQuestion.createMany({
    data: theoryQuestionIds.map((questionId, index) => ({
      examTemplatePartId: writtenPart.id,
      questionId,
      displayOrder: index,
    })),
  });

  console.log(
    `문제은행 ${questionSeeds.length}개, 시험 템플릿 "${templateName}" 준비 완료`,
  );
}

/**
 * 활성 템플릿으로 예약(`SCHEDULED`) 상태의 실제 시험 1건을 만든다.
 *
 * 응시·답안·파일 데이터는 시드하지 않는다. 대상 반과 성적 관리 수강생 몇 명을
 * 함께 만들어, 실행 직후 `POST /exams/:id/targets/rebuild`로 명단을 만들고 필기
 * 응시·자동 채점·결과 공개까지 손으로 확인할 수 있게 한다.
 *
 * 재실행 안전: 같은 제목의 시험이 있으면 통째로 지우고 다시 만든다. 반·수강은
 * 자연 키로 찾아 갱신한다.
 */
async function seedRealExam(
  subjectIds: Map<string, string>,
  users: Map<string, { id: string }>,
): Promise<void> {
  const adminId = users.get('admin')!.id;
  const examTitle = '피부 이론 정기 시험 (자동 시드)';
  const className = '피부 기초 1기';

  const offering = await prisma.courseOffering.findFirst({
    where: { name: '피부 기초 교육과정' },
    select: { id: true },
  });
  const template = await prisma.examTemplate.findFirst({
    where: { name: '피부 이론 정기 시험 (예제)' },
    include: {
      subjects: { select: { subjectId: true } },
      parts: {
        orderBy: { type: 'asc' },
        include: {
          questions: {
            orderBy: { displayOrder: 'asc' },
            include: {
              question: {
                include: {
                  options: { orderBy: { displayOrder: 'asc' } },
                  acceptedAnswers: { orderBy: { displayOrder: 'asc' } },
                },
              },
            },
          },
          practicalCriteria: { orderBy: { displayOrder: 'asc' } },
        },
      },
    },
  });
  if (!offering || !template) {
    console.log(
      '실제 시험 시드를 건너뛴다: 개설 강의 또는 활성 템플릿이 없다.',
    );
    return;
  }

  const theorySubjectId = subjectIds.get('피부:피부 이론')!;
  const offeringSubject = await prisma.courseOfferingSubject.findFirst({
    where: { courseOfferingId: offering.id, subjectId: theorySubjectId },
    select: { id: true },
  });
  if (!offeringSubject) {
    console.log(
      '실제 시험 시드를 건너뛴다: 개설 강의에 피부 이론 과목이 없다.',
    );
    return;
  }

  // 대상 반과 교육과정 연결.
  const existingClass = await prisma.class.findFirst({
    where: { name: className, archivedAt: null },
    select: { id: true },
  });
  const seededClass = existingClass
    ? existingClass
    : await prisma.class.create({
        data: {
          name: className,
          startDate: new Date('2026-01-05T00:00:00.000Z'),
          endDate: new Date('2026-12-20T00:00:00.000Z'),
          capacity: 20,
          createdById: adminId,
        },
        select: { id: true },
      });
  await prisma.classProgram.upsert({
    where: {
      classId_courseOfferingId: {
        classId: seededClass.id,
        courseOfferingId: offering.id,
      },
    },
    update: {},
    create: { classId: seededClass.id, courseOfferingId: offering.id },
  });

  // 성적 관리 수강생 5명(student01~05).
  for (let index = 1; index <= 5; index += 1) {
    const student = users.get(`student${String(index).padStart(2, '0')}`);
    if (!student) continue;

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseOfferingId: offering.id,
        classId: seededClass.id,
      },
      select: { id: true },
    });
    const enrollment = existingEnrollment
      ? await prisma.enrollment.update({
          where: { id: existingEnrollment.id },
          data: {
            type: EnrollmentType.REGULAR,
            status: EnrollmentStatus.ACTIVE,
            attendanceManaged: true,
            gradeManaged: true,
          },
          select: { id: true },
        })
      : await prisma.enrollment.create({
          data: {
            studentId: student.id,
            courseOfferingId: offering.id,
            classId: seededClass.id,
            type: EnrollmentType.REGULAR,
            status: EnrollmentStatus.ACTIVE,
            startsOn: new Date('2026-01-05T00:00:00.000Z'),
            attendanceManaged: true,
            gradeManaged: true,
            assignedById: adminId,
          },
          select: { id: true },
        });

    await prisma.enrollmentSubject.upsert({
      where: {
        enrollmentId_courseOfferingSubjectId: {
          enrollmentId: enrollment.id,
          courseOfferingSubjectId: offeringSubject.id,
        },
      },
      update: { gradeManaged: true, attendanceManaged: true },
      create: {
        enrollmentId: enrollment.id,
        courseOfferingId: offering.id,
        courseOfferingSubjectId: offeringSubject.id,
        startsOn: new Date('2026-01-05T00:00:00.000Z'),
        attendanceManaged: true,
        gradeManaged: true,
      },
    });
  }

  // 재실행: 기존 시드 시험을 통째로 제거(응시 기록 먼저).
  const priorExam = await prisma.exam.findFirst({
    where: { title: examTitle },
    select: { id: true },
  });
  if (priorExam) {
    await prisma.examAttempt.deleteMany({ where: { examId: priorExam.id } });
    await prisma.exam.delete({ where: { id: priorExam.id } });
  }

  // 파트 시작을 30일 뒤 자정으로 잡고, 템플릿의 상대 오프셋으로 각 파트 시각을 계산.
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + 30);

  await prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        courseOfferingId: offering.id,
        sourceTemplateId: template.id,
        title: examTitle,
        description: '자동 시드로 만든 예약 상태 예제 시험이다.',
        scope: ExamScope.SUBJECT,
        stage: ExamStage.REGULAR,
        status: ExamStatus.DRAFT,
        opensAt: base,
        closesAt: new Date(base.getTime() + DAY_MS),
        createdById: adminId,
      },
    });

    await tx.examSubject.create({
      data: {
        examId: exam.id,
        courseOfferingId: offering.id,
        courseOfferingSubjectId: offeringSubject.id,
      },
    });
    await tx.examClassTarget.create({
      data: {
        examId: exam.id,
        courseOfferingId: offering.id,
        classId: seededClass.id,
      },
    });

    let minOpens = Number.POSITIVE_INFINITY;
    let maxCloses = Number.NEGATIVE_INFINITY;

    for (const part of template.parts) {
      const opensAt = new Date(
        base.getTime() + part.defaultOpenOffsetDays * DAY_MS,
      );
      const closesAt = new Date(
        opensAt.getTime() + part.defaultOpenDays * DAY_MS,
      );
      minOpens = Math.min(minOpens, opensAt.getTime());
      maxCloses = Math.max(maxCloses, closesAt.getTime());

      // 템플릿은 배점을 갖지 않는다. 문제 배점은 문제은행 기본 배점으로 채우고
      // 실제 시험 파트 총점은 그 합계로 맞춘다(§14.9 합계 검증 통과용).
      const writtenSum = part.questions.reduce(
        (sum, tq) => sum + Number(tq.question.defaultScore),
        0,
      );
      const partTotalScore = part.type === ExamPartType.WRITTEN ? writtenSum : 100;
      const partPassScore = Math.ceil(partTotalScore * 0.6);

      const createdPart = await tx.examPart.create({
        data: {
          examId: exam.id,
          type: part.type,
          totalScore: partTotalScore,
          passScore: partPassScore,
          opensAt,
          closesAt,
          durationMinutes: part.durationMinutes,
          minFiles: part.minFiles,
          maxFiles: part.maxFiles,
          maxFileSizeBytes: part.maxFileSizeBytes,
          maxTotalSizeBytes: part.maxTotalSizeBytes,
          instructions: part.instructions,
        },
      });

      if (part.type === ExamPartType.WRITTEN) {
        for (const [index, templateQuestion] of part.questions.entries()) {
          const bank = templateQuestion.question;
          await tx.examQuestion.create({
            data: {
              examId: exam.id,
              examPartId: createdPart.id,
              courseOfferingSubjectId: offeringSubject.id,
              sourceQuestionId: bank.id,
              type: bank.type,
              prompt: bank.prompt,
              explanation: bank.explanation,
              score: bank.defaultScore,
              displayOrder: index,
              normalizationVersion:
                bank.type === QuestionType.SHORT_ANSWER
                  ? String(ANSWER_NORMALIZATION_VERSION)
                  : null,
              options: {
                create: bank.options.map((option, optionIndex) => ({
                  content: option.content,
                  displayOrder: optionIndex,
                  isCorrect: option.isCorrect,
                })),
              },
              acceptedAnswers: {
                create: bank.acceptedAnswers.map((answer) => ({
                  answerText: answer.answerText,
                  normalizedAnswer: answer.normalizedAnswer,
                })),
              },
            },
          });
        }
      } else {
        await tx.examPracticalCriterion.createMany({
          data: part.practicalCriteria.map((criterion, index) => ({
            examPartId: createdPart.id,
            name: criterion.name,
            description: criterion.description,
            maxScore: criterion.maxScore,
            displayOrder: index,
          })),
        });
      }
    }

    // 시험 전체 기간을 파트 봉투에 맞추고 예약 상태로 전이한다.
    await tx.exam.update({
      where: { id: exam.id },
      data: {
        opensAt: new Date(minOpens),
        closesAt: new Date(maxCloses),
        status: ExamStatus.SCHEDULED,
      },
    });
  });

  console.log(
    `대상 반 "${className}"·성적 관리 수강생 5명, 예약 상태 실제 시험 "${examTitle}" 준비 완료`,
  );
}

/**
 * 운영 정책값을 `system_settings`에 채운다. 이미 있는 키는 값을 덮어쓰지 않아
 * 운영자가 조정한 값이 재실행에도 유지된다. 설명만 최신으로 맞춘다.
 */
async function seedSystemSettings(): Promise<void> {
  const keys = Object.keys(SYSTEM_SETTING_DEFAULTS) as SystemSettingKey[];
  for (const key of keys) {
    const description = SYSTEM_SETTING_DESCRIPTIONS[key] ?? null;
    await prisma.systemSetting.upsert({
      where: { key },
      update: { description },
      create: {
        key,
        value: SYSTEM_SETTING_DEFAULTS[key] as object,
        description,
      },
    });
  }
  console.log(`시스템 설정 ${keys.length}개 확인 완료`);
}

/**
 * 시행 중인 필수 약관을 생성한다(기획안 §3·§7.2·§33.3). 이게 없으면 회원가입과
 * 로그인 시 필수 약관 동의 흐름이 동작하지 않는다. `(type, version)` 기준으로
 * 이미 있으면 두지 않아 멱등하다.
 */
async function seedTermsDocuments(): Promise<void> {
  const docs = [
    {
      type: '이용약관',
      version: '1.0',
      title: '서비스 이용약관',
      content: '예제 시드 이용약관 본문입니다. 실제 문구로 교체하세요.',
    },
    {
      type: '개인정보 수집·이용 동의',
      version: '1.0',
      title: '개인정보 수집·이용 동의',
      content:
        '예제 시드 개인정보 수집·이용 동의 본문입니다. 실제 문구로 교체하세요.',
    },
  ];
  const effectiveAt = new Date('2026-01-01T00:00:00.000Z');
  for (const doc of docs) {
    const existing = await prisma.termsDocument.findFirst({
      where: { type: doc.type, version: doc.version },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.termsDocument.create({
      data: { ...doc, required: true, effectiveAt, active: true },
    });
  }
  console.log(`필수 약관 ${docs.length}건 확인 완료`);
}

async function seed(): Promise<void> {
  await seedSystemSettings();
  await seedTermsDocuments();

  const passwordHashes = new Map<string, string>();
  for (const password of new Set(credentials.map((item) => item.password))) {
    passwordHashes.set(
      password,
      await argon2.hash(password, { type: argon2.argon2id }),
    );
  }

  const users = new Map<string, { id: string }>();
  for (const item of credentials) {
    const existing = await prisma.user.findFirst({
      where: { loginId: item.loginId },
      select: { id: true },
    });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: passwordHashes.get(item.password),
            name: item.name,
            role: item.role,
            status: UserStatus.ACTIVE,
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
            passwordChangedAt: new Date(),
          },
          select: { id: true },
        })
      : await prisma.user.create({
          data: {
            loginId: item.loginId,
            passwordHash: passwordHashes.get(item.password),
            name: item.name,
            phone: `010-9000-${String(users.size + 1).padStart(4, '0')}`,
            role: item.role,
            status: UserStatus.ACTIVE,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          },
          select: { id: true },
        });
    users.set(item.loginId, user);

    if (item.role === UserRole.STUDENT) {
      await prisma.studentProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, isMinorAtSignup: false },
      });
    }
  }

  const fields = [
    { name: '피부', subjects: ['피부 이론', '각질 제거', '피부 관리', '문신'] },
    { name: '헤어', subjects: ['헤어 이론', '커트', '펌', '컬러'] },
  ];
  const fieldIds = new Map<string, string>();
  const subjectIds = new Map<string, string>();

  for (const [fieldIndex, definition] of fields.entries()) {
    const field = await prisma.educationField.upsert({
      where: { name: definition.name },
      update: { active: true, displayOrder: fieldIndex + 1 },
      create: {
        name: definition.name,
        description: `${definition.name} 교육 분야`,
        displayOrder: fieldIndex + 1,
        active: true,
      },
    });
    fieldIds.set(definition.name, field.id);

    for (const [subjectIndex, name] of definition.subjects.entries()) {
      const subject = await prisma.subject.upsert({
        where: {
          educationFieldId_name: { educationFieldId: field.id, name },
        },
        update: { active: true, displayOrder: subjectIndex + 1 },
        create: {
          educationFieldId: field.id,
          name,
          mode: SubjectMode.MIXED,
          displayOrder: subjectIndex + 1,
          active: true,
        },
      });
      subjectIds.set(`${definition.name}:${name}`, subject.id);
    }
  }

  const programs = [
    {
      name: '피부 기초 교육과정',
      field: '피부',
      instructor: 'instructor01',
      subjects: ['피부 이론', '각질 제거'],
    },
    {
      name: '피부 전문가 교육과정',
      field: '피부',
      instructor: 'instructor02',
      subjects: ['피부 관리', '문신'],
    },
    {
      name: '헤어 전문가 교육과정',
      field: '헤어',
      instructor: 'instructor03',
      subjects: ['헤어 이론', '커트', '펌', '컬러'],
    },
  ];

  for (const program of programs) {
    const existing = await prisma.courseOffering.findFirst({
      where: { name: program.name },
    });
    const course = existing
      ? await prisma.courseOffering.update({
          where: { id: existing.id },
          data: {
            primaryEducationFieldId: fieldIds.get(program.field)!,
            instructorId: users.get(program.instructor)!.id,
            archivedAt: null,
          },
        })
      : await prisma.courseOffering.create({
          data: {
            name: program.name,
            primaryEducationFieldId: fieldIds.get(program.field)!,
            instructorId: users.get(program.instructor)!.id,
            createdById: users.get('admin')!.id,
          },
        });

    // 과목 연결은 삭제 후 재생성이 아니라 upsert 로 유지한다. 수강·시험 데이터가
    // 이 행의 id 를 참조하므로 재실행할 때마다 id 가 바뀌면 FK 가 깨진다.
    for (const name of program.subjects) {
      await prisma.courseOfferingSubject.upsert({
        where: {
          courseOfferingId_subjectId: {
            courseOfferingId: course.id,
            subjectId: subjectIds.get(`${program.field}:${name}`)!,
          },
        },
        update: {},
        create: {
          courseOfferingId: course.id,
          subjectId: subjectIds.get(`${program.field}:${name}`)!,
        },
      });
    }
  }

  await seedQuestionBankAndExamTemplate(subjectIds, users.get('admin')!.id);
  await seedRealExam(subjectIds, users);
  await seedNoticesAndInquiries(users);

  console.table(
    credentials.map(({ loginId, password, role }) => ({
      loginId,
      password,
      role,
    })),
  );
}

/**
 * 예제 공지 3건(전체 학생 / 특정 반 / 강사)과 문의 2건(반 관련 / 일반)을 만든다.
 *
 * 첨부파일·인수인계는 파일 저장소 확정 전까지 범위 밖이라 시드하지 않는다.
 * 재실행 안전: 제목으로 찾아 갱신하거나 새로 만든다.
 */
async function seedNoticesAndInquiries(
  users: Map<string, { id: string }>,
): Promise<void> {
  const adminId = users.get('admin')!.id;
  const skinClass = await prisma.class.findFirst({
    where: { name: '피부 기초 1기', archivedAt: null },
    select: { id: true },
  });

  const noticeSeeds = [
    {
      type: NoticeType.STUDENT,
      scope: NoticeScope.ALL,
      title: '수강생 이용 안내 (자동 시드)',
      content: '출결과 시험 일정은 각 화면에서 확인해 주세요.',
      important: true,
      classIds: [] as string[],
    },
    {
      type: NoticeType.STUDENT,
      scope: NoticeScope.CLASSES,
      title: '피부 기초 1기 보강 안내 (자동 시드)',
      content: '이번 주 보강은 금요일 저녁 7시에 진행합니다.',
      important: false,
      classIds: skinClass ? [skinClass.id] : [],
    },
    {
      type: NoticeType.INSTRUCTOR,
      scope: NoticeScope.ALL,
      title: '강사 정기 회의 공지 (자동 시드)',
      content: '매월 첫째 주 월요일 오전 10시에 강사 회의를 진행합니다.',
      important: false,
      classIds: [] as string[],
    },
  ];

  for (const seedRow of noticeSeeds) {
    if (
      seedRow.scope === NoticeScope.CLASSES &&
      seedRow.classIds.length === 0
    ) {
      continue;
    }
    const existing = await prisma.notice.findFirst({
      where: { title: seedRow.title },
      select: { id: true },
    });
    const data = {
      type: seedRow.type,
      scope: seedRow.scope,
      content: seedRow.content,
      important: seedRow.important,
      publishedFrom: null,
      publishedUntil: null,
    };
    if (existing) {
      await prisma.noticeClassTarget.deleteMany({
        where: { noticeId: existing.id },
      });
      await prisma.notice.update({ where: { id: existing.id }, data });
      if (seedRow.classIds.length > 0) {
        await prisma.noticeClassTarget.createMany({
          data: seedRow.classIds.map((classId) => ({
            noticeId: existing.id,
            classId,
          })),
        });
      }
    } else {
      await prisma.notice.create({
        data: {
          ...data,
          title: seedRow.title,
          authorId: adminId,
          classTargets:
            seedRow.classIds.length > 0
              ? {
                  create: seedRow.classIds.map((classId) => ({ classId })),
                }
              : undefined,
        },
      });
    }
  }

  const inquirySeeds = [
    {
      authorLoginId: 'student01',
      type: InquiryType.CLASS,
      classId: skinClass?.id ?? null,
      title: '보강 일정 문의 (자동 시드)',
      content: '이번 주 보강 시간에 참석이 어려운데 다른 반 청강이 가능한가요?',
    },
    {
      authorLoginId: 'student02',
      type: InquiryType.GENERAL,
      classId: null as string | null,
      title: '수강료 환불 문의 (자동 시드)',
      content: '개인 사정으로 수강을 중단하려는데 환불 절차가 궁금합니다.',
    },
  ];

  for (const seedRow of inquirySeeds) {
    const author = users.get(seedRow.authorLoginId);
    if (!author) {
      continue;
    }
    if (seedRow.type === InquiryType.CLASS && !seedRow.classId) {
      continue;
    }
    // 문의 원문과 답글은 불변이다(기획안 §19.2, DB 트리거로도 강제). 재실행 시
    // 같은 제목의 예제 문의가 이미 있으면 그대로 둔다.
    const existing = await prisma.inquiry.findFirst({
      where: { title: seedRow.title },
      select: { id: true },
    });
    if (!existing) {
      await prisma.inquiry.create({
        data: {
          authorId: author.id,
          type: seedRow.type,
          classId: seedRow.type === InquiryType.CLASS ? seedRow.classId : null,
          title: seedRow.title,
          content: seedRow.content,
          status: InquiryStatus.RECEIVED,
          closedAt: null,
        },
      });
    }
  }

  console.log('예제 공지 3건·문의 2건 준비 완료');
}

seed()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'seed 실행에 실패했습니다.',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
