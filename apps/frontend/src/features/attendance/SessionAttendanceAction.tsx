import { ClipboardList } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  getSessionAttendance,
  updateAttendanceRecord,
  type AttendanceStatus,
  type SessionAttendanceRecord,
} from "./attendance.api";

type SessionAttendanceActionProps = {
  sessionId: string;
  sessionTitle: string;
  sessionStartsAt: string;
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
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

/** 출석·지각·조퇴는 실제 도착 시각이 필수다. */
const ARRIVAL_REQUIRED: AttendanceStatus[] = ["PRESENT", "LATE", "EARLY_LEAVE"];

const SELECTABLE: AttendanceStatus[] = [
  "PRESENT",
  "LATE",
  "ABSENT",
  "EARLY_LEAVE",
  "EXCUSED",
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

/** datetime-local 입력용 Asia/Seoul 기준 문자열 */
function toLocalInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

export function SessionAttendanceAction({
  sessionId,
  sessionTitle,
  sessionStartsAt,
}: SessionAttendanceActionProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<AttendanceStatus>("PRESENT");

  const queryKey = ["sessions", sessionId, "attendance"];

  const query = useQuery({
    queryKey,
    queryFn: () => getSessionAttendance(sessionId),
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      recordId,
      status,
      checkedAt,
      reason,
    }: {
      recordId: string;
      status: AttendanceStatus;
      checkedAt?: string;
      reason: string;
    }) =>
      updateAttendanceRecord(sessionId, recordId, {
        status,
        checkedAt,
        reason,
      }),
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const startEditing = (record: SessionAttendanceRecord): void => {
    setEditingId(record.id);
    setDraftStatus(record.status === "UNPROCESSED" ? "PRESENT" : record.status);
    updateMutation.reset();
  };

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
    record: SessionAttendanceRecord,
  ): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const checkedAtRaw = String(formData.get("checkedAt") ?? "").trim();

    updateMutation.mutate({
      recordId: record.id,
      status: draftStatus,
      checkedAt: checkedAtRaw
        ? new Date(`${checkedAtRaw}:00+09:00`).toISOString()
        : undefined,
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  const records = query.data ?? [];
  const summary = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.status] = (acc[record.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        className="button button--secondary button--compact"
        onClick={() => setOpen(true)}
      >
        <ClipboardList size={14} />
        출석 현황
      </button>

      {open && (
        <Modal
          title="출석 현황"
          description={`${sessionTitle} · ${formatDateTime(sessionStartsAt)}`}
          onClose={() => setOpen(false)}
        >
          {query.isLoading && (
            <LoadingState message="출석을 불러오고 있습니다." />
          )}
          {query.isError && (
            <ErrorState
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          )}

          {query.isSuccess && (
            <div className="stack">
              <div className="cluster">
                {SELECTABLE.concat("UNPROCESSED").map((status) =>
                  summary[status] ? (
                    <span
                      key={status}
                      className={`status-badge ${STATUS_CLASSES[status]}`}
                    >
                      {STATUS_LABELS[status]} {summary[status]}
                    </span>
                  ) : null,
                )}
              </div>

              {records.length === 0 && (
                <p className="field-hint">출석 대상 학생이 없습니다.</p>
              )}

              <div className="data-list">
                {records.map((record) => (
                  <article
                    className="list-row list-row--stacked"
                    key={record.id}
                  >
                    <div>
                      <strong>
                        {record.student.name}{" "}
                        <span
                          className={`status-badge ${
                            STATUS_CLASSES[record.status]
                          }`}
                        >
                          {STATUS_LABELS[record.status]}
                        </span>
                      </strong>
                      <p className="field-hint">
                        {record.student.loginId || "아이디 없음"}
                        {record.checkedAt
                          ? ` · ${formatDateTime(record.checkedAt)} 도착`
                          : ""}
                      </p>

                      {record.histories.length > 0 && (
                        <details className="journal-history">
                          <summary>
                            변경 이력 {record.histories.length}건
                          </summary>
                          <ol>
                            {record.histories.map((history) => (
                              <li key={history.id}>
                                <strong>
                                  {formatDateTime(history.changedAt)} ·{" "}
                                  {history.changedBy?.name ?? "시스템"}
                                </strong>
                                <p>
                                  {STATUS_LABELS[history.previousStatus]} →{" "}
                                  {STATUS_LABELS[history.newStatus]}
                                  {history.newCheckedAt
                                    ? ` (도착 ${formatDateTime(history.newCheckedAt)})`
                                    : ""}
                                </p>
                                <p className="journal-history__content">
                                  {history.reason}
                                </p>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </div>

                    {editingId === record.id ? (
                      <form
                        className="stack"
                        onSubmit={(event) => handleSubmit(event, record)}
                      >
                        <label className="form-field form-field--flush">
                          <span>변경할 상태</span>
                          <select
                            value={draftStatus}
                            onChange={(event) =>
                              setDraftStatus(
                                event.target.value as AttendanceStatus,
                              )
                            }
                          >
                            {SELECTABLE.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </label>

                        {ARRIVAL_REQUIRED.includes(draftStatus) && (
                          <label className="form-field form-field--flush">
                            <span>실제 도착 시각</span>
                            <input
                              name="checkedAt"
                              type="datetime-local"
                              required
                              defaultValue={toLocalInput(
                                record.checkedAt ?? sessionStartsAt,
                              )}
                            />
                          </label>
                        )}

                        <label className="form-field">
                          <span>변경 사유</span>
                          <textarea
                            name="reason"
                            rows={2}
                            maxLength={500}
                            required
                            placeholder="지각 사유 확인, 학생 요청 등"
                          />
                        </label>

                        {updateMutation.isError && (
                          <div className="form-alert" role="alert">
                            {getErrorMessage(updateMutation.error)}
                          </div>
                        )}

                        <div className="cluster">
                          <button
                            type="button"
                            className="button button--secondary button--compact"
                            onClick={() => setEditingId(null)}
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            className="button button--primary button--compact"
                            disabled={updateMutation.isPending}
                          >
                            {updateMutation.isPending ? "저장 중..." : "저장"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="button button--secondary button--compact"
                        onClick={() => startEditing(record)}
                      >
                        출석 수정
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
