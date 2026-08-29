import { Check, Clipboard, KeyRound, UserPlus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Modal } from "../../components/ui/Modal";
import {
  createStaff,
  issueTemporaryPassword,
  type CreateStaffResponse,
  type StaffRole,
  type TemporaryPasswordResponse,
  type UserSummary,
} from "./users.api";

const ROLE_LABELS: Record<StaffRole, string> = {
  INSTRUCTOR: "강사",
  MANAGER: "실장",
  PRINCIPAL: "원장",
  ADMIN: "관리자",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

type CredentialResult = CreateStaffResponse | TemporaryPasswordResponse;

type CredentialPanelProps = {
  result: CredentialResult;
  loginId?: string;
};

function CredentialPanel({ result, loginId }: CredentialPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyPassword = async (): Promise<void> => {
    await navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
  };

  return (
    <div className="credential-panel">
      <div className="credential-panel__warning">
        <KeyRound size={19} />

        <div>
          <strong>임시 비밀번호는 지금만 표시됩니다.</strong>
          <p>사용자에게 안전한 방법으로 전달해 주세요.</p>
        </div>
      </div>

      {loginId && (
        <div className="credential-row">
          <span>로그인 아이디</span>
          <strong>{loginId}</strong>
        </div>
      )}

      <div className="credential-row">
        <span>임시 비밀번호</span>

        <div className="credential-value">
          <code>{result.temporaryPassword}</code>

          <button
            type="button"
            className="icon-button bordered-icon-button"
            aria-label="임시 비밀번호 복사"
            onClick={() => void copyPassword()}
          >
            {copied ? <Check size={17} /> : <Clipboard size={17} />}
          </button>
        </div>
      </div>

      <div className="credential-row">
        <span>만료 시각</span>
        <strong>{formatDateTime(result.temporaryPasswordExpiresAt)}</strong>
      </div>
    </div>
  );
}

type CreateStaffButtonProps = {
  onCreated: () => Promise<void>;
};

export function CreateStaffButton({ onCreated }: CreateStaffButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CreateStaffResponse | null>(null);

  const mutation = useMutation({
    mutationFn: createStaff,
    onSuccess: async (created) => {
      setResult(created);
      await onCreated();
    },
  });

  if (!user) {
    return null;
  }

  const availableRoles: StaffRole[] =
    user.role === "ADMIN"
      ? ["INSTRUCTOR", "MANAGER", "PRINCIPAL", "ADMIN"]
      : ["INSTRUCTOR"];

  const close = (): void => {
    setOpen(false);
    setResult(null);
    mutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    mutation.mutate({
      loginId: String(formData.get("loginId") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      email: email || undefined,
      role: String(formData.get("role")) as StaffRole,
    });
  };

  return (
    <>
      <button
        type="button"
        className="button button--primary"
        onClick={() => setOpen(true)}
      >
        <UserPlus size={18} />
        직원 계정 추가
      </button>

      {open && (
        <Modal
          title={result ? "직원 계정 생성 완료" : "직원 계정 추가"}
          description={
            result
              ? `${result.name} 계정이 생성되었습니다.`
              : "직원 정보와 역할을 입력합니다."
          }
          onClose={close}
        >
          {result ? (
            <div className="stack">
              <CredentialPanel result={result} loginId={result.loginId} />

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={close}
                >
                  확인
                </button>
              </div>
            </div>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="form-field form-field--flush">
                  <span>로그인 아이디</span>
                  <input
                    name="loginId"
                    minLength={4}
                    maxLength={30}
                    pattern="[a-z0-9._-]+"
                    required
                  />
                </label>

                <label className="form-field form-field--flush">
                  <span>역할</span>
                  <select name="role" required>
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="form-field">
                <span>이름</span>
                <input name="name" maxLength={100} required />
              </label>

              <label className="form-field">
                <span>전화번호</span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="010-0000-0000"
                  pattern="[0-9-]{10,20}"
                  required
                />
              </label>

              <label className="form-field">
                <span>이메일</span>
                <input name="email" type="email" maxLength={255} />
              </label>

              {mutation.isError && (
                <div className="form-alert" role="alert">
                  {getErrorMessage(mutation.error)}
                </div>
              )}

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={close}
                >
                  취소
                </button>

                <button
                  type="submit"
                  className="button button--primary"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "생성 중..." : "계정 생성"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

type TemporaryPasswordButtonProps = {
  target: UserSummary;
  onIssued: () => Promise<void>;
};

export function TemporaryPasswordButton({
  target,
  onIssued,
}: TemporaryPasswordButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TemporaryPasswordResponse | null>(null);

  const mutation = useMutation({
    mutationFn: (reason: string) => issueTemporaryPassword(target.id, reason),
    onSuccess: async (issued) => {
      setResult(issued);
      await onIssued();
    },
  });

  if (!user || user.id === target.id || target.status !== "ACTIVE") {
    return null;
  }

  const canIssue =
    user.role === "ADMIN" ||
    ((user.role === "MANAGER" || user.role === "PRINCIPAL") &&
      (target.role === "STUDENT" || target.role === "INSTRUCTOR"));

  if (!canIssue) {
    return null;
  }

  const close = (): void => {
    setOpen(false);
    setResult(null);
    mutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const reason = String(formData.get("reason") ?? "").trim();

    mutation.mutate(reason);
  };

  return (
    <>
      <button
        type="button"
        className="button button--ghost button--compact"
        onClick={() => setOpen(true)}
      >
        <KeyRound size={15} />
        임시 비밀번호
      </button>

      {open && (
        <Modal
          title={result ? "임시 비밀번호 발급 완료" : "임시 비밀번호 발급"}
          description={`${target.name} 사용자의 로그인 비밀번호를 재설정합니다.`}
          onClose={close}
        >
          {result ? (
            <div className="stack">
              <CredentialPanel
                result={result}
                loginId={target.loginId ?? undefined}
              />

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={close}
                >
                  확인
                </button>
              </div>
            </div>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <div className="form-alert form-alert--warning">
                발급 즉시 해당 사용자의 기존 로그인 세션이 모두 종료됩니다.
              </div>

              <label className="form-field form-field--flush">
                <span>발급 사유</span>
                <textarea name="reason" rows={4} maxLength={500} required />
              </label>

              {mutation.isError && (
                <div className="form-alert" role="alert">
                  {getErrorMessage(mutation.error)}
                </div>
              )}

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={close}
                >
                  취소
                </button>

                <button
                  type="submit"
                  className="button button--danger"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "발급 중..." : "임시 비밀번호 발급"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
