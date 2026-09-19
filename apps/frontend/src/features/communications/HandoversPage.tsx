import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { getManagedClasses } from "../classes/class-management.api";
import { getActiveInstructors, getUsers } from "../users/users.api";
import {
  acknowledgeHandover,
  createHandover,
  getHandover,
  getHandovers,
  updateHandover,
  type Handover,
} from "./communications.api";
import "./communications.css";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function HandoversPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const manager = user?.role !== "INSTRUCTOR";
  const [page, setPage] = useState(1);
  const [acknowledged, setAcknowledged] = useState<"" | "true" | "false">("");
  const [keyword, setKeyword] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const list = useQuery({ queryKey: ["handovers", page, acknowledged], queryFn: () => getHandovers({ page, acknowledged: acknowledged === "" ? undefined : acknowledged === "true" }) });
  const selected = selectedId ?? list.data?.items[0]?.id ?? null;
  const detail = useQuery({ queryKey: ["handover", selected], queryFn: () => getHandover(selected!), enabled: Boolean(selected) });
  const classes = useQuery({ queryKey: ["handover", "classes"], queryFn: () => getManagedClasses(false), enabled: manager && editing === "new" });
  const instructors = useQuery({ queryKey: ["handover", "instructors"], queryFn: getActiveInstructors, enabled: manager && editing === "new" });
  const formerInstructors = useQuery({ queryKey: ["handover", "former-instructors"], queryFn: () => getUsers({ role: "INSTRUCTOR", page: 1, limit: 100 }), enabled: manager && editing === "new" });
  const save = useMutation({
    mutationFn: (input: { classId?: string; fromInstructorId?: string; toInstructorId?: string; title: string; content: string }) => editing === "new" ? createHandover({ classId: input.classId!, fromInstructorId: input.fromInstructorId, toInstructorId: input.toInstructorId!, title: input.title, content: input.content }) : updateHandover(selected!, { title: input.title, content: input.content }),
    onSuccess: async (saved) => { setSelectedId(saved.id); setEditing(null); client.setQueryData(["handover", saved.id], saved); await client.invalidateQueries({ queryKey: ["handovers"] }); },
  });
  const acknowledge = useMutation({
    mutationFn: acknowledgeHandover,
    onSuccess: async (saved) => { client.setQueryData(["handover", saved.id], saved); await client.invalidateQueries({ queryKey: ["handovers"] }); },
  });
  const classOptions = useMemo(() => [...new Map((list.data?.items ?? []).map((item) => [item.classId, item.className])).entries()], [list.data?.items]);
  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
    return (list.data?.items ?? []).filter((item) => (!classFilter || item.classId === classFilter) && (!normalized || `${item.title} ${item.className} ${item.fromInstructorName ?? ""} ${item.toInstructorName}`.toLocaleLowerCase("ko-KR").includes(normalized)));
  }, [classFilter, keyword, list.data?.items]);

  return (
    <div className="page-stack communications-page handovers-page">
      <header className="page-header">
        <div><h1>강사 인수인계</h1><p>반 변경 내용을 전달하고 새 담당 강사의 확인 상태를 관리합니다.</p></div>
        {manager && <button type="button" className="button button--primary" onClick={() => setEditing("new")}><Plus size={18} />새 인수인계</button>}
      </header>
      <section className="filter-bar handover-filters">
        <label className="filter-control handover-search"><span>검색</span><Search size={17} /><input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="제목, 반, 강사 검색" /></label>
        <label className="filter-control"><span>반</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">전체 반</option>{classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="filter-control"><span>확인 상태</span><select value={acknowledged} onChange={(event) => { setAcknowledged(event.target.value as typeof acknowledged); setPage(1); }}><option value="">전체 상태</option><option value="false">미확인</option><option value="true">확인 완료</option></select></label>
      </section>

      {editing === "new" && <HandoverForm classes={classes.data?.items ?? []} fromInstructors={formerInstructors.data?.items ?? []} toInstructors={instructors.data?.items ?? []} pending={save.isPending} error={save.isError ? message(save.error) : ""} onCancel={() => setEditing(null)} onSubmit={(input) => save.mutate(input)} />}

      <div className={`communications-workbench ${selectedId ? "communications-workbench--detail" : ""}`}>
      <div className="communications-list-pane">
      <section className="surface-card">
        <header className="card-header handover-list-header"><div><h2>인수인계 목록</h2><p>담당 강사 변경과 문서 확인 상태를 관리합니다.</p></div><span>{visibleItems.length}건</span></header>
        {list.isPending ? <LoadingState /> : list.isError ? <ErrorState message={message(list.error)} onRetry={() => void list.refetch()} /> : visibleItems.length === 0 ? <EmptyState title={list.data.items.length === 0 ? "인수인계 문서가 없습니다." : "조건에 맞는 문서가 없습니다."} description={list.data.items.length === 0 ? "강사 변경이 있을 때 문서를 작성합니다." : "검색어나 필터를 바꿔 다시 확인해 주세요."} /> : <div className="handover-table-wrap"><table className="handover-table"><thead><tr><th>제목</th><th>대상 반</th><th>이전 강사</th><th>새 강사</th><th>인계일</th><th>상태</th><th><span className="sr-only">상세 보기</span></th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id} className={selected === item.id ? "handover-table-row--selected" : undefined}><td><button type="button" className="handover-title-button" onClick={() => { setSelectedId(item.id); setEditing(null); }}><strong>{item.title}</strong><span>{item.content}</span></button></td><td>{item.className}</td><td>{item.fromInstructorName ?? "지정 없음"}</td><td>{item.toInstructorName}</td><td><time>{formatDateTime(item.createdAt)}</time></td><td><span className={`status-badge ${item.acknowledgedAt ? "status-badge--success" : "status-badge--warning"}`}>{item.acknowledgedAt ? "확인 완료" : "미확인"}</span></td><td><button type="button" className="icon-button" aria-label={`${item.title} 상세 보기`} onClick={() => { setSelectedId(item.id); setEditing(null); }}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div>}
      </section>
      {(list.data?.pagination.totalPages ?? 1) > 1 && <nav className="pagination"><button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button><span>{page} / {list.data!.pagination.totalPages}</span><button type="button" className="button button--secondary" disabled={page >= list.data!.pagination.totalPages} onClick={() => setPage(page + 1)}>다음</button></nav>}

      </div>
      <div className="communications-detail-pane">
      {selectedId && <button type="button" className="mobile-detail-back" onClick={() => setSelectedId(null)}><ChevronLeft size={18} />인수인계 목록</button>}
      {selected && (detail.isPending ? <section className="surface-card"><LoadingState message="인수인계를 불러오는 중입니다." /></section> : detail.isError ? <section className="surface-card"><ErrorState message={message(detail.error)} onRetry={() => void detail.refetch()} /></section> : detail.data && (editing === "edit" ? <HandoverForm handover={detail.data} classes={[]} fromInstructors={[]} toInstructors={[]} pending={save.isPending} error={save.isError ? message(save.error) : ""} onCancel={() => setEditing(null)} onSubmit={(input) => save.mutate(input)} /> : <HandoverDetail handover={detail.data} currentUserId={user?.id ?? ""} manager={manager} acknowledgePending={acknowledge.isPending} actionError={acknowledge.isError ? message(acknowledge.error) : ""} onEdit={() => setEditing("edit")} onAcknowledge={() => acknowledge.mutate(detail.data.id)} />))}
      </div>
      </div>
    </div>
  );
}

