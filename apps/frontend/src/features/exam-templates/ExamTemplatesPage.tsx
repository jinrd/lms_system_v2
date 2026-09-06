import {
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  FileText,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { TemplateEditor, PartEditor } from "./ExamTemplateForms";
import {
  createExamTemplate,
  deleteExamTemplatePart,
  getExamTemplate,
  getExamTemplates,
  saveExamTemplatePart,
  updateExamTemplate,
  type ExamPartInput,
  type ExamPartType,
  type ExamScope,
  type ExamStage,
  type ExamTemplate,
  type ExamTemplateInput,
  type ExamTemplateQuery,
} from "./exam-templates.api";
import {
  errorMessage,
  MIB,
  PART_LABELS,
  SCOPE_LABELS,
  STAGE_LABELS,
  templateUpdate,
} from "./exam-template.utils";
import "./exam-templates.css";

type Editor =
  | { mode: "create" }
  | { mode: "edit"; template: ExamTemplate }
  | { mode: "part"; template: ExamTemplate; type: ExamPartType };
type SaveAction =
  | { type: "create"; input: ExamTemplateInput }
  | { type: "edit"; template: ExamTemplate; input: ExamTemplateInput }
  | { type: "part"; id: string; partType: ExamPartType; input: ExamPartInput }
  | { type: "delete"; id: string; partType: ExamPartType };

export function ExamTemplatesPage() {
  const client = useQueryClient();
  const [query, setQuery] = useState<ExamTemplateQuery>({ page: 1, limit: 20 });
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleting, setDeleting] = useState<{
    template: ExamTemplate;
    type: ExamPartType;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const list = useQuery({
    queryKey: ["exam-templates", query],
    queryFn: () => getExamTemplates(query),
  });
  const id = selectedId ?? list.data?.items[0]?.id;
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 767px)").matches) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [mobileOpen, editor, id]);
  const detail = useQuery({
    queryKey: ["exam-template", id],
    queryFn: () => getExamTemplate(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: (action: SaveAction) => {
      switch (action.type) {
        case "create":
          return createExamTemplate(action.input);
        case "edit":
          return updateExamTemplate(
            action.template.id,
            templateUpdate(action.input, action.template),
          );
        case "part":
          return saveExamTemplatePart(action.id, action.partType, action.input);
        case "delete":
          return deleteExamTemplatePart(action.id, action.partType);
      }
    },
    onSuccess: (saved, action) => {
      client.setQueryData(["exam-template", saved.id], saved);
      void client.invalidateQueries({ queryKey: ["exam-templates"] });
      setSelectedId(saved.id);
      setEditor(null);
      setDirty(false);
      setDeleting(null);
      setMobileOpen(true);
      setNotice(
        action.type === "delete"
          ? `${PART_LABELS[action.partType]} 파트를 삭제했습니다.`
          : action.type === "create"
            ? "초안을 만들었습니다. 필기·실기 파트를 추가해 주세요."
            : "변경 사항을 저장했습니다.",
      );
    },
  });
  const busy = save.isPending;
  const locked = Boolean(editor) || busy;
  const blocker = useBlocker(dirty || busy);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty || busy) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      [dirty, busy],
    ),
  );
  const changeQuery = (next: Partial<ExamTemplateQuery>) => {
    setQuery((current) => ({ ...current, ...next, page: next.page ?? 1 }));
    setSelectedId(null);
    setNotice("");
  };
  const openEditor = (next: Editor) => {
    save.reset();
    setNotice("");
    setDirty(false);
    setEditor(next);
    setMobileOpen(true);
  };
  const closeEditor = () => {
    setEditor(null);
    setDirty(false);
    setDiscardOpen(false);
    save.reset();
    if (!id) setMobileOpen(false);
  };
  const cancelEditor = () => {
    if (dirty) setDiscardOpen(true);
    else closeEditor();
  };
  const hasFilters = Boolean(
    query.keyword || query.scope || query.stage || query.active !== undefined,
  );
  return (
    <div
      className={`page-stack templates-page ${mobileOpen ? "page--mobile-detail-open" : ""}`}
    >
      <header className="page-header">
        <div>
          <h1>시험 템플릿</h1>
          <p>
            반복해서 사용할 시험의 과목, 평가 기준과 응시 조건을 구성합니다.
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={locked}
          onClick={() => openEditor({ mode: "create" })}
        >
          <CirclePlus size={18} />새 템플릿
        </button>
      </header>
      <form
        className="filter-bar template-filters"
        role="search"
        aria-label="시험 템플릿 검색"
        onSubmit={(event) => {
          event.preventDefault();
          changeQuery({ keyword: keyword.trim() || undefined });
        }}
      >
        <fieldset disabled={locked}>
          <label className="form-field template-filters__keyword">
            <span>템플릿 이름</span>
            <div className="template-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={keyword}
                maxLength={200}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="이름으로 검색"
              />
            </div>
          </label>
          <label className="form-field">
            <span>시험 범위</span>
            <select
              value={query.scope ?? ""}
              onChange={(event) =>
                changeQuery({
                  scope: (event.target.value as ExamScope) || undefined,
                })
              }
            >
              <option value="">전체 범위</option>
              {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>시험 단계</span>
            <select
              value={query.stage ?? ""}
              onChange={(event) =>
                changeQuery({
                  stage: (event.target.value as ExamStage) || undefined,
                })
              }
            >
              <option value="">전체 단계</option>
              {Object.entries(STAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>상태</span>
            <select
              value={query.active === undefined ? "" : String(query.active)}
              onChange={(event) =>
                changeQuery({
                  active:
                    event.target.value === ""
                      ? undefined
                      : event.target.value === "true",
                })
              }
            >
              <option value="">전체 상태</option>
              <option value="false">초안</option>
              <option value="true">활성</option>
            </select>
          </label>
          <div className="template-filters__actions">
            <button
              type="button"
              className="button button--ghost"
              disabled={!hasFilters && !keyword}
              onClick={() => {
                setKeyword("");
                setQuery({ page: 1, limit: 20 });
                setSelectedId(null);
                setNotice("");
              }}
            >
              초기화
            </button>
            <button type="submit" className="button button--secondary">
              검색
            </button>
          </div>
        </fieldset>
      </form>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      <section className="master-detail-layout workbench-layout template-workbench">
        <section
          className={`surface-card master-pane master-pane--list template-list-pane ${mobileOpen ? "master-pane--mobile-hidden" : ""}`}
          aria-label="템플릿 목록"
        >
          <header className="card-header">
            <div>
              <h2>템플릿 목록</h2>
              <p>
                {list.isPending
                  ? "목록을 불러오는 중"
                  : list.isError
                    ? "목록 조회 실패"
                    : `총 ${list.data?.pagination.total ?? 0}개`}
              </p>
            </div>
            <ClipboardList size={20} aria-hidden="true" />
          </header>
          {list.isPending ? (
            <LoadingState message="템플릿을 불러오는 중입니다." />
          ) : list.isError ? (
            <ErrorState
              message={errorMessage(list.error)}
              onRetry={() => void list.refetch()}
            />
          ) : list.data?.items.length === 0 ? (
            <EmptyState
              title={
                hasFilters
                  ? "조건에 맞는 템플릿이 없습니다."
                  : "등록된 템플릿이 없습니다."
              }
              description={
                hasFilters
                  ? "검색 조건을 변경하거나 초기화해 주세요."
                  : "새 템플릿을 눌러 첫 시험의 초안을 만들어 보세요."
              }
            />
          ) : (
            <div className="template-list">
              {list.data?.items.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  disabled={locked}
                  aria-pressed={id === template.id && !editor}
                  className={`template-list-item ${id === template.id && !editor ? "template-list-item--selected" : ""}`}
                  onClick={() => {
                    setSelectedId(template.id);
                    setMobileOpen(true);
                    setNotice("");
                    save.reset();
                  }}
                >
                  <span className="template-list-item__meta">
                    <span>
                      {SCOPE_LABELS[template.scope]} ·{" "}
                      {STAGE_LABELS[template.stage]}
                    </span>
                    <TemplateStatus active={template.active} />
                  </span>
                  <strong>{template.name}</strong>
                  <span className="template-list-item__subjects">
                    {template.subjects
                      .map((subject) => subject.name)
                      .join(" · ")}
                  </span>
                  <span className="template-list-item__meta">
                    <span>
                      {template.parts.length
                        ? template.parts
                            .map((part) => PART_LABELS[part.type])
                            .join(" · ")
                        : "파트 미구성"}
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          )}
          {!list.isError && (list.data?.pagination.totalPages ?? 0) > 1 && (
            <nav className="pagination" aria-label="템플릿 목록 페이지">
              <button
                type="button"
                className="button button--secondary"
                disabled={locked || list.isFetching || (query.page ?? 1) <= 1}
                onClick={() => changeQuery({ page: (query.page ?? 1) - 1 })}
              >
                <ChevronLeft size={16} />
                이전
              </button>
              <span>
                {query.page} / {list.data?.pagination.totalPages}
              </span>
              <button
                type="button"
                className="button button--secondary"
                disabled={
                  locked ||
                  list.isFetching ||
                  (query.page ?? 1) >= (list.data?.pagination.totalPages ?? 1)
                }
                onClick={() => changeQuery({ page: (query.page ?? 1) + 1 })}
              >
                다음
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </section>
        <div
          className={`master-pane master-pane--detail template-detail-pane ${mobileOpen ? "" : "master-pane--mobile-hidden"}`}
        >
          <button
            type="button"
            className="mobile-detail-back"
            disabled={busy}
            onClick={() => {
              if (editor) cancelEditor();
              else setMobileOpen(false);
            }}
          >
            <ChevronLeft size={18} />
            {editor ? "편집 닫기" : "템플릿 목록"}
          </button>
          {editor?.mode === "create" || editor?.mode === "edit" ? (
            <TemplateEditor
              key={editor.mode === "edit" ? editor.template.id : "create"}
              template={editor.mode === "edit" ? editor.template : undefined}
              pending={busy}
              error={save.isError ? errorMessage(save.error) : null}
              onDirty={() => setDirty(true)}
              onCancel={cancelEditor}
              onSubmit={(input) =>
                save.mutate(
                  editor.mode === "edit"
                    ? { type: "edit", template: editor.template, input }
                    : { type: "create", input },
                )
              }
            />
          ) : editor?.mode === "part" ? (
            <PartEditor
              key={`${editor.template.id}:${editor.type}`}
              type={editor.type}
              part={editor.template.parts.find(
                (part) => part.type === editor.type,
              )}
              pending={busy}
              error={save.isError ? errorMessage(save.error) : null}
              onDirty={() => setDirty(true)}
              onCancel={cancelEditor}
              onSubmit={(input) =>
                save.mutate({
                  type: "part",
                  id: editor.template.id,
                  partType: editor.type,
                  input,
                })
              }
            />
          ) : !id ? (
            <div className="surface-card">
              <EmptyState
                title="시험 구성을 시작하세요"
                description="목록에서 템플릿을 선택하거나 새 초안을 만들어 과목과 파트를 구성하세요."
              />
            </div>
          ) : detail.isPending ? (
            <LoadingState message="템플릿 상세 정보를 불러오는 중입니다." />
          ) : detail.isError ? (
            <ErrorState
              message={errorMessage(detail.error)}
              onRetry={() => void detail.refetch()}
            />
          ) : detail.data ? (
            <TemplateDetail
              template={detail.data}
              onEdit={() => openEditor({ mode: "edit", template: detail.data })}
              onPart={(type) =>
                openEditor({ mode: "part", template: detail.data, type })
              }
              onDelete={(type) => {
                save.reset();
                setDeleting({ template: detail.data, type });
              }}
            />
          ) : null}
        </div>
      </section>
      {deleting && (
        <Modal
          title={`${PART_LABELS[deleting.type]} 파트 삭제`}
          description={`“${deleting.template.name}”의 ${PART_LABELS[deleting.type]} 파트를 삭제합니다.`}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            파트의 설정과 연결된 문제 구성·평가 항목이 함께 삭제되며 되돌릴 수
            없습니다. 문제은행의 원본 문제는 삭제되지 않습니다.
          </p>
          {save.isError && (
            <p role="alert" className="form-error">
              {errorMessage(save.error)}
            </p>
          )}
          <div className="dialog__actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              취소
            </button>
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() =>
                save.mutate({
                  type: "delete",
                  id: deleting.template.id,
                  partType: deleting.type,
                })
              }
            >
              {busy ? "삭제 중…" : "파트 삭제"}
            </button>
          </div>
        </Modal>
      )}
      {(discardOpen || blocker.state === "blocked") && (
        <Modal
          title={busy ? "저장 중입니다" : "변경 사항을 저장하지 않았습니다"}
          description={
            busy
              ? "저장이 끝날 때까지 잠시 기다려 주세요."
              : "편집을 나가면 저장하지 않은 내용이 사라집니다."
          }
          onClose={() => {
            setDiscardOpen(false);
            if (blocker.state === "blocked") blocker.reset();
          }}
        >
          <div className="dialog__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setDiscardOpen(false);
                if (blocker.state === "blocked") blocker.reset();
              }}
            >
              계속 편집
            </button>
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() => {
                closeEditor();
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              저장하지 않고 나가기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TemplateStatus({ active }: { active: boolean }) {
  return (
    <span
      className={`status-badge ${active ? "status-badge--success" : "status-badge--neutral"}`}
    >
      {active ? "활성" : "초안"}
    </span>
  );
}

export function TemplateDetail({
  template,
  onEdit,
  onPart,
  onDelete,
}: {
  template: ExamTemplate;
  onEdit: () => void;
  onPart: (type: ExamPartType) => void;
  onDelete: (type: ExamPartType) => void;
}) {
  return (
    <div className="template-detail">
      <section className="surface-card">
        <header className="card-header">
          <div>
            <div className="template-detail__tags">
              <TemplateStatus active={template.active} />
              <span>
                {SCOPE_LABELS[template.scope]} · {STAGE_LABELS[template.stage]}
              </span>
            </div>
            <h2 className="template-detail__title">{template.name}</h2>
          </div>
          {!template.active && (
            <button
              type="button"
              className="button button--secondary"
              onClick={onEdit}
            >
              <Pencil size={16} />
              기본 정보 수정
            </button>
          )}
        </header>
        <div className="card-body template-detail__body">
          {template.active ? (
            <p className="template-guidance">
              활성 템플릿은 읽기 전용입니다. 기본 정보와 파트를 변경할 수
              없습니다.
            </p>
          ) : (
            <p className="template-guidance">
              초안에서는 기본 정보와 필기·실기 파트의 응시 조건을 설정할 수
              있습니다.
            </p>
          )}
          {template.description && (
            <p className="template-description">{template.description}</p>
          )}
          <dl className="template-metadata">
            <div>
              <dt>구성 과목</dt>
              <dd>
                {template.subjects.map((subject) => (
                  <span key={subject.subjectId}>
                    {subject.name}
                    {!subject.active && " (사용 중지)"}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>기본 응시 기간</dt>
              <dd>
                {template.defaultOpenDays === null
                  ? "미지정"
                  : `${template.defaultOpenDays}일`}
              </dd>
            </div>
            <div>
              <dt>최근 수정</dt>
              <dd>
                <time dateTime={template.updatedAt}>
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(template.updatedAt))}
                </time>
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section
        className="surface-card template-parts"
        aria-labelledby="template-parts-title"
      >
        <header className="card-header">
          <div>
            <h2 id="template-parts-title">시험 파트</h2>
            <p>필기와 실기의 평가·응시 조건을 각각 관리합니다.</p>
          </div>
        </header>
        {(["WRITTEN", "PRACTICAL"] as const).map((type) => {
          const part = template.parts.find((item) => item.type === type);
          return (
            <section
              className="template-part"
              key={type}
              aria-label={`${PART_LABELS[type]} 파트`}
            >
              <header className="template-part__header">
                <h3>
                  <FileText size={18} aria-hidden="true" />
                  {PART_LABELS[type]}
                  <span>{part ? "구성됨" : "미구성"}</span>
                </h3>
                {!template.active && (
                  <div className="template-part__actions">
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => onPart(type)}
                      aria-label={`${PART_LABELS[type]} 파트 ${part ? "수정" : "추가"}`}
                    >
                      {part ? <Pencil size={15} /> : <CirclePlus size={15} />}
                      {part ? "수정" : "파트 추가"}
                    </button>
                    {part && (
                      <button
                        type="button"
                        className="button button--ghost"
                        aria-label={`${PART_LABELS[type]} 파트 삭제`}
                        onClick={() => onDelete(type)}
                      >
                        <Trash2 size={15} />
                        삭제
                      </button>
                    )}
                  </div>
                )}
              </header>
              {part ? (
                <>
                  <dl className="template-part__facts">
                    <div>
                      <dt>총점 / 합격 점수</dt>
                      <dd>
                        {part.totalScore}점 / {part.passScore}점
                      </dd>
                    </div>
                    <div>
                      <dt>응시 기간</dt>
                      <dd>
                        시험 시작{" "}
                        {part.defaultOpenOffsetDays === 0
                          ? "당일"
                          : `${part.defaultOpenOffsetDays}일 후`}
                        부터 {part.defaultOpenDays}일
                      </dd>
                    </div>
                    {type === "WRITTEN" ? (
                      <div>
                        <dt>제한 시간</dt>
                        <dd>{part.durationMinutes}분</dd>
                      </div>
                    ) : (
                      <>
                        <div>
                          <dt>제출 파일 수</dt>
                          <dd>
                            {part.minFiles}~{part.maxFiles}개
                          </dd>
                        </div>
                        <div>
                          <dt>파일 크기 제한</dt>
                          <dd>
                            파일당{" "}
                            {Number(
                              ((part.maxFileSizeBytes ?? 0) / MIB).toFixed(4),
                            )}{" "}
                            MiB · 전체{" "}
                            {Number(
                              ((part.maxTotalSizeBytes ?? 0) / MIB).toFixed(4),
                            )}{" "}
                            MiB
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                  {part.instructions && (
                    <div className="template-part__instructions">
                      <h4>응시 안내</h4>
                      <p>{part.instructions}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="template-part__empty">
                  {type === "WRITTEN"
                    ? "총점, 합격 점수와 필기 제한 시간을 설정하세요."
                    : "총점, 합격 점수와 실기 파일 제출 조건을 설정하세요."}
                </p>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}
