import { CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, KeyRound, Users } from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  getClassSessions,
  getInstructorClasses,
  getManagedClasses,
  type ClassSession,
} from "../classes/class-management.api";
import { AttendanceCodeAction } from "./AttendanceCodeAction";
import {
  getMyAttendanceSessions,
  getMyAttendanceSummary,
  getSessionAttendance,
  submitAttendanceCode,
  updateAttendanceRecord,
  type AttendanceStatus,
  type SessionAttendanceRecord,
  type StudentAttendanceSession,
} from "./attendance.api";
import "./attendance.css";

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  UNPROCESSED: "미처리",
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EARLY_LEAVE: "조퇴",
  EXCUSED: "공결",
};

const STATUS_CLASSES: Record<AttendanceStatus, string> = {
  UNPROCESSED: "status-badge--neutral",
  PRESENT: "status-badge--success",
  LATE: "status-badge--warning",
  ABSENT: "status-badge--danger",
  EARLY_LEAVE: "status-badge--warning",
  EXCUSED: "status-badge--primary",
};

const QUICK_STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function seoulDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AttendancePage() {
  const { user } = useAuth();
  return user?.role === "STUDENT" ? <StudentAttendancePage /> : <StaffAttendancePage />;
}

function StaffAttendancePage() {
  const { user } = useAuth();
  const isInstructor = user?.role === "INSTRUCTOR";
  const today = seoulDate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["attendance", isInstructor ? "instructor-classes" : "managed-classes"],
    queryFn: async () => {
      if (isInstructor) {
        const rows = await getInstructorClasses();
        return [...new Map(rows.map((item) => [item.id, { id: item.id, name: item.name }])).values()];
      }
      const page = await getManagedClasses(false);
      return page.items.map((item) => ({ id: item.id, name: item.name }));
    },
  });

  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);
  const sessionQueries = useQueries({
    queries: classes.map((item) => ({
      queryKey: ["attendance", "sessions", item.id, today],
      queryFn: () => getClassSessions(item.id, { startDate: today, endDate: today }),
    })),
  });

  const classNames = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes]);
  const sessions = useMemo(
    () => sessionQueries.flatMap((query) => query.data ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessionQueries],
  );
  const selected = sessions.find((item) => item.id === selectedId) ?? sessions[0] ?? null;

  if (classesQuery.isLoading || sessionQueries.some((query) => query.isLoading)) {
    return <LoadingState message="오늘 출석 수업을 불러오고 있습니다." />;
  }
  if (classesQuery.isError) {
    return <ErrorState message={getErrorMessage(classesQuery.error)} onRetry={() => void classesQuery.refetch()} />;
  }
  const sessionsError = sessionQueries.find((query) => query.isError);
  if (sessionsError) {
    return <ErrorState message={getErrorMessage(sessionsError.error)} onRetry={() => void sessionsError.refetch()} />;
  }

  return (
    <div className="page-stack attendance-page attendance-page--staff">
      <header className="page-header attendance-page-header">
        <div>
          <h1>출석</h1>
          <p>오늘 수업을 선택하고 학생별 출석 상태를 한 화면에서 처리합니다.</p>
        </div>
        <span className="attendance-date">
          <CalendarDays size={16} />
          {formatDate(`${today}T00:00:00+09:00`)}
        </span>
      </header>

      {sessions.length === 0 ? (
        <section className="surface-card attendance-empty-card">
          <EmptyState
            title="오늘 예정된 수업이 없습니다."
            description="수업 일정에 오늘 수업이 등록되면 출석부가 자동으로 표시됩니다."
          />
        </section>
      ) : (
        <>
          <nav className="attendance-session-strip" aria-label="오늘 수업 선택">
            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={
                  session.id === selected?.id
                    ? "attendance-session-tab attendance-session-tab--active"
                    : "attendance-session-tab"
                }
                aria-current={session.id === selected?.id ? "true" : undefined}
                onClick={() => setSelectedId(session.id)}
              >
                <span>{formatTime(session.startsAt)}</span>
                <strong>{session.subjectName}</strong>
                <small>{classNames.get(session.classId) ?? "반 미지정"}</small>
                <ChevronRight size={16} />
              </button>
            ))}
          </nav>

          {selected && (
            <StaffAttendanceBoard
              key={selected.id}
              session={selected}
              className={classNames.get(selected.classId) ?? "반 미지정"}
            />
          )}
        </>
      )}
    </div>
  );
}

