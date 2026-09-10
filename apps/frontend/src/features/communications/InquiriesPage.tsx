import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  MessageCircle,
  Plus,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { Modal } from "../../components/ui/Modal";
import { getMyAttendanceSessions } from "../attendance/attendance.api";
import {
  closeInquiry,
  createInquiry,
  getInquiries,
  getInquiry,
  replyInquiry,
  type InquiryDetail,
  type InquiryListItem,
  type InquiryStatus,
  type InquiryType,
} from "./communications.api";
import "./communications.css";

const TYPE_LABELS: Record<InquiryType, string> = { CLASS: "수업 관련", GENERAL: "일반 문의" };
const STATUS_LABELS: Record<InquiryStatus, string> = { RECEIVED: "답변 대기", IN_PROGRESS: "처리 중", ANSWERED: "답변 완료", CLOSED: "종료" };
const STATUS_TABS: Array<{ value: InquiryStatus | ""; label: string }> = [
  { value: "", label: "전체" },
  { value: "RECEIVED", label: "답변 대기" },
  { value: "IN_PROGRESS", label: "처리 중" },
  { value: "ANSWERED", label: "답변 완료" },
  { value: "CLOSED", label: "종료" },
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(value))
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

function statusTone(status: InquiryStatus): string {
  if (status === "RECEIVED") return "danger";
  if (status === "IN_PROGRESS") return "warning";
  if (status === "ANSWERED") return "success";
  return "neutral";
}

