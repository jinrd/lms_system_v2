import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Circle,
  ClipboardList,
  Pin,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  getMyAttendanceSessions,
  getMyAttendanceSummary,
  type StudentAttendanceSession,
} from "../features/attendance/attendance.api";
import {
  getClassSessions,
  getInstructorClasses,
  getManagedClasses,
  type ClassSession,
} from "../features/classes/class-management.api";
import {
  getInquiries,
  getMyNotices,
  getNotices,
  type InquiryListItem,
  type MyNotice,
  type Notice,
} from "../features/communications/communications.api";
import { getExams, type Exam } from "../features/exams/exams.api";
import { getAuditLogs, type AuditLog } from "../features/operations/operations.api";
import { getUsers } from "../features/users/users.api";
import "./dashboard.css";

const SEOUL_TIME_ZONE = "Asia/Seoul";

function todayString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: SEOUL_TIME_ZONE });
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(value))
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

function formatToday(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function formatRelativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return formatDate(value);
}

const SESSION_LABELS: Record<string, string> = {
  SCHEDULED: "수업 전",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "휴강",
};

const ATTENDANCE_LABELS: Record<string, string> = {
  UNPROCESSED: "미처리",
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EARLY_LEAVE: "조퇴",
  EXCUSED: "공결",
};

function dashboardName(name: string | undefined, fallback: string): string {
  return name?.trim() || fallback;
}

type DashboardPanelProps = {
  title: string;
  to: string;
  children: React.ReactNode;
};

function DashboardPanel({ title, to, children }: DashboardPanelProps) {
  return (
    <section className="surface-card dashboard-panel">
      <header className="dashboard-panel__header">
        <h2>{title}</h2>
        <Link className="dashboard-panel__more" to={to}>
          전체보기 <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <div className="dashboard-panel__body">{children}</div>
    </section>
  );
}

function DashboardLoading({ label }: { label: string }) {
  return <p className="dashboard-panel__state">{label} 불러오는 중...</p>;
}

function DashboardError({ label }: { label: string }) {
  return <p className="dashboard-panel__state dashboard-panel__state--error">{label} 불러오지 못했습니다.</p>;
}

function DashboardEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-empty">
      <CheckCircle2 size={19} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

type DashboardScheduleItem = {
  id: string;
  title: string;
  meta: string;
  startsAt: string;
  status: string;
};

function ScheduleList({ items }: { items: DashboardScheduleItem[] }) {
  if (items.length === 0) return <DashboardEmpty>오늘 예정된 수업이 없습니다.</DashboardEmpty>;
  return (
    <div className="dashboard-schedule-list">
      {items.slice(0, 5).map((item) => (
        <article className="dashboard-schedule-row" key={item.id}>
          <time>{formatTime(item.startsAt)}</time>
          <span className={`dashboard-schedule-row__dot dashboard-schedule-row__dot--${item.status.toLowerCase()}`} />
          <div>
            <strong>{item.title}</strong>
            <small>{item.meta}</small>
          </div>
          <span className={`status-badge status-badge--${item.status === "IN_PROGRESS" ? "success" : item.status === "CANCELED" ? "danger" : "neutral"}`}>
            {SESSION_LABELS[item.status] ?? item.status}
          </span>
        </article>
      ))}
    </div>
  );
}

type DashboardTask = {
  id: string;
  title: string;
  detail: string;
  badge: string;
  tone: "danger" | "warning" | "neutral";
  to: string;
};

function TaskList({ items }: { items: DashboardTask[] }) {
  if (items.length === 0) return <DashboardEmpty>지금 바로 확인할 긴급 업무가 없습니다.</DashboardEmpty>;
  return (
    <div className="dashboard-task-list">
      {items.slice(0, 5).map((item) => (
        <Link className="dashboard-task-row" key={item.id} to={item.to}>
          <span className="dashboard-task-row__check"><Circle size={16} aria-hidden="true" /></span>
          <span className="dashboard-task-row__copy">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
          <span className={`dashboard-task-row__badge dashboard-task-row__badge--${item.tone}`}>{item.badge}</span>
        </Link>
      ))}
    </div>
  );
}

type DashboardNoticeItem = Pick<Notice, "id" | "title" | "important" | "createdAt"> | Pick<MyNotice, "id" | "title" | "important" | "createdAt">;

