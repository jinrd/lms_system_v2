import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Search, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  getAuditLogs,
  getBackupRuns,
  getLifecycleRuns,
  getSystemLogs,
  recordRestoreTest,
  runDataLifecycle,
  type AuditLog,
  type BackupRun,
  type LifecycleRun,
  type SystemLog,
} from "./operations.api";
import "./operations.css";

type OperationsTab = "audit" | "system" | "lifecycle" | "backups";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function json(value: unknown): string {
  if (value === null || value === undefined) return "-";
  return JSON.stringify(value, null, 2);
}

export function SystemOperationsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<OperationsTab>("audit");
  return (
    <div className="page-stack system-operations-page">
      <header className="page-header"><div><h1>시스템 운영</h1><p>시스템의 안정적인 운영을 위한 로그 확인, 정책 관리, 백업 기능을 제공합니다.</p></div></header>
      <div className="tabs" role="tablist" aria-label="시스템 운영 메뉴">
        <TabButton value="audit" current={tab} onChange={setTab}>감사 로그</TabButton>
        <TabButton value="system" current={tab} onChange={setTab}>시스템 로그</TabButton>
        <TabButton value="lifecycle" current={tab} onChange={setTab}>데이터 수명 주기 정책</TabButton>
        <TabButton value="backups" current={tab} onChange={setTab}>백업 및 복구</TabButton>
      </div>
      {tab === "audit" && <AuditLogsPanel />}
      {tab === "system" && <SystemLogsPanel />}
      {tab === "lifecycle" && <LifecyclePanel admin={user?.role === "ADMIN"} />}
      {tab === "backups" && <BackupsPanel admin={user?.role === "ADMIN"} />}
    </div>
  );
}

function TabButton({ value, current, onChange, children }: { value: OperationsTab; current: OperationsTab; onChange: (value: OperationsTab) => void; children: string }) {
  return <button type="button" role="tab" aria-selected={current === value} className={`tab ${current === value ? "tab--active" : ""}`} onClick={() => onChange(value)}>{children}</button>;
}

function StatusPill({ label, dot, active, onClick }: { label: string; dot: "neutral" | "success" | "warning" | "danger"; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`operations-pill ${active ? "operations-pill--active" : ""}`} onClick={onClick}>
      <span className={`operations-pill__dot operations-pill__dot--${dot}`} aria-hidden="true" />
      {label}
    </button>
  );
}

function AuditLogsPanel() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [result, setResult] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["operations", "audit", page, action, resourceType, result], queryFn: () => getAuditLogs({ page, action: action || undefined, resourceType: resourceType || undefined, result: result || undefined }) });
  const rows = query.data?.items ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const resetFilters = () => {
    setAction("");
    setResourceType("");
    setResult("");
    setPage(1);
  };

  return (
    <section className="surface-card">
      <header className="card-header"><div><h2>감사 로그</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div></header>
      <div className="operations-toolbar">
        <label className="operations-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">작업 검색</span>
          <input type="search" placeholder="키워드로 검색 (예: 로그인, 삭제, 학생번호)" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} />
        </label>
        <input className="operations-input" placeholder="자원 유형 (예: 학생, 강의)" value={resourceType} onChange={(event) => { setResourceType(event.target.value); setPage(1); }} />
      </div>
      <div className="operations-stats">
        <StatusPill label="전체" dot="neutral" active={result === ""} onClick={() => { setResult(""); setPage(1); }} />
        <StatusPill label="성공" dot="success" active={result === "SUCCESS"} onClick={() => { setResult("SUCCESS"); setPage(1); }} />
        <StatusPill label="실패" dot="danger" active={result === "FAILURE"} onClick={() => { setResult("FAILURE"); setPage(1); }} />
        <button type="button" className="button button--secondary operations-reset" onClick={resetFilters}>필터 초기화</button>
      </div>
      <QueryBody
        query={query}
        empty="감사 로그가 없습니다."
        render={(items: AuditLog[]) => (
          <div className="desktop-table">
            <table className="data-table">
              <thead><tr><th>일시</th><th>사용자</th><th>작업</th><th>대상</th><th>결과</th><th>IP 주소</th><th>상세</th></tr></thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} data-selected={selectedId === row.id} onClick={() => setSelectedId(row.id)}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{row.actorName ?? "시스템"}<br /><small>{row.actorRole ?? "-"}</small></td>
                    <td>{row.action}</td>
                    <td>{row.resourceType}<br /><small>{row.resourceId ?? "-"}</small></td>
                    <td><span className={`status-badge status-badge--${row.result === "SUCCESS" ? "success" : "danger"}`}>{row.result === "SUCCESS" ? "성공" : "실패"}</span>{row.errorCode ? ` · ${row.errorCode}` : ""}</td>
                    <td>{row.ipAddress ?? "-"}</td>
                    <td><button type="button" className="operations-row-view" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}><Eye size={15} aria-hidden="true" /> 보기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      />
      <Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} />
      {selected && (
        <div className="operations-detail">
          <header className="card-header">
            <h3>감사 이벤트 상세</h3>
            <button type="button" className="operations-detail__close" aria-label="닫기" onClick={() => setSelectedId(null)}><X size={16} /></button>
          </header>
          <dl className="operations-detail__meta">
            <div><dt>일시</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
            <div><dt>사용자</dt><dd>{selected.actorName ?? "시스템"} ({selected.actorRole ?? "-"})</dd></div>
            <div><dt>작업</dt><dd>{selected.action}</dd></div>
            <div><dt>대상</dt><dd>{selected.resourceType} {selected.resourceId ?? ""}</dd></div>
            <div><dt>결과</dt><dd><span className={`status-badge status-badge--${selected.result === "SUCCESS" ? "success" : "danger"}`}>{selected.result === "SUCCESS" ? "성공" : "실패"}</span>{selected.errorCode ? ` · ${selected.errorCode}` : ""}</dd></div>
            <div><dt>IP 주소</dt><dd>{selected.ipAddress ?? "-"}</dd></div>
          </dl>
          <pre>{json({ reason: selected.reason, before: selected.beforeData, after: selected.afterData, requestId: selected.requestId })}</pre>
        </div>
      )}
    </section>
  );
}

