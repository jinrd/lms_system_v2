import {
  CalendarDays,
  CalendarRange,
  CirclePlus,
  Clock3,
  Pencil,
  RefreshCw,
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
  createClassSchedulePattern,
  generateClassSessions,
  getClassSchedulePatterns,
  getClassSessions,
  updateClassSchedulePattern,
  type ClassItem,
  type ClassSchedulePattern,
  type SessionStatus,
} from "./classes.api";

type ClassSchedulePanelProps = {
  courseOfferingId: string;
  classItem: ClassItem;
};

type ScheduleTab = "patterns" | "sessions";

const DAY_LABELS: Record<number, string> = {
  1: "월요일",
  2: "화요일",
  3: "수요일",
  4: "목요일",
  5: "금요일",
  6: "토요일",
  7: "일요일",
};

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: "예정",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const SESSION_STATUS_CLASSES: Record<SessionStatus, string> = {
  SCHEDULED: "status-badge--neutral",
  IN_PROGRESS: "status-badge--success",
  COMPLETED: "status-badge--primary",
  CANCELED: "status-badge--danger",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getInitialStartDate(classItem: ClassItem): string {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });

  if (today < classItem.startDate) {
    return classItem.startDate;
  }

  if (today > classItem.endDate) {
    return classItem.startDate;
  }

  return today;
}