function NoticeList({ items }: { items: DashboardNoticeItem[] }) {
  if (items.length === 0) return <DashboardEmpty>등록된 공지사항이 없습니다.</DashboardEmpty>;
  return (
    <div className="dashboard-notice-list">
      {items.slice(0, 5).map((notice) => (
        <Link className="dashboard-notice-row" key={notice.id} to="/notices">
          <span className={notice.important ? "dashboard-notice-row__pin dashboard-notice-row__pin--active" : "dashboard-notice-row__pin"}>
            {notice.important ? <Pin size={14} aria-label="중요 공지" /> : <Bell size={13} aria-hidden="true" />}
          </span>
          <strong>{notice.title}</strong>
          <time>{formatDate(notice.createdAt)}</time>
        </Link>
      ))}
    </div>
  );
}

type DashboardActivity = {
  id: string;
  title: string;
  occurredAt: string;
  tone?: "primary" | "muted";
};

function ActivityList({ items }: { items: DashboardActivity[] }) {
  if (items.length === 0) return <DashboardEmpty>최근 활동이 없습니다.</DashboardEmpty>;
  return (
    <div className="dashboard-activity-list">
      {items.slice(0, 5).map((activity) => (
        <article className="dashboard-activity-row" key={activity.id}>
          <span className={`dashboard-activity-row__marker dashboard-activity-row__marker--${activity.tone ?? "muted"}`} />
          <div>
            <strong>{activity.title}</strong>
            <time>{formatRelativeTime(activity.occurredAt)}</time>
          </div>
        </article>
      ))}
    </div>
  );
}

function DashboardHeader({ name }: { name: string }) {
  return (
    <section className="dashboard-greeting">
      <div>
        <p className="dashboard-greeting__eyebrow">오늘의 학원 운영</p>
        <h1>안녕하세요, {name}님!</h1>
        <p>오늘도 좋은 하루 되세요.</p>
      </div>
      <time dateTime={todayString()}>{formatToday()}</time>
    </section>
  );
}

async function getSessionsForClasses(classIds: string[]): Promise<ClassSession[]> {
  if (classIds.length === 0) return [];
  const today = todayString();
  const sessionGroups = await Promise.all(classIds.map((classId) => getClassSessions(classId, { startDate: today, endDate: today })));
  return sessionGroups.flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentDashboard name={dashboardName(user.name, "학생")} />;
  if (user?.role === "INSTRUCTOR") return <InstructorDashboard name={dashboardName(user.name, "강사")} />;
  return <OperationDashboard name={dashboardName(user?.name, "운영자")} isAdmin={user?.role === "ADMIN"} />;
}

function StudentDashboard({ name }: { name: string }) {
  const sessionsQuery = useQuery({ queryKey: ["attendance", "my-sessions"], queryFn: getMyAttendanceSessions });
  const summaryQuery = useQuery({ queryKey: ["attendance", "my-summary"], queryFn: getMyAttendanceSummary });
  const noticesQuery = useQuery({ queryKey: ["notices", "dashboard", "mine"], queryFn: () => getMyNotices({ page: 1 }) });
  const sessions = sessionsQuery.data ?? [];
  const scheduleItems: DashboardScheduleItem[] = sessions.map((session) => ({
    id: session.id,
    title: session.title || session.subjectName,
    meta: `${session.className} · ${session.room || "강의실 미정"}`,
    startsAt: session.startsAt,
    status: session.status,
  }));
  const tasks: DashboardTask[] = sessions
    .filter((session) => !session.attendance || session.attendance.status === "UNPROCESSED")
    .map((session) => ({
      id: `attendance:${session.id}`,
      title: `${session.subjectName} 출석 확인`,
      detail: `${formatTime(session.startsAt)} 수업 · ${session.codeAvailable ? "출석 코드 입력 가능" : "수업 시작 전"}`,
      badge: session.codeAvailable ? "지금 확인" : "오늘",
      tone: session.codeAvailable ? "danger" : "warning",
      to: "/attendance",
    }));
  const activities: DashboardActivity[] = sessions
    .filter((session): session is StudentAttendanceSession & { attendance: NonNullable<StudentAttendanceSession["attendance"]> } => Boolean(session.attendance))
    .map((session) => ({
      id: `student-session:${session.id}`,
      title: `${session.subjectName} · ${ATTENDANCE_LABELS[session.attendance.status] ?? session.attendance.status}`,
      occurredAt: session.attendance.checkedAt || session.startsAt,
      tone: session.attendance.status === "PRESENT" ? "primary" : "muted",
    }));
  if (summaryQuery.data?.attendanceRate !== null && summaryQuery.data?.attendanceRate !== undefined) {
    activities.unshift({ id: "attendance-summary", title: `누적 출석률 ${summaryQuery.data.attendanceRate}% · 대상 ${summaryQuery.data.countedTotal}회`, occurredAt: new Date().toISOString(), tone: "primary" });
  }
  return (
    <div className="dashboard-page">
      <DashboardHeader name={name} />
      <div className="dashboard-workspace">
        <DashboardPanel title="오늘의 일정" to="/attendance">
          {sessionsQuery.isPending ? <DashboardLoading label="오늘 일정을" /> : sessionsQuery.isError ? <DashboardError label="오늘 일정을" /> : <ScheduleList items={scheduleItems} />}
        </DashboardPanel>
        <DashboardPanel title="긴급한 일" to="/learning">
          {sessionsQuery.isPending ? <DashboardLoading label="할 일을" /> : sessionsQuery.isError ? <DashboardError label="할 일을" /> : <TaskList items={tasks} />}
        </DashboardPanel>
        <DashboardPanel title="최근 공지사항" to="/notices">
          {noticesQuery.isPending ? <DashboardLoading label="공지사항을" /> : noticesQuery.isError ? <DashboardError label="공지사항을" /> : <NoticeList items={noticesQuery.data.items} />}
        </DashboardPanel>
        <DashboardPanel title="최근 활동" to="/attendance">
          {sessionsQuery.isPending || summaryQuery.isPending ? <DashboardLoading label="최근 활동을" /> : sessionsQuery.isError || summaryQuery.isError ? <DashboardError label="최근 활동을" /> : <ActivityList items={activities} />}
        </DashboardPanel>
      </div>
    </div>
  );
}

