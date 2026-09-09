import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { todaySeoulDateString } from '../common/seoul-date';
import { Prisma } from '../generated/prisma/client';
import {
  ExamStatus,
  InquiryStatus,
  SessionStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StatisticsQueryDto } from './dto/statistics-query.dto';

const STAFF_ROLES: readonly UserRole[] = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
];

/** 출석 상태별 집계와 파생 출석률이다(기획안 §7 계산식). */
export type AttendanceBucket = {
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  excused: number;
  unprocessed: number;
  /** 지각 횟수 별도 집계(§7). late와 같은 값이지만 명시적으로 노출한다. */
  lateCount: number;
  /** 출석률 분모: 출석 + 지각 + 조퇴 + 결석. */
  countedTotal: number;
  /** (출석 + 지각 + 조퇴×0.5) ÷ countedTotal × 100. 분모 0이면 null. */
  attendanceRate: number | null;
};

export type AttendanceStatisticsResponse = {
  range: { from: string | null; to: string | null };
  overall: AttendanceBucket;
  classes: Array<
    {
      classId: string;
      className: string;
      courseOfferingId: string;
      courseOfferingName: string;
    } & AttendanceBucket
  >;
  /** classId 필터를 준 경우에만 채워지는 학생별 상세다. */
  students: Array<
    {
      studentId: string;
      name: string;
      loginId: string | null;
    } & AttendanceBucket
  > | null;
};

export type ExamStatRow = {
  examId: string;
  title: string;
  scope: string;
  stage: string;
  status: string;
  opensAt: string;
  closesAt: string;
  /** 대상자 수(응시 기록 전체). */
  targetCount: number;
  /** 응시자 수: 한 파트라도 시작한 사람. */
  attemptedCount: number;
  notStartedCount: number;
  /** 미응시자 수(NOT_ATTENDED). 일반 불합격자 수에서는 제외한다(D-29). */
  notAttendedCount: number;
  incompleteCount: number;
  /** 채점 대기(SUBMITTED·GRADING). */
  gradingPendingCount: number;
  passCount: number;
  /** 일반 불합격자 수. NOT_ATTENDED는 제외한다(D-29). */
  failCount: number;
  writtenAvg: number | null;
  practicalAvg: number | null;
};

export type ExamStatisticsResponse = {
  range: { from: string | null; to: string | null };
  exams: ExamStatRow[];
  overall: {
    examCount: number;
    targetCount: number;
    attemptedCount: number;
    notAttendedCount: number;
    incompleteCount: number;
    passCount: number;
    failCount: number;
    /** passCount ÷ (passCount + failCount) × 100. 분모 0이면 null. */
    passRate: number | null;
  };
};

export type EnrollmentStatRow = {
  classId: string;
  className: string;
  courseOfferingId: string;
  courseOfferingName: string;
  startDate: string;
  endDate: string;
  operatingStatus: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  capacity: number;
  /** 중복 없는 기본(REGULAR·ACTIVE) 수강 학생 수. 정원 계산 기준이다(§5). */
  regularActive: number;
  canceled: number;
  supplement: number;
  makeup: number;
};

export type EnrollmentStatisticsResponse = {
  classes: EnrollmentStatRow[];
  overall: { totalRegularActive: number; totalCanceled: number };
};