function SystemLogsPanel() {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("");
  const [route, setRoute] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["operations", "system", page, level, route], queryFn: () => getSystemLogs({ page, level: level || undefined, route: route || undefined }) });
  const rows = query.data?.items ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <section className="surface-card">
      <header className="card-header"><div><h2>시스템 로그</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div></header>
      <div className="operations-toolbar">
        <label className="operations-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">API 경로 검색</span>
          <input type="search" placeholder="API 경로로 검색 (예: /admin/backups)" value={route} onChange={(event) => { setRoute(event.target.value); setPage(1); }} />
        </label>
      </div>
      <div className="operations-stats">
        <StatusPill label="전체" dot="neutral" active={level === ""} onClick={() => { setLevel(""); setPage(1); }} />
        <StatusPill label="정보" dot="neutral" active={level === "INFO"} onClick={() => { setLevel("INFO"); setPage(1); }} />
        <StatusPill label="경고" dot="warning" active={level === "WARN"} onClick={() => { setLevel("WARN"); setPage(1); }} />
        <StatusPill label="오류" dot="danger" active={level === "ERROR"} onClick={() => { setLevel("ERROR"); setPage(1); }} />
        <button type="button" className="button button--secondary operations-reset" onClick={() => { setLevel(""); setRoute(""); setPage(1); }}>필터 초기화</button>
      </div>
      <QueryBody
        query={query}
        empty="시스템 로그가 없습니다."
        render={(items: SystemLog[]) => (
          <div className="desktop-table">
            <table className="data-table">
              <thead><tr><th>시각</th><th>수준</th><th>메시지</th><th>경로</th><th>상세</th></tr></thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} data-selected={selectedId === row.id} onClick={() => setSelectedId(row.id)}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td><span className={`status-badge status-badge--${row.level === "ERROR" ? "danger" : row.level === "WARN" ? "warning" : "info"}`}>{row.level === "ERROR" ? "오류" : row.level === "WARN" ? "경고" : "정보"}</span></td>
                    <td>{row.message}<br /><small>{row.errorCode ?? ""}</small></td>
                    <td>{row.route ?? "-"}</td>
                    <td><button type="button" className="operations-row-view" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}><Eye size={15} aria-hidden="true" /> 보기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      />
      <Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} />
      {selected && (
        <div className="operations-detail">
          <header className="card-header">
            <h3>시스템 로그 상세</h3>
            <button type="button" className="operations-detail__close" aria-label="닫기" onClick={() => setSelectedId(null)}><X size={16} /></button>
          </header>
          <dl className="operations-detail__meta">
            <div><dt>시각</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
            <div><dt>수준</dt><dd>{selected.level}</dd></div>
            <div><dt>경로</dt><dd>{selected.route ?? "-"}</dd></div>
            <div><dt>사용자</dt><dd>{selected.userId ?? "-"}</dd></div>
          </dl>
          <pre>{json({ requestId: selected.requestId, metadata: selected.metadata, stack: selected.stack })}</pre>
        </div>
      )}
    </section>
  );
}

