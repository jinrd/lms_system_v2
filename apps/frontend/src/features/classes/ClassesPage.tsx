import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Pencil,
  Trash2,
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
import { getCourseOfferings } from "../courses/courses.api";
import {
  changeClassStatus,
  createClass,
  getClasses,
  removeClass,
  updateClass,
  type ClassInput,
  type ClassItem,
  type ClassStatus,
} from "./classes.api";
import { ClassInstructorsPanel } from "./ClassInstructorsPanel";
import { ClassSchedulePanel } from "./ClassSchedulePanel";
import { ClassSubjectsPanel } from "./ClassSubjectsPanel";

const STATUS_LABELS: Record<ClassStatus, string> = {
  PLANNED: "예정",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const STATUS_CLASS_NAMES: Record<ClassStatus, string> = {
  PLANNED: "status-badge--neutral",
  IN_PROGRESS: "status-badge--success",
  COMPLETED: "status-badge--primary",
  CANCELED: "status-badge--danger",
};

const STATUS_TRANSITIONS: Record<ClassStatus, readonly ClassStatus[]> = {
  PLANNED: ["IN_PROGRESS", "CANCELED"],
  IN_PROGRESS: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

type ClassEditor =
  | {
      type: "class";
      item?: ClassItem;
      courseOfferingId?: string;
    }
  | {
      type: "status";
      item: ClassItem;
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

export function ClassesPage() {
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [status, setStatus] = useState<ClassStatus | "">("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<ClassEditor>(null);

  const coursesQuery = useQuery({
    queryKey: ["course-offerings", "class-management"],
    queryFn: () =>
      getCourseOfferings({
        page: 1,
        limit: 100,
      }),
  });

  const courses = coursesQuery.data?.items ?? [];
  const availableCreationCourses = courses.filter(
    (course) =>
      course.status !== "COMPLETED" &&
      course.status !== "CANCELED" &&
      course.subjectCount > 0,
  );
  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ??
    courses[0] ??
    null;
  const effectiveCourseId = selectedCourse?.id ?? null;
  const editorCourseId =
    editor?.type === "class"
      ? (editor.item?.courseOfferingId ?? editor.courseOfferingId ?? null)
      : null;
  const editorCourse =
    courses.find((course) => course.id === editorCourseId) ?? null;

  const classesQuery = useQuery({
    queryKey: ["course-offerings", effectiveCourseId, "classes", status, page],
    queryFn: () => getClasses(effectiveCourseId!, status || undefined, page),
    enabled: effectiveCourseId !== null,
  });

  const classes = classesQuery.data?.items ?? [];
  const selectedClass =
    classes.find((item) => item.id === selectedClassId) ?? classes[0] ?? null;

  const refreshClasses = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["course-offerings", effectiveCourseId, "classes"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["course-offerings"],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      item,
      courseOfferingId,
      input,
    }: {
      item?: ClassItem;
      courseOfferingId: string;
      input: ClassInput;
    }) => {
      if (item) {
        return updateClass(courseOfferingId, item.id, input);
      }

      return createClass(courseOfferingId, input);
    },
    onSuccess: async (saved) => {
      setSelectedCourseId(saved.courseOfferingId);
      setSelectedClassId(saved.id);
      setEditor(null);
      await refreshClasses();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      item,
      nextStatus,
    }: {
      item: ClassItem;
      nextStatus: ClassStatus;
    }) => {
      if (!effectiveCourseId) {
        throw new Error("개설 강의를 먼저 선택해 주세요.");
      }

      return changeClassStatus(effectiveCourseId, item.id, nextStatus);
    },
    onSuccess: async () => {
      setEditor(null);
      await refreshClasses();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (item: ClassItem) =>
      removeClass(item.courseOfferingId, item.id),
    onSuccess: async () => {
      setSelectedClassId(null);
      await refreshClasses();
    },
  });

  const handleClassSubmit = (
    event: FormEvent<HTMLFormElement>,
    item?: ClassItem,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    saveMutation.mutate({
      item,
      courseOfferingId: String(
        formData.get("courseOfferingId") ?? item?.courseOfferingId ?? "",
      ),
      input: {
        name: String(formData.get("name") ?? "").trim(),
        description: optionalString(formData, "description"),
        room: optionalString(formData, "room"),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        capacity: Number(formData.get("capacity")),
      },
    });
  };

  const handleStatusSubmit = (
    event: FormEvent<HTMLFormElement>,
    item: ClassItem,
  ): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    statusMutation.mutate({
      item,
      nextStatus: String(formData.get("status")) as ClassStatus,
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
          <h1>반 관리</h1>
          <p>개설 강의별 반과 운영 상태를 관리합니다.</p>
        </div>

        <button
          type="button"
          className="button button--primary"
          disabled={availableCreationCourses.length === 0}
          onClick={() => {
            const initialCourse =
              availableCreationCourses.find(
                (course) => course.id === effectiveCourseId,
              ) ?? availableCreationCourses[0];

            setEditor({
              type: "class",
              courseOfferingId: initialCourse.id,
            });
          }}
        >
          <CirclePlus size={18} />반 추가
        </button>
      </section>

      <section className="filter-bar">
        <label className="filter-control">
          <span className="sr-only">개설 강의 선택</span>
          <select
            value={effectiveCourseId ?? ""}
            onChange={(event) => {
              setSelectedCourseId(event.target.value);
              setSelectedClassId(null);
              setPage(1);
            }}
          >
            {courses.length === 0 && (
              <option value="">등록된 개설 강의 없음</option>
            )}

            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span className="sr-only">반 상태</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ClassStatus | "");
              setSelectedClassId(null);
              setPage(1);
            }}
          >
            <option value="">전체 상태</option>

            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!selectedCourse ? (
        <EmptyState
          title="등록된 개설 강의가 없습니다."
          description="개설 강의를 먼저 생성해 주세요."
        />
      ) : (
        <section className="management-split">
          <article className="surface-card">
            <header className="card-header">
              <div>
                <h2>반 목록</h2>
                <p>총 {classesQuery.data?.pagination.total ?? 0}개</p>
              </div>
            </header>

            {classesQuery.isLoading && (
              <LoadingState message="반 목록을 불러오고 있습니다." />
            )}

            {classesQuery.isError && (
              <ErrorState
                message={getErrorMessage(classesQuery.error)}
                onRetry={() => void classesQuery.refetch()}
              />
            )}

            {!classesQuery.isLoading &&
              !classesQuery.isError &&
              (classes.length ? (
                <div className="record-list">
                  {classes.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`record-item ${
                        selectedClass?.id === item.id
                          ? "record-item--selected"
                          : ""
                      }`}
                      onClick={() => setSelectedClassId(item.id)}
                    >
                      <span className="record-item__icon">
                        <Users size={19} />
                      </span>

                      <span className="record-item__body">
                        <strong>{item.name}</strong>
                        <small>
                          {item.currentInstructor?.name ?? "담당 강사 미배정"}
                        </small>
                      </span>

                      <span
                        className={`status-badge ${
                          STATUS_CLASS_NAMES[item.status]
                        }`}
                      >
                        {STATUS_LABELS[item.status]}
                      </span>

                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="등록된 반이 없습니다."
                  description="선택한 개설 강의에 반을 추가해 주세요."
                />
              ))}

            {(classesQuery.data?.pagination.totalPages ?? 0) > 1 && (
              <footer className="pagination">
                <button
                  type="button"
                  className="icon-button bordered-icon-button"
                  aria-label="이전 페이지"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((current) => Math.max(1, current - 1));
                    setSelectedClassId(null);
                  }}
                >
                  <ChevronLeft size={18} />
                </button>

                <span>
                  {page} / {classesQuery.data?.pagination.totalPages}
                </span>

                <button
                  type="button"
                  className="icon-button bordered-icon-button"
                  aria-label="다음 페이지"
                  disabled={
                    page >= (classesQuery.data?.pagination.totalPages ?? 1)
                  }
                  onClick={() => {
                    setPage((current) => current + 1);
                    setSelectedClassId(null);
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </footer>
            )}
          </article>

          <article className="surface-card">
            {selectedClass ? (
              <>
                <header className="card-header">
                  <div>
                    <h2>{selectedClass.name}</h2>
                    <p>{selectedCourse.name}</p>
                  </div>

                  <div className="cluster">
                    {selectedClass.status === "PLANNED" && (
                      <>
                        <button
                          type="button"
                          className="button button--danger"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `${selectedClass.name} 반을 삭제하시겠습니까?\n삭제한 반은 복구할 수 없습니다.`,
                              )
                            ) {
                              removeMutation.mutate(selectedClass);
                            }
                          }}
                        >
                          <Trash2 size={16} />
                          삭제
                        </button>

                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() =>
                            setEditor({
                              type: "class",
                              item: selectedClass,
                            })
                          }
                        >
                          <Pencil size={16} />
                          수정
                        </button>
                      </>
                    )}

                    {STATUS_TRANSITIONS[selectedClass.status].length > 0 && (
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() =>
                          setEditor({
                            type: "status",
                            item: selectedClass,
                          })
                        }
                      >
                        상태 변경
                      </button>
                    )}
                  </div>
                </header>

                <div className="card-body stack">
                  {removeMutation.isError &&
                    removeMutation.variables?.id === selectedClass.id && (
                    <div className="form-alert" role="alert">
                      {getErrorMessage(removeMutation.error)}
                    </div>
                    )}

                  <div className="detail-grid">
                    <div className="detail-item">
                      <span>상태</span>
                      <strong>
                        <i
                          className={`status-badge ${
                            STATUS_CLASS_NAMES[selectedClass.status]
                          }`}
                        >
                          {STATUS_LABELS[selectedClass.status]}
                        </i>
                      </strong>
                    </div>

                    <div className="detail-item">
                      <span>정원 및 현재 수강생</span>
                      <strong>
                        {selectedClass.enrollmentCount} /{" "}
                        {selectedClass.capacity}명
                      </strong>
                    </div>

                    <div className="detail-item">
                      <span>운영 기간</span>
                      <strong>
                        {formatDate(selectedClass.startDate)} ~{" "}
                        {formatDate(selectedClass.endDate)}
                      </strong>
                    </div>

                    <div className="detail-item">
                      <span>강의실</span>
                      <strong>{selectedClass.room || "강의실 미설정"}</strong>
                    </div>
                  </div>

                  <section className="detail-section">
                    <h3>반 설명</h3>
                    <p>
                      {selectedClass.description ||
                        "등록된 반 설명이 없습니다."}
                    </p>
                  </section>

                  <ClassInstructorsPanel
                    courseOfferingId={selectedCourse.id}
                    classItem={selectedClass}
                    onChanged={refreshClasses}
                  />

                  <ClassSubjectsPanel
                    courseOfferingId={selectedCourse.id}
                    classItem={selectedClass}
                    onChanged={refreshClasses}
                  />
                  <ClassSchedulePanel
                    key={selectedClass.id}
                    courseOfferingId={selectedCourse.id}
                    classItem={selectedClass}
                  />
                </div>
              </>
            ) : (
              <EmptyState
                title="반을 선택해 주세요."
                description="왼쪽 목록에서 상세 정보를 확인할 반을 선택합니다."
              />
            )}
          </article>
        </section>
      )}

      {editor?.type === "class" && editorCourse && (
        <Modal
          title={editor.item ? "반 수정" : "반 추가"}
          description="반이 소속될 개설 강의와 운영 정보를 설정합니다."
          onClose={() => setEditor(null)}
        >
          <form
            key={editorCourse.id}
            className="stack"
            onSubmit={(event) => handleClassSubmit(event, editor.item)}
          >
            {!editor.item && (
              <label className="form-field form-field--flush">
                <span>개설 강의</span>
                <select
                  name="courseOfferingId"
                  value={editorCourse.id}
                  onChange={(event) =>
                    setEditor({
                      type: "class",
                      courseOfferingId: event.target.value,
                    })
                  }
                  required
                >
                  {availableCreationCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} · 과목 {course.subjectCount}개
                    </option>
                  ))}
                </select>
              </label>
            )}

            {editor.item && (
              <input
                type="hidden"
                name="courseOfferingId"
                value={editor.item.courseOfferingId}
              />
            )}

            <label className="form-field form-field--flush">
              <span>반명</span>
              <input
                name="name"
                maxLength={200}
                defaultValue={editor.item?.name}
                required
              />
            </label>

            <label className="form-field">
              <span>설명</span>
              <textarea
                name="description"
                rows={4}
                defaultValue={editor.item?.description ?? ""}
              />
            </label>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>시작일</span>
                <input
                  name="startDate"
                  type="date"
                  min={editorCourse.startDate}
                  max={editorCourse.endDate}
                  defaultValue={
                    editor.item?.startDate ?? editorCourse.startDate
                  }
                  required
                />
              </label>

              <label className="form-field form-field--flush">
                <span>종료일</span>
                <input
                  name="endDate"
                  type="date"
                  min={editorCourse.startDate}
                  max={editorCourse.endDate}
                  defaultValue={editor.item?.endDate ?? editorCourse.endDate}
                  required
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="form-field form-field--flush">
                <span>강의실</span>
                <input
                  name="room"
                  maxLength={100}
                  defaultValue={editor.item?.room ?? ""}
                />
              </label>

              <label className="form-field form-field--flush">
                <span>정원</span>
                <input
                  name="capacity"
                  type="number"
                  min={1}
                  defaultValue={editor.item?.capacity ?? 20}
                  required
                />
              </label>
            </div>

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
          title="반 상태 변경"
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
