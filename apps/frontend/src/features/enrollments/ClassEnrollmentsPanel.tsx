import {
  ChevronLeft,
  ChevronRight,
  Search,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import type { ClassItem } from "../classes/classes.api";
import { getUsers } from "../users/users.api";
import {
  createRegularEnrollment,
  getClassEnrollments,
  type EnrollmentStatus,
} from "./enrollments.api";
import { EnrollmentActions } from "./EnrollmentActions";

type ClassEnrollmentsPanelProps = {
  courseOfferingId: string;
  classItem: ClassItem;
  onChanged: () => Promise<void>;
};

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  SCHEDULED: "예정",
  ACTIVE: "수강 중",
  COMPLETED: "종료",
  CANCELED: "중도 취소",
};

const STATUS_CLASSES: Record<EnrollmentStatus, string> = {
  SCHEDULED: "status-badge--neutral",
  ACTIVE: "status-badge--success",
  COMPLETED: "status-badge--primary",
  CANCELED: "status-badge--danger",
};

const TYPE_LABELS = {
  REGULAR: "기본 수강",
  SUPPLEMENT: "보충",
  MAKEUP: "보강",
  RETAKE: "재수강",
  AUDIT: "참관",
} as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR").format(
    new Date(`${value}T00:00:00+09:00`),
  );
}

function getInitialStartDate(classItem: ClassItem): string {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });

  if (today < classItem.startDate) {
    return classItem.startDate;
  }

  if (today > classItem.endDate) {
    return classItem.startDate;
  }

  return today;
}

