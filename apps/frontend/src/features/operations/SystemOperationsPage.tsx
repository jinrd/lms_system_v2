import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      <header className="page-header"><div><h1>시스템 운영</h1><p>업무 기록, 서버 오류, 데이터 관리 작업과 백업 상태를 확인합니다.</p></div></header>
      <div className="tabs" role="tablist" aria-label="시스템 운영 메뉴">
        <TabButton value="audit" current={tab} onChange={setTab}>감사 로그</TabButton>
        <TabButton value="system" current={tab} onChange={setTab}>시스템 로그</TabButton>
        <TabButton value="lifecycle" current={tab} onChange={setTab}>데이터 생명주기</TabButton>
        <TabButton value="backups" current={tab} onChange={setTab}>백업</TabButton>
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

function AuditLogsPanel() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [result, setResult] = useState("");
  const query = useQuery({ queryKey: ["operations", "audit", page, action, resourceType, result], queryFn: () => getAuditLogs({ page, action: action || undefined, resourceType: resourceType || undefined, result: result || undefined }) });
  return <section className="surface-card"><header className="card-header"><div><h2>감사 로그</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div></header><div className="card-body form-grid"><label className="form-field"><span>작업</span><input value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} /></label><label className="form-field"><span>자원 유형</span><input value={resourceType} onChange={(event) => { setResourceType(event.target.value); setPage(1); }} /></label><label className="form-field"><span>결과</span><select value={result} onChange={(event) => { setResult(event.target.value); setPage(1); }}><option value="">전체</option><option value="SUCCESS">성공</option><option value="FAILURE">실패</option></select></label></div><QueryBody query={query} empty="감사 로그가 없습니다." render={(rows: AuditLog[]) => <div className="desktop-table"><table className="data-table"><thead><tr><th>시각</th><th>작업자</th><th>작업</th><th>대상</th><th>결과</th><th>세부 데이터</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.createdAt)}</td><td>{row.actorName ?? "시스템"}<br /><small>{row.actorRole ?? "-"}</small></td><td>{row.action}</td><td>{row.resourceType}<br /><small>{row.resourceId ?? "-"}</small></td><td>{row.result}{row.errorCode ? ` · ${row.errorCode}` : ""}</td><td><details><summary>보기</summary><pre>{json({ reason: row.reason, before: row.beforeData, after: row.afterData, requestId: row.requestId })}</pre></details></td></tr>)}</tbody></table></div>} /><Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} /></section>;
}

function SystemLogsPanel() {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("");
  const [route, setRoute] = useState("");
  const query = useQuery({ queryKey: ["operations", "system", page, level, route], queryFn: () => getSystemLogs({ page, level: level || undefined, route: route || undefined }) });
  return <section className="surface-card"><header className="card-header"><div><h2>시스템 로그</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div></header><div className="card-body form-grid"><label className="form-field"><span>수준</span><select value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }}><option value="">전체</option><option value="INFO">정보</option><option value="WARN">경고</option><option value="ERROR">오류</option></select></label><label className="form-field"><span>API 경로</span><input value={route} onChange={(event) => { setRoute(event.target.value); setPage(1); }} /></label></div><QueryBody query={query} empty="시스템 로그가 없습니다." render={(rows: SystemLog[]) => <div className="desktop-table"><table className="data-table"><thead><tr><th>시각</th><th>수준</th><th>메시지</th><th>경로</th><th>추적 정보</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.createdAt)}</td><td>{row.level}</td><td>{row.message}<br /><small>{row.errorCode ?? ""}</small></td><td>{row.route ?? "-"}</td><td><details><summary>보기</summary><pre>{json({ requestId: row.requestId, userId: row.userId, metadata: row.metadata, stack: row.stack })}</pre></details></td></tr>)}</tbody></table></div>} /><Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} /></section>;
}