function LifecyclePanel({ admin }: { admin: boolean }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = useQuery({ queryKey: ["operations", "lifecycle", page, status], queryFn: () => getLifecycleRuns({ page, status: status || undefined }) });
  const run = useMutation({ mutationFn: runDataLifecycle, onSuccess: async () => client.invalidateQueries({ queryKey: ["operations", "lifecycle"] }) });
  return <section className="surface-card"><header className="card-header"><div><h2>데이터 수명 주기 실행 이력</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div>{admin && <button type="button" className="button button--primary" disabled={run.isPending} onClick={() => { if (window.confirm("데이터 보존 정책 작업을 지금 실행할까요?")) run.mutate(); }}>{run.isPending ? "실행 중…" : "지금 실행"}</button>}</header><div className="card-body"><label className="form-field"><span>상태</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">전체</option><option value="RUNNING">실행 중</option><option value="SUCCESS">성공</option><option value="PARTIAL_FAILURE">부분 실패</option><option value="FAILURE">실패</option></select></label>{run.isError && <p className="form-error">{message(run.error)}</p>}{run.isSuccess && <p className="form-success">{run.data.ran ? `${run.data.jobs.length}개 작업을 실행했습니다.` : "이미 실행 중인 작업이 있어 새 실행을 시작하지 않았습니다."}</p>}</div><QueryBody query={query} empty="실행 이력이 없습니다." render={(rows: LifecycleRun[]) => <div className="desktop-table"><table className="data-table"><thead><tr><th>시작</th><th>작업</th><th>상태</th><th>확인</th><th>성공</th><th>실패</th><th>오류</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.startedAt)}</td><td>{row.jobType}</td><td>{row.status}</td><td>{row.scannedCount}</td><td>{row.successCount}</td><td>{row.failureCount}</td><td>{row.errorSummary ?? "-"}</td></tr>)}</tbody></table></div>} /><Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} /></section>;
}

function BackupsPanel({ admin }: { admin: boolean }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = useQuery({ queryKey: ["operations", "backups", page, status], queryFn: () => getBackupRuns({ page, status: status || undefined }) });
  const restore = useMutation({ mutationFn: ({ id, result }: { id: string; result: "SUCCESS" | "FAILURE" }) => recordRestoreTest(id, result), onSuccess: async () => client.invalidateQueries({ queryKey: ["operations", "backups"] }) });
  return <section className="surface-card"><header className="card-header"><div><h2>최근 백업 스냅샷</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div></header><div className="card-body"><label className="form-field"><span>상태</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">전체</option><option value="RUNNING">실행 중</option><option value="SUCCESS">성공</option><option value="FAILURE">실패</option></select></label>{restore.isError && <p className="form-error">{message(restore.error)}</p>}</div><QueryBody query={query} empty="백업 실행 이력이 없습니다." render={(rows: BackupRun[]) => <div className="desktop-table"><table className="data-table"><thead><tr><th>생성 일시</th><th>상태</th><th>저장 위치</th><th>크기</th><th>보관 기한</th><th>복구 테스트</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.startedAt)}</td><td>{row.status}{row.errorMessage ? <><br /><small>{row.errorMessage}</small></> : null}</td><td>{row.storageKey ?? "-"}</td><td>{row.sizeBytes ? `${Math.round(Number(row.sizeBytes) / 1048576)} MiB` : "-"}</td><td>{formatDateTime(row.retentionUntil)}</td><td>{row.restoreTestResult ?? "미실시"}<br />{admin && row.status === "SUCCESS" && <><button type="button" className="button button--secondary" disabled={restore.isPending} onClick={() => restore.mutate({ id: row.id, result: "SUCCESS" })}>성공 기록</button> <button type="button" className="button button--ghost" disabled={restore.isPending} onClick={() => restore.mutate({ id: row.id, result: "FAILURE" })}>실패 기록</button></>}</td></tr>)}</tbody></table></div>} /><Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} /></section>;
}

type QueryLike<T> = { isPending: boolean; isError: boolean; error: unknown; data?: { items: T[] }; refetch: () => Promise<unknown> };

function QueryBody<T>({ query, empty, render }: { query: QueryLike<T>; empty: string; render: (rows: T[]) => React.ReactNode }) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={message(query.error)} onRetry={() => void query.refetch()} />;
  if (!query.data?.items.length) return <EmptyState title={empty} description="필터를 변경하거나 다음 실행을 기다려 주세요." />;
  return render(query.data.items);
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination"><button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</button><span>{page} / {totalPages}</span><button type="button" className="button button--secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>다음</button></nav>;
}
