import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CirclePlus,
  FileText,
  Pencil,
  Power,
  ShieldCheck,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import {
  activateTermsVersion,
  createTermsVersion,
  getTermsVersions,
  TERMS_TYPE_LABELS,
  TERMS_TYPES,
  type TermsDocument,
  type TermsType,
  updateTermsVersion,
} from "./terms.api";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function currentLocalDateTime(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;

  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function typeLabel(type: TermsType): string {
  return TERMS_TYPE_LABELS[type];
}

export function TermsPage() {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDocument, setEditingDocument] =
    useState<TermsDocument | null>(null);

  const termsQuery = useQuery({
    queryKey: ["terms", "versions"],
    queryFn: getTermsVersions,
  });

  const documents = termsQuery.data ?? [];
  const types = TERMS_TYPES;

  const filteredDocuments = selectedType
    ? documents.filter((document) => document.type === selectedType)
    : documents;

  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedDocumentId) ??
    filteredDocuments[0] ??
    null;

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: ["terms"],
    });
  };

  const createMutation = useMutation({
    mutationFn: createTermsVersion,
    onSuccess: async (created) => {
      setSelectedType(created.type);
      setSelectedDocumentId(created.id);
      setMobileDetailOpen(true);
      setCreateOpen(false);
      await refresh();
    },
  });

  const activateMutation = useMutation({
    mutationFn: activateTermsVersion,
    onSuccess: async (activated) => {
      setSelectedType(activated.type);
      setSelectedDocumentId(activated.id);
      setMobileDetailOpen(true);
      await refresh();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Parameters<typeof updateTermsVersion>[1]) =>
      updateTermsVersion(id, input),
    onSuccess: async (updated) => {
      setSelectedType(updated.type);
      setSelectedDocumentId(updated.id);
      setMobileDetailOpen(true);
      setEditingDocument(null);
      await refresh();
    },
  });

  const handleCreate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const effectiveAt = String(formData.get("effectiveAt") ?? "");

    createMutation.mutate({
      type: String(formData.get("type") ?? "") as TermsType,
      version: String(formData.get("version") ?? "").trim(),
      title: String(formData.get("title") ?? "").trim(),
      content: String(formData.get("content") ?? "").trim(),
      required: formData.get("required") === "on",
      effectiveAt: new Date(effectiveAt).toISOString(),
      activate: formData.get("activate") === "on",
    });
  };

  const handleUpdate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (!editingDocument) return;

    const formData = new FormData(event.currentTarget);
    const effectiveAt = String(formData.get("effectiveAt") ?? "");

    updateMutation.mutate({
      id: editingDocument.id,
      type: String(formData.get("type") ?? "") as TermsType,
      version: String(formData.get("version") ?? "").trim(),
      title: String(formData.get("title") ?? "").trim(),
      content: String(formData.get("content") ?? "").trim(),
      required: formData.get("required") === "on",
      effectiveAt: new Date(effectiveAt).toISOString(),
    });
  };

  if (termsQuery.isLoading) {
    return <LoadingState message="약관 버전을 불러오고 있습니다." />;
  }

  if (termsQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(termsQuery.error)}
        onRetry={() => void termsQuery.refetch()}
      />
    );
  }

  return (
    <div
      className={`page-stack terms-page ${
        mobileDetailOpen ? "page--mobile-detail-open" : ""
      }`}
    >
      <section className="page-header">
        <div>
          <h1>약관 관리</h1>
          <p>회원가입에 사용하는 약관 문서와 버전을 관리합니다.</p>
        </div>

        <button
          type="button"
          className="button button--primary"
          onClick={() => setCreateOpen(true)}
        >
          <CirclePlus size={18} />새 약관 버전
        </button>
      </section>

      <section className="filter-bar">
        <label className="filter-control">
          <span className="sr-only">약관 유형</span>
          <select
            value={selectedType}
            onChange={(event) => {
              setSelectedType(event.target.value);
              setSelectedDocumentId(null);
              setMobileDetailOpen(false);
            }}
          >
            <option value="">전체 약관 유형</option>

            {types.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="management-split workbench-layout">
        <article
          className={`surface-card master-pane master-pane--list ${
            mobileDetailOpen ? "master-pane--mobile-hidden" : ""
          }`}
        >
          <header className="card-header">
            <div>
              <h2>약관 버전</h2>
              <p>총 {filteredDocuments.length}개</p>
            </div>
          </header>

          {filteredDocuments.length ? (
            <div className="record-list">
              {filteredDocuments.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  className={`record-item ${
                    selectedDocument?.id === document.id
                      ? "record-item--selected"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedDocumentId(document.id);
                    setMobileDetailOpen(true);
                  }}
                >
                  <span className="record-item__icon">
                    <FileText size={19} />
                  </span>

                  <span className="record-item__body">
                    <strong>{document.title}</strong>
                    <small>
                      {typeLabel(document.type)} · v{document.version}
                    </small>
                  </span>

                  <span
                    className={`status-badge ${
                      document.active
                        ? "status-badge--success"
                        : "status-badge--neutral"
                    }`}
                  >
                    {document.active ? "활성" : "비활성"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="등록된 약관 버전이 없습니다."
              description="새 약관 버전을 등록해 주세요."
            />
          )}
        </article>

        <article
          className={`surface-card master-pane master-pane--detail ${
            mobileDetailOpen ? "" : "master-pane--mobile-hidden"
          }`}
        >
          <button
            type="button"
            className="mobile-detail-back"
            onClick={() => setMobileDetailOpen(false)}
          >
            <ChevronLeft size={18} /> 약관 목록
          </button>
          {selectedDocument ? (
            <>
              <header className="card-header">
                <div>
                  <h2>{selectedDocument.title}</h2>
                  <p>
                    {selectedDocument.type} · 버전 {selectedDocument.version}
                  </p>
                </div>

                <div className="button-group">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setEditingDocument(selectedDocument)}
                  >
                    <Pencil size={17} />
                    수정
                  </button>

                  {!selectedDocument.active && (
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={
                        activateMutation.isPending ||
                        new Date(selectedDocument.effectiveAt) > new Date()
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            `${selectedDocument.title} 버전을 활성화하시겠습니까?\n같은 유형의 기존 활성 약관은 비활성화됩니다.`,
                          )
                        ) {
                          activateMutation.mutate(selectedDocument.id);
                        }
                      }}
                    >
                      <Power size={17} />
                      활성화
                    </button>
                  )}
                </div>
              </header>

              <div className="card-body stack">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>약관 유형</span>
                    <strong>{typeLabel(selectedDocument.type)}</strong>
                  </div>

                  <div className="detail-item">
                    <span>버전</span>
                    <strong>{selectedDocument.version}</strong>
                  </div>

                  <div className="detail-item">
                    <span>시행 시각</span>
                    <strong>
                      {formatDateTime(selectedDocument.effectiveAt)}
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>동의 정책</span>
                    <strong>
                      {selectedDocument.required ? "필수 동의" : "선택 동의"}
                    </strong>
                  </div>
                </div>

                <div
                  className={`info-banner ${
                    selectedDocument.active ? "info-banner--success" : ""
                  }`}
                >
                  {selectedDocument.active ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <CalendarClock size={19} />
                  )}

                  <div>
                    <strong>
                      {selectedDocument.active
                        ? "현재 활성 약관"
                        : "비활성 약관"}
                    </strong>

                    <p>
                      {new Date(selectedDocument.effectiveAt) > new Date()
                        ? "시행 시각이 지나야 활성화할 수 있습니다."
                        : selectedDocument.active
                          ? "현재 회원가입 동의 대상으로 사용됩니다."
                          : "필요한 경우 이 버전을 활성화할 수 있습니다."}
                    </p>
                  </div>
                </div>

                <section className="document-preview">
                  <header>
                    <ShieldCheck size={20} />

                    <div>
                      <strong>{selectedDocument.title}</strong>
                      <span>버전 {selectedDocument.version}</span>
                    </div>
                  </header>

                  <pre>{selectedDocument.content}</pre>
                </section>

                {activateMutation.isError && (
                  <div className="form-alert" role="alert">
                    {getErrorMessage(activateMutation.error)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="약관 버전을 선택해 주세요."
              description="왼쪽 목록에서 확인할 약관을 선택합니다."
            />
          )}
        </article>
      </section>

      {createOpen && (
        <Modal
          title="새 약관 버전"
          description="등록한 약관 본문은 수정하지 않고 새 버전으로 관리합니다."
          onClose={() => setCreateOpen(false)}
        >
          <form className="stack" onSubmit={handleCreate}>
            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>약관 유형</span>
                <select name="type" defaultValue="SERVICE" required>
                  {TERMS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field form-field--flush">
                <span>버전</span>
                <input
                  name="version"
                  placeholder="1.0"
                  maxLength={30}
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>제목</span>
              <input name="title" maxLength={200} required />
            </label>

            <label className="form-field">
              <span>약관 본문</span>
              <textarea name="content" rows={15} maxLength={100_000} required />
            </label>

            <label className="form-field">
              <span>시행 시각</span>
              <input
                name="effectiveAt"
                type="datetime-local"
                defaultValue={currentLocalDateTime()}
                required
              />
            </label>

            <div className="checkbox-list">
              <label className="checkbox-field">
                <input name="required" type="checkbox" defaultChecked />

                <span>
                  <strong>필수 동의</strong>
                  <small>동의하지 않으면 회원가입할 수 없습니다.</small>
                </span>
              </label>

              <label className="checkbox-field">
                <input name="activate" type="checkbox" />

                <span>
                  <strong>등록과 동시에 활성화</strong>
                  <small>같은 유형의 기존 활성 버전은 비활성화됩니다.</small>
                </span>
              </label>
            </div>

            {createMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(createMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setCreateOpen(false)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "등록 중..." : "약관 버전 등록"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingDocument && (
        <Modal
          title="약관 수정"
          description="오탈자 수정도 감사 로그에 변경 전·후 내용이 기록됩니다. 내용의 의미가 달라지면 새 버전을 등록하세요."
          onClose={() => setEditingDocument(null)}
        >
          <form className="stack" onSubmit={handleUpdate}>
            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>약관 유형</span>
                <select
                  name="type"
                  defaultValue={editingDocument.type}
                  required
                >
                  {TERMS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field form-field--flush">
                <span>버전</span>
                <input
                  name="version"
                  defaultValue={editingDocument.version}
                  maxLength={30}
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>제목</span>
              <input
                name="title"
                defaultValue={editingDocument.title}
                maxLength={200}
                required
              />
            </label>

            <label className="form-field">
              <span>약관 본문</span>
              <textarea
                name="content"
                defaultValue={editingDocument.content}
                rows={15}
                maxLength={100_000}
                required
              />
            </label>

            <label className="form-field">
              <span>시행 시각</span>
              <input
                name="effectiveAt"
                type="datetime-local"
                defaultValue={toLocalDateTime(editingDocument.effectiveAt)}
                required
              />
            </label>

            <label className="checkbox-field">
              <input
                name="required"
                type="checkbox"
                defaultChecked={editingDocument.required}
              />

              <span>
                <strong>필수 동의</strong>
                <small>동의하지 않으면 회원가입할 수 없습니다.</small>
              </span>
            </label>

            {updateMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(updateMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditingDocument(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "저장 중..." : "변경사항 저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
