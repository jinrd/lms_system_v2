import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, Eye, EyeOff, UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { signup, type SignupGender } from "../auth/signup.api";
import { ErrorState, LoadingState } from "../components/ui/PageStates";
import { getCurrentTerms } from "../features/terms/terms.api";
import { ApiError } from "../lib/api-client";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "회원가입을 처리하지 못했습니다. 다시 시도해 주세요.";
}

export function SignupPage() {
  const terms = useQuery({
    queryKey: ["terms", "current"],
    queryFn: getCurrentTerms,
    staleTime: 60_000,
  });
  const requiredTerms = useMemo(
    () => terms.data?.filter((document) => document.required) ?? [],
    [terms.data],
  );
  const [agreedIds, setAgreedIds] = useState<string[]>([]);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [minor, setMinor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  const allRequiredAgreed =
    requiredTerms.length > 0 &&
    requiredTerms.every((document) => agreedIds.includes(document.id));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("passwordConfirm") ?? "")) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!allRequiredAgreed) {
      setError("필수 약관에 모두 동의해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        loginId: String(form.get("loginId") ?? "").trim().toLowerCase(),
        password,
        name: String(form.get("name") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
        email: String(form.get("email") ?? "").trim() || undefined,
        birthDate: String(form.get("birthDate") ?? ""),
        gender: String(form.get("gender")) as SignupGender,
        isMinorAtSignup: minor,
        guardianName: minor
          ? String(form.get("guardianName") ?? "").trim()
          : undefined,
        guardianPhone: minor
          ? String(form.get("guardianPhone") ?? "").trim()
          : undefined,
        agreedTermsDocumentIds: requiredTerms.map((document) => document.id),
      });
      setComplete(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  if (complete) {
    return (
      <main className="signup-layout">
        <section className="signup-complete surface-card">
          <span className="signup-complete__icon">
            <CheckCircle2 size={28} aria-hidden="true" />
          </span>
          <p className="signup-eyebrow">가입 신청 완료</p>
          <h1>관리자 승인을 기다리고 있습니다</h1>
          <p>
            가입 정보가 접수되었습니다. 학원 관리자가 승인하면 등록한
            아이디로 로그인할 수 있습니다.
          </p>
          <Link to="/login" className="button button--primary">
            로그인 화면으로
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="signup-layout">
      <div className="signup-shell">
        <header className="signup-header">
          <Link to="/login" className="signup-back">
            <ChevronLeft size={18} aria-hidden="true" /> 로그인
          </Link>
          <div className="signup-heading">
            <span className="signup-heading__icon">
              <UserPlus size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="signup-eyebrow">학생 회원가입</p>
              <h1>학습을 시작할 계정을 신청하세요</h1>
              <span>기본 정보를 입력하면 관리자 승인 후 이용할 수 있습니다.</span>
            </div>
          </div>
        </header>

        <form className="signup-form" onSubmit={handleSubmit}>
          <section className="surface-card signup-section" aria-labelledby="signup-account-title">
            <header>
              <span>1</span>
              <div>
                <h2 id="signup-account-title">계정 정보</h2>
                <p>로그인에 사용할 아이디와 비밀번호를 입력합니다.</p>
              </div>
            </header>
            <div className="signup-section__body form-grid">
              <label className="form-field">
                <span>로그인 아이디</span>
                <input name="loginId" type="text" autoComplete="username" minLength={4} maxLength={30} pattern="[a-z0-9._-]{4,30}" placeholder="영문 소문자·숫자 4~30자" required />
                <small>영문 소문자, 숫자, 마침표, 밑줄, 하이픈을 사용할 수 있습니다.</small>
              </label>
              <div />
              <label className="form-field">
                <span>비밀번호</span>
                <div className="password-input">
                  <input name="password" type={passwordVisible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={64} required />
                  <button type="button" aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 표시"} onClick={() => setPasswordVisible((visible) => !visible)}>
                    {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
                <small>8~64자로 입력하세요.</small>
              </label>
              <label className="form-field">
                <span>비밀번호 확인</span>
                <input name="passwordConfirm" type={passwordVisible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={64} required />
              </label>
            </div>
          </section>

          <section className="surface-card signup-section" aria-labelledby="signup-profile-title">
            <header>
              <span>2</span>
              <div>
                <h2 id="signup-profile-title">학생 정보</h2>
                <p>수강생 확인과 학원 안내에 필요한 정보입니다.</p>
              </div>
            </header>
            <div className="signup-section__body form-grid">
              <label className="form-field"><span>이름</span><input name="name" type="text" autoComplete="name" maxLength={100} required /></label>
              <label className="form-field"><span>전화번호</span><input name="phone" type="tel" autoComplete="tel" minLength={10} maxLength={20} pattern="[0-9-]{10,20}" placeholder="010-1234-5678" required /></label>
              <label className="form-field"><span>이메일 <small>(선택)</small></span><input name="email" type="email" autoComplete="email" maxLength={255} /></label>
              <label className="form-field"><span>생년월일</span><input name="birthDate" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} required /></label>
              <label className="form-field"><span>성별</span><select name="gender" defaultValue="UNDISCLOSED" required><option value="UNDISCLOSED">선택하지 않음</option><option value="FEMALE">여성</option><option value="MALE">남성</option><option value="OTHER">기타</option></select></label>
              <label className="signup-minor-check"><input type="checkbox" checked={minor} onChange={(event) => setMinor(event.target.checked)} /><span><strong>가입일 기준 만 19세 미만입니다.</strong><small>미성년 학생은 보호자 연락처가 필요합니다.</small></span></label>
              {minor && (
                <div className="signup-guardian form-grid">
                  <label className="form-field"><span>보호자 이름</span><input name="guardianName" type="text" autoComplete="name" maxLength={100} required /></label>
                  <label className="form-field"><span>보호자 전화번호</span><input name="guardianPhone" type="tel" autoComplete="tel" minLength={10} maxLength={20} pattern="[0-9-]{10,20}" placeholder="010-1234-5678" required /></label>
                </div>
              )}
            </div>
          </section>

          <section className="surface-card signup-section" aria-labelledby="signup-terms-title">
            <header>
              <span>3</span>
              <div>
                <h2 id="signup-terms-title">필수 약관 동의</h2>
                <p>현재 시행 중인 필수 약관을 확인해 주세요.</p>
              </div>
            </header>
            <div className="signup-section__body signup-terms">
              {terms.isPending ? (
                <LoadingState message="가입 약관을 불러오는 중입니다." />
              ) : terms.isError ? (
                <ErrorState message={errorMessage(terms.error)} onRetry={() => void terms.refetch()} />
              ) : requiredTerms.length === 0 ? (
                <div className="form-alert" role="alert">현재 가입에 필요한 필수 약관이 준비되지 않았습니다. 관리자에게 문의해 주세요.</div>
              ) : (
                <>
                  <label className="signup-agree-all">
                    <input type="checkbox" checked={allRequiredAgreed} onChange={(event) => setAgreedIds(event.target.checked ? requiredTerms.map((document) => document.id) : [])} />
                    <strong>필수 약관 전체 동의</strong>
                  </label>
                  <div className="signup-term-list">
                    {requiredTerms.map((document) => (
                      <details key={document.id} className="signup-term">
                        <summary>
                          <label onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={agreedIds.includes(document.id)} onChange={(event) => setAgreedIds((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} />
                            <span><strong>[필수] {document.title}</strong><small>버전 {document.version}</small></span>
                          </label>
                          <span className="signup-term__toggle">내용 보기</span>
                        </summary>
                        <div className="signup-term__content">{document.content}</div>
                      </details>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {error && <div className="form-alert signup-submit-error" role="alert">{error}</div>}
          <footer className="signup-actions">
            <p>가입 신청 후 관리자의 승인이 필요합니다.</p>
            <button type="submit" className="button button--primary" disabled={submitting || terms.isPending || terms.isError || !allRequiredAgreed}>
              {submitting ? "신청 중…" : "가입 신청"}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
