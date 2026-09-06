import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { normalizeAnswer } from '../src/common/answer-normalizer';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  DifficultyLevel,
  ExamPartType,
  ExamScope,
  ExamStage,
  QuestionType,
  SubjectMode,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

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
    const existing = await prisma.questionBank.findFirst({
      where: { subjectId, prompt: item.prompt },
      select: { id: true },
    });

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

    let questionId: string;
    if (existing) {
      await prisma.questionOption.deleteMany({
        where: { questionId: existing.id },
      });
      await prisma.questionAcceptedAnswer.deleteMany({
        where: { questionId: existing.id },
      });
      await prisma.questionBank.update({ where: { id: existing.id }, data });
      questionId = existing.id;
    } else {
      const created = await prisma.questionBank.create({ data });
      questionId = created.id;
    }

    if (item.options) {
      await prisma.questionOption.createMany({
        data: item.options.map((option, index) => ({
          questionId,
          content: option.content,
          displayOrder: index,
          isCorrect: option.isCorrect,
        })),
      });
    }
    if (item.acceptedAnswers) {
      await prisma.questionAcceptedAnswer.createMany({
        data: item.acceptedAnswers.map((answer, index) => ({
          questionId,
          answerText: answer,
          normalizedAnswer: normalizeAnswer(answer),
          displayOrder: index,
        })),
      });
    }

    const list = questionIdsByKey.get(item.subjectKey) ?? [];
    list.push(questionId);
    questionIdsByKey.set(item.subjectKey, list);
  }

  // 활성 시험 템플릿 1개: 피부 이론 필기(30점) + 실기(20점).
  const templateName = '피부 이론 정기 시험 (예제)';
  const theoryQuestionIds = questionIdsByKey.get('피부:피부 이론')!;

  const existingTemplate = await prisma.examTemplate.findFirst({
    where: { name: templateName },
    select: { id: true },
  });

  // 재실행 시: 구성 트리거를 건드리지 않도록 먼저 비활성화한다.
  if (existingTemplate) {
    await prisma.examTemplate.update({
      where: { id: existingTemplate.id },
      data: { active: false },
    });
    await prisma.examTemplatePart.deleteMany({
      where: { examTemplateId: existingTemplate.id },
    });
    await prisma.examTemplateSubject.deleteMany({
      where: { examTemplateId: existingTemplate.id },
    });
  }

  const templateData = {
    name: templateName,
    description: '문제은행 예제 문제로 구성한 활성 템플릿 샘플이다.',
    scope: ExamScope.SUBJECT,
    stage: ExamStage.REGULAR,
    defaultOpenDays: 7,
    active: false,
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
      totalScore: 30,
      passScore: 18,
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
      score: 10,
    })),
  });

  const practicalPart = await prisma.examTemplatePart.create({
    data: {
      examTemplateId: template.id,
      type: ExamPartType.PRACTICAL,
      totalScore: 20,
      passScore: 12,
      defaultOpenOffsetDays: 1,
      defaultOpenDays: 3,
      minFiles: 1,
      maxFiles: 3,
      maxFileSizeBytes: 10_485_760,
      maxTotalSizeBytes: 31_457_280,
      instructions: '시술 전후 사진을 제출한다.',
    },
  });
  await prisma.examTemplatePracticalCriterion.createMany({
    data: [
      {
        examTemplatePartId: practicalPart.id,
        name: '준비와 위생',
        description: '도구 소독과 준비 상태를 평가한다.',
        maxScore: 10,
        displayOrder: 0,
      },
      {
        examTemplatePartId: practicalPart.id,
        name: '시술 정확도',
        description: '각질 제거 범위와 강도를 평가한다.',
        maxScore: 10,
        displayOrder: 1,
      },
    ],
  });

  // 합계(필기 30 = 30, 실기 20 = 20)가 맞으므로 활성화 트리거를 통과한다.
  await prisma.examTemplate.update({
    where: { id: template.id },
    data: { active: true },
  });

  console.log(
    `문제은행 ${questionSeeds.length}개, 활성 시험 템플릿 "${templateName}" 준비 완료`,
  );
}

async function seed(): Promise<void> {
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

    await prisma.courseOfferingSubject.deleteMany({
      where: { courseOfferingId: course.id },
    });
    await prisma.courseOfferingSubject.createMany({
      data: program.subjects.map((name) => ({
        courseOfferingId: course.id,
        subjectId: subjectIds.get(`${program.field}:${name}`)!,
      })),
    });
  }

  await seedQuestionBankAndExamTemplate(subjectIds, users.get('admin')!.id);

  console.table(
    credentials.map(({ loginId, password, role }) => ({
      loginId,
      password,
      role,
    })),
  );
}

seed()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'seed 실행에 실패했습니다.',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
