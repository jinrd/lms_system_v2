import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Pencil,
  Users,
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
  changeCourseOfferingStatus,
  createCourseOffering,
  getCourseOfferings,
  updateCourseOffering,
  type CourseOffering,
  type CourseOfferingInput,
  type CourseStatus,
} from "./courses.api";
import { CourseSubjectsPanel } from "./CourseSubjectsPanel";

const STATUS_LABELS: Record<CourseStatus, string> = {
  PLANNED: "예정",
  RECRUITING: "모집 중",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const STATUS_CLASS_NAMES: Record<CourseStatus, string> = {
  PLANNED: "status-badge--neutral",
  RECRUITING: "status-badge--info",
  IN_PROGRESS: "status-badge--success",
  COMPLETED: "status-badge--primary",
  CANCELED: "status-badge--danger",
};

const STATUS_TRANSITIONS: Record<CourseStatus, readonly CourseStatus[]> = {
  PLANNED: ["RECRUITING", "CANCELED"],
  RECRUITING: ["IN_PROGRESS", "CANCELED"],
  IN_PROGRESS: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

type CourseEditor =
  | {
      type: "course";
      item?: CourseOffering;
    }
  | {
      type: "status";
      item: CourseOffering;
    }
  | null;

function optionalString(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("ko-KR").format(
    new Date(`${date}T00:00:00+09:00`),
  );
}

export function CoursesPage() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<CourseStatus | "">("");
  const [page, setPage] = useState(1);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [editor, setEditor] = useState<CourseEditor>(null);

  const coursesQuery = useQuery({
    queryKey: ["course-offerings", keyword, status, page],
    queryFn: () =>
      getCourseOfferings({
        keyword: keyword || undefined,
        status: status || undefined,
        page,
        limit: 20,
      }),
  });

  const courses = coursesQuery.data?.items ?? [];
  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ??
    courses[0] ??
    null;

  const refreshCourses = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: ["course-offerings"],
    });
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: CourseOfferingInput;
    }) => {
      if (id) {
        return updateCourseOffering(id, input);
      }

      return createCourseOffering(input);
    },
    onSuccess: async (saved) => {
      setSelectedCourseId(saved.id);
      setEditor(null);
      await refreshCourses();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status: nextStatus,
      reason,
    }: {
      id: string;
      status: CourseStatus;
      reason: string;
    }) => changeCourseOfferingStatus(id, nextStatus, reason),
    onSuccess: async () => {
      setEditor(null);
      await refreshCourses();
    },
  });

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setKeyword(String(formData.get("keyword") ?? "").trim());
    setStatus(String(formData.get("status") ?? "") as CourseStatus | "");
    setPage(1);
    setSelectedCourseId(null);
  };

  const handleCourseSubmit = (
    event: FormEvent<HTMLFormElement>,
    item?: CourseOffering,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    saveMutation.mutate({
      id: item?.id,
      input: {
        name: String(formData.get("name") ?? "").trim(),
        description: optionalString(formData, "description"),
        curriculum: optionalString(formData, "curriculum"),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        capacity: Number(formData.get("capacity")),
      },
    });
  };

  const handleStatusSubmit = (
    event: FormEvent<HTMLFormElement>,
    item: CourseOffering,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    statusMutation.mutate({
      id: item.id,
      status: String(formData.get("status")) as CourseStatus,
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  if (coursesQuery.isLoading) {
    return <LoadingState message="개설 강의를 불러오고 있습니다." />;
  }

  if (coursesQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(coursesQuery.error)}
        onRetry={() => void coursesQuery.refetch()}
      />
    );
  }

  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">교육 관리</p>
          <h1>개설 강의</h1>
          <p>실제 기간과 정원을 정해 운영하는 강의를 관리합니다.</p>
        </div>

        <button
          type="button"
          className="button button--primary"
          onClick={() => setEditor({ type: "course" })}
        >
          <CirclePlus size={18} />
          개설 강의 추가
        </button>
      </section>

      <form className="filter-bar" onSubmit={handleFilterSubmit}>
        <label className="filter-control">
          <span className="sr-only">강의명 검색</span>
          <input
            name="keyword"
            defaultValue={keyword}
            placeholder="강의명 검색"
          />
        </label>

        <label className="filter-control">
          <span className="sr-only">강의 상태</span>
          <select name="status" defaultValue={status}>
            <option value="">전체 상태</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="button button--secondary">
          검색
        </button>
      </form>

      <section className="management-split">
        <article className="surface-card">
          <header className="card-header">
            <div>
              <h2>강의 목록</h2>
              <p>총 {coursesQuery.data?.pagination.total ?? 0}개</p>
            </div>
          </header>

          {courses.length === 0 ? (
            <EmptyState
              title="조회된 개설 강의가 없습니다."
              description="검색 조건을 변경하거나 새 강의를 추가해 주세요."
            />
          ) : (
            <div className="record-list">
              {courses.map((course) => (
                <button
                  type="button"
                  key={course.id}
                  className={`record-item ${
                    selectedCourse?.id === course.id
                      ? "record-item--selected"
                      : ""
                  }`}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  <span className="record-item__icon">
                    <BookOpen size={19} />
                  </span>

                  <span className="record-item__body">
                    <strong>{course.name}</strong>
                    <small>
                      {formatDate(course.startDate)} ~{" "}
                      {formatDate(course.endDate)}
                    </small>
                  </span>

                  <span
                    className={`status-badge ${
                      STATUS_CLASS_NAMES[course.status]
                    }`}
                  >
                    {STATUS_LABELS[course.status]}
                  </span>

                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          )}

          {(coursesQuery.data?.pagination.totalPages ?? 0) > 1 && (
            <footer className="pagination">
              <button
                type="button"
                className="icon-button bordered-icon-button"
                aria-label="이전 페이지"
                disabled={page <= 1}
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                  setSelectedCourseId(null);
                }}
              >
                <ChevronLeft size={18} />
              </button>

              <span>
                {page} / {coursesQuery.data?.pagination.totalPages}
              </span>

              <button
                type="button"
                className="icon-button bordered-icon-button"
                aria-label="다음 페이지"
                disabled={
                  page >= (coursesQuery.data?.pagination.totalPages ?? 1)
                }
                onClick={() => {
                  setPage((current) => current + 1);
                  setSelectedCourseId(null);
                }}
              >
                <ChevronRight size={18} />
              </button>
            </footer>
          )}
        </article>

        <article className="surface-card">
          {selectedCourse ? (
            <>
              <header className="card-header">
                <div>
                  <h2>{selectedCourse.name}</h2>
                  <p>개설 강의 상세 정보</p>
                </div>

                <div className="cluster">
                  {selectedCourse.status !== "COMPLETED" &&
                    selectedCourse.status !== "CANCELED" && (
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() =>
                          setEditor({
                            type: "course",
                            item: selectedCourse,
                          })
                        }
                      >
                        <Pencil size={16} />
                        수정
                      </button>
                    )}

                  {STATUS_TRANSITIONS[selectedCourse.status].length > 0 && (
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() =>
                        setEditor({
                          type: "status",
                          item: selectedCourse,
                        })
                      }
                    >
                      상태 변경
                    </button>
                  )}
                </div>
              </header>

              <div className="card-body stack">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>상태</span>
                    <strong>
                      <i
                        className={`status-badge ${
                          STATUS_CLASS_NAMES[selectedCourse.status]
                        }`}
                      >
                        {STATUS_LABELS[selectedCourse.status]}
                      </i>
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>정원</span>
                    <strong>{selectedCourse.capacity}명</strong>
                  </div>

                  <div className="detail-item">
                    <span>운영 기간</span>
                    <strong>
                      {formatDate(selectedCourse.startDate)} ~{" "}
                      {formatDate(selectedCourse.endDate)}
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>운영 구성</span>
                    <strong>
                      과목 {selectedCourse.subjectCount}개 · 반{" "}
                      {selectedCourse.classCount}개
                    </strong>
                  </div>
                </div>

                <section className="detail-section">
                  <h3>강의 설명</h3>
                  <p>
                    {selectedCourse.description ||
                      "등록된 강의 설명이 없습니다."}
                  </p>
                </section>

                <section className="detail-section">
                  <h3>전체 커리큘럼</h3>
                  <p>
                    {selectedCourse.curriculum || "등록된 커리큘럼이 없습니다."}
                  </p>
                </section>

                <CourseSubjectsPanel course={selectedCourse} />

                <div className="info-banner">
                  <Users size={19} />
                  <div>
                    <strong>생성된 반</strong>
                    <p>
                      현재 {selectedCourse.classCount}개 반이 연결되어 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title="개설 강의를 선택해 주세요."
              description="왼쪽 목록에서 상세 정보를 확인할 강의를 선택합니다."
            />
          )}
        </article>
      </section>

      {editor?.type === "course" && (
        <Modal
          title={editor.item ? "개설 강의 수정" : "개설 강의 추가"}
          description="강의의 운영 기간과 모집 정원을 설정합니다."
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => handleCourseSubmit(event, editor.item)}
          >
            <label className="form-field form-field--flush">
              <span>강의명</span>
              <input
                name="name"
                defaultValue={editor.item?.name}
                maxLength={200}
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
              <span>전체 커리큘럼</span>
              <textarea
                name="curriculum"
                defaultValue={editor.item?.curriculum ?? ""}
                rows={5}
              />
            </label>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>시작일</span>
                <input
                  name="startDate"
                  type="date"
                  defaultValue={editor.item?.startDate}
                  required
                />
              </label>

              <label className="form-field form-field--flush">
                <span>종료일</span>
                <input
                  name="endDate"
                  type="date"
                  defaultValue={editor.item?.endDate}
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>모집 정원</span>
              <input
                name="capacity"
                type="number"
                min={1}
                defaultValue={editor.item?.capacity ?? 20}
                required
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
                onClick={() => setEditor(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className="button button--primary"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editor?.type === "status" && (
        <Modal
          title="강의 상태 변경"
          description={`${editor.item.name}의 운영 상태를 변경합니다.`}
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => handleStatusSubmit(event, editor.item)}
          >
            <div className="info-banner">
              <CalendarDays size={19} />
              <div>
                <strong>현재 상태</strong>
                <p>{STATUS_LABELS[editor.item.status]}</p>
              </div>
            </div>

            <label className="form-field form-field--flush">
              <span>변경할 상태</span>
              <select name="status" required>
                {STATUS_TRANSITIONS[editor.item.status].map((nextStatus) => (
                  <option key={nextStatus} value={nextStatus}>
                    {STATUS_LABELS[nextStatus]}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>변경 사유</span>
              <textarea name="reason" rows={4} maxLength={500} required />
            </label>

            {statusMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(statusMutation.error)}
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
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? "변경 중..." : "상태 변경"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
