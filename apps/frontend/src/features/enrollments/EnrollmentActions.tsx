import { ArrowRightLeft, UserMinus } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  getManagedClasses,
  type ManagedClass,
} from "../classes/class-management.api";
import {
  transferEnrollment,
  withdrawEnrollment,
  type Enrollment,
} from "./enrollments.api";

type EnrollmentActionsProps = {
  classItem: ManagedClass;
  enrollment: Enrollment;
  onChanged: () => Promise<void>;
};

type EnrollmentAction = "withdraw" | "transfer" | null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function getToday(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
}

function getInitialTransferDate(enrollment: Enrollment): string {
  const today = getToday();
  return today < enrollment.startsOn ? enrollment.startsOn : today;
}

export function EnrollmentActions({
  classItem,
  enrollment,
  onChanged,
}: EnrollmentActionsProps) {
  const [action, setAction] = useState<EnrollmentAction>(null);

  const targetClassesQuery = useQuery({
    queryKey: ["managed-classes", "transfer-targets"],
    queryFn: () => getManagedClasses(false),
    enabled: action === "transfer",
  });

  const withdrawMutation = useMutation({
    mutationFn: ({
      effectiveOn,
      reason,
    }: {
      effectiveOn: string;
      reason: string;
    }) =>
      withdrawEnrollment(classItem.id, enrollment.id, {
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
      transferEnrollment(classItem.id, enrollment.id, {
        targetClassId,
        transferOn,
        reason,
      }),
    onSuccess: async () => {
      setAction(null);
      await onChanged();
    },
  });

  const handleWithdrawSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    withdrawMutation.mutate({
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

  const canWithdraw = enrollment.status === "ACTIVE";
  const canTransfer =
    enrollment.type === "REGULAR" &&
    (enrollment.status === "SCHEDULED" || enrollment.status === "ACTIVE");
  // 이동 대상은 학생의 교육과정을 운영하는, 아직 끝나지 않은 다른 반이어야 한다.
  const targetClasses = (targetClassesQuery.data?.items ?? []).filter(
    (item) =>
      item.id !== classItem.id &&
      item.derivedStatus !== "ENDED" &&
      item.programs.some(
        (program) => program.courseOfferingId === enrollment.courseOfferingId,
      ),
  );

  if (!canWithdraw && !canTransfer) return null;

  return (
    <>
      <div className="data-row__actions">
        {canWithdraw && (
          <button
            type="button"
            className="button button--danger button--compact"
            onClick={() => setAction("withdraw")}
          >
            <UserMinus size={14} />
            중도 퇴원
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

      {action === "withdraw" && (
        <Modal
          title="중도 퇴원 처리"
          description={`${enrollment.student.name} 학생의 수강을 중도 종료합니다.`}
          onClose={() => setAction(null)}
        >
          <form className="stack" onSubmit={handleWithdrawSubmit}>
            <div className="info-banner">
              <UserMinus size={19} />
              <div>
                <strong>처리 후 되돌릴 수 없습니다.</strong>
                <p>출석과 수강 이력은 삭제하지 않고 보존합니다.</p>
              </div>
            </div>
            <label className="form-field form-field--flush">
              <span>중도 퇴원일</span>
              <input
                name="effectiveOn"
                type="date"
                min={enrollment.startsOn}
                max={getToday()}
                defaultValue={getToday()}
                required
              />
            </label>
            <label className="form-field">
              <span>중도 퇴원 사유</span>
              <textarea
                name="reason"
                rows={4}
                maxLength={1000}
                placeholder="중도 퇴원 사유를 입력해 주세요."
                required
              />
            </label>
            {withdrawMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(withdrawMutation.error)}
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
                className="button button--danger"
                disabled={withdrawMutation.isPending}
              >
                {withdrawMutation.isPending ? "처리 중..." : "중도 퇴원 처리"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === "transfer" && (
        <Modal
          title="수강생 반 이동"
          description={`${enrollment.student.name} 학생을 같은 교육과정의 다른 반으로 이동합니다.`}
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
                defaultValue={getInitialTransferDate(enrollment)}
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
