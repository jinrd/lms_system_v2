import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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

  return (
    <div className="page-stack communications-page handovers-page">
      <header className="page-header">
        <div><h1>강사 인수인계</h1><p>반 변경 내용을 전달하고 새 담당 강사의 확인 상태를 관리합니다.</p></div>
        {manager && <button type="button" className="button button--primary" onClick={() => setEditing("new")}>새 인수인계</button>}
      </header>
      <section className="filter-bar"><label className="filter-control"><span>확인 상태</span><select value={acknowledged} onChange={(event) => { setAcknowledged(event.target.value as typeof acknowledged); setPage(1); }}><option value="">전체</option><option value="false">미확인</option><option value="true">확인 완료</option></select></label></section>

      {editing === "new" && <HandoverForm classes={classes.data?.items ?? []} fromInstructors={formerInstructors.data?.items ?? []} toInstructors={instructors.data?.items ?? []} pending={save.isPending} error={save.isError ? message(save.error) : ""} onCancel={() => setEditing(null)} onSubmit={(input) => save.mutate(input)} />}

      <div className={`communications-workbench ${selectedId ? "communications-workbench--detail" : ""}`}>
      <div className="communications-list-pane">
      <section className="surface-card">
        <header className="card-header"><div><h2>인수인계 목록</h2><p>총 {list.data?.pagination.total ?? 0}개</p></div></header>
        {list.isPending ? <LoadingState /> : list.isError ? <ErrorState message={message(list.error)} onRetry={() => void list.refetch()} /> : list.data.items.length === 0 ? <EmptyState title="인수인계 문서가 없습니다." description="강사 변경이 있을 때 문서를 작성합니다." /> : <div className="data-list">{list.data.items.map((item) => <button type="button" className="data-list__item" key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelectedId(item.id); setEditing(null); }}><span><strong>{item.title}</strong><small>{item.className} · {item.fromInstructorName ?? "이전 강사 없음"} → {item.toInstructorName}</small></span><span className={`status-badge ${item.acknowledgedAt ? "status-badge--success" : "status-badge--warning"}`}>{item.acknowledgedAt ? "확인 완료" : "미확인"}</span></button>)}</div>}
      </section>
      {(list.data?.pagination.totalPages ?? 1) > 1 && <nav className="pagination"><button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button><span>{page} / {list.data!.pagination.totalPages}</span><button type="button" className="button button--secondary" disabled={page >= list.data!.pagination.totalPages} onClick={() => setPage(page + 1)}>다음</button></nav>}

      </div>
      <div className="communications-detail-pane">
      {selectedId && <button type="button" className="mobile-detail-back" onClick={() => setSelectedId(null)}>인수인계 목록</button>}
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
