import { CirclePlus, Clock3, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { getEducationFields, getSubjects } from "../education/education.api";
import {
  addCourseOfferingSubject,
  getCourseOfferingSubjects,
  removeCourseOfferingSubject,
  updateCourseOfferingSubject,
  type CourseOffering,
  type CourseOfferingSubject,
  type CourseOfferingSubjectInput,
} from "./courses.api";

type SubjectEditor = {
  item?: CourseOfferingSubject;
} | null;

function optionalString(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

function optionalNumber(formData: FormData, name: string): number | undefined {
  const value = String(formData.get(name) ?? "");
  return value ? Number(value) : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

type CourseSubjectsPanelProps = {
  course: CourseOffering;
};

export function CourseSubjectsPanel({ course }: CourseSubjectsPanelProps) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<SubjectEditor>(null);
  const [selectedEducationFieldId, setSelectedEducationFieldId] = useState<
    string | null
  >(null);

  const editable =
    course.status !== "COMPLETED" && course.status !== "CANCELED";

  const linkedSubjectsQuery = useQuery({
    queryKey: ["course-offerings", course.id, "subjects"],
    queryFn: () => getCourseOfferingSubjects(course.id),
  });

  const educationFieldsQuery = useQuery({
    queryKey: ["education-fields"],
    queryFn: getEducationFields,
    enabled: editor !== null && editor.item === undefined,
  });

  const activeEducationFields = (educationFieldsQuery.data ?? []).filter(
    (field) => field.active,
  );

  const effectiveEducationFieldId =
    selectedEducationFieldId ?? activeEducationFields[0]?.id ?? null;

  const availableSubjectsQuery = useQuery({
    queryKey: ["education-fields", effectiveEducationFieldId, "subjects"],
    queryFn: () => getSubjects(effectiveEducationFieldId!),
    enabled:
      editor !== null &&
      editor.item === undefined &&
      effectiveEducationFieldId !== null,
  });

  const linkedSubjectIds = new Set(
    (linkedSubjectsQuery.data ?? []).map((item) => item.subjectId),
  );

  const availableSubjects = (availableSubjectsQuery.data ?? []).filter(
    (subject) => subject.active && !linkedSubjectIds.has(subject.id),
  );

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["course-offerings", course.id, "subjects"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["course-offerings"],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      item,
      input,
    }: {
      item?: CourseOfferingSubject;
      input: CourseOfferingSubjectInput;
    }) => {
      if (item) {
        return updateCourseOfferingSubject(course.id, item.id, {
          sequence: input.sequence,
          plannedStartDate: input.plannedStartDate,
          plannedEndDate: input.plannedEndDate,
          plannedMinutes: input.plannedMinutes,
          curriculum: input.curriculum,
        });
      }

      return addCourseOfferingSubject(course.id, input);
    },
    onSuccess: async () => {
      setEditor(null);
      setSelectedEducationFieldId(null);
      await refresh();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (item: CourseOfferingSubject) =>
      removeCourseOfferingSubject(course.id, item.id),
    onSuccess: refresh,
  });

  const handleOpenCreate = (): void => {
    setSelectedEducationFieldId(null);
    setEditor({});
  };

  const handleClose = (): void => {
    setSelectedEducationFieldId(null);
    setEditor(null);
  };

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
    item?: CourseOfferingSubject,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    saveMutation.mutate({
      item,
      input: {
        subjectId: item
          ? item.subjectId
          : String(formData.get("subjectId") ?? ""),
        sequence: Number(formData.get("sequence")),
        plannedStartDate: optionalString(formData, "plannedStartDate"),
        plannedEndDate: optionalString(formData, "plannedEndDate"),
        plannedMinutes: optionalNumber(formData, "plannedMinutes"),
        curriculum: optionalString(formData, "curriculum"),
      },
    });
  };

  return (
    <section className="nested-section">
      <header className="nested-section__header">
        <div>
          <h3>연결 과목</h3>
          <p>개설 강의에서 운영할 과목과 교육 순서를 관리합니다.</p>
        </div>

        {editable && (
          <button
            type="button"
            className="button button--secondary"
            onClick={handleOpenCreate}
          >
            <CirclePlus size={17} />
            과목 연결
          </button>
        )}
      </header>

      {linkedSubjectsQuery.isLoading && (
        <LoadingState message="연결 과목을 불러오고 있습니다." />
      )}

      {linkedSubjectsQuery.isError && (
        <ErrorState
          message={getErrorMessage(linkedSubjectsQuery.error)}
          onRetry={() => void linkedSubjectsQuery.refetch()}
        />
      )}

      {!linkedSubjectsQuery.isLoading &&
        !linkedSubjectsQuery.isError &&
        (linkedSubjectsQuery.data?.length ? (
          <div className="compact-list">
            {linkedSubjectsQuery.data.map((item) => (
              <article className="compact-row" key={item.id}>
                <div className="sequence-badge">{item.sequence}</div>

                <div className="compact-row__body">
                  <div className="cluster">
                    <strong>{item.subjectName}</strong>
                    <span className="status-badge status-badge--neutral">
                      {item.educationFieldName}
                    </span>
                  </div>

                  <p>
                    {item.plannedStartDate && item.plannedEndDate
                      ? `${item.plannedStartDate} ~ ${item.plannedEndDate}`
                      : "계획 기간 미설정"}
                  </p>

                  <small>
                    <Clock3 size={13} />
                    {item.plannedMinutes
                      ? `${item.plannedMinutes}분`
                      : "계획 시간 미설정"}
                  </small>
                </div>

                {editable && (
                  <div className="data-row__actions">
                    <button
                      type="button"
                      className="icon-button bordered-icon-button"
                      aria-label={`${item.subjectName} 연결 정보 수정`}
                      onClick={() => setEditor({ item })}
                    >
                      <Pencil size={17} />
                    </button>

                    <button
                      type="button"
                      className="icon-button bordered-icon-button danger-icon-button"
                      aria-label={`${item.subjectName} 연결 해제`}
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `${item.subjectName} 과목 연결을 해제하시겠습니까?`,
                          )
                        ) {
                          removeMutation.mutate(item);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="연결된 과목이 없습니다."
            description="강의를 모집 상태로 변경하기 전에 과목을 연결해 주세요."
          />
        ))}

      {removeMutation.isError && (
        <div className="form-alert nested-section__error" role="alert">
          {getErrorMessage(removeMutation.error)}
        </div>
      )}

      {editor && (
        <Modal
          title={editor.item ? "연결 과목 수정" : "과목 연결"}
          description={
            editor.item
              ? `${editor.item.subjectName} 과목의 운영 계획을 수정합니다.`
              : `${course.name}에 운영할 과목을 연결합니다.`
          }
          onClose={handleClose}
        >
          <form
            className="stack"
            onSubmit={(event) => handleSubmit(event, editor.item)}
          >
            {editor.item ? (
              <div className="info-banner">
                <div>
                  <strong>{editor.item.subjectName}</strong>
                  <p>{editor.item.educationFieldName}</p>
                </div>
              </div>
            ) : (
              <>
                <label className="form-field form-field--flush">
                  <span>교육 분야</span>
                  <select
                    value={effectiveEducationFieldId ?? ""}
                    onChange={(event) =>
                      setSelectedEducationFieldId(event.target.value)
                    }
                    required
                  >
                    {activeEducationFields.length === 0 && (
                      <option value="">사용 가능한 교육 분야 없음</option>
                    )}

                    {activeEducationFields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>세부 과목</span>
                  <select name="subjectId" required>
                    {availableSubjects.length === 0 && (
                      <option value="">연결 가능한 과목 없음</option>
                    )}

                    {availableSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>교육 순서</span>
                <input
                  name="sequence"
                  type="number"
                  min={1}
                  defaultValue={
                    editor.item?.sequence ??
                    (linkedSubjectsQuery.data?.length ?? 0) + 1
                  }
                  required
                />
              </label>

              <label className="form-field form-field--flush">
                <span>계획 시간(분)</span>
                <input
                  name="plannedMinutes"
                  type="number"
                  min={1}
                  defaultValue={editor.item?.plannedMinutes ?? undefined}
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>계획 시작일</span>
                <input
                  name="plannedStartDate"
                  type="date"
                  min={course.startDate}
                  max={course.endDate}
                  defaultValue={
                    editor.item?.plannedStartDate ?? course.startDate
                  }
                />
              </label>

              <label className="form-field form-field--flush">
                <span>계획 종료일</span>
                <input
                  name="plannedEndDate"
                  type="date"
                  min={course.startDate}
                  max={course.endDate}
                  defaultValue={editor.item?.plannedEndDate ?? course.endDate}
                />
              </label>
            </div>

            <label className="form-field">
              <span>과목별 커리큘럼</span>
              <textarea
                name="curriculum"
                rows={5}
                defaultValue={editor.item?.curriculum ?? ""}
              />
            </label>

            {saveMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(saveMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={handleClose}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={
                  saveMutation.isPending ||
                  (!editor.item && availableSubjects.length === 0)
                }
              >
                {saveMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
