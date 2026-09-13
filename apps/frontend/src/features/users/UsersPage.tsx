import {
  Check,
  ChevronLeft,
  ChevronRight,
  Power,
  RotateCcw,
  Search,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { UserRole } from "../../auth/auth.types";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  approveStudent,
  deactivateUser,
  getPendingStudents,
  getUsers,
  reactivateUser,
  rejectStudent,
  updateStudentProfile,
  type PendingStudent,
  type StudentGender,
  type UpdateStudentProfileInput,
  type UserStatus,
  type UserSummary,
} from "./users.api";
import {
  CreateStaffButton,
  TemporaryPasswordButton,
} from "./StaffAccountActions";
import "./users.css";

type UserTab = "all" | "pending" | "inactive";

type UserAction =
  | {
      type: "reject";
      user: PendingStudent;
    }
  | {
      type: "deactivate" | "reactivate";
      user: UserSummary;
    }
  | null;

const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: "학생",
  INSTRUCTOR: "강사",
  MANAGER: "실장",
  PRINCIPAL: "원장",
  ADMIN: "관리자",
};

const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING_APPROVAL: "승인 대기",
  ACTIVE: "활성",
  REJECTED: "가입 거절",
  INACTIVE: "비활성",
  DELETE_PENDING: "삭제 대기",
  DELETED: "삭제됨",
};

const STATUS_CLASS_NAMES: Record<UserStatus, string> = {
  PENDING_APPROVAL: "status-badge--warning",
  ACTIVE: "status-badge--success",
  REJECTED: "status-badge--danger",
  INACTIVE: "status-badge--neutral",
  DELETE_PENDING: "status-badge--warning",
  DELETED: "status-badge--neutral",
};

