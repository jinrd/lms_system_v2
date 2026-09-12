import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/ui/PageStates";
import { getCurrentTerms } from "../features/terms/terms.api";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function PendingConsentPage() {
  const { pendingTerms, consent, cancelPendingConsent } = useAuth();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const terms = useQuery({ queryKey: ["terms", "current", "pending-consent"], queryFn: getCurrentTerms, enabled: Boolean(pendingTerms) });

  if (!pendingTerms) return <Navigate to="/login" replace />;
  const documents = pendingTerms.map((pending) => terms.data?.find((item) => item.id === pending.id) ?? { ...pending, content: "약관 내용을 불러오는 중입니다.", required: true, effectiveAt: "", active: true });
  const complete = pendingTerms.every((term) => agreed.includes(term.id));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await consent(agreed);
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="password-change-layout"><form className="auth-card" onSubmit={submit}><div className="auth-card__header"><h2>필수 약관 동의</h2><span>서비스를 계속 이용하려면 새로 시행된 필수 약관을 확인해 주세요.</span></div>{terms.isPending ? <LoadingState message="약관을 불러오는 중입니다." /> : terms.isError ? <ErrorState message={message(terms.error)} onRetry={() => void terms.refetch()} /> : documents.map((term) => <section className="surface-card" key={term.id}><header className="card-header"><div><h3>{term.title}</h3><p>버전 {term.version}</p></div></header><div className="card-body"><details><summary>약관 내용 보기</summary><p className="preserve-lines">{term.content}</p></details><label><input type="checkbox" checked={agreed.includes(term.id)} onChange={(event) => setAgreed(event.target.checked ? [...agreed, term.id] : agreed.filter((id) => id !== term.id))} /> 필수 약관에 동의합니다.</label></div></section>)}{error && <div className="form-alert" role="alert">{error}</div>}<button type="submit" className="button button--primary auth-submit" disabled={!complete || submitting || terms.isPending || terms.isError}>{submitting ? "처리 중…" : "동의하고 계속"}</button><button type="button" className="button button--ghost" onClick={() => { cancelPendingConsent(); navigate("/login", { replace: true }); }}>다른 계정으로 로그인</button></form></main>;
}
