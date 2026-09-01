import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  CourseStatus,
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
  { loginId: 'admin', password: 'admin1234', name: '관리자', role: UserRole.ADMIN },
  { loginId: 'manager01', password: 'manager1234', name: '실장', role: UserRole.MANAGER },
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
    { name: '피부 기초 교육과정', field: '피부', instructor: 'instructor01', subjects: ['피부 이론', '각질 제거'] },
    { name: '피부 전문가 교육과정', field: '피부', instructor: 'instructor02', subjects: ['피부 관리', '문신'] },
    { name: '헤어 전문가 교육과정', field: '헤어', instructor: 'instructor03', subjects: ['헤어 이론', '커트', '펌', '컬러'] },
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
            startDate: new Date('2000-01-01T00:00:00.000Z'),
            endDate: new Date('2099-12-31T00:00:00.000Z'),
            capacity: 1,
            status: CourseStatus.PLANNED,
            primaryEducationFieldId: fieldIds.get(program.field)!,
            instructorId: users.get(program.instructor)!.id,
            createdById: users.get('admin')!.id,
          },
        });

    await prisma.courseOfferingSubject.deleteMany({
      where: { courseOfferingId: course.id },
    });
    await prisma.courseOfferingSubject.createMany({
      data: program.subjects.map((name, index) => ({
        courseOfferingId: course.id,
        subjectId: subjectIds.get(`${program.field}:${name}`)!,
        sequence: index + 1,
      })),
    });
  }

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
