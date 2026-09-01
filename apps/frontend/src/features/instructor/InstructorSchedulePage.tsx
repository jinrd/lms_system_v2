import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Play,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import {
  changeClassSessionStatus,
  getClassSessions,
  getInstructorClasses,
  updateClassSession,
  type ClassSession,
  type SessionStatus,
} from "../classes/class-management.api";
import { AttendanceCodeAction } from "../attendance/AttendanceCodeAction";

type SessionEditor =
  | {
      type: "edit";
      session: ClassSession;
    }
  | {
      type: "start";
      session: ClassSession;
    }
  | {
      type: "complete";
      session: ClassSession;
    }
  | null;

const STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: "예정",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const STATUS_CLASSES: Record<SessionStatus, string> = {
  SCHEDULED: "status-badge--neutral",
  IN_PROGRESS: "status-badge--success",
  COMPLETED: "status-badge--primary",
  CANCELED: "status-badge--danger",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function todayString(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const seoulOffset = 9 * 60 * 60 * 1000;

  return new Date(date.getTime() + seoulOffset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function scheduledMinutes(session: ClassSession): number {
  return Math.max(
    1,
    Math.round(
      (new Date(session.endsAt).getTime() -
        new Date(session.startsAt).getTime()) /
        60_000,
    ),
  );
}

export function InstructorSchedulePage() {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayString);
  const [editor, setEditor] = useState<SessionEditor>(null);

  const endDate = addDays(startDate, 6);

  const classesQuery = useQuery({
    queryKey: ["instructor", "classes"],
    queryFn: getInstructorClasses,
  });

  // 강사 담당 반 목록은 (반 × 담당 교육과정) 단위로 내려오므로 반 기준으로 합친다.
  const classes = Object.values(
    (classesQuery.data ?? []).reduce<
      Record<string, { id: string; name: string; programNames: string[] }>
    >((accumulator, item) => {
      const current = accumulator[item.id] ?? {
        id: item.id,
        name: item.name,
        programNames: [],
      };
      current.programNames.push(item.courseOfferingName);
      accumulator[item.id] = current;
      return accumulator;
    }, {}),
  );
  const selectedClass =
    classes.find((item) => item.id === selectedClassId) ?? classes[0] ?? null;

  const sessionsQueryKey = [
    "instructor",
    "classes",
    selectedClass?.id,
    "sessions",
    startDate,
    endDate,
  ];

  const sessionsQuery = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () =>
      getClassSessions(selectedClass!.id, {
        startDate,
        endDate,
      }),
    enabled: selectedClass !== null,
  });

  const refreshSessions = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: ["instructor", "classes", selectedClass?.id, "sessions"],
    });
  };

  const updateMutation = useMutation({
    mutationFn: ({
      session,
      input,
    }: {
      session: ClassSession;
      input: {
        title?: string;
        lessonContent?: string;
        startsAt?: string;
        endsAt?: string;
        room?: string;
      };
    }) => {
      if (!selectedClass) {
        throw new Error("담당 반을 선택해 주세요.");
      }

      return updateClassSession(selectedClass.id, session.id, input);
    },
    onSuccess: async () => {
      setEditor(null);
      await refreshSessions();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      session,
      status,
      completedMinutes,
    }: {
      session: ClassSession;
      status: "IN_PROGRESS" | "COMPLETED";
      completedMinutes?: number;
    }) => {
      if (!selectedClass) {
        throw new Error("담당 반을 선택해 주세요.");
      }

      return changeClassSessionStatus(
        selectedClass.id,
        session.id,
        status,
        completedMinutes,
      );
    },
    onSuccess: async () => {
      setEditor(null);
      await refreshSessions();
    },
  });

  const handleUpdate = (
    event: FormEvent<HTMLFormElement>,
    session: ClassSession,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const lessonContent = String(formData.get("lessonContent") ?? "").trim();
    const room = String(formData.get("room") ?? "").trim();

    updateMutation.mutate({
      session,
      input: {
        title,
        lessonContent,
        room,
        ...(session.status === "SCHEDULED"
          ? {
              startsAt: toIsoDateTime(String(formData.get("startsAt") ?? "")),
              endsAt: toIsoDateTime(String(formData.get("endsAt") ?? "")),
            }
          : {}),
      },
    });
  };

  const handleComplete = (
    event: FormEvent<HTMLFormElement>,
    session: ClassSession,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    statusMutation.mutate({
      session,
      status: "COMPLETED",
      completedMinutes: Number(formData.get("completedMinutes")),
    });
  };

  if (classesQuery.isLoading) {
    return <LoadingState message="담당 반을 불러오고 있습니다." />;
  }

  if (classesQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(classesQuery.error)}
        onRetry={() => void classesQuery.refetch()}
      />
    );
  }

  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">강사 업무</p>
          <h1>내 수업</h1>
          <p>담당 수업 일정과 진행 상태를 관리합니다.</p>
        </div>
      </section>

      {selectedClass ? (
        <>
          <section className="filter-bar instructor-schedule-filter">
            <label className="filter-control">
              <span className="sr-only">담당 반</span>
              <select
                value={selectedClass.id}
                onChange={(event) => setSelectedClassId(event.target.value)}
              >
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.name} · {classItem.programNames.join(", ")}
                  </option>
                ))}
              </select>
            </label>

            <div className="date-navigation">
              <button
                type="button"
                className="icon-button bordered-icon-button"
                aria-label="이전 주"
                onClick={() => setStartDate((current) => addDays(current, -7))}
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                className="button button--secondary"
                onClick={() => setStartDate(todayString())}
              >
                이번 주
              </button>

              <button
                type="button"
                className="icon-button bordered-icon-button"
                aria-label="다음 주"
                onClick={() => setStartDate((current) => addDays(current, 7))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>

          <section className="surface-card">
            <header className="card-header">
              <div>
                <h2>{selectedClass.name}</h2>
                <p>
                  {startDate} ~ {endDate} · {sessionsQuery.data?.length ?? 0}개
                  수업
                </p>
              </div>

              <span className="status-badge status-badge--success">
                {selectedClass.programNames.join(", ")}
              </span>
            </header>

            {sessionsQuery.isLoading && (
              <LoadingState message="수업 일정을 불러오고 있습니다." />
            )}

            {sessionsQuery.isError && (
              <ErrorState
                message={getErrorMessage(sessionsQuery.error)}
                onRetry={() => void sessionsQuery.refetch()}
              />
            )}

            {!sessionsQuery.isLoading &&
              !sessionsQuery.isError &&
              (sessionsQuery.data?.length ? (
                <div className="instructor-session-list">
                  {sessionsQuery.data.map((session) => (
                    <article
                      className="instructor-session-card"
                      key={session.id}
                    >
                      <div className="date-badge">
                        <CalendarDays size={18} />
                      </div>

                      <div className="instructor-session-card__body">
                        <div className="cluster">
                          <strong>
                            {session.title || session.subjectName}
                          </strong>

                          <span
                            className={`status-badge ${
                              STATUS_CLASSES[session.status]
                            }`}
                          >
                            {STATUS_LABELS[session.status]}
                          </span>
                        </div>

                        <p>{formatDate(session.startsAt)}</p>

                        <small>
                          <Clock3 size={13} />
                          {formatTime(session.startsAt)}~
                          {formatTime(session.endsAt)} ·{" "}
                          {session.room || "강의실 미설정"}
                        </small>

                        {session.lessonContent && (
                          <div className="session-content-preview">
                            {session.lessonContent}
                          </div>
                        )}
                      </div>

                      <div className="instructor-session-card__actions">
                        <AttendanceCodeAction
                          classId={selectedClass.id}
                          sessionId={session.id}
                          sessionTitle={session.title || session.subjectName}
                          sessionStatus={session.status}
                        />

                        {(session.status === "SCHEDULED" ||
                          session.status === "IN_PROGRESS") && (
                          <button
                            type="button"
                            className="button button--secondary button--compact"
                            onClick={() =>
                              setEditor({
                                type: "edit",
                                session,
                              })
                            }
                          >
                            <Pencil size={14} />
                            수정
                          </button>
                        )}

                        {session.status === "SCHEDULED" && (
                          <button
                            type="button"
                            className="button button--primary button--compact"
                            onClick={() =>
                              setEditor({
                                type: "start",
                                session,
                              })
                            }
                          >
                            <Play size={14} />
                            수업 시작
                          </button>
                        )}

                        {session.status === "IN_PROGRESS" && (
                          <button
                            type="button"
                            className="button button--primary button--compact"
                            onClick={() =>
                              setEditor({
                                type: "complete",
                                session,
                              })
                            }
                          >
                            <CheckCircle2 size={14} />
                            수업 완료
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="조회 기간에 수업이 없습니다."
                  description="실장 또는 원장에게 수업 일정을 확인해 주세요."
                />
              ))}
          </section>
        </>
      ) : (
        <EmptyState
          title="담당 반이 없습니다."
          description="반 담당 강사 배정이 완료되면 수업을 확인할 수 있습니다."
        />
      )}

      {editor?.type === "edit" && (
        <Modal
          title="수업 정보 수정"
          description="수업 내용과 실제 운영 정보를 기록합니다."
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => handleUpdate(event, editor.session)}
          >
            <label className="form-field form-field--flush">
              <span>수업명</span>
              <input
                name="title"
                maxLength={200}
                defaultValue={editor.session.title ?? ""}
              />
            </label>

            {editor.session.status === "SCHEDULED" && (
              <div className="form-grid">
                <label className="form-field form-field--flush">
                  <span>시작 시각</span>
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={toLocalDateTime(editor.session.startsAt)}
                    required
                  />
                </label>

                <label className="form-field form-field--flush">
                  <span>종료 시각</span>
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={toLocalDateTime(editor.session.endsAt)}
                    required
                  />
                </label>
              </div>
            )}

            <label className="form-field">
              <span>강의실</span>
              <input
                name="room"
                maxLength={100}
                defaultValue={editor.session.room ?? ""}
              />
            </label>

            <label className="form-field">
              <span>수업 내용</span>
              <textarea
                name="lessonContent"
                rows={7}
                maxLength={10_000}
                defaultValue={editor.session.lessonContent ?? ""}
              />
            </label>

            {updateMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(updateMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditor(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "저장 중..." : "수정사항 저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editor?.type === "start" && (
        <Modal
          title="수업 시작"
          description={`${editor.session.title || editor.session.subjectName} 수업을 시작합니다.`}
          onClose={() => setEditor(null)}
        >
          <div className="stack">
            <div className="info-banner">
              <Play size={19} />

              <div>
                <strong>수업 상태 변경</strong>
                <p>시작 처리 후에는 수업 시간을 변경할 수 없습니다.</p>
              </div>
            </div>

            {statusMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(statusMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditor(null)}
              >
                취소
              </button>

              <button
                type="button"
                className="button button--primary"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    session: editor.session,
                    status: "IN_PROGRESS",
                  })
                }
              >
                {statusMutation.isPending ? "처리 중..." : "수업 시작"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editor?.type === "complete" && (
        <Modal
          title="수업 완료"
          description="실제로 진행한 교육 시간을 입력합니다."
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => handleComplete(event, editor.session)}
          >
            <label className="form-field form-field--flush">
              <span>실제 교육 시간(분)</span>
              <input
                name="completedMinutes"
                type="number"
                min={1}
                max={1440}
                defaultValue={scheduledMinutes(editor.session)}
                required
              />
            </label>

            {statusMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(statusMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditor(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? "완료 처리 중..." : "수업 완료"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
