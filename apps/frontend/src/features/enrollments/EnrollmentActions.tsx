import { ArrowRightLeft, PencilLine } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import type { ClassItem } from "../classes/classes.api";
import { getClasses } from "../classes/classes.api";
import {
  changeEnrollmentStatus,
  transferEnrollment,
  type Enrollment,
  type EnrollmentStatus,
} from "./enrollments.api";

type EnrollmentActionsProps = {
  courseOfferingId: string;
  classItem: ClassItem;
  enrollment: Enrollment;
  onChanged: () => Promise<void>;
};

type EnrollmentAction = "status" | "transfer" | null;

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  SCHEDULED: "예정",
  ACTIVE: "수강 중",
  COMPLETED: "종료",
  CANCELED: "중도 취소",
};

const STATUS_ACTION_LABELS: Partial<Record<EnrollmentStatus, string>> = {
  ACTIVE: "수강 시작",
  COMPLETED: "수강 종료",
  CANCELED: "중도 취소",
};

const STATUS_TRANSITIONS: Record<
  EnrollmentStatus,
  readonly EnrollmentStatus[]
> = {
  SCHEDULED: ["ACTIVE", "CANCELED"],
  ACTIVE: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function getToday(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
}

function getInitialEffectiveDate(enrollment: Enrollment): string {
  const today = getToday();

  return today < enrollment.startsOn ? enrollment.startsOn : today;
}

export function EnrollmentActions({
  courseOfferingId,
  classItem,
  enrollment,
  onChanged,
}: EnrollmentActionsProps) {
  const [action, setAction] = useState<EnrollmentAction>(null);

  const targetClassesQuery = useQuery({
    queryKey: ["course-offerings", courseOfferingId, "transfer-target-classes"],
    queryFn: () => getClasses(courseOfferingId, undefined, 1, 100),
    enabled: action === "transfer",
  });

  const statusMutation = useMutation({
    mutationFn: ({
      status,
      effectiveOn,
      reason,
    }: {
      status: EnrollmentStatus;
      effectiveOn: string;
      reason: string;
    }) =>
      changeEnrollmentStatus(courseOfferingId, classItem.id, enrollment.id, {
        status,
        effectiveOn,
        reason,
      }),
    onSuccess: async () => {
      setAction(null);
      await onChanged();
    },
  });

  const transferMutation = useMutation({
    mutationFn: ({
      targetClassId,
      transferOn,
      reason,
    }: {
      targetClassId: string;
      transferOn: string;
      reason: string;
    }) =>
      transferEnrollment(courseOfferingId, classItem.id, enrollment.id, {
        targetClassId,
        transferOn,
        reason,
      }),
    onSuccess: async () => {
      setAction(null);
      await onChanged();
    },
  });

  const handleStatusSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    statusMutation.mutate({
      status: String(formData.get("status")) as EnrollmentStatus,
      effectiveOn: String(formData.get("effectiveOn") ?? ""),
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  const handleTransferSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    transferMutation.mutate({
      targetClassId: String(formData.get("targetClassId") ?? ""),
      transferOn: String(formData.get("transferOn") ?? ""),
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  const nextStatuses = STATUS_TRANSITIONS[enrollment.status];
  const canTransfer =
    enrollment.type === "REGULAR" &&
    (enrollment.status === "SCHEDULED" || enrollment.status === "ACTIVE");

  const targetClasses = (targetClassesQuery.data?.items ?? []).filter(
    (item) =>
      item.id !== classItem.id &&
      item.status !== "COMPLETED" &&
      item.status !== "CANCELED",
  );

  if (nextStatuses.length === 0 && !canTransfer) {
    return null;
  }

  return (
    <>
      <div className="data-row__actions">
        {nextStatuses.length > 0 && (
          <button
            type="button"
            className="button button--secondary button--compact"
            onClick={() => setAction("status")}
          >
            <PencilLine size={14} />
            상태 변경
          </button>
        )}

        {canTransfer && (
          <button
            type="button"
            className="button button--secondary button--compact"
            onClick={() => setAction("transfer")}
          >
            <ArrowRightLeft size={14} />반 이동
          </button>
        )}
      </div>

      {action === "status" && (
        <Modal
          title="수강 상태 변경"
          description={`${enrollment.student.name} 학생의 수강 상태를 변경합니다.`}
          onClose={() => setAction(null)}
        >
          <form className="stack" onSubmit={handleStatusSubmit}>
            <div className="info-banner">
              <PencilLine size={19} />
              <div>
                <strong>현재 상태</strong>
                <p>{STATUS_LABELS[enrollment.status]}</p>
              </div>
            </div>

            <label className="form-field form-field--flush">
              <span>변경 상태</span>
              <select name="status" required>
                {nextStatuses.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_ACTION_LABELS[status] ?? STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>적용일</span>
              <input
                name="effectiveOn"
                type="date"
                defaultValue={getInitialEffectiveDate(enrollment)}
                required
              />
            </label>

            <label className="form-field">
              <span>변경 사유</span>
              <textarea
                name="reason"
                rows={4}
                maxLength={1000}
                placeholder="상태 변경 사유를 입력해 주세요."
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
                onClick={() => setAction(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? "변경 중..." : "상태 변경"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === "transfer" && (
        <Modal
          title="수강생 반 이동"
          description={`${enrollment.student.name} 학생을 같은 개설 강의의 다른 반으로 이동합니다.`}
          onClose={() => setAction(null)}
        >
          <form className="stack" onSubmit={handleTransferSubmit}>
            <div className="info-banner">
              <ArrowRightLeft size={19} />
              <div>
                <strong>현재 반</strong>
                <p>{classItem.name}</p>
              </div>
            </div>

            <label className="form-field form-field--flush">
              <span>이동할 반</span>
              <select
                name="targetClassId"
                disabled={
                  targetClassesQuery.isLoading || targetClasses.length === 0
                }
                required
              >
                {targetClassesQuery.isLoading && (
                  <option value="">반 목록 불러오는 중...</option>
                )}

                {!targetClassesQuery.isLoading &&
                  targetClasses.length === 0 && (
                    <option value="">이동 가능한 반이 없습니다.</option>
                  )}

                {targetClasses.map((targetClass) => (
                  <option key={targetClass.id} value={targetClass.id}>
                    {targetClass.name} · {targetClass.enrollmentCount}/
                    {targetClass.capacity}명
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>반 이동일</span>
              <input
                name="transferOn"
                type="date"
                min={enrollment.startsOn}
                defaultValue={getInitialEffectiveDate(enrollment)}
                required
              />
            </label>

            <label className="form-field">
              <span>반 이동 사유</span>
              <textarea
                name="reason"
                rows={4}
                maxLength={1000}
                placeholder="시간표 변경, 학생 요청 등"
                required
              />
            </label>

            {targetClassesQuery.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(targetClassesQuery.error)}
              </div>
            )}

            {transferMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(transferMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setAction(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={
                  transferMutation.isPending ||
                  targetClassesQuery.isLoading ||
                  targetClasses.length === 0
                }
              >
                {transferMutation.isPending ? "이동 중..." : "반 이동"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