const GENDER_LABELS: Record<StudentGender, string> = {
  MALE: "남",
  FEMALE: "여",
  OTHER: "기타",
  UNDISCLOSED: "비공개",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<UserTab>("all");
  const [pendingPage, setPendingPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [action, setAction] = useState<UserAction>(null);

  const changeTab = (next: UserTab): void => {
    setTab(next);
    setSelectedUserId(null);
    setUserPage(1);
  };

  const pendingQuery = useQuery({
    queryKey: ["users", "pending", pendingPage],
    queryFn: () => getPendingStudents(pendingPage),
  });

  const allCountQuery = useQuery({
    queryKey: ["users", "count-all"],
    queryFn: () => getUsers({ page: 1, limit: 1 }),
  });

  const inactiveCountQuery = useQuery({
    queryKey: ["users", "count-inactive"],
    queryFn: () => getUsers({ page: 1, limit: 1, status: "INACTIVE" }),
  });

  const effectiveStatus = tab === "inactive" ? "INACTIVE" : status;

  const usersQuery = useQuery({
    queryKey: ["users", "list", keyword, role, effectiveStatus, userPage],
    queryFn: () =>
      getUsers({
        keyword: keyword || undefined,
        role: role || undefined,
        status: effectiveStatus || undefined,
        page: userPage,
      }),
    enabled: tab === "all" || tab === "inactive",
  });

  const refreshUsers = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users", "pending"] }),
      queryClient.invalidateQueries({ queryKey: ["users", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["users", "count-all"] }),
      queryClient.invalidateQueries({ queryKey: ["users", "count-inactive"] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: approveStudent,
    onSuccess: refreshUsers,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      rejectStudent(userId, reason),
    onSuccess: async () => {
      setAction(null);
      await refreshUsers();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      userId,
      type,
      reason,
    }: {
      userId: string;
      type: "deactivate" | "reactivate";
      reason: string;
    }) =>
      type === "deactivate"
        ? deactivateUser(userId, reason)
        : reactivateUser(userId, reason),
    onSuccess: async () => {
      setAction(null);
      await refreshUsers();
    },
  });

  const handleSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setKeyword(String(formData.get("keyword") ?? "").trim());
    setRole(String(formData.get("role") ?? "") as UserRole | "");
    if (tab === "all") {
      setStatus(String(formData.get("status") ?? "") as UserStatus | "");
    }
    setUserPage(1);
  };

  const handleActionSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (!action) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const reason = String(formData.get("reason") ?? "").trim();

    if (action.type === "reject") {
      rejectMutation.mutate({
        userId: action.user.id,
        reason,
      });

      return;
    }

    statusMutation.mutate({
      userId: action.user.id,
      type: action.type,
      reason,
    });
  };

  const currentMutation =
    action?.type === "reject" ? rejectMutation : statusMutation;

  const selectedUser =
    usersQuery.data?.items.find((item) => item.id === selectedUserId) ?? null;

  return (
    <div className="page-stack users-page">
      <section className="page-header">
        <div>
          <h1>사용자 관리</h1>
          <p>구성원의 계정 상태와 권한을 관리합니다.</p>
        </div>

        <CreateStaffButton onCreated={refreshUsers} />
      </section>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={`tab ${tab === "all" ? "tab--active" : ""}`}
          onClick={() => changeTab("all")}
        >
          전체 사용자
          {(allCountQuery.data?.pagination.total ?? 0) > 0 && (
            <span className="tab__count">
              {allCountQuery.data?.pagination.total}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={`tab ${tab === "pending" ? "tab--active" : ""}`}
          onClick={() => changeTab("pending")}
        >
          승인 대기
          {(pendingQuery.data?.pagination.total ?? 0) > 0 && (
            <span className="tab__count">
              {pendingQuery.data?.pagination.total}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "inactive"}
          className={`tab ${tab === "inactive" ? "tab--active" : ""}`}
          onClick={() => changeTab("inactive")}
        >
          비활성 계정
          {(inactiveCountQuery.data?.pagination.total ?? 0) > 0 && (
            <span className="tab__count">
              {inactiveCountQuery.data?.pagination.total}
            </span>
          )}
        </button>
      </div>

      {tab === "pending" && (
        <section className="surface-card">
          <header className="card-header">
            <div>
              <h2>가입 승인 대기 학생</h2>
              <p>총 {pendingQuery.data?.pagination.total ?? 0}명</p>
            </div>
          </header>

          {pendingQuery.isLoading && (
            <LoadingState message="승인 대기 학생을 불러오고 있습니다." />
          )}

          {pendingQuery.isError && (
            <ErrorState
              message={getErrorMessage(pendingQuery.error)}
              onRetry={() => void pendingQuery.refetch()}
            />
          )}

          {!pendingQuery.isLoading &&
            !pendingQuery.isError &&
            (pendingQuery.data?.items.length ? (
              <>
                <div className="desktop-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>학생</th>
                        <th>연락처</th>
                        <th>생년월일</th>
                        <th>보호자</th>
                        <th>신청일</th>
                        <th>처리</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pendingQuery.data.items.map((student) => (
                        <tr key={student.id}>
                          <td>
                            <div className="table-user">
                              <span className="table-user__avatar">
                                {student.name.slice(0, 1)}
                              </span>

                              <span>
                                <strong>{student.name}</strong>
                                <small>{student.loginId}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            {student.phone}
                            <small className="table-secondary">
                              {student.email ?? "이메일 없음"}
                            </small>
                          </td>
                          <td>{student.birthDate}</td>
                          <td>
                            {student.isMinorAtSignup
                              ? `${student.guardianName ?? "-"} · ${student.guardianPhone ?? "-"}`
                              : "해당 없음"}
                          </td>
                          <td>{formatDateTime(student.createdAt)}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="button button--secondary button--compact"
                                onClick={() =>
                                  setAction({
                                    type: "reject",
                                    user: student,
                                  })
                                }
                              >
                                <X size={15} />
                                거절
                              </button>

                              <button
                                type="button"
                                className="button button--primary button--compact"
                                disabled={approveMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `${student.name} 학생의 가입을 승인하시겠습니까?`,
                                    )
                                  ) {
                                    approveMutation.mutate(student.id);
                                  }
                                }}
                              >
                                <Check size={15} />
                                승인
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-record-list">
                  {pendingQuery.data.items.map((student) => (
                    <article className="mobile-record-card" key={student.id}>
                      <header>
                        <div className="table-user">
                          <span className="table-user__avatar">
                            {student.name.slice(0, 1)}
                          </span>

                          <span>
                            <strong>{student.name}</strong>
                            <small>{student.loginId}</small>
                          </span>
                        </div>

                        <span className="status-badge status-badge--warning">
                          승인 대기
                        </span>
                      </header>

                      <dl>
                        <div>
                          <dt>연락처</dt>
                          <dd>{student.phone}</dd>
                        </div>

                        <div>
                          <dt>생년월일</dt>
                          <dd>{student.birthDate}</dd>
                        </div>

                        <div>
                          <dt>신청일</dt>
                          <dd>{formatDateTime(student.createdAt)}</dd>
                        </div>
                      </dl>

                      <footer>
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() =>
                            setAction({
                              type: "reject",
                              user: student,
                            })
                          }
                        >
                          거절
                        </button>

                        <button
                          type="button"
                          className="button button--primary"
                          disabled={approveMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `${student.name} 학생의 가입을 승인하시겠습니까?`,
                              )
                            ) {
                              approveMutation.mutate(student.id);
                            }
                          }}
                        >
                          승인
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                title="승인 대기 학생이 없습니다."
                description="새로운 가입 신청이 등록되면 이곳에 표시됩니다."
              />
            ))}

          {(pendingQuery.data?.pagination.totalPages ?? 0) > 1 && (
            <Pagination
              page={pendingPage}
              totalPages={pendingQuery.data?.pagination.totalPages ?? 1}
              onChange={setPendingPage}
            />
          )}
        </section>
      )}

      {(tab === "all" || tab === "inactive") && (
        <>
          <form className="filter-bar users-filter-bar" onSubmit={handleSearch}>
            <label className="users-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">사용자 검색</span>
              <input
                name="keyword"
                defaultValue={keyword}
                placeholder="이름, 아이디, 연락처로 검색"
              />
            </label>

            <label className="filter-control">
              <span className="sr-only">역할</span>
              <select name="role" defaultValue={role}>
                <option value="">전체 역할</option>

                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {tab === "all" && (
              <label className="filter-control">
                <span className="sr-only">상태</span>
                <select name="status" defaultValue={status}>
                  <option value="">전체 상태</option>

                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button type="submit" className="button button--secondary">
              검색
            </button>
          </form>

          <div className="users-workbench">
            <section className="surface-card users-list-pane">
              <header className="card-header">
                <div>
                  <h2>{tab === "inactive" ? "비활성 계정" : "전체 사용자"}</h2>
                  <p>총 {usersQuery.data?.pagination.total ?? 0}명</p>
                </div>
              </header>

              {usersQuery.isLoading && (
                <LoadingState message="사용자를 불러오고 있습니다." />
              )}

              {usersQuery.isError && (
                <ErrorState
                  message={getErrorMessage(usersQuery.error)}
                  onRetry={() => void usersQuery.refetch()}
                />
              )}

              {!usersQuery.isLoading &&
                !usersQuery.isError &&
                (usersQuery.data?.items.length ? (
                  <>
                    <div className="desktop-table">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>사용자</th>
                            <th>역할</th>
                            <th>연락처</th>
                            <th>상태</th>
                            <th>가입일</th>
                          </tr>
                        </thead>

                        <tbody>
                          {usersQuery.data.items.map((user) => (
                            <tr
                              key={user.id}
                              data-selected={selectedUserId === user.id}
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              <td>
                                <div className="table-user">
                                  <span className="table-user__avatar">
                                    {user.name.slice(0, 1)}
                                  </span>

                                  <span>
                                    <strong>{user.name}</strong>
                                    <small>
                                      {user.loginId ?? "로그인 아이디 없음"}
                                    </small>
                                  </span>
                                </div>
                              </td>
                              <td>{ROLE_LABELS[user.role]}</td>
                              <td>
                                {user.phone ?? "연락처 없음"}
                                <small className="table-secondary">
                                  {user.email ?? "이메일 없음"}
                                </small>
                              </td>
                              <td>
                                <span
                                  className={`status-badge ${
                                    STATUS_CLASS_NAMES[user.status]
                                  }`}
                                >
                                  {STATUS_LABELS[user.status]}
                                </span>
                              </td>
                              <td>{formatDateTime(user.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mobile-record-list">
                      {usersQuery.data.items.map((user) => (
                        <button
                          type="button"
                          className="mobile-record-card users-mobile-card"
                          key={user.id}
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          <header>
                            <div className="table-user">
                              <span className="table-user__avatar">
                                {user.name.slice(0, 1)}
                              </span>

                              <span>
                                <strong>{user.name}</strong>
                                <small>
                                  {ROLE_LABELS[user.role]} ·{" "}
                                  {user.loginId ?? "아이디 없음"}
                                </small>
                              </span>
                            </div>

                            <span
                              className={`status-badge ${
                                STATUS_CLASS_NAMES[user.status]
                              }`}
                            >
                              {STATUS_LABELS[user.status]}
                            </span>
                          </header>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="조회된 사용자가 없습니다."
                    description="검색 조건을 변경해 주세요."
                  />
                ))}

              {(usersQuery.data?.pagination.totalPages ?? 0) > 1 && (
                <Pagination
                  page={userPage}
                  totalPages={usersQuery.data?.pagination.totalPages ?? 1}
                  onChange={setUserPage}
                />
              )}
            </section>

            <section className="surface-card users-detail-pane">
              {selectedUser ? (
                <UserDetailPanel
                  key={selectedUser.id}
                  user={selectedUser}
                  onClose={() => setSelectedUserId(null)}
                  onRequestStatusChange={(type) =>
                    setAction({ type, user: selectedUser })
                  }
                  onRefresh={refreshUsers}
                />
              ) : (
                <EmptyState
                  title="사용자를 선택해 주세요."
                  description="목록에서 사용자를 선택하면 상세 정보를 확인할 수 있습니다."
                />
              )}
            </section>
          </div>
        </>
      )}

      {approveMutation.isError && (
        <div className="form-alert page-alert" role="alert">
          {getErrorMessage(approveMutation.error)}
        </div>
      )}

      {action && (
        <Modal
          title={
            action.type === "reject"
              ? "가입 거절"
              : action.type === "deactivate"
                ? "사용자 비활성화"
                : "사용자 재활성화"
          }
          description={`${action.user.name} 사용자의 상태를 변경합니다.`}
          onClose={() => setAction(null)}
        >
          <form className="stack" onSubmit={handleActionSubmit}>
            <div className="info-banner">
              {action.type === "reject" ? (
                <UserCheck size={19} />
              ) : (
                <UserRound size={19} />
              )}

              <div>
                <strong>{action.user.name}</strong>
                <p>{"loginId" in action.user ? action.user.loginId : ""}</p>
              </div>
            </div>

            <label className="form-field form-field--flush">
              <span>처리 사유</span>
              <textarea name="reason" rows={5} maxLength={500} required />
            </label>

            {currentMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(currentMutation.error)}
              </div>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setAction(null)}
              >
                취소
              </button>

              <button
                type="submit"
                className={
                  action.type === "reactivate"
                    ? "button button--primary"
                    : "button button--danger"
                }
                disabled={currentMutation.isPending}
              >
                {currentMutation.isPending
                  ? "처리 중..."
                  : action.type === "reject"
                    ? "가입 거절"
                    : action.type === "deactivate"
                      ? "비활성화"
                      : "재활성화"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

type UserDetailPanelProps = {
  user: UserSummary;
  onClose: () => void;
  onRequestStatusChange: (type: "deactivate" | "reactivate") => void;
  onRefresh: () => Promise<void>;
};

function UserDetailPanel({
  user,
  onClose,
  onRequestStatusChange,
  onRefresh,
}: UserDetailPanelProps) {
  const isStudent = user.role === "STUDENT";

  const updateMutation = useMutation({
    mutationFn: (input: UpdateStudentProfileInput) =>
      updateStudentProfile(user.id, input),
    onSuccess: onRefresh,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const input: UpdateStudentProfileInput = {
      reason: String(formData.get("reason") ?? "").trim(),
    };

    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const birthDate = String(formData.get("birthDate") ?? "").trim();
    const gender = String(formData.get("gender") ?? "").trim();
    const guardianName = String(formData.get("guardianName") ?? "").trim();
    const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();

    // 이름/연락처/이메일은 폼에 기존 값이 채워져 있으므로, 실제로 값이 바뀐
    // 필드만 전송한다 — 그대로 재전송하면 서버 쪽 정규화(예: 연락처 하이픈 제거)로
    // 건드리지 않은 값까지 바뀔 수 있다.
    if (name && name !== user.name) input.name = name;
    if (phone && phone !== (user.phone ?? "")) input.phone = phone;
    if (email !== (user.email ?? "")) input.email = email;
    if (birthDate) input.birthDate = birthDate;
    if (gender) input.gender = gender as StudentGender;
    if (guardianName) input.guardianName = guardianName;
    if (guardianPhone) input.guardianPhone = guardianPhone;

    updateMutation.mutate(input);
  };

  return (
    <>
      <header className="users-detail-header">
        <div className="users-detail-header__identity">
          <span className="table-user__avatar">{user.name.slice(0, 1)}</span>

          <div>
            <strong>{user.name}</strong>
            <small>{user.loginId ?? "아이디 없음"}</small>
          </div>

          <span className={`status-badge ${STATUS_CLASS_NAMES[user.status]}`}>
            {STATUS_LABELS[user.status]}
          </span>
        </div>

        <button
          type="button"
          className="users-detail-header__close"
          aria-label="닫기"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      <div className="card-body users-detail-body">
        <dl className="users-detail-meta">
          <div>
            <dt>역할</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt>가입일</dt>
            <dd>{formatDateTime(user.createdAt)}</dd>
          </div>
        </dl>

        {isStudent ? (
          <form className="stack users-detail-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="form-field">
                <span>이름</span>
                <input name="name" defaultValue={user.name} maxLength={100} />
              </label>
              <label className="form-field">
                <span>연락처</span>
                <input
                  name="phone"
                  defaultValue={user.phone ?? ""}
                  placeholder="010-0000-0000"
                />
              </label>
            </div>

            <label className="form-field">
              <span>이메일</span>
              <input name="email" type="email" defaultValue={user.email ?? ""} />
            </label>

            <div className="form-grid">
              <label className="form-field">
                <span>생년월일</span>
                <input name="birthDate" type="date" />
              </label>
              <label className="form-field">
                <span>성별</span>
                <select name="gender" defaultValue="">
                  <option value="">변경 안 함</option>
                  {Object.entries(GENDER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>보호자 이름</span>
                <input name="guardianName" maxLength={100} />
              </label>
              <label className="form-field">
                <span>보호자 연락처</span>
                <input name="guardianPhone" placeholder="010-0000-0000" />
              </label>
            </div>

            <label className="form-field">
              <span>변경 사유</span>
              <textarea name="reason" rows={3} maxLength={500} required />
            </label>

            {updateMutation.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(updateMutation.error)}
              </div>
            )}

            {updateMutation.isSuccess && (
              <p className="form-success">변경사항을 저장했습니다.</p>
            )}

            <div className="users-detail-actions">
              <TemporaryPasswordButton target={user} onIssued={onRefresh} />

              {user.status === "ACTIVE" && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onRequestStatusChange("deactivate")}
                >
                  <Power size={15} />
                  비활성화
                </button>
              )}

              {user.status === "INACTIVE" && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => onRequestStatusChange("reactivate")}
                >
                  <RotateCcw size={15} />
                  재활성화
                </button>
              )}

              <button
                type="submit"
                className="button button--primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="users-detail-meta">
              <div>
                <dt>연락처</dt>
                <dd>{user.phone ?? "-"}</dd>
              </div>
              <div>
                <dt>이메일</dt>
                <dd>{user.email ?? "-"}</dd>
              </div>
            </dl>

            <div className="users-detail-actions">
              <TemporaryPasswordButton target={user} onIssued={onRefresh} />

              {user.status === "ACTIVE" && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onRequestStatusChange("deactivate")}
                >
                  <Power size={15} />
                  비활성화
                </button>
              )}

              {user.status === "INACTIVE" && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => onRequestStatusChange("reactivate")}
                >
                  <RotateCcw size={15} />
                  재활성화
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

type PaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

function Pagination({ page, totalPages, onChange }: PaginationProps) {
  return (
    <footer className="pagination">
      <button
        type="button"
        className="icon-button bordered-icon-button"
        aria-label="이전 페이지"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        <ChevronLeft size={18} />
      </button>

      <span>
        {page} / {totalPages}
      </span>

      <button
        type="button"
        className="icon-button bordered-icon-button"
        aria-label="다음 페이지"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </footer>
  );
}
