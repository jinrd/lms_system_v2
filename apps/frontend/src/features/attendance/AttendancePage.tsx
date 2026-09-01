import { CheckCircle2, KeyRound } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import {
  getMyAttendanceSessions,
  submitAttendanceCode,
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    submitMutation.mutate({
      classSessionId: String(formData.get("classSessionId") ?? ""),
      code: String(formData.get("code") ?? ""),
    });
  };

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
          <h1>출석 코드 입력</h1>
          <p>선생님이 안내한 4자리 코드는 발급 후 5분 동안 사용할 수 있습니다.</p>
        </div>
      </section>

      {sessions.length ? (
        <section className="content-card attendance-entry-card">
          <header className="attendance-entry-card__header">
            <span className="attendance-entry-card__icon" aria-hidden="true">
              <KeyRound size={22} />
            </span>
            <div>
              <h2>오늘 수업 출석</h2>
              <p>수업을 선택한 뒤 숫자 네 자리를 입력하세요.</p>
            </div>
          </header>

          <form className="stack attendance-entry-form" onSubmit={handleSubmit}>
            <label className="form-field form-field--flush">
              <span>오늘 수업</span>
              <select name="classSessionId" required>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatDateTime(session.startsAt)} ·{" "}
                    {session.title || session.subjectName} · {session.className}
                  </option>
                ))}
              </select>
            </label>

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
              <small>숫자 4자리</small>
            </label>

            {submitMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(submitMutation.error)}
              </div>
            )}

            {submitMutation.isSuccess && (
              <div className="info-banner info-banner--success">
                <CheckCircle2 size={20} />
                <div>
                  <strong>
                    {ATTENDANCE_LABELS[submitMutation.data.status]}{" "}
                    처리되었습니다.
                  </strong>
                  <p>
                    처리 시각: {formatDateTime(submitMutation.data.checkedAt)}
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="button button--primary"
              disabled={submitMutation.isPending}
            >
              <KeyRound size={16} />
              {submitMutation.isPending ? "확인 중..." : "출석 확인"}
            </button>
          </form>
        </section>
      ) : (
        <EmptyState
          title="오늘 출석 대상 수업이 없습니다."
          description="수강 중인 반의 오늘 수업이 표시됩니다."
        />
      )}
    </div>
  );
}