export function ClassEnrollmentsPanel({
  courseOfferingId,
  classItem,
  onChanged,
}: ClassEnrollmentsPanelProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<EnrollmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [studentKeywordDraft, setStudentKeywordDraft] = useState("");
  const [studentKeyword, setStudentKeyword] = useState("");

  const enrollmentQueryKey = [
    "course-offerings",
    courseOfferingId,
    "classes",
    classItem.id,
    "enrollments",
    status,
    page,
  ];

  const enrollmentsQuery = useQuery({
    queryKey: enrollmentQueryKey,
    queryFn: () =>
      getClassEnrollments(courseOfferingId, classItem.id, {
        status: status || undefined,
        page,
        limit: 20,
      }),
  });

  const studentsQuery = useQuery({
    queryKey: ["users", "active-students", studentKeyword],
    queryFn: () =>
      getUsers({
        keyword: studentKeyword || undefined,
        role: "STUDENT",
        status: "ACTIVE",
        page: 1,
        limit: 100,
      }),
    enabled: editorOpen,
  });

  const refreshEnrollments = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: [
        "course-offerings",
        courseOfferingId,
        "classes",
        classItem.id,
        "enrollments",
      ],
    });

    await onChanged();
  };

  const createMutation = useMutation({
    mutationFn: ({
      studentId,
      startsOn,
      endsOn,
      reason,
    }: {
      studentId: string;
      startsOn: string;
      endsOn?: string;
      reason?: string;
    }) =>
      createRegularEnrollment(courseOfferingId, classItem.id, {
        studentId,
        startsOn,
        endsOn,
        reason,
      }),
    onSuccess: async () => {
      setEditorOpen(false);
      setStudentKeyword("");
      setStudentKeywordDraft("");
      await refreshEnrollments();
    },
  });

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const endsOn = String(formData.get("endsOn") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    createMutation.mutate({
      studentId: String(formData.get("studentId") ?? ""),
      startsOn: String(formData.get("startsOn") ?? ""),
      endsOn: endsOn || undefined,
      reason: reason || undefined,
    });
  };

  const handleStudentSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setStudentKeyword(studentKeywordDraft.trim());
  };

  const enrollments = enrollmentsQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const editable =
    classItem.status !== "COMPLETED" && classItem.status !== "CANCELED";

  return (
    <section className="nested-section">
      <header className="nested-section__header">
        <div>
          <h3>수강생 관리</h3>
          <p>기본 수강생을 등록하고 현재 수강 상태를 확인합니다.</p>
        </div>

        <button
          type="button"
          className="button button--primary button--compact"
          disabled={!editable}
          onClick={() => setEditorOpen(true)}
        >
          <UserRoundPlus size={15} />
          수강생 등록
        </button>
      </header>

      <div className="nested-section__body">
        <div className="section-toolbar">
          <label className="form-field form-field--flush">
            <span>수강 상태</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as EnrollmentStatus | "");
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

          <div className="section-toolbar__summary">
            총 {enrollmentsQuery.data?.pagination.total ?? 0}명
          </div>
        </div>

        {enrollmentsQuery.isLoading && (
          <LoadingState message="수강생을 불러오고 있습니다." />
        )}

        {enrollmentsQuery.isError && (
          <ErrorState
            message={getErrorMessage(enrollmentsQuery.error)}
            onRetry={() => void enrollmentsQuery.refetch()}
          />
        )}

        {!enrollmentsQuery.isLoading &&
          !enrollmentsQuery.isError &&
          (enrollments.length ? (
            <div className="compact-list schedule-list">
              {enrollments.map((enrollment) => (
                <article className="compact-row" key={enrollment.id}>
                  <div className="table-user__avatar">
                    {enrollment.student.name.slice(0, 1)}
                  </div>

                  <div className="compact-row__body">
                    <div className="cluster">
                      <strong>{enrollment.student.name}</strong>

                      <span
                        className={`status-badge ${
                          STATUS_CLASSES[enrollment.status]
                        }`}
                      >
                        {STATUS_LABELS[enrollment.status]}
                      </span>

                      <span className="status-badge status-badge--neutral">
                        {TYPE_LABELS[enrollment.type]}
                      </span>
                    </div>

                    <p>
                      {formatDate(enrollment.startsOn)} ~{" "}
                      {enrollment.endsOn
                        ? formatDate(enrollment.endsOn)
                        : "종료일 미정"}
                    </p>

                    <small>
                      {enrollment.student.loginId || "아이디 없음"} ·{" "}
                      {enrollment.student.phone || "연락처 없음"} · 과목{" "}
                      {enrollment.subjects.length}개
                    </small>
                  </div>
                  <EnrollmentActions
                    courseOfferingId={courseOfferingId}
                    classItem={classItem}
                    enrollment={enrollment}
                    onChanged={refreshEnrollments}
                  />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="등록된 수강생이 없습니다."
              description="활성 학생을 검색하여 기본 수강생으로 등록해 주세요."
            />
          ))}

        {(enrollmentsQuery.data?.pagination.totalPages ?? 0) > 1 && (
          <footer className="pagination">
            <button
              type="button"
              className="icon-button bordered-icon-button"
              aria-label="이전 페이지"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={18} />
            </button>

            <span>
              {page} / {enrollmentsQuery.data?.pagination.totalPages}
            </span>

            <button
              type="button"
              className="icon-button bordered-icon-button"
              aria-label="다음 페이지"
              disabled={
                page >= (enrollmentsQuery.data?.pagination.totalPages ?? 1)
              }
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </footer>
        )}
      </div>

      {editorOpen && (
        <Modal
          title="기본 수강생 등록"
          description={`${classItem.name} 반에 학생을 배정하고 운영 과목을 자동 연결합니다.`}
          onClose={() => setEditorOpen(false)}
        >
          <div className="stack">
            <form className="section-toolbar" onSubmit={handleStudentSearch}>
              <label className="form-field form-field--flush">
                <span>학생 검색</span>
                <input
                  value={studentKeywordDraft}
                  placeholder="이름, 아이디 또는 연락처"
                  onChange={(event) =>
                    setStudentKeywordDraft(event.target.value)
                  }
                />
              </label>

              <button type="submit" className="button button--secondary">
                <Search size={16} />
                검색
              </button>
            </form>

            {studentsQuery.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(studentsQuery.error)}
              </div>
            )}

            <form className="stack" onSubmit={handleCreateSubmit}>
              <label className="form-field form-field--flush">
                <span>학생</span>
                <select
                  name="studentId"
                  disabled={studentsQuery.isLoading || students.length === 0}
                  required
                >
                  {studentsQuery.isLoading && (
                    <option value="">학생 불러오는 중...</option>
                  )}

                  {!studentsQuery.isLoading && students.length === 0 && (
                    <option value="">검색된 활성 학생이 없습니다.</option>
                  )}

                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.loginId || "아이디 없음"} ·{" "}
                      {student.phone || "연락처 없음"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-grid">
                <label className="form-field form-field--flush">
                  <span>수강 시작일</span>
                  <input
                    name="startsOn"
                    type="date"
                    min={classItem.startDate}
                    max={classItem.endDate}
                    defaultValue={getInitialStartDate(classItem)}
                    required
                  />
                </label>

                <label className="form-field form-field--flush">
                  <span>수강 종료일</span>
                  <input
                    name="endsOn"
                    type="date"
                    min={classItem.startDate}
                    max={classItem.endDate}
                    defaultValue={classItem.endDate}
                  />
                </label>
              </div>

              <label className="form-field">
                <span>배정 사유</span>
                <textarea
                  name="reason"
                  rows={4}
                  maxLength={1000}
                  placeholder="신규 등록, 기존 학생 재등록 등"
                />
              </label>

              <div className="info-banner">
                <UsersRound size={19} />
                <div>
                  <strong>기본 수강 등록</strong>
                  <p>
                    이 반의 모든 운영 과목이 학생의 수강 과목으로 자동
                    연결됩니다.
                  </p>
                </div>
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
                  onClick={() => setEditorOpen(false)}
                >
                  취소
                </button>

                <button
                  type="submit"
                  className="button button--primary"
                  disabled={
                    createMutation.isPending ||
                    studentsQuery.isLoading ||
                    students.length === 0
                  }
                >
                  {createMutation.isPending ? "등록 중..." : "기본 수강 등록"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </section>
  );
}
