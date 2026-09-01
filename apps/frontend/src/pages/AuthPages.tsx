import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../lib/api-client";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return "요청을 처리하지 못했습니다.";
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await login({ loginId, password });
      navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <div className="brand-mark">S</div>
          <strong>SKB ACADEMY</strong>
        </div>

        <div className="auth-brand-copy">
          <p>학원 운영 시스템</p>
          <h1>
            매일의 교육 운영을
            <br />
            한곳에서 정리합니다
          </h1>
          <span>
            교육과정과 반, 수업과 출석을 구성원 모두가 같은 기준으로
            확인합니다.
          </span>

          <dl className="auth-brand-points">
            <div>
              <dt>운영</dt>
              <dd>교육과정과 반을 빠르게 관리</dd>
            </div>
            <div>
              <dt>수업</dt>
              <dd>오늘 일정과 담당 수업을 명확하게 확인</dd>
            </div>
            <div>
              <dt>출석</dt>
              <dd>현장에서 바로 처리하고 이력을 보존</dd>
            </div>
          </dl>
        </div>

        <small>© 2026 SKB Academy</small>
      </section>

      <section className="auth-form-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__mobile-brand">
            <div className="brand-mark">S</div>
            <strong>SKB ACADEMY</strong>
          </div>

          <div className="auth-card__header">
            <h2>로그인</h2>
            <span>학원에서 발급받은 계정으로 로그인하세요.</span>
          </div>

          {errorMessage && (
            <div className="form-alert" role="alert">
              {errorMessage}
            </div>
          )}

          <label className="form-field">
            <span>로그인 아이디</span>
            <input
              type="text"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
              placeholder="아이디를 입력하세요"
              required
            />
          </label>

          <label className="form-field">
            <span>비밀번호</span>

            <div className="password-input">
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="비밀번호를 입력하세요"
                minLength={8}
                required
              />

              <button
                type="button"
                aria-label={
                  passwordVisible ? "비밀번호 숨기기" : "비밀번호 표시"
                }
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="button button--primary auth-submit"
            disabled={submitting}
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>

          <p className="auth-help">
            계정 또는 비밀번호 문의는 학원 관리자에게 요청하세요.
          </p>
        </form>
      </section>
    </main>
  );
}

export function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword !== newPasswordConfirm) {
      setErrorMessage("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMessage("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);

    try {
      await changePassword({
        currentPassword,
        newPassword,
      });

      navigate("/login", {
        replace: true,
        state: {
          message: "비밀번호가 변경되었습니다. 다시 로그인해 주세요.",
        },
      });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="password-change-layout">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="password-change-icon">
          <LockKeyhole size={26} />
        </div>

        <div className="auth-card__header">
          <h2>비밀번호 변경</h2>
          <span>
            임시 비밀번호를 사용 중입니다. 계속하려면 새 비밀번호를 설정하세요.
          </span>
        </div>

        {errorMessage && (
          <div className="form-alert" role="alert">
            {errorMessage}
          </div>
        )}

        <label className="form-field">
          <span>현재 비밀번호</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>

        <label className="form-field">
          <span>새 비밀번호</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={64}
            required
          />
          <small>8~64자로 입력하세요.</small>
        </label>

        <label className="form-field">
          <span>새 비밀번호 확인</span>
          <input
            type="password"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={64}
            required
          />
        </label>

        <button
          type="submit"
          className="button button--primary auth-submit"
          disabled={submitting}
        >
          {submitting ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </main>
  );
}
