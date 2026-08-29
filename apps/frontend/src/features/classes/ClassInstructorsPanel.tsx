import { ArrowRight, CirclePlus, History, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { getActiveInstructors } from "../users/users.api";
import {
  assignClassInstructor,
  getClassInstructorHistory,
  type ClassItem,
} from "./classes.api";

type ClassInstructorsPanelProps = {
  courseOfferingId: string;
  classItem: ClassItem;
  onChanged: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("ko-KR").format(
    new Date(`${date}T00:00:00+09:00`),
  );
}

export function ClassInstructorsPanel({
  courseOfferingId,
  classItem,
  onChanged,
}: ClassInstructorsPanelProps) {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);

  const historyQuery = useQuery({
    queryKey: [
      "course-offerings",
      courseOfferingId,
      "classes",
      classItem.id,
      "instructors",
    ],
    queryFn: () => getClassInstructorHistory(courseOfferingId, classItem.id),
  });

  const instructorsQuery = useQuery({
    queryKey: ["users", "active-instructors"],
    queryFn: getActiveInstructors,
    enabled: editorOpen,
  });

  const currentAssignment =
    historyQuery.data?.find((assignment) => assignment.current) ?? null;

  const availableInstructors = (instructorsQuery.data?.items ?? []).filter(
    (instructor) => instructor.id !== currentAssignment?.instructor.id,
  );

  const assignMutation = useMutation({
    mutationFn: (input: {
      instructorId: string;
      assignedFrom: string;
      reason: string;
      handoverTitle?: string;
      handoverContent?: string;
    }) => assignClassInstructor(courseOfferingId, classItem.id, input),
    onSuccess: async () => {
      setEditorOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "course-offerings",
            courseOfferingId,
            "classes",
            classItem.id,
            "instructors",
          ],
        }),
        onChanged(),
      ]);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const handoverTitle = String(formData.get("handoverTitle") ?? "").trim();
    const handoverContent = String(
      formData.get("handoverContent") ?? "",
    ).trim();

    assignMutation.mutate({
      instructorId: String(formData.get("instructorId") ?? ""),
      assignedFrom: String(formData.get("assignedFrom") ?? ""),
      reason: String(formData.get("reason") ?? "").trim(),
      handoverTitle: handoverTitle || undefined,
      handoverContent: handoverContent || undefined,
    });
  };

  const editable =
    classItem.status !== "COMPLETED" && classItem.status !== "CANCELED";

  return (
    <section className="nested-section">
      <header className="nested-section__header">
        <div>
          <h3>담당 강사</h3>
          <p>현재 담당 강사와 과거 배정 이력을 확인합니다.</p>
        </div>

        {editable && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setEditorOpen(true)}
          >
            <CirclePlus size={17} />
            {currentAssignment ? "담당 강사 변경" : "강사 배정"}
          </button>
        )}
      </header>

      {historyQuery.isLoading && (
        <LoadingState message="담당 강사 이력을 불러오고 있습니다." />
      )}

      {historyQuery.isError && (
        <ErrorState
          message={getErrorMessage(historyQuery.error)}
          onRetry={() => void historyQuery.refetch()}
        />
      )}

      {!historyQuery.isLoading &&
        !historyQuery.isError &&
        (historyQuery.data?.length ? (
          <div className="timeline">
            {historyQuery.data.map((assignment) => (
              <article
                className={`timeline-item ${
                  assignment.current ? "timeline-item--current" : ""
                }`}
                key={assignment.id}
              >
                <div className="timeline-item__marker">
                  <UserRound size={16} />
                </div>

                <div className="timeline-item__body">
                  <div className="cluster">
                    <strong>{assignment.instructor.name}</strong>

                    {assignment.current && (
                      <span className="status-badge status-badge--success">
                        현재 담당
                      </span>
                    )}
                  </div>

                  <p>
                    {formatDate(assignment.assignedFrom)}
                    <ArrowRight size={13} />
                    {assignment.assignedTo
                      ? formatDate(assignment.assignedTo)
                      : "현재"}
                  </p>

                  <small>
                    배정자: {assignment.assignedBy?.name ?? "시스템"}
                  </small>

                  {assignment.reason && (
                    <div className="timeline-item__reason">
                      {assignment.reason}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="배정된 담당 강사가 없습니다."
            description="수업 운영 전에 담당 강사를 배정해 주세요."
          />
        ))}

      {editorOpen && (
        <Modal
          title={currentAssignment ? "담당 강사 변경" : "담당 강사 배정"}
          description={`${classItem.name}의 담당 강사를 설정합니다.`}
          onClose={() => setEditorOpen(false)}
        >
          <form className="stack" onSubmit={handleSubmit}>
            {currentAssignment && (
              <div className="info-banner">
                <History size={19} />

                <div>
                  <strong>현재 담당 강사</strong>
                  <p>
                    {currentAssignment.instructor.name} ·{" "}
                    {formatDate(currentAssignment.assignedFrom)}부터
                  </p>
                </div>
              </div>
            )}

            <label className="form-field form-field--flush">
              <span>{currentAssignment ? "새 담당 강사" : "담당 강사"}</span>

              <select name="instructorId" required>
                {availableInstructors.length === 0 && (
                  <option value="">배정 가능한 강사 없음</option>
                )}

                {availableInstructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.name}
                    {instructor.loginId ? ` (${instructor.loginId})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>담당 시작일</span>
              <input
                name="assignedFrom"
                type="date"
                min={classItem.startDate}
                max={classItem.endDate}
                defaultValue={classItem.startDate}
                required
              />
            </label>

            <label className="form-field">
              <span>배정·변경 사유</span>
              <textarea name="reason" rows={3} maxLength={500} required />
            </label>

            {currentAssignment && (
              <>
                <label className="form-field">
                  <span>인수인계 제목</span>
                  <input name="handoverTitle" maxLength={200} required />
                </label>

                <label className="form-field">
                  <span>인수인계 내용</span>
                  <textarea
                    name="handoverContent"
                    rows={6}
                    maxLength={10_000}
                    required
                  />
                </label>
              </>
            )}

            {assignMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(assignMutation.error)}
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
                  assignMutation.isPending ||
                  instructorsQuery.isLoading ||
                  availableInstructors.length === 0
                }
              >
                {assignMutation.isPending
                  ? "처리 중..."
                  : currentAssignment
                    ? "담당 강사 변경"
                    : "강사 배정"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