export function InquiriesPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const student = user?.role === "STUDENT";
  const [page, setPage] = useState(1);
  const [type, setType] = useState<InquiryType | "">("");
  const [status, setStatus] = useState<InquiryStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<"latest" | "oldest">("latest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const list = useQuery({ queryKey: ["inquiries", page, type, status], queryFn: () => getInquiries({ page, type: type || undefined, status: status || undefined }) });
  const counts = useQuery({
    queryKey: ["inquiries", "status-counts", type],
    queryFn: async () => {
      const responses = await Promise.all(STATUS_TABS.slice(1).map((tab) => getInquiries({ page: 1, type: type || undefined, status: tab.value as InquiryStatus })));
      return Object.fromEntries(STATUS_TABS.slice(1).map((tab, index) => [tab.value, responses[index].pagination.total])) as Record<InquiryStatus, number>;
    },
  });
  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
    return [...(list.data?.items ?? [])]
      .filter((item) => !normalized || item.title.toLocaleLowerCase("ko-KR").includes(normalized) || item.className?.toLocaleLowerCase("ko-KR").includes(normalized))
      .sort((a, b) => sort === "latest" ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt));
  }, [keyword, list.data?.items, sort]);
  const selectedListItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const selected = selectedListItem?.id ?? null;
  const detail = useQuery({ queryKey: ["inquiry", selected], queryFn: () => getInquiry(selected!), enabled: Boolean(selected) });

  const sessions = useQuery({ queryKey: ["inquiry", "my-classes"], queryFn: getMyAttendanceSessions, enabled: student && creating });
  const classes = [...new Map((sessions.data ?? []).map((item) => [item.classId, { id: item.classId, name: item.className }])).values()];
  const create = useMutation({
    mutationFn: createInquiry,
    onSuccess: async (saved) => {
      setCreating(false);
      setSelectedId(saved.id);
      setMobileDetailOpen(true);
      client.setQueryData(["inquiry", saved.id], saved);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["inquiries"], exact: false }),
        client.invalidateQueries({ queryKey: ["inquiries", "status-counts"], exact: false }),
      ]);
    },
  });
  const reply = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => replyInquiry(id, content),
    onSuccess: async (saved) => {
      client.setQueryData(["inquiry", saved.id], saved);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["inquiries"], exact: false }),
        client.invalidateQueries({ queryKey: ["inquiries", "status-counts"], exact: false }),
      ]);
    },
  });
  const close = useMutation({
    mutationFn: closeInquiry,
    onSuccess: async (saved) => {
      client.setQueryData(["inquiry", saved.id], saved);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["inquiries"], exact: false }),
        client.invalidateQueries({ queryKey: ["inquiries", "status-counts"], exact: false }),
      ]);
    },
  });

  const statusCount = (value: InquiryStatus | ""): number | undefined => {
    if (!value) return counts.data ? Object.values(counts.data).reduce((total, count) => total + count, 0) : list.data?.pagination.total;
    return counts.data?.[value];
  };

  return (
    <div className="page-stack communications-page inquiries-page">
      <header className="page-header inquiry-page-header">
        <div>
          <h1>문의사항</h1>
          <p>{student ? "내 문의를 작성하고 답변을 확인합니다." : "학생과 강사의 문의를 확인하고 답변할 수 있습니다."}</p>
        </div>
        {student && <button type="button" className="button button--primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> 문의 등록</button>}
      </header>

      <nav className="inquiry-status-tabs" aria-label="문의 상태">
        {STATUS_TABS.map((tab) => (
          <button key={tab.value || "all"} type="button" className={status === tab.value ? "inquiry-status-tab inquiry-status-tab--active" : "inquiry-status-tab"} aria-pressed={status === tab.value} onClick={() => { setStatus(tab.value); setPage(1); setSelectedId(null); setMobileDetailOpen(false); }}>
            {tab.label}<span>{statusCount(tab.value) ?? "—"}</span>
          </button>
        ))}
      </nav>

      <div className="inquiry-toolbar">
        <label className="notice-toolbar__select">
          <span className="sr-only">문의 유형</span>
          <select value={type} onChange={(event) => { setType(event.target.value as InquiryType | ""); setPage(1); setSelectedId(null); }}>
            <option value="">전체 유형</option>
            <option value="CLASS">수업 관련</option>
            {user?.role !== "INSTRUCTOR" && <option value="GENERAL">일반 문의</option>}
          </select>
        </label>
        <label className="inquiry-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">문의 검색</span>
          <input type="search" placeholder="제목 또는 반 이름을 검색하세요." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </label>
        <label className="notice-toolbar__select">
          <span className="sr-only">정렬</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as "latest" | "oldest")}><option value="latest">최신순</option><option value="oldest">오래된순</option></select>
        </label>
      </div>

      <div className={`communications-workbench inquiry-workbench ${mobileDetailOpen ? "communications-workbench--detail" : ""}`}>
        <div className="communications-list-pane">
          <section className="surface-card inquiry-list-card">
            <header className="inquiry-list-summary"><strong>{student ? "내 문의" : "문의 처리함"} {list.data?.pagination.total ?? 0}</strong><span>최근 업데이트 순으로 표시됩니다.</span></header>
            {list.isPending ? <LoadingState message="문의 목록을 불러오는 중입니다." /> : list.isError ? <ErrorState message={message(list.error)} onRetry={() => void list.refetch()} /> : visibleItems.length === 0 ? <EmptyState title="문의가 없습니다." description={student ? "궁금한 내용을 새 문의로 남겨 주세요." : "현재 조건에 맞는 문의가 없습니다."} /> : (
              <div className="inquiry-list">
                {visibleItems.map((item) => <InquiryListRow key={item.id} item={item} selected={selected === item.id} onSelect={() => { setSelectedId(item.id); setMobileDetailOpen(true); }} />)}
              </div>
            )}
          </section>
          <Pagination page={page} totalPages={list.data?.pagination.totalPages ?? 1} onChange={(nextPage) => { setPage(nextPage); setSelectedId(null); setMobileDetailOpen(false); }} />
        </div>

        <div className="communications-detail-pane inquiry-detail-pane">
          {selected && <button type="button" className="mobile-detail-back" onClick={() => setMobileDetailOpen(false)}><ChevronLeft size={17} aria-hidden="true" /> 문의 목록</button>}
          {selected ? (
            <InquiryThread
              inquiry={detail.data}
              loading={detail.isPending}
              error={detail.isError ? message(detail.error) : ""}
              student={student}
              currentUserId={user?.id ?? ""}
              replyPending={reply.isPending}
              closePending={close.isPending}
              actionError={reply.isError ? message(reply.error) : close.isError ? message(close.error) : ""}
              onRetry={() => void detail.refetch()}
              onReply={(content) => reply.mutateAsync({ id: selected, content }).then(() => undefined)}
              onClose={() => close.mutate(selected)}
            />
          ) : (
            <section className="surface-card communications-empty-detail"><EmptyState title="문의를 선택해 주세요." description="목록에서 문의를 선택하면 대화 내용이 표시됩니다." /></section>
          )}
        </div>
      </div>

      {creating && (
        <Modal title="새 문의 등록" description="답변이 필요한 내용을 구체적으로 작성해 주세요." onClose={() => setCreating(false)}>
          <InquiryCreateForm classes={classes} pending={create.isPending} error={create.isError ? message(create.error) : sessions.isError ? "수강 중인 반을 불러오지 못했습니다." : ""} onCancel={() => setCreating(false)} onSubmit={(input) => create.mutate(input)} />
        </Modal>
      )}
    </div>
  );
}

function InquiryListRow({ item, selected, onSelect }: { item: InquiryListItem; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="inquiry-list-item" aria-pressed={selected} onClick={onSelect}>
      <span className="inquiry-list-item__copy">
        <strong>{item.title}</strong>
        <small>{TYPE_LABELS[item.type]}{item.className ? ` · ${item.className}` : ""} · 답글 {item.replyCount}개</small>
      </span>
      <span className="inquiry-list-item__meta">
        <span className={`status-badge status-badge--${statusTone(item.status)}`}>{STATUS_LABELS[item.status]}</span>
        <time>{formatShortDate(item.updatedAt)}</time>
      </span>
    </button>
  );
}

