import FullCalendar from "@fullcalendar/react";
import koLocale from "@fullcalendar/core/locales/ko";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventClickArg, EventInput } from "@fullcalendar/core";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  NotebookPen,
  Play,
} from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Modal } from "../../components/ui/Modal";
import { ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  changeClassSessionStatus,
  getClassSessions,
  getInstructorClasses,
  getManagedClasses,
  getSessionJournalHistories,
  updateSessionJournal,
  type ClassSession,
  type SessionStatus,
} from "../classes/class-management.api";
import { AttendanceCodeAction } from "../attendance/AttendanceCodeAction";
import { SessionAttendanceAction } from "../attendance/SessionAttendanceAction";
import "./schedule.css";

type ScheduleClass = { id: string; name: string };
type SessionEditor =
  | { type: "journal"; session: ClassSession }
  | { type: "start"; session: ClassSession }
  | { type: "complete"; session: ClassSession }
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

const STATUS_COLORS: Record<SessionStatus, string> = {
  SCHEDULED: "var(--text-secondary)",
  IN_PROGRESS: "var(--success)",
  COMPLETED: "var(--primary)",
  CANCELED: "var(--danger)",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function scheduledMinutes(session: ClassSession): number {
  return Math.max(
    1,
    Math.round(
      (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) /
        60_000,
    ),
  );
}

export function SchedulePage() {
  const { user } = useAuth();
  const isInstructor = user?.role === "INSTRUCTOR";

  return isInstructor ? (
    <ScheduleCalendar
      title="내 수업 일정"
      description="내가 담당하는 반의 수업 일정을 달력으로 확인합니다."
      useClasses={useInstructorScheduleClasses}
    />
  ) : (
    <ScheduleCalendar
      title="수업 일정"
      description="현재 운영 중인 전체 반의 수업 일정을 달력으로 확인합니다."
      useClasses={useManagedScheduleClasses}
    />
  );
}

function useInstructorScheduleClasses() {
  const query = useQuery({
    queryKey: ["schedule", "instructor-classes"],
    queryFn: getInstructorClasses,
  });
  const classes = useMemo<ScheduleClass[]>(() => {
    const map = new Map<string, string>();
    for (const item of query.data ?? []) map.set(item.id, item.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [query.data]);
  return { classes, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch };
}

function useManagedScheduleClasses() {
  const query = useQuery({
    queryKey: ["schedule", "managed-classes"],
    queryFn: () => getManagedClasses(false),
  });
  const classes = useMemo<ScheduleClass[]>(
    () => (query.data?.items ?? []).map((item) => ({ id: item.id, name: item.name })),
    [query.data],
  );
  return { classes, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch };
}

function ScheduleCalendar({
  title,
  description,
  useClasses,
}: {
  title: string;
  description: string;
  useClasses: () => {
    classes: ScheduleClass[];
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
}) {
  const queryClient = useQueryClient();
  const { classes, isLoading, isError, error, refetch } = useClasses();
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionStatus | "">("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editor, setEditor] = useState<SessionEditor>(null);

  const classesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of classes) map.set(item.id, item.name);
    return map;
  }, [classes]);

  const sessionsQueries = useQueries({
    queries: classes.map((item) => ({
      queryKey: ["schedule", "sessions", item.id, range?.start, range?.end],
      queryFn: () => getClassSessions(item.id, { startDate: range!.start, endDate: range!.end }),
      enabled: Boolean(range),
    })),
  });

  const refreshSessions = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["schedule", "sessions"] });
  };

  const allSessions = useMemo(
    () => sessionsQueries.flatMap((query) => query.data ?? []),
    [sessionsQueries],
  );

  const filteredSessions = useMemo(
    () =>
      allSessions.filter(
        (session) =>
          (!classFilter || session.classId === classFilter) &&
          (!statusFilter || session.status === statusFilter),
      ),
    [allSessions, classFilter, statusFilter],
  );

  const events: EventInput[] = useMemo(
    () =>
      filteredSessions.map((session) => ({
        id: session.id,
        title: `${classesById.get(session.classId) ?? ""} · ${session.subjectName}`,
        start: session.startsAt,
        end: session.endsAt,
        backgroundColor: STATUS_COLORS[session.status],
        borderColor: STATUS_COLORS[session.status],
        extendedProps: { session },
      })),
    [classesById, filteredSessions],
  );

  const selectedSession = selectedSessionId
    ? allSessions.find((item) => item.id === selectedSessionId) ?? null
    : null;

  const journalMutation = useMutation({
    mutationFn: ({
      session,
      title: journalTitle,
      lessonContent,
    }: {
      session: ClassSession;
      title: string;
      lessonContent: string;
    }) => updateSessionJournal(session.classId, session.id, { title: journalTitle, lessonContent }),
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
    }) => changeClassSessionStatus(session.classId, session.id, status, completedMinutes),
    onSuccess: async () => {
      setEditor(null);
      await refreshSessions();
    },
  });

  const journalSession = editor?.type === "journal" ? editor.session : null;
  const journalHistoryQuery = useQuery({
    queryKey: ["schedule", "sessions", journalSession?.classId, journalSession?.id, "journal-history"],
    queryFn: () => getSessionJournalHistories(journalSession!.classId, journalSession!.id),
    enabled: Boolean(journalSession?.journalWrittenAt),
  });

  if (isLoading) return <LoadingState message="수업 일정을 불러오고 있습니다." />;
  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />;

  return (
    <div className="page-stack schedule-page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>

      <div className="filter-bar schedule-filter-bar">
        <label className="filter-control">
          <span className="sr-only">반</span>
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="">전체 반</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span className="sr-only">상태</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SessionStatus | "")}
          >
            <option value="">전체 상태</option>
            {(Object.keys(STATUS_LABELS) as SessionStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="surface-card schedule-calendar-card">
        <FullCalendar
          plugins={[timeGridPlugin, listPlugin]}
          initialView="timeGridWeek"
          locale={koLocale}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,listWeek" }}
          firstDay={1}
          hiddenDays={[0, 6]}
          slotMinTime="08:00:00"
          slotMaxTime="21:00:00"
          scrollTime="09:00:00"
          allDaySlot={false}
          height={700}
          nowIndicator
          events={events}
          eventClick={(info: EventClickArg) => {
            const session = info.event.extendedProps.session as ClassSession;
            setSelectedSessionId(session.id);
            setEditor(null);
          }}
          datesSet={(arg) => {
            const start = toDateStr(arg.start);
            const end = toDateStr(new Date(arg.end.getTime() - 86_400_000));
            setRange((current) =>
              current?.start === start && current?.end === end ? current : { start, end },
            );
          }}
        />
      </section>

      {selectedSession && (
        <Modal
          title="수업 일정 상세"
          description={`${classesById.get(selectedSession.classId) ?? ""} · ${selectedSession.subjectName}`}
          onClose={() => {
            setSelectedSessionId(null);
            setEditor(null);
          }}
        >
          <div className="stack schedule-detail">
            <div className="schedule-detail__meta">
              <div>
                <CalendarDays size={16} aria-hidden="true" />
                <span>{formatDateTime(selectedSession.startsAt)}</span>
              </div>
              <div>
                <Clock3 size={16} aria-hidden="true" />
                <span>
                  {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(selectedSession.startsAt))}
                  ~
                  {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(selectedSession.endsAt))}
                  {" · "}
                  {selectedSession.room || "강의실 미설정"}
                </span>
              </div>
            </div>

            <div className="cluster">
              <span className={`status-badge ${STATUS_CLASSES[selectedSession.status]}`}>
                {STATUS_LABELS[selectedSession.status]}
              </span>
              {selectedSession.kind === "MAKEUP" && (
                <span className="status-badge status-badge--warning">보강</span>
              )}
              <span className="status-badge status-badge--info">{selectedSession.instructor.name} 강사</span>
            </div>

            <p className="schedule-detail__course">{selectedSession.courseOfferingName}</p>

            {selectedSession.lessonContent && (
              <div className="session-content-preview">
                <strong>
                  수업 일지
                  {selectedSession.title ? ` · ${selectedSession.title}` : ""}
                </strong>
                <p>{selectedSession.lessonContent}</p>
              </div>
            )}

            <div className="schedule-detail__actions">
              <AttendanceCodeAction
                classId={selectedSession.classId}
                sessionId={selectedSession.id}
                sessionTitle={selectedSession.subjectName}
                sessionStatus={selectedSession.status}
              />

              {(selectedSession.status === "IN_PROGRESS" || selectedSession.status === "COMPLETED") && (
                <SessionAttendanceAction
                  sessionId={selectedSession.id}
                  sessionTitle={selectedSession.subjectName}
                  sessionStartsAt={selectedSession.startsAt}
                />
              )}

              {(selectedSession.status === "IN_PROGRESS" || selectedSession.status === "COMPLETED") && (
                <button
                  type="button"
                  className="button button--secondary button--compact"
                  onClick={() => setEditor({ type: "journal", session: selectedSession })}
                >
                  <NotebookPen size={14} />
                  {selectedSession.journalWrittenAt ? "수업 일지 수정" : "수업 일지"}
                </button>
              )}

              {selectedSession.status === "SCHEDULED" && (
                <button
                  type="button"
                  className="button button--primary button--compact"
                  onClick={() => setEditor({ type: "start", session: selectedSession })}
                >
                  <Play size={14} />
                  수업 시작
                </button>
              )}

              {selectedSession.status === "IN_PROGRESS" && (
                <button
                  type="button"
                  className="button button--primary button--compact"
                  onClick={() => setEditor({ type: "complete", session: selectedSession })}
                >
                  <CheckCircle2 size={14} />
                  수업 완료
                </button>
              )}
            </div>

            {editor?.type === "journal" && (
              <form
                className="stack schedule-journal-form"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  journalMutation.mutate({
                    session: selectedSession,
                    title: String(formData.get("title") ?? "").trim(),
                    lessonContent: String(formData.get("lessonContent") ?? "").trim(),
                  });
                }}
              >
                <label className="form-field form-field--flush">
                  <span>수업 제목</span>
                  <input
                    name="title"
                    maxLength={200}
                    required
                    placeholder="예: 각질 제거 실습 2차"
                    defaultValue={selectedSession.title ?? selectedSession.subjectName}
                  />
                </label>

                <label className="form-field">
                  <span>수업 내용</span>
                  <textarea
                    name="lessonContent"
                    rows={8}
                    maxLength={10_000}
                    required
                    placeholder="진행한 내용, 학생 반응, 다음 수업에 이어서 할 것 등을 자유롭게 적어 주세요."
                    defaultValue={selectedSession.lessonContent ?? ""}
                  />
                </label>

                {selectedSession.journalWrittenAt && (journalHistoryQuery.data?.length ?? 0) > 0 && (
                  <details className="journal-history">
                    <summary>변경 이력 {journalHistoryQuery.data?.length}건</summary>
                    <ol>
                      {journalHistoryQuery.data?.map((history) => (
                        <li key={history.id}>
                          <strong>
                            {formatDateTime(history.changedAt)} · {history.changedBy?.name ?? "알 수 없음"} ·{" "}
                            {history.previousTitle === null ? "작성" : "수정"}
                          </strong>
                          <p>{history.newTitle}</p>
                          <p className="journal-history__content">{history.newLessonContent}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                {journalMutation.isError && (
                  <div className="form-alert" role="alert">
                    {getErrorMessage(journalMutation.error)}
                  </div>
                )}

                <div className="dialog__actions">
                  <button type="submit" className="button button--primary" disabled={journalMutation.isPending}>
                    {journalMutation.isPending ? "저장 중..." : "일지 저장"}
                  </button>
                </div>
              </form>
            )}

            {editor?.type === "start" && (
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
                    className="button button--primary"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ session: selectedSession, status: "IN_PROGRESS" })}
                  >
                    {statusMutation.isPending ? "처리 중..." : "수업 시작"}
                  </button>
                </div>
              </div>
            )}

            {editor?.type === "complete" && (
              <form
                className="stack"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  statusMutation.mutate({
                    session: selectedSession,
                    status: "COMPLETED",
                    completedMinutes: Number(formData.get("completedMinutes")),
                  });
                }}
              >
                <label className="form-field form-field--flush">
                  <span>실제 교육 시간(분)</span>
                  <input
                    name="completedMinutes"
                    type="number"
                    min={1}
                    max={1440}
                    defaultValue={scheduledMinutes(selectedSession)}
                    required
                  />
                </label>

                {statusMutation.isError && (
                  <div className="form-alert" role="alert">
                    {getErrorMessage(statusMutation.error)}
                  </div>
                )}

                <div className="dialog__actions">
                  <button type="submit" className="button button--primary" disabled={statusMutation.isPending}>
                    {statusMutation.isPending ? "완료 처리 중..." : "수업 완료"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
