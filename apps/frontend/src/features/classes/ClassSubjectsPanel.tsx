import { BookOpen, CirclePlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { getCourseOfferingSubjects } from "../courses/courses.api";
import {
  addClassSubject,
  getClassSubjects,
  type ClassItem,
} from "./classes.api";

type ClassSubjectsPanelProps = {
  courseOfferingId: string;
  classItem: ClassItem;
  onChanged: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function ClassSubjectsPanel({
  courseOfferingId,
  classItem,
  onChanged,
}: ClassSubjectsPanelProps) {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);

  const classSubjectsQuery = useQuery({
    queryKey: [
      "course-offerings",
      courseOfferingId,
      "classes",
      classItem.id,
      "subjects",
    ],
    queryFn: () => getClassSubjects(courseOfferingId, classItem.id),
  });

  const courseSubjectsQuery = useQuery({
    queryKey: ["course-offerings", courseOfferingId, "subjects"],
    queryFn: () => getCourseOfferingSubjects(courseOfferingId),
    enabled: editorOpen,
  });

  const linkedIds = new Set(
    (classSubjectsQuery.data ?? []).map(
      (subject) => subject.courseOfferingSubjectId,
    ),
  );

  const availableSubjects = (courseSubjectsQuery.data ?? []).filter(
    (subject) => !linkedIds.has(subject.id),
  );

  const addMutation = useMutation({
    mutationFn: (courseOfferingSubjectId: string) =>
      addClassSubject(courseOfferingId, classItem.id, courseOfferingSubjectId),
    onSuccess: async () => {
      setEditorOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "course-offerings",
            courseOfferingId,
            "classes",
            classItem.id,
            "subjects",
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "course-offerings",
            courseOfferingId,
            "classes",
            classItem.id,
            "schedule-patterns",
          ],
        }),
        onChanged(),
      ]);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    addMutation.mutate(String(formData.get("courseOfferingSubjectId") ?? ""));
  };

  const editable =
    classItem.status !== "COMPLETED" && classItem.status !== "CANCELED";

  return (
    <section className="nested-section">
      <header className="nested-section__header">
        <div>
          <h3>운영 과목</h3>
          <p>개설 강의 과목 중 이 반에서 운영할 과목입니다.</p>
        </div>

        {editable && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setEditorOpen(true)}
          >
            <CirclePlus size={17} />
            운영 과목 추가
          </button>
        )}
      </header>

      {classSubjectsQuery.isLoading && (
        <LoadingState message="운영 과목을 불러오고 있습니다." />
      )}

      {classSubjectsQuery.isError && (
        <ErrorState
          message={getErrorMessage(classSubjectsQuery.error)}
          onRetry={() => void classSubjectsQuery.refetch()}
        />
      )}

      {!classSubjectsQuery.isLoading &&
        !classSubjectsQuery.isError &&
        (classSubjectsQuery.data?.length ? (
          <div className="compact-list">
            {classSubjectsQuery.data.map((subject) => (
              <article
                className="compact-row compact-row--simple"
                key={subject.id}
              >
                <div className="sequence-badge">{subject.sequence}</div>

                <div className="compact-row__body">
                  <div className="cluster">
                    <strong>{subject.subjectName}</strong>

                    <span className="status-badge status-badge--neutral">
                      {subject.educationFieldName}
                    </span>
                  </div>

                  <p>반 운영 과목</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="반에 연결된 운영 과목이 없습니다."
            description="개설 강의 과목 중 운영할 과목을 추가해 주세요."
          />
        ))}

      {editorOpen && (
        <Modal
          title="반 운영 과목 추가"
          description={`${classItem.name}에서 운영할 과목을 선택합니다.`}
          onClose={() => setEditorOpen(false)}
        >
          <form className="stack" onSubmit={handleSubmit}>
            <div className="info-banner">
              <BookOpen size={19} />

              <div>
                <strong>개설 강의 과목만 추가 가능</strong>
                <p>먼저 개설 강의에 과목을 연결해야 합니다.</p>
              </div>
            </div>

            <label className="form-field form-field--flush">
              <span>추가할 과목</span>

              <select name="courseOfferingSubjectId" required>
                {availableSubjects.length === 0 && (
                  <option value="">추가 가능한 과목 없음</option>
                )}

                {availableSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.sequence}. {subject.subjectName}
                  </option>
                ))}
              </select>
            </label>

            {addMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(addMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditorOpen(false)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={
                  addMutation.isPending ||
                  courseSubjectsQuery.isLoading ||
                  availableSubjects.length === 0
                }
              >
                {addMutation.isPending ? "추가 중..." : "운영 과목 추가"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