function InquiryCreateForm({ classes, pending, error, onCancel, onSubmit }: { classes: Array<{ id: string; name: string }>; pending: boolean; error: string; onCancel: () => void; onSubmit: (input: { type: InquiryType; classId?: string; title: string; content: string }) => void }) {
  const [type, setType] = useState<InquiryType>("GENERAL");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ type, classId: type === "CLASS" ? String(data.get("classId") ?? "") : undefined, title: String(data.get("title") ?? "").trim(), content: String(data.get("content") ?? "").trim() });
  };
  return (
    <form className="inquiry-create-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        <div className="form-grid">
          <label className="form-field"><span>문의 유형</span><select value={type} onChange={(event) => setType(event.target.value as InquiryType)}><option value="GENERAL">일반 문의</option><option value="CLASS">수업 관련 문의</option></select></label>
          {type === "CLASS" && <label className="form-field"><span>대상 반</span><select name="classId" required><option value="">반 선택</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        </div>
        <label className="form-field"><span>제목</span><input name="title" maxLength={200} required /></label>
        <label className="form-field"><span>내용</span><textarea name="content" rows={6} maxLength={50000} required /></label>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog__actions"><button type="button" className="button button--secondary" onClick={onCancel}>취소</button><button type="submit" className="button button--primary" disabled={pending}>{pending ? "등록 중…" : "문의 등록"}</button></div>
    </form>
  );
}

function InquiryThread({ inquiry, loading, error, student, currentUserId, replyPending, closePending, actionError, onRetry, onReply, onClose }: { inquiry?: InquiryDetail; loading: boolean; error: string; student: boolean; currentUserId: string; replyPending: boolean; closePending: boolean; actionError: string; onRetry: () => void; onReply: (content: string) => Promise<void>; onClose: () => void }) {
  const [replyText, setReplyText] = useState("");
  if (loading) return <section className="surface-card inquiry-thread-card"><LoadingState message="문의 내용을 불러오는 중입니다." /></section>;
  if (error) return <section className="surface-card inquiry-thread-card"><ErrorState message={error} onRetry={onRetry} /></section>;
  if (!inquiry) return null;
  const closed = inquiry.status === "CLOSED";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = replyText.trim();
    if (!content) return;
    await onReply(content);
    setReplyText("");
  };
  return (
    <section className="surface-card inquiry-thread-card">
      <header className="inquiry-thread-header">
        <div>
          <div className="inquiry-thread-header__state"><span className={`status-badge status-badge--${statusTone(inquiry.status)}`}>{STATUS_LABELS[inquiry.status]}</span><span>{TYPE_LABELS[inquiry.type]}</span></div>
          <h2>{inquiry.title}</h2>
        </div>
        {!student && !closed && <button type="button" className="button button--secondary" disabled={closePending} onClick={onClose}>{closePending ? "종료 중…" : "문의 종료"}</button>}
      </header>

      <div className="inquiry-thread-meta">
        <span><CalendarDays size={15} aria-hidden="true" /><small>작성일</small><strong>{formatDateTime(inquiry.createdAt)}</strong></span>
        <span><MessageCircle size={15} aria-hidden="true" /><small>문의 유형</small><strong>{TYPE_LABELS[inquiry.type]}</strong></span>
        <span><UserRound size={15} aria-hidden="true" /><small>대상</small><strong>{inquiry.className || "학원 운영팀"}</strong></span>
      </div>

      <div className="inquiry-thread-messages" aria-label="문의 대화 내용">
        <MessageBubble label={student ? "나" : "문의 작성자"} content={inquiry.content} createdAt={inquiry.createdAt} mine={student} />
        {inquiry.replies.map((item) => (
          <MessageBubble key={item.id} label={item.authorId === currentUserId ? "나" : student ? "학원 담당자" : "문의 작성자"} content={item.content} createdAt={item.createdAt} mine={item.authorId === currentUserId} />
        ))}
      </div>

      {closed ? (
        <div className="inquiry-closed-state"><Clock3 size={16} aria-hidden="true" /> 종료된 문의입니다. 대화 내용은 계속 확인할 수 있습니다.</div>
      ) : (
        <form className="inquiry-reply-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="inquiry-reply">{student ? "추가 문의" : "답변 작성"}</label>
          <textarea id="inquiry-reply" name="content" rows={4} maxLength={50000} placeholder={student ? "추가로 전달할 내용을 입력하세요." : "학생에게 전달할 답변을 입력하세요."} value={replyText} onChange={(event) => setReplyText(event.target.value)} required />
          <div className="inquiry-reply-form__footer">
            {actionError ? <p className="form-error" role="alert">{actionError}</p> : <span>{replyText.length.toLocaleString("ko-KR")} / 50,000</span>}
            <button type="submit" className="button button--primary" disabled={replyPending || !replyText.trim()}><Send size={15} aria-hidden="true" />{replyPending ? "등록 중…" : student ? "내용 추가" : "답변 등록"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function MessageBubble({ label, content, createdAt, mine }: { label: string; content: string; createdAt: string; mine: boolean }) {
  return (
    <article className={mine ? "inquiry-message inquiry-message--mine" : "inquiry-message"}>
      <header><span className="inquiry-message__avatar" aria-hidden="true"><UserRound size={15} /></span><strong>{label}</strong><time>{formatDateTime(createdAt)}</time></header>
      <p className="preserve-lines">{content}</p>
    </article>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="페이지 이동"><button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</button><span>{page} / {totalPages}</span><button type="button" className="button button--secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>다음</button></nav>;
}
