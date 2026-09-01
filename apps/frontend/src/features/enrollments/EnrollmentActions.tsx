import { UserMinus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import type { ManagedClass } from "../classes/class-management.api";
import { withdrawEnrollment, type Enrollment } from "./enrollments.api";

/**
 * 반에 배정된 학생이 할 수 있는 일은 수강과 환불로 인한 수강 철회 둘뿐이다.
 * 철회하면 같은 반의 모든 교육과정 수강이 함께 종료된다.
 */
type EnrollmentActionsProps = {
  classItem: ManagedClass;
  enrollment: Enrollment;
  onChanged: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function getToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function EnrollmentActions({
  classItem,
  enrollment,
  onChanged,
}: EnrollmentActionsProps) {
  const [open, setOpen] = useState(false);

  const withdrawMutation = useMutation({
    mutationFn: ({
      effectiveOn,
      reason,
    }: {
      effectiveOn: string;
      reason: string;
    }) =>
      withdrawEnrollment(classItem.id, enrollment.id, { effectiveOn, reason }),
    onSuccess: async () => {
      setOpen(false);
      await onChanged();
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    withdrawMutation.mutate({
      effectiveOn: String(formData.get("effectiveOn") ?? ""),
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  if (enrollment.status !== "ACTIVE") return null;

  return (
    <>
      <div className="data-row__actions">
        <button
          type="button"
          className="button button--danger button--compact"
          onClick={() => setOpen(true)}
        >
          <UserMinus size={14} />
          수강 철회
        </button>
      </div>

      {open && (
        <Modal
          title="수강 철회 처리"
          description={`${enrollment.student.name} 학생의 수강을 철회합니다.`}
          onClose={() => setOpen(false)}
        >
          <form className="stack" onSubmit={handleSubmit}>
            <div className="info-banner">
              <UserMinus size={19} />
              <div>
                <strong>처리 후 되돌릴 수 없습니다.</strong>
                <p>
                  이 반의 모든 교육과정 수강이 함께 철회됩니다. 출석과 수강
                  이력은 삭제하지 않고 보존합니다.
                </p>
              </div>
            </div>
            <label className="form-field form-field--flush">
              <span>철회일</span>
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
              <span>철회 사유</span>
              <textarea
                name="reason"
                rows={4}
                maxLength={1000}
                placeholder="환불 등 수강 철회 사유를 입력해 주세요."
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
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                type="submit"
                className="button button--danger"
                disabled={withdrawMutation.isPending}
              >
                {withdrawMutation.isPending ? "처리 중..." : "수강 철회"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
