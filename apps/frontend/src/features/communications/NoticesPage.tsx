import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, FileText, Pin, Plus, Search, Users } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { Modal } from "../../components/ui/Modal";
import { getInstructorClasses, getManagedClasses } from "../classes/class-management.api";
import {
  createNotice,
  deleteNotice,
  getMyNotice,
  getMyNotices,
  getNotices,
  getUnreadNoticeCount,
  updateNotice,
  type Notice,
  type NoticeInput,
  type NoticeScope,
  type NoticeType,
} from "./communications.api";
import "./communications.css";

type NoticeTab = "inbox" | "manage";
type ClassOption = { id: string; name: string };
type SortOrder = "latest" | "oldest";

const TYPE_LABELS: Record<NoticeType, string> = { STUDENT: "학생 공지", INSTRUCTOR: "강사 공지" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string | null): string {
  if (!value) return "제한 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value))
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

function localInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function NoticesPage() {
  const { user } = useAuth();
  const staff = user?.role !== "STUDENT";
  const [tab, setTab] = useState<NoticeTab>(staff ? "manage" : "inbox");
  const [createVersion, setCreateVersion] = useState(0);

  const startCreate = () => {
    setTab("manage");
    setCreateVersion((value) => value + 1);
  };

  return (
    <div className="page-stack communications-page notices-page">
      <header className="page-header notice-page-header">
        <div>
          <h1>공지사항</h1>
          <p>학원의 주요 안내사항을 확인할 수 있습니다.</p>
        </div>
        {staff && (
          <button type="button" className="button button--primary" onClick={startCreate}>
            <Plus size={16} aria-hidden="true" /> 새 공지 작성
          </button>
        )}
      </header>

      {staff && (
        <div className="tabs notice-page-tabs" role="tablist" aria-label="공지사항 화면">
          <button type="button" className={`tab ${tab === "manage" ? "tab--active" : ""}`} role="tab" aria-selected={tab === "manage"} onClick={() => setTab("manage")}>공지 관리</button>
          <button type="button" className={`tab ${tab === "inbox" ? "tab--active" : ""}`} role="tab" aria-selected={tab === "inbox"} onClick={() => setTab("inbox")}>받은 공지</button>
        </div>
      )}

      {tab === "inbox" ? <NoticeInbox /> : <NoticeManagement key={createVersion} initialCreate={createVersion > 0} />}
    </div>
  );
}

function NoticeInbox() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [important, setImportant] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortOrder>("latest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const list = useQuery({ queryKey: ["my-notices", page, important], queryFn: () => getMyNotices({ page, important: important || undefined }) });
  const unread = useQuery({ queryKey: ["my-notices", "unread-count"], queryFn: getUnreadNoticeCount });
  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
    return [...(list.data?.items ?? [])]
      .filter((notice) => !normalized || notice.title.toLocaleLowerCase("ko-KR").includes(normalized))
      .sort((a, b) => Number(b.important) - Number(a.important) || (sort === "latest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  }, [keyword, list.data?.items, sort]);

  const effectiveSelectedId = visibleItems.some((item) => item.id === selectedId) ? selectedId : visibleItems[0]?.id ?? null;

  const detail = useQuery({
    queryKey: ["my-notice", effectiveSelectedId],
    queryFn: async () => {
      const notice = await getMyNotice(effectiveSelectedId!);
      void client.invalidateQueries({ queryKey: ["my-notices", "unread-count"] });
      void client.invalidateQueries({ queryKey: ["my-notices"], exact: false });
      return notice;
    },
    enabled: Boolean(effectiveSelectedId),
    staleTime: Infinity,
  });

  return (
    <>
      <div className="notice-toolbar">
        <label className="notice-toolbar__select">
          <span className="sr-only">공지 범위</span>
          <select value={important ? "important" : "all"} onChange={(event) => { setImportant(event.target.value === "important"); setPage(1); }}>
            <option value="all">전체 공지</option>
            <option value="important">중요 공지</option>
          </select>
        </label>
        <label className="notice-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">공지 검색</span>
          <input type="search" placeholder="제목을 검색하세요." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </label>
        <label className="notice-toolbar__select">
          <span className="sr-only">정렬</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}>
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </label>
      </div>

      <div className={`communications-workbench notice-workbench ${mobileDetailOpen ? "communications-workbench--detail" : ""}`}>
        <div className="communications-list-pane">
          <section className="surface-card notice-list-card">
            <header className="notice-list-summary">
              <strong>받은 공지 {list.data?.pagination.total ?? 0}</strong>
              <span>읽지 않음 {unread.data?.count ?? 0}</span>
            </header>
            {list.isPending ? <LoadingState message="공지를 불러오는 중입니다." /> : list.isError ? <ErrorState message={message(list.error)} onRetry={() => void list.refetch()} /> : visibleItems.length === 0 ? <EmptyState title="공지가 없습니다." description="새 공지가 게시되면 이곳에서 확인할 수 있습니다." /> : (
              <div className="notice-list">
                {visibleItems.map((notice) => (
                  <button type="button" className="notice-list-item" aria-pressed={effectiveSelectedId === notice.id} key={notice.id} onClick={() => { setSelectedId(notice.id); setMobileDetailOpen(true); }}>
                    <span className={notice.important ? "notice-list-item__icon notice-list-item__icon--important" : "notice-list-item__icon"}>{notice.important ? <Pin size={15} aria-label="중요 공지" /> : <FileText size={14} aria-hidden="true" />}</span>
                    <span className="notice-list-item__copy"><strong>{notice.title}</strong><small>{TYPE_LABELS[notice.type]}</small></span>
                    <span className="notice-list-item__meta"><time>{formatShortDate(notice.publishedFrom ?? notice.createdAt)}</time>{!notice.isRead && <em>새 공지</em>}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <Pagination page={page} totalPages={list.data?.pagination.totalPages ?? 1} onChange={setPage} />
        </div>

        <div className="communications-detail-pane">
          {effectiveSelectedId && <button type="button" className="mobile-detail-back" onClick={() => setMobileDetailOpen(false)}><ChevronLeft size={17} /> 공지 목록</button>}
          {effectiveSelectedId ? (
            <section className="surface-card notice-detail-card">
              {detail.isPending ? <LoadingState message="공지 내용을 불러오는 중입니다." /> : detail.isError ? <ErrorState message={message(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data && <NoticeDetail notice={detail.data} />}
            </section>
          ) : (
            <section className="surface-card communications-empty-detail"><EmptyState title="공지를 선택해 주세요." description="목록에서 공지를 선택하면 내용을 함께 볼 수 있습니다." /></section>
          )}
        </div>
      </div>
    </>
  );
}

function NoticeManagement({ initialCreate }: { initialCreate: boolean }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<NoticeType | "">("");
  const [scope, setScope] = useState<NoticeScope | "">("");
  const [sort, setSort] = useState<SortOrder>("latest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editor, setEditor] = useState<Notice | "new" | null>(initialCreate ? "new" : null);
  const list = useQuery({ queryKey: ["notices", page, keyword, type, scope], queryFn: () => getNotices({ page, keyword: keyword || undefined, type: type || undefined, scope: scope || undefined }) });
  const visibleItems = useMemo(() => [...(list.data?.items ?? [])].sort((a, b) => Number(b.important) - Number(a.important) || (sort === "latest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))), [list.data?.items, sort]);
  const selected = visibleItems.find((notice) => notice.id === selectedId) ?? visibleItems[0] ?? null;

  const classes = useQuery({
    queryKey: ["notice-class-options", user?.id],
    queryFn: async (): Promise<ClassOption[]> => {
      if (user?.role === "INSTRUCTOR") {
        const rows = await getInstructorClasses();
        return [...new Map(rows.map((item) => [item.id, { id: item.id, name: item.name }])).values()];
      }
      const response = await getManagedClasses(false);
      return response.items.map((item) => ({ id: item.id, name: item.name }));
    },
  });
  const save = useMutation({
    mutationFn: (input: NoticeInput) => editor === "new" ? createNotice(input) : updateNotice(editor!.id, {
      title: input.title,
      content: input.content,
      important: input.important,
      publishedFrom: input.publishedFrom ?? null,
      publishedUntil: input.publishedUntil ?? null,
      ...(input.scope === "CLASSES" ? { classTargetIds: input.classTargetIds } : {}),
    }),
    onSuccess: async (notice) => {
      setEditor(null);
      setSelectedId(notice.id);
      await client.invalidateQueries({ queryKey: ["notices"] });
    },
  });
  const remove = useMutation({
    mutationFn: deleteNotice,
    onSuccess: async () => {
      setSelectedId(null);
      await client.invalidateQueries({ queryKey: ["notices"] });
    },
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  return (
    <>
      <form className="notice-toolbar" role="search" onSubmit={submitSearch}>
        <label className="notice-toolbar__select"><span className="sr-only">대상 유형</span><select value={type} onChange={(event) => { setType(event.target.value as NoticeType | ""); setPage(1); }}><option value="">전체 대상</option><option value="STUDENT">학생</option><option value="INSTRUCTOR">강사</option></select></label>
        <label className="notice-toolbar__select"><span className="sr-only">공개 범위</span><select value={scope} onChange={(event) => { setScope(event.target.value as NoticeScope | ""); setPage(1); }}><option value="">전체 범위</option><option value="ALL">전체 공개</option><option value="CLASSES">특정 반</option></select></label>
        <label className="notice-search"><Search size={16} aria-hidden="true" /><span className="sr-only">공지 검색</span><input type="search" placeholder="제목 또는 내용을 검색하세요." value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} /></label>
        <button type="submit" className="button button--secondary notice-search-button">검색</button>
        <label className="notice-toolbar__select"><span className="sr-only">정렬</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}><option value="latest">최신순</option><option value="oldest">오래된순</option></select></label>
      </form>

      <div className={`communications-workbench notice-workbench ${mobileDetailOpen ? "communications-workbench--detail" : ""}`}>
        <div className="communications-list-pane">
          <section className="surface-card notice-list-card">
            <header className="notice-list-summary"><strong>전체 공지 {list.data?.pagination.total ?? 0}</strong><span>중요 공지는 목록 상단에서 빠르게 확인하세요.</span></header>
            {list.isPending ? <LoadingState message="공지를 불러오는 중입니다." /> : list.isError ? <ErrorState message={message(list.error)} onRetry={() => void list.refetch()} /> : visibleItems.length === 0 ? <EmptyState title="등록된 공지가 없습니다." description="새 공지를 작성해 대상에게 전달하세요." /> : (
              <div className="notice-list">
                {visibleItems.map((notice) => (
                  <button type="button" className="notice-list-item" aria-pressed={selected?.id === notice.id} key={notice.id} onClick={() => { setSelectedId(notice.id); setMobileDetailOpen(true); }}>
                    <span className={notice.important ? "notice-list-item__icon notice-list-item__icon--important" : "notice-list-item__icon"}>{notice.important ? <Pin size={15} aria-label="중요 공지" /> : <FileText size={14} aria-hidden="true" />}</span>
                    <span className="notice-list-item__copy"><strong>{notice.title}</strong><small>{TYPE_LABELS[notice.type]} · {notice.scope === "ALL" ? "전체" : notice.classTargets.map((item) => item.name).join(", ") || "특정 반"}</small></span>
                    <span className="notice-list-item__meta"><time>{formatShortDate(notice.publishedFrom ?? notice.createdAt)}</time>{notice.important && <em>중요</em>}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <Pagination page={page} totalPages={list.data?.pagination.totalPages ?? 1} onChange={setPage} />
        </div>

        <div className="communications-detail-pane">
          {selected && <button type="button" className="mobile-detail-back" onClick={() => setMobileDetailOpen(false)}><ChevronLeft size={17} /> 공지 목록</button>}
          {selected ? (
            <section className="surface-card notice-detail-card">
              <NoticeDetail notice={selected} actions={
                <div className="notice-detail-actions">
                  <button type="button" className="button button--secondary" onClick={() => setEditor(selected)}>수정</button>
                  <button type="button" className="button button--danger" disabled={remove.isPending} onClick={() => { if (window.confirm("이 공지를 삭제할까요?")) remove.mutate(selected.id); }}>{remove.isPending ? "삭제 중…" : "삭제"}</button>
                </div>
              } />
            </section>
          ) : (
            <section className="surface-card communications-empty-detail"><EmptyState title="공지를 선택해 주세요." description="목록에서 공지를 선택하면 내용을 함께 볼 수 있습니다." /></section>
          )}
        </div>
      </div>

      {editor && (
        <Modal title={editor === "new" ? "새 공지 작성" : "공지 수정"} description="게시 대상과 기간을 지정합니다." onClose={() => setEditor(null)}>
          <NoticeForm notice={editor === "new" ? undefined : editor} instructor={user?.role === "INSTRUCTOR"} classes={classes.data ?? []} pending={save.isPending} error={save.isError ? message(save.error) : ""} onCancel={() => setEditor(null)} onSubmit={(input) => save.mutate(input)} />
        </Modal>
      )}
    </>
  );
}

type NoticeDetailData = Pick<Notice, "title" | "content" | "important" | "type" | "scope" | "publishedFrom" | "publishedUntil" | "createdAt"> & {
  classTargets?: Notice["classTargets"];
};

function NoticeDetail({ notice, actions }: { notice: NoticeDetailData; actions?: React.ReactNode }) {
  return (
    <>
      <header className="notice-detail-header">
        <div className="notice-detail-header__badges">
          {notice.important && <span className="status-badge status-badge--danger"><Pin size={12} /> 중요</span>}
          <span className="status-badge status-badge--info">{TYPE_LABELS[notice.type]}</span>
        </div>
        <h2>{notice.title}</h2>
        <p>{formatDateTime(notice.publishedFrom ?? notice.createdAt)}</p>
      </header>
      <div className="notice-detail-body">
        <div className="notice-detail-meta">
          <span><Users size={15} aria-hidden="true" /><small>대상</small><strong>{notice.scope === "ALL" ? "전체" : notice.classTargets?.map((item) => item.name).join(", ") || "특정 반"}</strong></span>
          <span><CalendarDays size={15} aria-hidden="true" /><small>게시 기간</small><strong>{formatDateTime(notice.publishedFrom ?? notice.createdAt)} ~ {formatDateTime(notice.publishedUntil)}</strong></span>
        </div>
        <article className="notice-content preserve-lines">{notice.content}</article>
      </div>
      {actions && <footer className="notice-detail-footer">{actions}</footer>}
    </>
  );
}

function NoticeForm({ notice, instructor, classes, pending, error, onCancel, onSubmit }: { notice?: Notice; instructor: boolean; classes: ClassOption[]; pending: boolean; error: string; onCancel: () => void; onSubmit: (input: NoticeInput) => void }) {
  const [type, setType] = useState<NoticeType>(notice?.type ?? "STUDENT");
  const [scope, setScope] = useState<NoticeScope>(notice?.scope ?? (instructor ? "CLASSES" : "ALL"));
  const [classIds, setClassIds] = useState(notice?.classTargets.map((item) => item.classId) ?? []);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const publishedFrom = String(data.get("publishedFrom") ?? "");
    const publishedUntil = String(data.get("publishedUntil") ?? "");
    onSubmit({ type, scope, title: String(data.get("title") ?? "").trim(), content: String(data.get("content") ?? "").trim(), important: data.get("important") === "on", publishedFrom: publishedFrom ? new Date(publishedFrom).toISOString() : undefined, publishedUntil: publishedUntil ? new Date(publishedUntil).toISOString() : undefined, ...(scope === "CLASSES" ? { classTargetIds: classIds } : {}) });
  };
  return (
    <form className="notice-editor-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        <div className="form-grid">
          <label className="form-field"><span>대상 유형</span><select value={type} disabled={Boolean(notice) || instructor} onChange={(event) => { const next = event.target.value as NoticeType; setType(next); if (next === "INSTRUCTOR") setScope("ALL"); }}><option value="STUDENT">학생</option>{!instructor && <option value="INSTRUCTOR">강사</option>}</select></label>
          <label className="form-field"><span>공개 범위</span><select value={scope} disabled={Boolean(notice) || instructor} onChange={(event) => setScope(event.target.value as NoticeScope)}>{!instructor && <option value="ALL">전체</option>}{type === "STUDENT" && <option value="CLASSES">특정 반</option>}</select></label>
        </div>
        <label className="form-field"><span>제목</span><input name="title" maxLength={200} defaultValue={notice?.title ?? ""} required /></label>
        <label className="form-field"><span>내용</span><textarea name="content" rows={4} maxLength={50000} defaultValue={notice?.content ?? ""} required /></label>
        <label className="notice-editor-form__important"><input name="important" type="checkbox" defaultChecked={notice?.important ?? false} /> 중요 공지로 표시</label>
        <div className="form-grid">
          <label className="form-field"><span>게시 시작</span><input name="publishedFrom" type="datetime-local" defaultValue={localInput(notice?.publishedFrom ?? null)} /></label>
          <label className="form-field"><span>게시 종료</span><input name="publishedUntil" type="datetime-local" defaultValue={localInput(notice?.publishedUntil ?? null)} /></label>
        </div>
        {scope === "CLASSES" && <fieldset className="notice-class-options"><legend>대상 반</legend>{classes.map((item) => <label key={item.id}><input type="checkbox" checked={classIds.includes(item.id)} onChange={(event) => setClassIds(event.target.checked ? [...classIds, item.id] : classIds.filter((id) => id !== item.id))} /> {item.name}</label>)}</fieldset>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog__actions"><button type="button" className="button button--secondary" onClick={onCancel}>취소</button><button type="submit" className="button button--primary" disabled={pending || (scope === "CLASSES" && classIds.length === 0)}>{pending ? "저장 중…" : "저장"}</button></div>
    </form>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="페이지 이동"><button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</button><span>{page} / {totalPages}</span><button type="button" className="button button--secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>다음</button></nav>;
}