function InstructorDashboard({ name }: { name: string }) {
  const classesQuery = useQuery({ queryKey: ["instructor", "classes"], queryFn: getInstructorClasses });
  const classIds = [...new Set((classesQuery.data ?? []).map((item) => item.id))];
  const sessionsQuery = useQuery({
    queryKey: ["instructor", "dashboard", "sessions", todayString(), classIds],
    queryFn: () => getSessionsForClasses(classIds),
    enabled: classesQuery.isSuccess,
  });
  const noticesQuery = useQuery({ queryKey: ["notices", "dashboard", "mine"], queryFn: () => getMyNotices({ page: 1 }) });
  const sessions = sessionsQuery.data ?? [];
  const scheduleItems: DashboardScheduleItem[] = sessions.map((session) => ({ id: session.id, title: session.title || session.subjectName, meta: `${session.courseOfferingName} · ${session.room || "강의실 미정"}`, startsAt: session.startsAt, status: session.status }));
  const tasks: DashboardTask[] = sessions.filter((session) => session.status === "COMPLETED" && !session.journalWrittenAt).map((session) => ({ id: `journal:${session.id}`, title: `${session.subjectName} 수업 일지 작성`, detail: `${formatTime(session.endsAt)} 종료 수업`, badge: "오늘 마감", tone: "danger", to: "/schedule" }));
  const activities: DashboardActivity[] = sessions.map((session) => ({ id: `instructor-session:${session.id}`, title: `${session.subjectName} 수업 ${SESSION_LABELS[session.status] ?? session.status}`, occurredAt: session.updatedAt, tone: session.status === "IN_PROGRESS" || session.status === "COMPLETED" ? "primary" : "muted" }));
  return (
    <div className="dashboard-page">
      <DashboardHeader name={name} />
      <div className="dashboard-workspace">
        <DashboardPanel title="오늘의 일정" to="/schedule">
          {classesQuery.isPending || sessionsQuery.isPending ? <DashboardLoading label="오늘 일정을" /> : classesQuery.isError || sessionsQuery.isError ? <DashboardError label="오늘 일정을" /> : <ScheduleList items={scheduleItems} />}
        </DashboardPanel>
        <DashboardPanel title="긴급한 일" to="/schedule">
          {classesQuery.isPending || sessionsQuery.isPending ? <DashboardLoading label="할 일을" /> : classesQuery.isError || sessionsQuery.isError ? <DashboardError label="할 일을" /> : <TaskList items={tasks} />}
        </DashboardPanel>
        <DashboardPanel title="최근 공지사항" to="/notices">
          {noticesQuery.isPending ? <DashboardLoading label="공지사항을" /> : noticesQuery.isError ? <DashboardError label="공지사항을" /> : <NoticeList items={noticesQuery.data.items} />}
        </DashboardPanel>
        <DashboardPanel title="최근 활동" to="/schedule">
          {sessionsQuery.isPending ? <DashboardLoading label="최근 활동을" /> : sessionsQuery.isError ? <DashboardError label="최근 활동을" /> : <ActivityList items={activities} />}
        </DashboardPanel>
      </div>
    </div>
  );
}

