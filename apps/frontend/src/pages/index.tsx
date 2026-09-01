import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  UserCheck,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/PageStates";
import {
  getMyAttendanceSessions,
  getMyAttendanceSummary,
} from "../features/attendance/attendance.api";
import {
  getInstructorClasses,
  getManagedClasses,
} from "../features/classes/class-management.api";
import { getPrograms } from "../features/courses/programs.api";
import { getUsers } from "../features/users/users.api";

export function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === "STUDENT") {
    return <StudentDashboard />;
  }

  if (user?.role === "INSTRUCTOR") {
    return <InstructorDashboard />;
  }

  return <OperationDashboard />;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const ATTENDANCE_LABELS: Record<string, string> = {
  UNPROCESSED: "미처리",
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EARLY_LEAVE: "조퇴",
  EXCUSED: "공결",
};

function StudentDashboard() {
  const sessionsQuery = useQuery({
    queryKey: ["attendance", "my-sessions"],
    queryFn: getMyAttendanceSessions,
  });
  const summaryQuery = useQuery({
    queryKey: ["attendance", "my-summary"],
    queryFn: getMyAttendanceSummary,
  });

  const sessions = sessionsQuery.data ?? [];
  const summary = summaryQuery.data;

  return (
    <>
      <section className="page-header">
        <div>
          <h1>내 학습</h1>
          <p>오늘 수업과 출석 현황을 확인합니다.</p>
        </div>
      </section>

      <section className="surface-card">
        <header className="card-header">
          <div>
            <h2>오늘 수업</h2>
            <p>출석 코드는 수업 화면에서 입력합니다.</p>
          </div>
          <Link className="button button--primary" to="/attendance">
            출석 코드 입력 <ArrowRight size={16} />
          </Link>
        </header>

        <div className="card-body">
          {sessionsQuery.isLoading && (
            <LoadingState message="오늘 수업을 불러오고 있습니다." />
          )}
          {sessionsQuery.isError && (
            <ErrorState message="오늘 수업을 불러오지 못했습니다." />
          )}
          {sessionsQuery.isSuccess &&
            (sessions.length === 0 ? (
              <EmptyState
                title="오늘 예정된 수업이 없습니다."
                description="수강 중인 반의 오늘 수업이 여기에 표시됩니다."
              />
            ) : (
              <div className="data-list">
                {sessions.map((session) => (
                  <article className="list-row" key={session.id}>
                    <div>
                      <strong>{session.title || session.subjectName}</strong>
                      <p>
                        {session.className} · {session.courseOfferingName}
                      </p>
                      <small>
                        <CalendarClock size={13} />
                        {formatTime(session.startsAt)}~
                        {formatTime(session.endsAt)} ·{" "}
                        {session.room || "강의실 미정"}
                      </small>
                    </div>
                    <span className="status-badge status-badge--neutral">
                      {session.attendance
                        ? ATTENDANCE_LABELS[session.attendance.status]
                        : "미처리"}
                    </span>
                  </article>
                ))}
              </div>
            ))}
        </div>
      </section>

      <section className="surface-card">
        <header className="card-header">
          <div>
            <h2>내 출석률</h2>
            <p>
              출석·지각은 1회, 조퇴는 0.5회로 계산하며 공결과 미처리는
              제외합니다.
            </p>
          </div>
        </header>

        <div className="card-body">
          {summaryQuery.isLoading && (
            <LoadingState message="출석률을 계산하고 있습니다." />
          )}
          {summaryQuery.isError && (
            <ErrorState message="출석률을 불러오지 못했습니다." />
          )}
          {summary &&
            (summary.attendanceRate === null ? (
              <EmptyState
                title="아직 집계할 출석 기록이 없습니다."
                description="수업이 진행되면 출석률이 표시됩니다."
              />
            ) : (
              <>
                <div className="attendance-chart__value">
                  <strong>{summary.attendanceRate}%</strong>
                  <span>전체 출석률 (대상 {summary.countedTotal}회)</span>
                </div>
                <div className="attendance-legend">
                  <span>
                    <i className="legend-dot legend-dot--success" />
                    출석 {summary.present}
                  </span>
                  <span>
                    <i className="legend-dot legend-dot--warning" />
                    지각 {summary.late}
                  </span>
                  <span>
                    <i className="legend-dot legend-dot--warning" />
                    조퇴 {summary.earlyLeave}
                  </span>
                  <span>
                    <i className="legend-dot legend-dot--danger" />
                    결석 {summary.absent}
                  </span>
                  <span>공결 {summary.excused}</span>
                </div>
              </>
            ))}
        </div>
      </section>
    </>
  );
}