function StaffAttendanceBoard({ session, className }: { session: ClassSession; className: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["sessions", session.id, "attendance"];
  const attendanceQuery = useQuery({
    queryKey,
    queryFn: () => getSessionAttendance(session.id),
  });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ record, status }: { record: SessionAttendanceRecord; status: AttendanceStatus }) => {
      const arrivalRequired = status === "PRESENT" || status === "LATE" || status === "EARLY_LEAVE";
      return updateAttendanceRecord(session.id, record.id, {
        status,
        checkedAt: arrivalRequired ? new Date().toISOString() : undefined,
        reason: "출석 관리 화면에서 수동 처리",
      });
    },
    onMutate: ({ record }) => setUpdatingId(record.id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey }),
    onSettled: () => setUpdatingId(null),
  });

  if (attendanceQuery.isLoading) return <LoadingState message="출석부를 불러오고 있습니다." />;
  if (attendanceQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(attendanceQuery.error)}
        onRetry={() => void attendanceQuery.refetch()}
      />
    );
  }

  const records = attendanceQuery.data ?? [];
  const counts = records.reduce<Record<AttendanceStatus, number>>(
    (result, record) => ({ ...result, [record.status]: result[record.status] + 1 }),
    { UNPROCESSED: 0, PRESENT: 0, LATE: 0, ABSENT: 0, EARLY_LEAVE: 0, EXCUSED: 0 },
  );
  const completed = records.length - counts.UNPROCESSED;

  return (
    <div className="attendance-workspace">
      <section className="surface-card attendance-roster">
        <header className="attendance-class-header">
          <div>
            <div className="attendance-class-title">
              <h2>{className}</h2>
              <span
                className={`status-badge ${
                  session.status === "IN_PROGRESS" ? "status-badge--success" : "status-badge--neutral"
                }`}
              >
                {session.status === "IN_PROGRESS"
                  ? "진행 중"
                  : session.status === "COMPLETED"
                    ? "완료"
                    : session.status === "CANCELED"
                      ? "취소"
                      : "예정"}
              </span>
            </div>
            <p>
              {session.courseOfferingName} · {session.subjectName} · {formatTime(session.startsAt)}~
              {formatTime(session.endsAt)} · {session.room || "강의실 미정"}
            </p>
          </div>
          <AttendanceCodeAction
            classId={session.classId}
            sessionId={session.id}
            sessionTitle={`${className} ${session.subjectName}`}
            sessionStatus={session.status}
          />
        </header>

        <div className="attendance-roster-toolbar">
          <strong>수강생 {records.length}명</strong>
          <span>
            {completed === records.length && records.length > 0
              ? "모든 출석 처리가 완료되었습니다."
              : `${records.length - completed}명의 상태를 확인해 주세요.`}
          </span>
        </div>

        {records.length === 0 ? (
          <EmptyState
            title="출석 대상 학생이 없습니다."
            description="수업이 시작되면 등록된 수강생의 출석부가 생성됩니다."
          />
        ) : (
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th scope="col">번호</th>
                  <th scope="col">이름</th>
                  <th scope="col">현재 상태</th>
                  <th scope="col">확인 시각</th>
                  <th scope="col">출석 처리</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr key={record.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{record.student.name}</strong>
                      <small>{record.student.loginId || "아이디 없음"}</small>
                    </td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASSES[record.status]}`}>
                        {ATTENDANCE_LABELS[record.status]}
                      </span>
                    </td>
                    <td>{record.checkedAt ? formatTime(record.checkedAt) : "-"}</td>
                    <td>
                      <div className="attendance-status-actions">
                        {QUICK_STATUSES.map((status) => (
                          <button
                            type="button"
                            key={status}
                            className={`attendance-status-button attendance-status-button--${status.toLowerCase()} ${
                              record.status === status ? "attendance-status-button--active" : ""
                            }`}
                            aria-pressed={record.status === status}
                            disabled={updatingId === record.id || session.status === "CANCELED"}
                            onClick={() => updateMutation.mutate({ record, status })}
                          >
                            {record.status === status && <Check size={12} />}
                            {ATTENDANCE_LABELS[status]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {updateMutation.isError && (
          <p className="form-error attendance-update-error" role="alert">
            {getErrorMessage(updateMutation.error)}
          </p>
        )}
      </section>

      <aside className="surface-card attendance-summary-panel">
        <header>
          <span>오늘 수업 요약</span>
          <strong>{formatDate(session.startsAt)}</strong>
        </header>
        <div className="attendance-completion">
          <div
            className="attendance-completion__ring"
            style={
              {
                "--progress": `${records.length ? Math.round((completed / records.length) * 100) : 0}%`,
              } as CSSProperties
            }
          >
            <strong>{records.length ? Math.round((completed / records.length) * 100) : 0}%</strong>
            <span>처리</span>
          </div>
          <div>
            <strong>
              {completed} / {records.length}명
            </strong>
            <p>출석 상태 확인</p>
          </div>
        </div>
        <dl className="attendance-summary-list">
          {(
            ["PRESENT", "LATE", "ABSENT", "EARLY_LEAVE", "EXCUSED", "UNPROCESSED"] as AttendanceStatus[]
          ).map((status) => (
            <div key={status}>
              <dt>
                <i className={`attendance-dot attendance-dot--${status.toLowerCase()}`} />
                {ATTENDANCE_LABELS[status]}
              </dt>
              <dd>{counts[status]}명</dd>
            </div>
          ))}
        </dl>
        <div className="attendance-summary-note">
          <Users size={17} />
          <p>상태 변경은 즉시 저장되며 변경 이력에 기록됩니다.</p>
        </div>
      </aside>
    </div>
  );
}

function StudentAttendancePage() {
  const sessionsQuery = useQuery({
    queryKey: ["attendance", "my-sessions"],
    queryFn: getMyAttendanceSessions,
  });
  const summaryQuery = useQuery({
    queryKey: ["attendance", "my-summary"],
    queryFn: getMyAttendanceSummary,
  });
  const submitMutation = useMutation({
    mutationFn: ({ classSessionId, code }: { classSessionId: string; code: string }) =>
      submitAttendanceCode(classSessionId, code),
    onSuccess: async () => Promise.all([sessionsQuery.refetch(), summaryQuery.refetch()]),
  });

  if (sessionsQuery.isLoading) return <LoadingState message="오늘 수업을 불러오고 있습니다." />;
  if (sessionsQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(sessionsQuery.error)}
        onRetry={() => void sessionsQuery.refetch()}
      />
    );
  }

  const sessions = sessionsQuery.data ?? [];
  const summary = summaryQuery.data;
  return (
    <div className="page-stack attendance-page attendance-page--student">
      <header className="page-header attendance-page-header">
        <div>
          <h1>내 출석</h1>
          <p>선생님이 안내한 4자리 코드는 발급 후 5분 동안 사용할 수 있습니다.</p>
        </div>
      </header>
      {summary && (
        <section className="surface-card student-attendance-summary">
          <div>
            <span>누적 출석률</span>
            <strong>
              {summary.attendanceRate ?? "-"}
              <small>%</small>
            </strong>
          </div>
          <dl>
            <div><dt>출석</dt><dd>{summary.present}</dd></div>
            <div><dt>지각</dt><dd>{summary.late}</dd></div>
            <div><dt>결석</dt><dd>{summary.absent}</dd></div>
            <div><dt>공결</dt><dd>{summary.excused}</dd></div>
          </dl>
        </section>
      )}
      {sessions.length === 0 ? (
        <section className="surface-card">
          <EmptyState
            title="오늘 출석 대상 수업이 없습니다."
            description="수강 중인 반의 오늘 수업이 여기에 표시됩니다."
          />
        </section>
      ) : (
        <div className="student-attendance-grid">
          {sessions.map((session) => (
            <SessionAttendanceCard
              key={session.id}
              session={session}
              onSubmit={(code) =>
                submitMutation.mutateAsync({ classSessionId: session.id, code })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

type SessionCardProps = {
  session: StudentAttendanceSession;
  onSubmit: (code: string) => Promise<unknown>;
};

function SessionAttendanceCard({ session, onSubmit }: SessionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attendance = session.attendance;
  const done = attendance !== null && attendance.status !== "UNPROCESSED";
  const inProgress = session.status === "IN_PROGRESS";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      await onSubmit(String(formData.get("code") ?? ""));
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <article className={`surface-card attendance-session-card ${done ? "attendance-session-card--done" : ""}`}>
      <header className="attendance-session-card__header">
        <div>
          <strong>{session.subjectName}</strong>
          <p>{session.courseOfferingName} · {session.className}</p>
          <small>
            <Clock3 size={13} />
            {formatTime(session.startsAt)}~{formatTime(session.endsAt)} · {session.room || "강의실 미정"}
          </small>
        </div>
        <span className={`status-badge ${done ? STATUS_CLASSES[attendance.status] : "status-badge--neutral"}`}>
          {attendance ? ATTENDANCE_LABELS[attendance.status] : "미처리"}
        </span>
      </header>
      {done ? (
        <div className="info-banner info-banner--success">
          <CheckCircle2 size={20} />
          <div>
            <strong>{ATTENDANCE_LABELS[attendance.status]} 처리되었습니다.</strong>
            <p>
              {attendance.checkedAt
                ? `${formatDateTime(attendance.checkedAt)} 기준`
                : "이 수업은 더 이상 코드를 입력하지 않습니다."}
            </p>
          </div>
        </div>
      ) : !inProgress ? (
        <p className="field-hint">수업이 시작되면 출석 코드를 입력할 수 있습니다.</p>
      ) : !session.codeAvailable ? (
        <p className="field-hint">선생님이 출석 코드를 만들면 여기에 입력할 수 있습니다.</p>
      ) : (
        <form className="attendance-entry-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>4자리 출석 코드</span>
            <input
              className="attendance-code-input"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              minLength={4}
              maxLength={4}
              autoComplete="one-time-code"
              placeholder="0000"
              required
            />
          </label>
          {error && <div className="form-alert" role="alert">{error}</div>}
          <button type="submit" className="button button--primary" disabled={pending}>
            <KeyRound size={16} />
            {pending ? "확인 중..." : "출석 확인"}
          </button>
        </form>
      )}
    </article>
  );
}