function inquiryTask(inquiry: InquiryListItem): DashboardTask {
  return { id: `inquiry:${inquiry.id}`, title: inquiry.title, detail: `${inquiry.className || "일반 문의"} · 답변 ${inquiry.replyCount}건`, badge: inquiry.status === "RECEIVED" ? "답변 대기" : "처리 중", tone: inquiry.status === "RECEIVED" ? "danger" : "warning", to: "/inquiries" };
}

function examTask(exam: Exam): DashboardTask {
  const isGrading = exam.status === "GRADING";
  return { id: `exam:${exam.id}`, title: exam.title, detail: `${exam.courseOfferingName} · ${isGrading ? "채점 결과 확인 필요" : "시험 설정 확인 필요"}`, badge: isGrading ? "채점 필요" : "예약 전", tone: isGrading ? "danger" : "warning", to: "/learning" };
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  BACKUP_RESTORE_TESTED: "백업 복원 상태를 점검했습니다.",
  CLASS_CREATED: "새 반을 등록했습니다.",
  CLASS_UPDATED: "반 정보를 수정했습니다.",
  CLASS_SESSION_STATUS_CHANGED: "수업 상태를 변경했습니다.",
  ATTENDANCE_MANUALLY_CHANGED: "출석 정보를 수정했습니다.",
  EXAM_CREATED: "시험을 등록했습니다.",
  EXAM_SCHEDULED: "시험 일정을 확정했습니다.",
  EXAM_RESULTS_PUBLISHED: "시험 결과를 공개했습니다.",
  EXAM_TEMPLATE_CREATED: "시험 템플릿을 등록했습니다.",
  EXAM_TEMPLATE_UPDATED: "시험 템플릿을 수정했습니다.",
  HANDOVER_CREATED: "강사 인수인계를 등록했습니다.",
  HANDOVER_ACKNOWLEDGED: "강사 인수인계를 확인했습니다.",
  INQUIRY_CREATED: "문의사항을 등록했습니다.",
  INQUIRY_REPLIED: "문의사항에 답변했습니다.",
  NOTICE_CREATED: "공지사항을 등록했습니다.",
  NOTICE_UPDATED: "공지사항을 수정했습니다.",
  QUESTION_CREATED: "문제은행에 문항을 등록했습니다.",
  QUESTION_UPDATED: "문제은행 문항을 수정했습니다.",
  STUDENT_SIGNUP_APPROVED: "학생 가입을 승인했습니다.",
  USER_DEACTIVATED: "사용자 계정을 비활성화했습니다.",
  USER_REACTIVATED: "사용자 계정을 다시 활성화했습니다.",
};

function auditActivity(log: AuditLog): DashboardActivity {
  const action = AUDIT_ACTION_LABELS[log.action] ?? `${log.action} 작업을 처리했습니다.`;
  const actor = log.actorName ? `${log.actorName}님이` : "시스템이";
  return { id: `audit:${log.id}`, title: `${actor} ${action}`, occurredAt: log.createdAt, tone: log.result === "SUCCESS" ? "primary" : "muted" };
}

