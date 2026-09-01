import { KeyRound, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Modal } from "../../components/ui/Modal";
import {
  generateAttendanceCode,
  getCurrentAttendanceCode,
} from "./attendance.api";

type AttendanceCodeActionProps = {
  courseOfferingId: string;
  classId: string;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function AttendanceCodeAction({
  courseOfferingId,
  classId,
  sessionId,
  sessionTitle,
  sessionStatus,
}: AttendanceCodeActionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const queryKey = ["attendance-code", courseOfferingId, classId, sessionId];

  const currentCodeQuery = useQuery({
    queryKey,
    queryFn: () =>
      getCurrentAttendanceCode(courseOfferingId, classId, sessionId),
    enabled: modalOpen,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateAttendanceCode(courseOfferingId, classId, sessionId),
    onSuccess: async (result) => {
      setGeneratedCode(result.code);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const canManageCode = user?.role === "INSTRUCTOR" || user?.role === "ADMIN";

  if (
    !canManageCode ||
    sessionStatus === "COMPLETED" ||
    sessionStatus === "CANCELED"
  ) {
    return null;
  }

  const currentCode = currentCodeQuery.data;

  return (
    <>
      <button
        type="button"
        className="button button--secondary button--compact"
        onClick={() => {
          setGeneratedCode(null);
          setModalOpen(true);
        }}
      >
        <KeyRound size={14} />
        출석 코드
      </button>

      {modalOpen && (
        <Modal
          title="출석 코드 관리"
          description={`${sessionTitle} 수업의 출석 코드를 생성합니다.`}
          onClose={() => {
            setGeneratedCode(null);
            setModalOpen(false);
          }}
        >
          <div className="stack">
            {generatedCode && (
              <div className="info-banner info-banner--success">
                <KeyRound size={24} />
                <div>
                  <strong>출석 코드: {generatedCode}</strong>
                  <p>
                    학생에게 이 4자리 코드를 안내해 주세요. 화면을 닫으면 원본
                    코드를 다시 확인할 수 없습니다.
                  </p>
                </div>
              </div>
            )}

            {!generatedCode && currentCode && (
              <div className="info-banner">
                <KeyRound size={20} />
                <div>
                  <strong>활성 출석 코드가 있습니다.</strong>
                  <p>
                    {formatTime(currentCode.expiresAt)}까지 유효합니다. 원본
                    코드는 저장되지 않으므로 필요한 경우 재발급해 주세요.
                  </p>
                </div>
              </div>
            )}

            {!generatedCode && !currentCodeQuery.isLoading && !currentCode && (
              <div className="info-banner">
                <KeyRound size={20} />
                <div>
                  <strong>활성 코드 없음</strong>
                  <p>
                    {sessionStatus === "IN_PROGRESS"
                      ? "아래 코드 생성 버튼을 눌러 출석 코드를 발급하세요."
                      : "예정 시작 시각 이후 또는 수업 시작 처리 후 출석 코드를 생성할 수 있습니다."}
                  </p>
                </div>
              </div>
            )}

            {currentCodeQuery.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(currentCodeQuery.error)}
              </div>
            )}

            {generateMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(generateMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setGeneratedCode(null);
                  setModalOpen(false);
                }}
              >
                닫기
              </button>

              <button
                type="button"
                className="button button--primary"
                disabled={generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
              >
                <RefreshCw size={16} />
                {generateMutation.isPending
                  ? "생성 중..."
                  : currentCode
                    ? "코드 재발급"
                    : "코드 생성"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