function HandoverDetail({ handover, currentUserId, manager, acknowledgePending, actionError, onEdit, onAcknowledge }: { handover: Handover; currentUserId: string; manager: boolean; acknowledgePending: boolean; actionError: string; onEdit: () => void; onAcknowledge: () => void }) {
  return <section className="surface-card"><header className="card-header"><div><h2>{handover.title}</h2><p>{handover.className} · {formatDateTime(handover.createdAt)}</p></div><div>{manager && !handover.acknowledgedAt && <button type="button" className="button button--secondary" onClick={onEdit}>수정</button>} {handover.toInstructorId === currentUserId && !handover.acknowledgedAt && <button type="button" className="button button--primary" disabled={acknowledgePending} onClick={onAcknowledge}>인수인계 확인</button>}</div></header><div className="card-body page-stack"><dl><div><dt>이전 강사</dt><dd>{handover.fromInstructorName ?? "지정 없음"}</dd></div><div><dt>새 강사</dt><dd>{handover.toInstructorName}</dd></div><div><dt>확인 시각</dt><dd>{handover.acknowledgedAt ? formatDateTime(handover.acknowledgedAt) : "미확인"}</dd></div></dl><p className="preserve-lines">{handover.content}</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}</div></section>;
}

function HandoverForm({ handover, classes, fromInstructors, toInstructors, pending, error, onCancel, onSubmit }: { handover?: Handover; classes: Array<{ id: string; name: string }>; fromInstructors: Array<{ id: string; name: string }>; toInstructors: Array<{ id: string; name: string }>; pending: boolean; error: string; onCancel: () => void; onSubmit: (input: { classId?: string; fromInstructorId?: string; toInstructorId?: string; title: string; content: string }) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ classId: String(data.get("classId") ?? "") || undefined, fromInstructorId: String(data.get("fromInstructorId") ?? "") || undefined, toInstructorId: String(data.get("toInstructorId") ?? "") || undefined, title: String(data.get("title") ?? "").trim(), content: String(data.get("content") ?? "").trim() });
  };
  return <section className="surface-card"><header className="card-header"><div><h2>{handover ? "인수인계 수정" : "새 인수인계"}</h2><p>{handover ? "확인 전까지 제목과 내용을 수정할 수 있습니다." : "대상 반과 이전·새 담당 강사를 지정합니다."}</p></div></header><form className="card-body page-stack" onSubmit={submit}><fieldset disabled={pending}>{!handover && <><label className="form-field"><span>대상 반</span><select name="classId" required><option value="">반 선택</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-grid"><label className="form-field"><span>이전 강사</span><select name="fromInstructorId"><option value="">지정 없음</option>{fromInstructors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>새 강사</span><select name="toInstructorId" required><option value="">강사 선택</option>{toInstructors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></>}<label className="form-field"><span>제목</span><input name="title" maxLength={200} defaultValue={handover?.title ?? ""} required /></label><label className="form-field"><span>인수인계 내용</span><textarea name="content" rows={10} maxLength={50000} defaultValue={handover?.content ?? ""} required /></label></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div><button type="button" className="button button--ghost" onClick={onCancel}>취소</button> <button type="submit" className="button button--primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button></div></form></section>;
}