function getInitialEndDate(classItem: ClassItem): string {
  const startDate = getInitialStartDate(classItem);
  const candidate = addDays(startDate, 30);

  return candidate > classItem.endDate ? classItem.endDate : candidate;
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function ClassSchedulePanel({
  courseOfferingId,
  classItem,
}: ClassSchedulePanelProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ScheduleTab>("patterns");
  const [editor, setEditor] = useState<ClassSchedulePattern | "create" | null>(
    null,
  );
  const [startDate, setStartDate] = useState(() =>
    getInitialStartDate(classItem),
  );
  const [endDate, setEndDate] = useState(() => getInitialEndDate(classItem));

  const patternQueryKey = [
    "course-offerings",
    courseOfferingId,
    "classes",
    classItem.id,
    "schedule-patterns",
  ];

  const sessionQueryKey = [
    "course-offerings",
    courseOfferingId,
    "classes",
    classItem.id,
    "sessions",
    startDate,
    endDate,
  ];

  const patternsQuery = useQuery({
    queryKey: patternQueryKey,
    queryFn: () => getClassSchedulePatterns(courseOfferingId, classItem.id),
  });

  const sessionsQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () =>
      getClassSessions(courseOfferingId, classItem.id, {
        startDate,
        endDate,
      }),
    enabled: tab === "sessions" && startDate <= endDate,
  });

  const savePatternMutation = useMutation({
    mutationFn: ({
      pattern,
      classSubjectId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      active,
    }: {
      pattern?: ClassSchedulePattern;
      classSubjectId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      room?: string;
      active: boolean;
    }) => {
      if (pattern) {
        return updateClassSchedulePattern(
          courseOfferingId,
          classItem.id,
          pattern.id,
          {
            classSubjectId,
            dayOfWeek,
            startTime,
            endTime,
            room: room ?? "",
            active,
          },
        );
      }

      return createClassSchedulePattern(courseOfferingId, classItem.id, {
        classSubjectId,
        dayOfWeek,
        startTime,
        endTime,
        room,
      });
    },
    onSuccess: async () => {
      setEditor(null);
      await queryClient.invalidateQueries({
        queryKey: patternQueryKey,
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateClassSessions(courseOfferingId, classItem.id, {
        startDate,
        endDate,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "course-offerings",
          courseOfferingId,
          "classes",
          classItem.id,
          "sessions",
        ],
      });
    },
  });

  const handlePatternSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const pattern = editor === "create" ? undefined : (editor ?? undefined);
    const room = String(formData.get("room") ?? "").trim();

    savePatternMutation.mutate({
      pattern,
      classSubjectId: String(formData.get("classSubjectId") ?? ""),
      dayOfWeek: Number(formData.get("dayOfWeek")),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      room: room || undefined,
      active: pattern === undefined || formData.get("active") === "on",
    });
  };

  const editable =
    classItem.status !== "COMPLETED" && classItem.status !== "CANCELED";

  const patterns = patternsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const activePatternCount = patterns.filter(
    (pattern) => pattern.active,
  ).length;

  return (
    <section className="nested-section">
      <header className="nested-section__header">
        <div>
          <h3>수업 시간표</h3>
          <p>반복 시간표와 날짜별 실제 수업을 관리합니다.</p>
        </div>

        {editable && tab === "patterns" && (
          <button
            type="button"
            className="button button--secondary"
            disabled={classItem.subjects.length === 0}
            onClick={() => setEditor("create")}
          >
            <CirclePlus size={17} />
            시간표 추가
          </button>
        )}
      </header>

      <div className="schedule-panel__body">
        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === "patterns" ? "tab--active" : ""}`}
            onClick={() => setTab("patterns")}
          >
            반복 시간표
            <span className="tab__count">{patterns.length}</span>
          </button>

          <button
            type="button"
            className={`tab ${tab === "sessions" ? "tab--active" : ""}`}
            onClick={() => setTab("sessions")}
          >
            실제 수업
            <span className="tab__count">
              {sessionsQuery.data?.length ?? 0}
            </span>
          </button>
        </div>

        {tab === "patterns" && (
          <>
            {patternsQuery.isLoading && (
              <LoadingState message="반복 시간표를 불러오고 있습니다." />
            )}

            {patternsQuery.isError && (
              <ErrorState
                message={getErrorMessage(patternsQuery.error)}
                onRetry={() => void patternsQuery.refetch()}
              />
            )}

            {!patternsQuery.isLoading &&
              !patternsQuery.isError &&
              (patterns.length ? (
                <div className="compact-list schedule-list">
                  {patterns.map((pattern) => (
                    <article className="compact-row" key={pattern.id}>
                      <div className="weekday-badge">
                        {DAY_LABELS[pattern.dayOfWeek].slice(0, 1)}
                      </div>

                      <div className="compact-row__body">
                        <div className="cluster">
                          <strong>{pattern.subjectName}</strong>

                          <span
                            className={`status-badge ${
                              pattern.active
                                ? "status-badge--success"
                                : "status-badge--neutral"
                            }`}
                          >
                            {pattern.active ? "사용" : "미사용"}
                          </span>
                        </div>

                        <p>
                          {DAY_LABELS[pattern.dayOfWeek]} · {pattern.startTime}~
                          {pattern.endTime}
                        </p>

                        <small>
                          <Clock3 size={13} />
                          {pattern.room || classItem.room || "강의실 미설정"}
                        </small>
                      </div>

                      {editable && (
                        <div className="data-row__actions">
                          <button
                            type="button"
                            className="button button--secondary button--compact"
                            onClick={() => setEditor(pattern)}
                          >
                            <Pencil size={14} />
                            수정
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="등록된 반복 시간표가 없습니다."
                  description="요일과 시간을 지정하여 시간표를 추가해 주세요."
                />
              ))}
          </>
        )}

        {tab === "sessions" && (
          <>
            <div className="schedule-toolbar">
              <label className="form-field form-field--flush">
                <span>조회 시작일</span>
                <input
                  type="date"
                  min={classItem.startDate}
                  max={classItem.endDate}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>

              <label className="form-field form-field--flush">
                <span>조회 종료일</span>
                <input
                  type="date"
                  min={classItem.startDate}
                  max={classItem.endDate}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>

              <button
                type="button"
                className="button button--primary"
                disabled={
                  !editable ||
                  !classItem.currentInstructor ||
                  activePatternCount === 0 ||
                  startDate > endDate ||
                  generateMutation.isPending
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `${startDate}부터 ${endDate}까지 실제 수업을 생성하시겠습니까?`,
                    )
                  ) {
                    generateMutation.mutate();
                  }
                }}
              >
                <RefreshCw size={17} />
                {generateMutation.isPending ? "생성 중..." : "실제 수업 생성"}
              </button>
            </div>

            {!classItem.currentInstructor && (
              <div className="info-banner">
                <CalendarRange size={19} />

                <div>
                  <strong>담당 강사 배정 필요</strong>
                  <p>
                    실제 수업을 만들기 전에 해당 기간의 담당 강사를 배정해야
                    합니다.
                  </p>
                </div>
              </div>
            )}

            {activePatternCount === 0 && (
              <div className="info-banner">
                <Clock3 size={19} />

                <div>
                  <strong>활성 시간표 필요</strong>
                  <p>
                    실제 수업을 만들려면 하나 이상의 활성 반복 시간표가
                    필요합니다.
                  </p>
                </div>
              </div>
            )}

            {generateMutation.isSuccess && (
              <div className="info-banner info-banner--success">
                <CalendarDays size={19} />

                <div>
                  <strong>실제 수업 생성 완료</strong>
                  <p>
                    {generateMutation.data.createdCount}개 생성,{" "}
                    {generateMutation.data.skippedCount}개 기존 수업 건너뜀
                  </p>
                </div>
              </div>
            )}

            {generateMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(generateMutation.error)}
              </div>
            )}

            {sessionsQuery.isLoading && (
              <LoadingState message="실제 수업을 불러오고 있습니다." />
            )}

            {sessionsQuery.isError && (
              <ErrorState
                message={getErrorMessage(sessionsQuery.error)}
                onRetry={() => void sessionsQuery.refetch()}
              />
            )}

            {!sessionsQuery.isLoading &&
              !sessionsQuery.isError &&
              (sessions.length ? (
                <div className="compact-list schedule-list">
                  {sessions.map((session) => (
                    <article className="compact-row" key={session.id}>
                      <div className="date-badge">
                        <strong>
                          {new Intl.DateTimeFormat("ko-KR", {
                            timeZone: "Asia/Seoul",
                            day: "2-digit",
                          }).format(new Date(session.startsAt))}
                        </strong>
                        <span>
                          {new Intl.DateTimeFormat("ko-KR", {
                            timeZone: "Asia/Seoul",
                            month: "short",
                          }).format(new Date(session.startsAt))}
                        </span>
                      </div>

                      <div className="compact-row__body">
                        <div className="cluster">
                          <strong>
                            {session.title || session.subjectName}
                          </strong>

                          <span
                            className={`status-badge ${
                              SESSION_STATUS_CLASSES[session.status]
                            }`}
                          >
                            {SESSION_STATUS_LABELS[session.status]}
                          </span>
                        </div>

                        <p>
                          {formatSessionDate(session.startsAt)} ·{" "}
                          {formatSessionTime(session.startsAt)}~
                          {formatSessionTime(session.endsAt)}
                        </p>

                        <small>
                          {session.instructor.name} ·{" "}
                          {session.room || "강의실 미설정"}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="조회 기간에 실제 수업이 없습니다."
                  description="반복 시간표를 확인한 후 실제 수업을 생성해 주세요."
                />
              ))}
          </>
        )}
      </div>

      {editor && (
        <Modal
          title={editor === "create" ? "반복 시간표 추가" : "반복 시간표 수정"}
          description={`${classItem.name}의 과목별 요일과 시간을 설정합니다.`}
          onClose={() => setEditor(null)}
        >
          <form className="stack" onSubmit={handlePatternSubmit}>
            <label className="form-field form-field--flush">
              <span>운영 과목</span>
              <select
                name="classSubjectId"
                defaultValue={
                  editor === "create"
                    ? classItem.subjects[0]?.id
                    : editor.classSubjectId
                }
                required
              >
                {classItem.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subjectName}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>요일</span>
                <select
                  name="dayOfWeek"
                  defaultValue={editor === "create" ? 1 : editor.dayOfWeek}
                  required
                >
                  {Object.entries(DAY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field form-field--flush">
                <span>강의실</span>
                <input
                  name="room"
                  maxLength={100}
                  defaultValue={
                    editor === "create"
                      ? (classItem.room ?? "")
                      : (editor.room ?? "")
                  }
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>시작 시간</span>
                <input
                  name="startTime"
                  type="time"
                  defaultValue={
                    editor === "create" ? "09:00" : editor.startTime
                  }
                  required
                />
              </label>

              <label className="form-field form-field--flush">
                <span>종료 시간</span>
                <input
                  name="endTime"
                  type="time"
                  defaultValue={editor === "create" ? "12:00" : editor.endTime}
                  required
                />
              </label>
            </div>

            {editor !== "create" && (
              <label className="checkbox-field">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editor.active}
                />

                <span>
                  <strong>시간표 사용</strong>
                  <small>
                    미사용 처리하면 이후 실제 수업 생성에서 제외됩니다.
                  </small>
                </span>
              </label>
            )}

            {savePatternMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(savePatternMutation.error)}
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
                disabled={savePatternMutation.isPending}
              >
                {savePatternMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