export type OperationsOverviewResponse = {
  pendingApprovalStudents: number;
  activeStudents: number;
  activeInstructors: number;
  operatingClasses: number;
  activeCourseOfferings: number;
  today: {
    date: string;
    sessions: number;
    attendance: {
      present: number;
      late: number;
      absent: number;
      earlyLeave: number;
      excused: number;
      unprocessed: number;
    };
  };
  exams: { open: number; grading: number; gradingPendingSubmissions: number };
  inquiries: { open: number };
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function num(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * 분석 및 운영 메뉴(출석 통계 · 시험·성적 통계 · 수강 현황 · 운영 리포트)를
 * 지원하는 읽기 전용 집계다(기획안 §13.3·§13.4·D-29).
 *
 * 강사는 담당 교육과정(`course_offerings.instructor_id`)이 포함된 반으로 범위가
 * 자동 축소된다. 운영 리포트(overview)는 실장·원장·관리자 전용이다.
 */
@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  private isStaff(role: UserRole): boolean {
    return STAFF_ROLES.includes(role);
  }

  /**
   * 이 요청이 볼 수 있는 반 id 목록을 계산한다. `null`은 "제한 없음"(실장·원장·
   * 관리자가 반·교육과정 필터를 주지 않은 경우)이다.
   */
  private async resolveClassScope(
    actor: AuthenticatedUser,
    query: StatisticsQueryDto,
  ): Promise<string[] | null> {
    const staff = this.isStaff(actor.role);
    const hasFilter = Boolean(query.classId || query.courseOfferingId);

    if (staff && !hasFilter) {
      return null;
    }

    const programWhere: Prisma.ClassProgramWhereInput = {};
    if (query.courseOfferingId) {
      programWhere.courseOfferingId = query.courseOfferingId;
    }
    if (!staff) {
      programWhere.courseOffering = { instructorId: actor.id };
    }

    const rows = await this.prisma.class.findMany({
      where: {
        ...(query.classId ? { id: query.classId } : {}),
        ...(Object.keys(programWhere).length > 0
          ? { programs: { some: programWhere } }
          : {}),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** `from`/`to`를 `YYYY-MM-DD` 경계 문자열로. 잘못된 값은 무시한다. */
  private dateBounds(query: StatisticsQueryDto): {
    from: string | null;
    to: string | null;
  } {
    const toDate = (value?: string): string | null => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? null
        : parsed.toISOString().slice(0, 10);
    };
    return { from: toDate(query.from), to: toDate(query.to) };
  }

  private bucket(counts: Record<string, number>): AttendanceBucket {
    const present = counts.PRESENT ?? 0;
    const late = counts.LATE ?? 0;
    const earlyLeave = counts.EARLY_LEAVE ?? 0;
    const absent = counts.ABSENT ?? 0;
    const excused = counts.EXCUSED ?? 0;
    const unprocessed = counts.UNPROCESSED ?? 0;
    const countedTotal = present + late + earlyLeave + absent;
    const earned = present + late + earlyLeave * 0.5;
    return {
      present,
      late,
      earlyLeave,
      absent,
      excused,
      unprocessed,
      lateCount: late,
      countedTotal,
      attendanceRate:
        countedTotal === 0 ? null : round1((earned / countedTotal) * 100),
    };
  }

  async attendance(
    actor: AuthenticatedUser,
    query: StatisticsQueryDto,
  ): Promise<AttendanceStatisticsResponse> {
    const range = this.dateBounds(query);
    const classIds = await this.resolveClassScope(actor, query);
    const empty: AttendanceStatisticsResponse = {
      range,
      overall: this.bucket({}),
      classes: [],
      students: null,
    };
    if (classIds !== null && classIds.length === 0) {
      return empty;
    }

    const filters: Prisma.Sql[] = [
      Prisma.sql`cs.status <> 'CANCELED'::session_status`,
    ];
    if (classIds !== null) {
      filters.push(Prisma.sql`cs.class_id IN (${Prisma.join(classIds)})`);
    }
    if (range.from) {
      filters.push(
        Prisma.sql`(cs.starts_at AT TIME ZONE 'Asia/Seoul')::date >= ${range.from}::date`,
      );
    }
    if (range.to) {
      filters.push(
        Prisma.sql`(cs.starts_at AT TIME ZONE 'Asia/Seoul')::date <= ${range.to}::date`,
      );
    }
    if (query.subjectId) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM course_offering_subjects cos WHERE cos.id = cs.course_offering_subject_id AND cos.subject_id = ${query.subjectId}::uuid)`,
      );
    }
    const where = Prisma.join(filters, ' AND ');

    const byClass = await this.prisma.$queryRaw<
      Array<{ class_id: string; status: string; n: number }>
    >`
      SELECT cs.class_id, ar.status::text AS status, count(*)::int AS n
      FROM attendance_records ar
      JOIN class_sessions cs ON cs.id = ar.class_session_id
      WHERE ${where}
      GROUP BY cs.class_id, ar.status
    `;

    const classCounts = new Map<string, Record<string, number>>();
    const overallCounts: Record<string, number> = {};
    for (const row of byClass) {
      const map = classCounts.get(row.class_id) ?? {};
      map[row.status] = (map[row.status] ?? 0) + row.n;
      classCounts.set(row.class_id, map);
      overallCounts[row.status] = (overallCounts[row.status] ?? 0) + row.n;
    }

    const classMeta = await this.prisma.class.findMany({
      where: { id: { in: [...classCounts.keys()] } },
      select: {
        id: true,
        name: true,
        programs: {
          select: {
            courseOfferingId: true,
            courseOffering: { select: { name: true } },
          },
          take: 1,
        },
      },
    });
    const metaById = new Map(classMeta.map((c) => [c.id, c]));

    const classes = [...classCounts.entries()]
      .map(([classId, counts]) => {
        const meta = metaById.get(classId);
        return {
          classId,
          className: meta?.name ?? '(삭제된 반)',
          courseOfferingId: meta?.programs[0]?.courseOfferingId ?? '',
          courseOfferingName: meta?.programs[0]?.courseOffering.name ?? '',
          ...this.bucket(counts),
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className, 'ko'));

    let students: AttendanceStatisticsResponse['students'] = null;
    if (query.classId) {
      const byStudent = await this.prisma.$queryRaw<
        Array<{ student_id: string; status: string; n: number }>
      >`
        SELECT ar.student_id, ar.status::text AS status, count(*)::int AS n
        FROM attendance_records ar
        JOIN class_sessions cs ON cs.id = ar.class_session_id
        WHERE ${where}
        GROUP BY ar.student_id, ar.status
      `;
      const studentCounts = new Map<string, Record<string, number>>();
      for (const row of byStudent) {
        const map = studentCounts.get(row.student_id) ?? {};
        map[row.status] = (map[row.status] ?? 0) + row.n;
        studentCounts.set(row.student_id, map);
      }
      const studentMeta = await this.prisma.user.findMany({
        where: { id: { in: [...studentCounts.keys()] } },
        select: { id: true, name: true, loginId: true },
      });
      const sMetaById = new Map(studentMeta.map((s) => [s.id, s]));
      students = [...studentCounts.entries()]
        .map(([studentId, counts]) => ({
          studentId,
          name: sMetaById.get(studentId)?.name ?? '(익명)',
          loginId: sMetaById.get(studentId)?.loginId ?? null,
          ...this.bucket(counts),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }

    return { range, overall: this.bucket(overallCounts), classes, students };
  }

  async exams(
    actor: AuthenticatedUser,
    query: StatisticsQueryDto,
  ): Promise<ExamStatisticsResponse> {
    const range = this.dateBounds(query);
    const classIds = await this.resolveClassScope(actor, query);
    const overallEmpty: ExamStatisticsResponse = {
      range,
      exams: [],
      overall: {
        examCount: 0,
        targetCount: 0,
        attemptedCount: 0,
        notAttendedCount: 0,
        incompleteCount: 0,
        passCount: 0,
        failCount: 0,
        passRate: null,
      },
    };
    if (classIds !== null && classIds.length === 0) {
      return overallEmpty;
    }

    const filters: Prisma.Sql[] = [
      Prisma.sql`e.status <> 'DRAFT'::exam_status`,
    ];
    if (!this.isStaff(actor.role)) {
      // 강사: 담당 교육과정 소속이거나 본인이 만든 시험.
      filters.push(
        Prisma.sql`(co.instructor_id = ${actor.id}::uuid OR e.created_by = ${actor.id}::uuid)`,
      );
    }
    if (query.courseOfferingId) {
      filters.push(
        Prisma.sql`e.course_offering_id = ${query.courseOfferingId}::uuid`,
      );
    }
    if (classIds !== null) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM exam_class_targets ect WHERE ect.exam_id = e.id AND ect.class_id IN (${Prisma.join(classIds)}))`,
      );
    }
    if (query.stage) {
      filters.push(Prisma.sql`e.stage = ${query.stage}::exam_stage`);
    }
    if (range.from) {
      filters.push(Prisma.sql`e.opens_at >= ${range.from}::date`);
    }
    if (range.to) {
      filters.push(
        Prisma.sql`e.opens_at < (${range.to}::date + INTERVAL '1 day')`,
      );
    }
    const where = Prisma.join(filters, ' AND ');

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        e.id, e.title, e.scope::text AS scope, e.stage::text AS stage,
        e.status::text AS status, e.opens_at, e.closes_at,
        count(a.*)::int AS target_count,
        count(*) FILTER (WHERE a.status NOT IN ('NOT_STARTED','NOT_ATTENDED'))::int AS attempted_count,
        count(*) FILTER (WHERE a.status = 'NOT_STARTED')::int AS not_started_count,
        count(*) FILTER (WHERE a.status = 'NOT_ATTENDED')::int AS not_attended_count,
        count(*) FILTER (WHERE a.status = 'INCOMPLETE')::int AS incomplete_count,
        count(*) FILTER (WHERE a.status IN ('SUBMITTED','GRADING'))::int AS grading_pending_count,
        count(*) FILTER (WHERE a.final_result = 'PASS')::int AS pass_count,
        count(*) FILTER (WHERE a.final_result = 'FAIL' AND a.status <> 'NOT_ATTENDED')::int AS fail_count,
        round(avg(a.written_score) FILTER (WHERE a.status = 'GRADED'), 2) AS written_avg,
        round(avg(a.practical_score) FILTER (WHERE a.status = 'GRADED'), 2) AS practical_avg
      FROM exams e
      JOIN course_offerings co ON co.id = e.course_offering_id
      LEFT JOIN exam_attempts a ON a.exam_id = e.id
      WHERE ${where}
      GROUP BY e.id, co.instructor_id
      ORDER BY e.opens_at DESC
      LIMIT 500
    `;

    const exams: ExamStatRow[] = rows.map((row) => ({
      examId: String(row.id),
      title: String(row.title),
      scope: String(row.scope),
      stage: String(row.stage),
      status: String(row.status),
      opensAt: new Date(row.opens_at as string).toISOString(),
      closesAt: new Date(row.closes_at as string).toISOString(),
      targetCount: num(row.target_count),
      attemptedCount: num(row.attempted_count),
      notStartedCount: num(row.not_started_count),
      notAttendedCount: num(row.not_attended_count),
      incompleteCount: num(row.incomplete_count),
      gradingPendingCount: num(row.grading_pending_count),
      passCount: num(row.pass_count),
      failCount: num(row.fail_count),
      writtenAvg: nullableNum(row.written_avg),
      practicalAvg: nullableNum(row.practical_avg),
    }));

    const sum = (key: keyof ExamStatRow): number =>
      exams.reduce((acc, e) => acc + (e[key] as number), 0);
    const passCount = sum('passCount');
    const failCount = sum('failCount');

    return {
      range,
      exams,
      overall: {
        examCount: exams.length,
        targetCount: sum('targetCount'),
        attemptedCount: sum('attemptedCount'),
        notAttendedCount: sum('notAttendedCount'),
        incompleteCount: sum('incompleteCount'),
        passCount,
        failCount,
        passRate:
          passCount + failCount === 0
            ? null
            : round1((passCount / (passCount + failCount)) * 100),
      },
    };
  }

  async enrollments(
    actor: AuthenticatedUser,
    query: StatisticsQueryDto,
  ): Promise<EnrollmentStatisticsResponse> {
    const classIds = await this.resolveClassScope(actor, query);
    if (classIds !== null && classIds.length === 0) {
      return {
        classes: [],
        overall: { totalRegularActive: 0, totalCanceled: 0 },
      };
    }

    const scope =
      classIds === null
        ? Prisma.sql`TRUE`
        : Prisma.sql`c.id IN (${Prisma.join(classIds)})`;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        c.id, c.name, c.start_date, c.end_date, c.capacity,
        cp.course_offering_id,
        co.name AS course_offering_name,
        count(DISTINCT en.student_id) FILTER (WHERE en.type = 'REGULAR' AND en.status = 'ACTIVE')::int AS regular_active,
        count(*) FILTER (WHERE en.status = 'CANCELED')::int AS canceled,
        count(*) FILTER (WHERE en.type = 'SUPPLEMENT')::int AS supplement,
        count(*) FILTER (WHERE en.type = 'MAKEUP')::int AS makeup
      FROM classes c
      JOIN class_programs cp ON cp.class_id = c.id
      JOIN course_offerings co ON co.id = cp.course_offering_id
      LEFT JOIN enrollments en
        ON en.class_id = c.id AND en.course_offering_id = cp.course_offering_id
      WHERE ${scope} AND c.archived_at IS NULL
      GROUP BY c.id, cp.course_offering_id, co.name
      ORDER BY c.start_date DESC, c.name ASC
    `;

    const today = todaySeoulDateString();
    const classes: EnrollmentStatRow[] = rows.map((row) => {
      const startDate = new Date(row.start_date as string)
        .toISOString()
        .slice(0, 10);
      const endDate = new Date(row.end_date as string)
        .toISOString()
        .slice(0, 10);
      const operatingStatus: EnrollmentStatRow['operatingStatus'] =
        today < startDate ? 'SCHEDULED' : today > endDate ? 'ENDED' : 'ACTIVE';
      return {
        classId: String(row.id),
        className: String(row.name),
        courseOfferingId: String(row.course_offering_id),
        courseOfferingName: String(row.course_offering_name),
        startDate,
        endDate,
        operatingStatus,
        capacity: num(row.capacity),
        regularActive: num(row.regular_active),
        canceled: num(row.canceled),
        supplement: num(row.supplement),
        makeup: num(row.makeup),
      };
    });

    return {
      classes,
      overall: {
        totalRegularActive: classes.reduce((a, c) => a + c.regularActive, 0),
        totalCanceled: classes.reduce((a, c) => a + c.canceled, 0),
      },
    };
  }

  async overview(
    actor: AuthenticatedUser,
  ): Promise<OperationsOverviewResponse> {
    if (!this.isStaff(actor.role)) {
      throw new ForbiddenException(
        '운영 리포트는 실장·원장·관리자만 조회할 수 있습니다.',
      );
    }

    const today = todaySeoulDateString();
    const todayStart = new Date(`${today}T00:00:00+09:00`);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayDateOnly = new Date(`${today}T00:00:00.000Z`);

    const [
      pendingApprovalStudents,
      activeStudents,
      activeInstructors,
      operatingClasses,
      activeCourseOfferings,
      todaySessions,
      todayAttendanceGroups,
      openExams,
      gradingExams,
      gradingPendingSubmissions,
      openInquiries,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: {
          role: UserRole.STUDENT,
          status: UserStatus.PENDING_APPROVAL,
        },
      }),
      this.prisma.user.count({
        where: { role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
      }),
      this.prisma.class.count({
        where: {
          archivedAt: null,
          startDate: { lte: todayDateOnly },
          endDate: { gte: todayDateOnly },
        },
      }),
      this.prisma.courseOffering.count({ where: { archivedAt: null } }),
      this.prisma.classSession.count({
        where: {
          startsAt: { gte: todayStart, lt: todayEnd },
          status: { not: SessionStatus.CANCELED },
        },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: {
          classSession: {
            startsAt: { gte: todayStart, lt: todayEnd },
            status: { not: SessionStatus.CANCELED },
          },
        },
        _count: { _all: true },
      }),
      this.prisma.exam.count({ where: { status: ExamStatus.OPEN } }),
      this.prisma.exam.count({ where: { status: ExamStatus.GRADING } }),
      this.prisma.examPartSubmission.count({
        where: {
          status: { in: ['SUBMITTED', 'GRADING'] },
          examPart: { type: 'WRITTEN' },
          exam: { status: { not: ExamStatus.CANCELED } },
        },
      }),
      this.prisma.inquiry.count({
        where: { status: { not: InquiryStatus.CLOSED } },
      }),
    ]);

    const att = (status: string): number =>
      todayAttendanceGroups.find((g) => g.status === status)?._count._all ?? 0;

    return {
      pendingApprovalStudents,
      activeStudents,
      activeInstructors,
      operatingClasses,
      activeCourseOfferings,
      today: {
        date: today,
        sessions: todaySessions,
        attendance: {
          present: att('PRESENT'),
          late: att('LATE'),
          absent: att('ABSENT'),
          earlyLeave: att('EARLY_LEAVE'),
          excused: att('EXCUSED'),
          unprocessed: att('UNPROCESSED'),
        },
      },
      exams: {
        open: openExams,
        grading: gradingExams,
        gradingPendingSubmissions,
      },
      inquiries: { open: openInquiries },
    };
  }
}
