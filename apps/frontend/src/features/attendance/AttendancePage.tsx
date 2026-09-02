import { CheckCircle2, Clock3, KeyRound } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import {
  getMyAttendanceSessions,
  submitAttendanceCode,
  type StudentAttendanceSession,
} from "./attendance.api";

const ATTENDANCE_LABELS = {
  UNPROCESSED: "미처리",
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EARLY_LEAVE: "조퇴",
  EXCUSED: "공결",
} as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
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

  const sessionsQuery = useQuery({
    queryKey: ["attendance", "my-sessions"],
    queryFn: getMyAttendanceSessions,
    enabled: user?.role === "STUDENT",
  });

  const submitMutation = useMutation({
    mutationFn: ({
      classSessionId,
      code,
    }: {
      classSessionId: string;
      code: string;
    }) => submitAttendanceCode(classSessionId, code),
    onSuccess: async () => {
      await sessionsQuery.refetch();
    },
  });

  if (user?.role !== "STUDENT") {
    return (
      <div className="page-stack attendance-page">
        <section className="page-header">
          <div>
            <h1>출석</h1>
            <p>출석 코드는 실제 수업 카드에서 생성할 수 있습니다.</p>
          </div>
        </section>

        <section className="content-card guidance-card">
          <div className="info-banner">
            <KeyRound size={20} />
            <div>
              <strong>출석 코드 생성 위치</strong>
              <p>
                강사는 내 수업 화면, 관리자는 반 관리의 실제 수업 카드에서 출석
                코드를 생성합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (sessionsQuery.isLoading) {
    return <LoadingState message="오늘 수업을 불러오고 있습니다." />;
  }

  if (sessionsQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(sessionsQuery.error)}
        onRetry={() => void sessionsQuery.refetch()}
      />
    );
  }

  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="page-stack attendance-page attendance-page--student">
      <section className="page-header">
        <div>
          <h1>출석</h1>
          <p>
            선생님이 안내한 4자리 코드는 발급 후 5분 동안 사용할 수 있습니다.
          </p>
        </div>
      </section>

      {sessions.length === 0 ? (
        <EmptyState
          title="오늘 출석 대상 수업이 없습니다."
          description="수강 중인 반의 오늘 수업이 여기에 표시됩니다."
        />
      ) : (
        <div className="data-list">
          {sessions.map((session) => (
            <SessionAttendanceCard
              key={session.id}
              session={session}
              onSubmit={(code) =>
                submitMutation.mutateAsync({
                  classSessionId: session.id,
                  code,
                })
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

/**
 * 수업 한 건의 출석 상태와 입력을 담는다.
 * 이미 처리된 출석은 입력 자리를 아예 두지 않아 다시 낼 수 없다.
 */
function SessionAttendanceCard({ session, onSubmit }: SessionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const attendance = session.attendance;
  const done = attendance !== null && attendance.status !== "UNPROCESSED";
  const inProgress = session.status === "IN_PROGRESS";

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
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
    <article
      className={`content-card attendance-session-card ${
        done ? "attendance-session-card--done" : ""
      }`}
    >
      <header className="attendance-session-card__header">
        <div>
          <strong>{session.subjectName}</strong>
          <p>
            {session.courseOfferingName} · {session.className}
          </p>
          <small>
            <Clock3 size={13} />
            {formatTime(session.startsAt)}~{formatTime(session.endsAt)} ·{" "}
            {session.room || "강의실 미정"}
          </small>
        </div>

        <span
          className={`status-badge ${
            done ? "status-badge--success" : "status-badge--neutral"
          }`}
        >
          {attendance ? ATTENDANCE_LABELS[attendance.status] : "미처리"}
        </span>
      </header>

      {done ? (
        <div className="info-banner info-banner--success">
          <CheckCircle2 size={20} />
          <div>
            <strong>
              {ATTENDANCE_LABELS[attendance.status]} 처리되었습니다.
            </strong>
            <p>
              {attendance.checkedAt
                ? `${formatDateTime(attendance.checkedAt)} 기준`
                : "이 수업은 더 이상 코드를 입력하지 않습니다."}
            </p>
          </div>
        </div>
      ) : !inProgress ? (
        <p className="field-hint">
          수업이 시작되면 출석 코드를 입력할 수 있습니다.
        </p>
      ) : !session.codeAvailable ? (
        <p className="field-hint">
          선생님이 출석 코드를 만들면 여기에 입력할 수 있습니다.
        </p>
      ) : (
        <form className="stack attendance-entry-form" onSubmit={handleSubmit}>
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

          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="button button--primary"
            disabled={pending}
          >
            <KeyRound size={16} />
            {pending ? "확인 중..." : "출석 확인"}
          </button>
        </form>
      )}
    </article>
  );
}