function LifecyclePanel({ admin }: { admin: boolean }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = useQuery({ queryKey: ["operations", "lifecycle", page, status], queryFn: () => getLifecycleRuns({ page, status: status || undefined }) });
  const run = useMutation({ mutationFn: runDataLifecycle, onSuccess: async () => client.invalidateQueries({ queryKey: ["operations", "lifecycle"] }) });
  return <section className="surface-card"><header className="card-header"><div><h2>데이터 생명주기 실행 이력</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div>{admin && <button type="button" className="button button--primary" disabled={run.isPending} onClick={() => { if (window.confirm("데이터 보존 정책 작업을 지금 실행할까요?")) run.mutate(); }}>{run.isPending ? "실행 중…" : "지금 실행"}</button>}</header><div className="card-body"><label className="form-field"><span>상태</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">전체</option><option value="RUNNING">실행 중</option><option value="SUCCESS">성공</option><option value="PARTIAL_FAILURE">부분 실패</option><option value="FAILURE">실패</option></select></label>{run.isError && <p className="form-error">{message(run.error)}</p>}{run.isSuccess && <p className="form-success">{run.data.ran ? `${run.data.jobs.length}개 작업을 실행했습니다.` : "이미 실행 중인 작업이 있어 새 실행을 시작하지 않았습니다."}</p>}</div><QueryBody query={query} empty="실행 이력이 없습니다." render={(rows: LifecycleRun[]) => <div className="desktop-table"><table className="data-table"><thead><tr><th>시작</th><th>작업</th><th>상태</th><th>확인</th><th>성공</th><th>실패</th><th>오류</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.startedAt)}</td><td>{row.jobType}</td><td>{row.status}</td><td>{row.scannedCount}</td><td>{row.successCount}</td><td>{row.failureCount}</td><td>{row.errorSummary ?? "-"}</td></tr>)}</tbody></table></div>} /><Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} /></section>;
}

function BackupsPanel({ admin }: { admin: boolean }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = useQuery({ queryKey: ["operations", "backups", page, status], queryFn: () => getBackupRuns({ page, status: status || undefined }) });
  const restore = useMutation({ mutationFn: ({ id, result }: { id: string; result: "SUCCESS" | "FAILURE" }) => recordRestoreTest(id, result), onSuccess: async () => client.invalidateQueries({ queryKey: ["operations", "backups"] }) });
  return <section className="surface-card"><header className="card-header"><div><h2>백업 실행 이력</h2><p>총 {query.data?.pagination.total ?? 0}건</p></div></header><div className="card-body"><label className="form-field"><span>상태</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">전체</option><option value="RUNNING">실행 중</option><option value="SUCCESS">성공</option><option value="FAILURE">실패</option></select></label>{restore.isError && <p className="form-error">{message(restore.error)}</p>}</div><QueryBody query={query} empty="백업 실행 이력이 없습니다." render={(rows: BackupRun[]) => <div className="desktop-table"><table className="data-table"><thead><tr><th>시작</th><th>상태</th><th>저장 위치</th><th>크기</th><th>보관 기한</th><th>복구 테스트</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.startedAt)}</td><td>{row.status}{row.errorMessage ? <><br /><small>{row.errorMessage}</small></> : null}</td><td>{row.storageKey ?? "-"}</td><td>{row.sizeBytes ? `${Math.round(Number(row.sizeBytes) / 1048576)} MiB` : "-"}</td><td>{formatDateTime(row.retentionUntil)}</td><td>{row.restoreTestResult ?? "미실시"}<br />{admin && row.status === "SUCCESS" && <><button type="button" className="button button--secondary" disabled={restore.isPending} onClick={() => restore.mutate({ id: row.id, result: "SUCCESS" })}>성공 기록</button> <button type="button" className="button button--ghost" disabled={restore.isPending} onClick={() => restore.mutate({ id: row.id, result: "FAILURE" })}>실패 기록</button></>}</td></tr>)}</tbody></table></div>} /><Pager page={page} totalPages={query.data?.pagination.totalPages ?? 1} onChange={setPage} /></section>;
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