function InstructorDashboard() {
  const classesQuery = useQuery({
    queryKey: ["instructor", "classes"],
    queryFn: getInstructorClasses,
  });

  const rows = classesQuery.data ?? [];
  const classCount = new Set(rows.map((item) => item.id)).size;

  return (
    <>
      <section className="page-header">
        <div>
          <h1>강사 대시보드</h1>
          <p>담당 교육과정이 포함된 반과 수업을 관리합니다.</p>
        </div>
        <Link className="button button--primary" to="/schedule">
          수업 일정 <ArrowRight size={16} />
        </Link>
      </section>

      <section className="surface-card">
        <header className="card-header">
          <div>
            <h2>담당 반</h2>
            <p>출석 코드 생성과 수업 일지는 수업 일정에서 처리합니다.</p>
          </div>
        </header>
        <div className="card-body">
          {classesQuery.isLoading && (
            <LoadingState message="담당 반을 불러오고 있습니다." />
          )}
          {classesQuery.isError && (
            <ErrorState message="담당 반을 불러오지 못했습니다." />
          )}
          {classesQuery.isSuccess &&
            (classCount === 0 ? (
              <EmptyState
                title="담당 반이 없습니다."
                description="담당 교육과정이 반에 연결되면 여기에 표시됩니다."
              />
            ) : (
              <div className="data-list">
                {rows.map((row) => (
                  <article
                    className="list-row"
                    key={`${row.id}:${row.courseOfferingId}`}
                  >
                    <div>
                      <strong>{row.name}</strong>
                      <p>
                        {row.courseOfferingName} · 운영 과목 {row.subjectCount}
                        개
                      </p>
                      <small>
                        <CalendarClock size={13} />
                        {row.startDate}~{row.endDate} ·{" "}
                        {row.room || "강의실 미정"}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ))}
        </div>
      </section>
    </>
  );
}

function OperationDashboard() {
  const pendingQuery = useQuery({
    queryKey: ["users", "dashboard", "pending"],
    queryFn: () =>
      getUsers({
        role: "STUDENT",
        status: "PENDING_APPROVAL",
        page: 1,
        limit: 1,
      }),
  });
  const studentsQuery = useQuery({
    queryKey: ["users", "dashboard", "students"],
    queryFn: () =>
      getUsers({ role: "STUDENT", status: "ACTIVE", page: 1, limit: 1 }),
  });
  const classesQuery = useQuery({
    queryKey: ["managed-classes", "dashboard"],
    queryFn: () => getManagedClasses(false),
  });
  const programsQuery = useQuery({
    queryKey: ["education-programs", "dashboard"],
    queryFn: () => getPrograms(),
  });

  const classes = classesQuery.data?.items ?? [];
  const operating = classes.filter(
    (item) => item.derivedStatus === "OPERATING",
  ).length;

  const cards = [
    {
      label: "승인 대기 학생",
      value: pendingQuery.data?.pagination.total,
      detail: "확인이 필요합니다",
      icon: UserCheck,
      tone: "blue",
      to: "/users",
    },
    {
      label: "활성 학생",
      value: studentsQuery.data?.pagination.total,
      detail: "수강 가능한 학생",
      icon: Users,
      tone: "green",
      to: "/users",
    },
    {
      label: "운영 중 반",
      value: operating,
      detail: `전체 ${classes.length}개 반`,
      icon: BookOpenCheck,
      tone: "purple",
      to: "/classes",
    },
    {
      label: "교육과정",
      value: programsQuery.data?.pagination.total,
      detail: "보관 제외",
      icon: ClipboardList,
      tone: "orange",
      to: "/courses",
    },
  ];

  return (
    <>
      <section className="page-header">
        <div>
          <h1>운영 대시보드</h1>
          <p>학원 운영 현황을 확인합니다.</p>
        </div>
      </section>

      <section className="summary-grid">
        {cards.map((card) => (
          <Link className="summary-card" key={card.label} to={card.to}>
            <div className={`summary-card__icon tone-${card.tone}`}>
              <card.icon size={22} />
            </div>

            <div>
              <p>{card.label}</p>
              <strong>{card.value ?? "—"}</strong>
              <span>{card.detail}</span>
            </div>

            <ChevronRight size={18} />
          </Link>
        ))}
      </section>
    </>
  );
}

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">SKB ACADEMY</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <section className="content-card placeholder-card">
        <ClipboardList size={36} />
        <h2>{title} 화면 준비 완료</h2>
        <p>해당 백엔드 단계와 함께 실제 기능을 연결합니다.</p>
      </section>
    </>
  );
}
