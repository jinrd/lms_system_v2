import {
  BookOpen,
  ChevronRight,
  CirclePlus,
  Pencil,
  Power,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { Modal } from "../../components/ui/Modal";
import {
  changeEducationFieldActive,
  changeSubjectActive,
  createEducationField,
  createSubject,
  getEducationFields,
  getSubjects,
  updateEducationField,
  updateSubject,
  type EducationField,
  type EducationFieldInput,
  type Subject,
  type SubjectInput,
  type SubjectMode,
} from "./education.api";

type EditorState =
  | { type: "field"; item?: EducationField }
  | { type: "subject"; item?: Subject }
  | null;

const SUBJECT_MODE_LABELS: Record<SubjectMode, string> = {
  THEORY: "이론",
  PRACTICE: "실기",
  MIXED: "이론·실기",
};

function optionalString(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function EducationPage() {
  const queryClient = useQueryClient();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);

  const fieldsQuery = useQuery({
    queryKey: ["education-fields"],
    queryFn: getEducationFields,
  });

  const fields = fieldsQuery.data ?? [];
  const selectedField =
    fields.find((field) => field.id === selectedFieldId) ?? fields[0] ?? null;
  const effectiveFieldId = selectedField?.id ?? null;

  const subjectsQuery = useQuery({
    queryKey: ["education-fields", effectiveFieldId, "subjects"],
    queryFn: () => getSubjects(effectiveFieldId!),
    enabled: effectiveFieldId !== null,
  });

  const refreshFields = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: ["education-fields"],
    });
  };

  const refreshSubjects = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: ["education-fields", effectiveFieldId, "subjects"],
    });
  };

  const saveFieldMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: EducationFieldInput;
    }) => {
      if (id) {
        return updateEducationField(id, input);
      }

      return createEducationField(input);
    },
    onSuccess: async (saved) => {
      setSelectedFieldId(saved.id);
      setEditor(null);
      await refreshFields();
    },
  });

  const toggleFieldMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      changeEducationFieldActive(id, active),
    onSuccess: refreshFields,
  });

  const saveSubjectMutation = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SubjectInput }) => {
      if (!effectiveFieldId) {
        throw new Error("교육 분야를 먼저 선택해 주세요.");
      }

      if (id) {
        return updateSubject(effectiveFieldId, id, input);
      }

      return createSubject(effectiveFieldId, input);
    },
    onSuccess: async () => {
      setEditor(null);
      await refreshSubjects();
    },
  });

  const toggleSubjectMutation = useMutation({
    mutationFn: ({
      subjectId,
      active,
    }: {
      subjectId: string;
      active: boolean;
    }) => {
      if (!effectiveFieldId) {
        throw new Error("교육 분야를 먼저 선택해 주세요.");
      }

      return changeSubjectActive(effectiveFieldId, subjectId, active);
    },
    onSuccess: refreshSubjects,
  });

  const handleFieldSubmit = (
    event: FormEvent<HTMLFormElement>,
    item?: EducationField,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    saveFieldMutation.mutate({
      id: item?.id,
      input: {
        name: String(formData.get("name") ?? "").trim(),
        description: optionalString(formData, "description"),
        displayOrder: Number(formData.get("displayOrder")),
        active: true,
      },
    });
  };

  const handleSubjectSubmit = (
    event: FormEvent<HTMLFormElement>,
    item?: Subject,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const duration = String(formData.get("defaultDurationMinutes") ?? "");

    saveSubjectMutation.mutate({
      id: item?.id,
      input: {
        name: String(formData.get("name") ?? "").trim(),
        description: optionalString(formData, "description"),
        objective: optionalString(formData, "objective"),
        mode: String(formData.get("mode")) as SubjectMode,
        defaultDurationMinutes: duration ? Number(duration) : undefined,
        displayOrder: Number(formData.get("displayOrder")),
        active: true,
      },
    });
  };

  if (fieldsQuery.isLoading) {
    return <LoadingState message="교육 분야를 불러오고 있습니다." />;
  }

  if (fieldsQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(fieldsQuery.error)}
        onRetry={() => void fieldsQuery.refetch()}
      />
    );
  }

  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">교육 관리</p>
          <h1>교육 분야·세부 과목</h1>
          <p>최상위 교육 분야와 실제 교육 단위인 세부 과목을 관리합니다.</p>
        </div>

        <button
          type="button"
          className="button button--primary"
          onClick={() => setEditor({ type: "field" })}
        >
          <CirclePlus size={18} />
          교육 분야 추가
        </button>
      </section>

      <section className="management-split">
        <article className="surface-card">
          <header className="card-header">
            <div>
              <h2>교육 분야</h2>
              <p>총 {fields.length}개</p>
            </div>
          </header>

          {fields.length === 0 ? (
            <EmptyState
              title="등록된 교육 분야가 없습니다."
              description="첫 번째 교육 분야를 추가해 주세요."
            />
          ) : (
            <div className="record-list">
              {fields.map((field) => (
                <button
                  type="button"
                  key={field.id}
                  className={`record-item ${
                    field.id === effectiveFieldId ? "record-item--selected" : ""
                  }`}
                  onClick={() => setSelectedFieldId(field.id)}
                >
                  <span className="record-item__icon">
                    <BookOpen size={19} />
                  </span>

                  <span className="record-item__body">
                    <strong>{field.name}</strong>
                    <small>{field.description || "설명 없음"}</small>
                  </span>

                  <span
                    className={`status-badge ${
                      field.active
                        ? "status-badge--success"
                        : "status-badge--neutral"
                    }`}
                  >
                    {field.active ? "사용" : "미사용"}
                  </span>

                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="surface-card">
          <header className="card-header">
            <div>
              <h2>{selectedField?.name ?? "세부 과목"}</h2>
              <p>
                {selectedField
                  ? "선택한 교육 분야의 세부 과목입니다."
                  : "교육 분야를 먼저 추가해 주세요."}
              </p>
            </div>

            {selectedField && (
              <div className="cluster">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    setEditor({
                      type: "field",
                      item: selectedField,
                    })
                  }
                >
                  <Pencil size={16} />
                  분야 수정
                </button>

                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setEditor({ type: "subject" })}
                >
                  <CirclePlus size={17} />
                  과목 추가
                </button>
              </div>
            )}
          </header>

          {selectedField && (
            <div className="card-body">
              <div className="record-actions">
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={toggleFieldMutation.isPending}
                  onClick={() => {
                    const nextActive = !selectedField.active;

                    if (
                      window.confirm(
                        `${selectedField.name}을(를) ${
                          nextActive ? "사용" : "미사용"
                        } 상태로 변경하시겠습니까?`,
                      )
                    ) {
                      toggleFieldMutation.mutate({
                        id: selectedField.id,
                        active: nextActive,
                      });
                    }
                  }}
                >
                  <Power size={16} />
                  {selectedField.active ? "분야 미사용 처리" : "분야 사용"}
                </button>
              </div>
            </div>
          )}

          {subjectsQuery.isLoading && (
            <LoadingState message="세부 과목을 불러오고 있습니다." />
          )}

          {subjectsQuery.isError && (
            <ErrorState
              message={getErrorMessage(subjectsQuery.error)}
              onRetry={() => void subjectsQuery.refetch()}
            />
          )}

          {selectedField &&
            !subjectsQuery.isLoading &&
            !subjectsQuery.isError &&
            (subjectsQuery.data?.length ? (
              <div className="data-list">
                {subjectsQuery.data.map((subject) => (
                  <article className="data-row" key={subject.id}>
                    <div className="data-row__main">
                      <div className="cluster">
                        <strong>{subject.name}</strong>

                        <span className="status-badge status-badge--info">
                          {SUBJECT_MODE_LABELS[subject.mode]}
                        </span>

                        <span
                          className={`status-badge ${
                            subject.active
                              ? "status-badge--success"
                              : "status-badge--neutral"
                          }`}
                        >
                          {subject.active ? "사용" : "미사용"}
                        </span>
                      </div>

                      <p>{subject.objective || "교육 목표가 없습니다."}</p>

                      <small>
                        기본 교육 시간:{" "}
                        {subject.defaultDurationMinutes
                          ? `${subject.defaultDurationMinutes}분`
                          : "미설정"}
                      </small>
                    </div>

                    <div className="data-row__actions">
                      <button
                        type="button"
                        className="icon-button bordered-icon-button"
                        aria-label={`${subject.name} 수정`}
                        onClick={() =>
                          setEditor({
                            type: "subject",
                            item: subject,
                          })
                        }
                      >
                        <Pencil size={17} />
                      </button>

                      <button
                        type="button"
                        className="icon-button bordered-icon-button"
                        aria-label={`${subject.name} 상태 변경`}
                        disabled={toggleSubjectMutation.isPending}
                        onClick={() => {
                          const nextActive = !subject.active;

                          if (
                            window.confirm(
                              `${subject.name}을(를) ${
                                nextActive ? "사용" : "미사용"
                              } 상태로 변경하시겠습니까?`,
                            )
                          ) {
                            toggleSubjectMutation.mutate({
                              subjectId: subject.id,
                              active: nextActive,
                            });
                          }
                        }}
                      >
                        <Power size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="등록된 세부 과목이 없습니다."
                description="선택한 교육 분야에 과목을 추가해 주세요."
              />
            ))}
        </article>
      </section>

      {editor?.type === "field" && (
        <Modal
          title={editor.item ? "교육 분야 수정" : "교육 분야 추가"}
          description="분야명과 화면 표시 순서를 입력합니다."
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => handleFieldSubmit(event, editor.item)}
          >
            <label className="form-field form-field--flush">
              <span>교육 분야명</span>
              <input
                name="name"
                defaultValue={editor.item?.name}
                maxLength={100}
                required
              />
            </label>

            <label className="form-field">
              <span>설명</span>
              <textarea
                name="description"
                defaultValue={editor.item?.description ?? ""}
                rows={4}
              />
            </label>

            <label className="form-field">
              <span>표시 순서</span>
              <input
                name="displayOrder"
                type="number"
                min={0}
                defaultValue={editor.item?.displayOrder ?? fields.length + 1}
                required
              />
            </label>

            {saveFieldMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(saveFieldMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditor(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={saveFieldMutation.isPending}
              >
                {saveFieldMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editor?.type === "subject" && selectedField && (
        <Modal
          title={editor.item ? "세부 과목 수정" : "세부 과목 추가"}
          description={`${selectedField.name} 분야의 세부 과목을 설정합니다.`}
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => handleSubjectSubmit(event, editor.item)}
          >
            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>과목명</span>
                <input
                  name="name"
                  defaultValue={editor.item?.name}
                  maxLength={150}
                  required
                />
              </label>

              <label className="form-field form-field--flush">
                <span>교육 방식</span>
                <select
                  name="mode"
                  defaultValue={editor.item?.mode ?? "MIXED"}
                  required
                >
                  <option value="THEORY">이론</option>
                  <option value="PRACTICE">실기</option>
                  <option value="MIXED">이론·실기</option>
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>설명</span>
              <textarea
                name="description"
                defaultValue={editor.item?.description ?? ""}
                rows={3}
              />
            </label>

            <label className="form-field">
              <span>교육 목표</span>
              <textarea
                name="objective"
                defaultValue={editor.item?.objective ?? ""}
                rows={3}
              />
            </label>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>기본 교육 시간(분)</span>
                <input
                  name="defaultDurationMinutes"
                  type="number"
                  min={1}
                  defaultValue={
                    editor.item?.defaultDurationMinutes ?? undefined
                  }
                />
              </label>

              <label className="form-field form-field--flush">
                <span>표시 순서</span>
                <input
                  name="displayOrder"
                  type="number"
                  min={0}
                  defaultValue={
                    editor.item?.displayOrder ??
                    (subjectsQuery.data?.length ?? 0) + 1
                  }
                  required
                />
              </label>
            </div>

            {saveSubjectMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(saveSubjectMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditor(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={saveSubjectMutation.isPending}
              >
                {saveSubjectMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