function OperationDashboard({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const classesQuery = useQuery({ queryKey: ["managed-classes", "dashboard"], queryFn: () => getManagedClasses(false) });
  const operatingClassIds = (classesQuery.data?.items ?? []).filter((item) => item.derivedStatus === "OPERATING").map((item) => item.id);
  const sessionsQuery = useQuery({ queryKey: ["operations", "dashboard", "sessions", todayString(), operatingClassIds], queryFn: () => getSessionsForClasses(operatingClassIds), enabled: classesQuery.isSuccess });
  const pendingQuery = useQuery({ queryKey: ["users", "dashboard", "pending"], queryFn: () => getUsers({ role: "STUDENT", status: "PENDING_APPROVAL", page: 1, limit: 1 }) });
  const inquiriesQuery = useQuery({ queryKey: ["inquiries", "dashboard"], queryFn: () => getInquiries({ page: 1 }) });
  const noticesQuery = useQuery({ queryKey: ["notices", "dashboard", "staff"], queryFn: () => getNotices({ page: 1 }) });
  const examsQuery = useQuery({ queryKey: ["exams", "dashboard"], queryFn: () => getExams({ page: 1, limit: 20 }) });
  const auditQuery = useQuery({ queryKey: ["operations", "dashboard", "audit"], queryFn: () => getAuditLogs({ page: 1 }), enabled: isAdmin });
  const sessions = sessionsQuery.data ?? [];
  const scheduleItems: DashboardScheduleItem[] = sessions.map((session) => ({ id: session.id, title: session.title || session.subjectName, meta: `${session.courseOfferingName} · ${session.room || "강의실 미정"}`, startsAt: session.startsAt, status: session.status }));
  const inquiryTasks = (inquiriesQuery.data?.items ?? []).filter((item) => item.status === "RECEIVED" || item.status === "IN_PROGRESS").map(inquiryTask);
  const examTasks = (examsQuery.data?.items ?? []).filter((item) => item.status === "DRAFT" || item.status === "GRADING").map(examTask);
  const pendingCount = pendingQuery.data?.pagination.total ?? 0;
  const tasks: DashboardTask[] = [
    ...(pendingCount > 0 ? [{ id: "pending-students", title: `가입 승인 대기 학생 ${pendingCount}명`, detail: "학생 정보를 확인하고 가입 승인을 처리하세요.", badge: "오늘 확인", tone: "danger" as const, to: "/users" }] : []),
    ...inquiryTasks,
    ...examTasks,
  ];
  const fallbackActivities: DashboardActivity[] = [
    ...(inquiriesQuery.data?.items ?? []).map((item) => ({ id: `inquiry-activity:${item.id}`, title: `문의사항 ‘${item.title}’이 업데이트됐습니다.`, occurredAt: item.updatedAt, tone: "primary" as const })),
    ...(noticesQuery.data?.items ?? []).map((item) => ({ id: `notice-activity:${item.id}`, title: `공지사항 ‘${item.title}’이 등록됐습니다.`, occurredAt: item.createdAt, tone: "muted" as const })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const activities = isAdmin ? (auditQuery.data?.items ?? []).map(auditActivity) : fallbackActivities;
  const taskQueriesPending = pendingQuery.isPending || inquiriesQuery.isPending || examsQuery.isPending;
  const taskQueriesError = pendingQuery.isError || inquiriesQuery.isError || examsQuery.isError;
  const activityPending = isAdmin ? auditQuery.isPending : inquiriesQuery.isPending || noticesQuery.isPending;
  const activityError = isAdmin ? auditQuery.isError : inquiriesQuery.isError || noticesQuery.isError;
  return (
    <div className="dashboard-page">
      <DashboardHeader name={name} />
      <div className="dashboard-workspace">
        <DashboardPanel title="오늘의 일정" to="/classes">
          {classesQuery.isPending || sessionsQuery.isPending ? <DashboardLoading label="오늘 일정을" /> : classesQuery.isError || sessionsQuery.isError ? <DashboardError label="오늘 일정을" /> : <ScheduleList items={scheduleItems} />}
        </DashboardPanel>
        <DashboardPanel title="긴급한 일" to="/users">
          {taskQueriesPending ? <DashboardLoading label="할 일을" /> : taskQueriesError ? <DashboardError label="할 일을" /> : <TaskList items={tasks} />}
        </DashboardPanel>
        <DashboardPanel title="최근 공지사항" to="/notices">
          {noticesQuery.isPending ? <DashboardLoading label="공지사항을" /> : noticesQuery.isError ? <DashboardError label="공지사항을" /> : <NoticeList items={noticesQuery.data.items} />}
        </DashboardPanel>
        <DashboardPanel title="최근 활동" to={isAdmin ? "/system" : "/inquiries"}>
          {activityPending ? <DashboardLoading label="최근 활동을" /> : activityError ? <DashboardError label="최근 활동을" /> : <ActivityList items={activities} />}
        </DashboardPanel>
      </div>
    </div>
  );
}

type PlaceholderPageProps = { title: string; description: string };

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <section className="page-header"><div><h1>{title}</h1><p>{description}</p></div></section>
      <section className="content-card placeholder-card"><ClipboardList size={36} /><h2>{title} 화면 준비 완료</h2><p>해당 백엔드 단계와 함께 실제 기능을 연결합니다.</p></section>
    </>
  );
}
