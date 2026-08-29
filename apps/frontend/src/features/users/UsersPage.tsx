import {
  Check,
  ChevronLeft,
  ChevronRight,
  Power,
  RotateCcw,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { UserRole } from "../../auth/auth.types";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import {
  approveStudent,
  deactivateUser,
  getPendingStudents,
  getUsers,
  reactivateUser,
  rejectStudent,
  type PendingStudent,
  type UserStatus,
  type UserSummary,
} from "./users.api";
import {
  CreateStaffButton,
  TemporaryPasswordButton,
} from "./StaffAccountActions";

type UserTab = "pending" | "all";

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
  const [tab, setTab] = useState<UserTab>("pending");
  const [pendingPage, setPendingPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [action, setAction] = useState<UserAction>(null);

  const pendingQuery = useQuery({
    queryKey: ["users", "pending", pendingPage],
    queryFn: () => getPendingStudents(pendingPage),
    enabled: tab === "pending",
  });

  const usersQuery = useQuery({
    queryKey: ["users", keyword, role, status, userPage],
    queryFn: () =>
      getUsers({
        keyword: keyword || undefined,
        role: role || undefined,
        status: status || undefined,
        page: userPage,
      }),
    enabled: tab === "all",
  });

  const refreshUsers = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["users", "pending"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["users"],
      }),
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
    setStatus(String(formData.get("status") ?? "") as UserStatus | "");
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

  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">사용자 관리</p>
          <h1>학생·직원 관리</h1>
          <p>가입 승인과 사용자 계정 상태를 관리합니다.</p>
        </div>

        <CreateStaffButton onCreated={refreshUsers} />
      </section>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={`tab ${tab === "pending" ? "tab--active" : ""}`}
          onClick={() => setTab("pending")}
        >
          가입 승인 대기
          {(pendingQuery.data?.pagination.total ?? 0) > 0 && (
            <span className="tab__count">
              {pendingQuery.data?.pagination.total}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={`tab ${tab === "all" ? "tab--active" : ""}`}
          onClick={() => setTab("all")}
        >
          전체 사용자
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

      {tab === "all" && (
        <>
          <form className="filter-bar" onSubmit={handleSearch}>
            <label className="filter-control">
              <span className="sr-only">사용자 검색</span>
              <input
                name="keyword"
                defaultValue={keyword}
                placeholder="이름 또는 로그인 아이디 검색"
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

            <button type="submit" className="button button--secondary">
              검색
            </button>
          </form>

          <section className="surface-card">
            <header className="card-header">
              <div>
                <h2>전체 사용자</h2>
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
                          <th>관리</th>
                        </tr>
                      </thead>

                      <tbody>
                        {usersQuery.data.items.map((user) => (
                          <tr key={user.id}>
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
                            <td>
                              <div className="table-actions">
                                <TemporaryPasswordButton
                                  target={user}
                                  onIssued={refreshUsers}
                                />

                                {user.status === "ACTIVE" && (
                                  <button
                                    type="button"
                                    className="button button--ghost button--compact"
                                    onClick={() =>
                                      setAction({
                                        type: "deactivate",
                                        user,
                                      })
                                    }
                                  >
                                    <Power size={15} />
                                    비활성화
                                  </button>
                                )}

                                {user.status === "INACTIVE" && (
                                  <button
                                    type="button"
                                    className="button button--secondary button--compact"
                                    onClick={() =>
                                      setAction({
                                        type: "reactivate",
                                        user,
                                      })
                                    }
                                  >
                                    <RotateCcw size={15} />
                                    재활성화
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-record-list">
                    {usersQuery.data.items.map((user) => (
                      <article className="mobile-record-card" key={user.id}>
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

                        <dl>
                          <div>
                            <dt>연락처</dt>
                            <dd>{user.phone ?? "-"}</dd>
                          </div>

                          <div>
                            <dt>이메일</dt>
                            <dd>{user.email ?? "-"}</dd>
                          </div>

                          <div>
                            <dt>가입일</dt>
                            <dd>{formatDateTime(user.createdAt)}</dd>
                          </div>
                        </dl>

                        {(user.status === "ACTIVE" ||
                          user.status === "INACTIVE") && (
                          <footer>
                            <TemporaryPasswordButton
                              target={user}
                              onIssued={refreshUsers}
                            />

                            <button
                              type="button"
                              className="button button--secondary"
                              onClick={() =>
                                setAction({
                                  type:
                                    user.status === "ACTIVE"
                                      ? "deactivate"
                                      : "reactivate",
                                  user,
                                })
                              }
                            >
                              {user.status === "ACTIVE"
                                ? "비활성화"
                                : "재활성화"}
                            </button>
                          </footer>
                        )}
                      </article>
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
