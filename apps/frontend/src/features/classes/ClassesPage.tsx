import { ChevronLeft, CirclePlus, Pencil, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Modal } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { ClassEnrollmentsPanel } from "../enrollments/ClassEnrollmentsPanel";
import { getPrograms } from "../courses/programs.api";
import { ClassSchedulePanel } from "./ClassSchedulePanel";
import {
  changeManagedSubject,
  createManagedClass,
  getInstructorClasses,
  getManagedClasses,
  removeManagedClass,
  updateManagedClass,
  type DerivedClassStatus,
  type ManagedClass,
  type ManagedClassPage,
} from "./class-management.api";
import "./classes.css";

const STATUS = {
  UPCOMING: { label: "운영 전", className: "status-badge--neutral" },
  OPERATING: { label: "운영 중", className: "status-badge--success" },
  ENDED: { label: "운영 종료", className: "status-badge--primary" },
} as const;

type Editor = { item?: ManagedClass } | null;
type ClassDetailTab = "overview" | "schedule" | "students";
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function ClassesPage() {
  const { user } = useAuth();

  return user?.role === "INSTRUCTOR" ? (
    <InstructorClassesView />
  ) : (
    <StaffClassesView />
  );
}

function InstructorClassesView() {
  const [keyword, setKeyword] = useState("");
  const classesQuery = useQuery({
    queryKey: ["instructor-classes"],
    queryFn: getInstructorClasses,
  });

  if (classesQuery.isLoading) {
    return <LoadingState message="담당 반 정보를 불러오고 있습니다." />;
  }
  if (classesQuery.isError) {
    return <ErrorState message="담당 반 정보를 불러오지 못했습니다." />;
  }

  const rows = classesQuery.data ?? [];
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("ko-KR");
  const filtered = normalizedKeyword
    ? rows.filter(
        (item) =>
          item.name.toLocaleLowerCase("ko-KR").includes(normalizedKeyword) ||
          item.courseOfferingName
            .toLocaleLowerCase("ko-KR")
            .includes(normalizedKeyword),
      )
    : rows;

  return (
    <div className="page-stack classes-page">
      <header className="page-header">
        <div>
          <h1>반 관리</h1>
          <p>내가 담당하는 반의 운영 정보를 확인합니다.</p>
        </div>
      </header>

      <div className="filter-bar classes-filter-bar">
        <label className="classes-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">반 검색</span>
          <input
            placeholder="반명, 과정명으로 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="담당하는 반이 없습니다."
          description="교육과정에 반이 연결되면 이곳에 표시됩니다."
        />
      ) : (
        <section className="surface-card">
          <header className="card-header">
            <div>
              <h2>담당 반</h2>
              <p>총 {filtered.length}개</p>
            </div>
          </header>

          {filtered.length === 0 ? (
            <EmptyState
              title="검색 결과가 없습니다."
              description="다른 검색어로 다시 시도해 주세요."
            />
          ) : (
            <div className="desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>반명</th>
                    <th>과정명</th>
                    <th>강의실</th>
                    <th>운영 기간</th>
                    <th>과목 수</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={`${item.id}:${item.courseOfferingId}`}>
                      <td>{item.name}</td>
                      <td>{item.courseOfferingName}</td>
                      <td>{item.room ?? "미정"}</td>
                      <td>
                        {item.startDate} ~ {item.endDate}
                      </td>
                      <td>{item.subjectCount}개</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StaffClassesView() {
  const client = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState<DerivedClassStatus | "">("");
  const [instructorId, setInstructorId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<ClassDetailTab>("overview");
  const [editor, setEditor] = useState<Editor>(null);
  const classesQuery = useQuery({
    queryKey: ["managed-classes", "list", showArchived],
    queryFn: () => getManagedClasses(showArchived),
  });
  const programsQuery = useQuery({
    queryKey: ["education-programs", false],
    queryFn: () => getPrograms(),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["managed-classes", "list"] });

  const saveMutation = useMutation({
    mutationFn: ({ item, form }: { item?: ManagedClass; form: FormData }) => {
      const fullInput = {
        name: String(form.get("name") ?? "").trim(),
        room: String(form.get("room") ?? "").trim() || undefined,
        startDate: String(form.get("startDate") ?? ""),
        endDate: String(form.get("endDate") ?? ""),
        capacity: Number(form.get("capacity")),
      };

      if (!item) {
        return createManagedClass({
          ...fullInput,
          programIds: form.getAll("programIds").map(String),
        });
      }

      // 반 생성 후에는 포함 교육과정을 변경하지 않는다.
      // 운영 중에는 이름만 바꿀 수 있다.
      if (item.derivedStatus === "OPERATING") {
        return updateManagedClass(item.id, { name: fullInput.name });
      }

      return updateManagedClass(item.id, fullInput);
    },
    onSuccess: async (saved) => {
      setEditor(null);
      setSelectedId(saved.id);
      setMobileDetailOpen(true);
      setDetailTab("overview");
      await refresh();
    },
  });
  const removeMutation = useMutation({
    mutationFn: removeManagedClass,
    onSuccess: async (_result, removedId) => {
      setSelectedId(null);
      setMobileDetailOpen(false);
      client.setQueryData<ManagedClassPage>(
        ["managed-classes", "list", showArchived],
        (current) =>
          current
            ? {
                ...current,
                items: current.items.filter((item) => item.id !== removedId),
                pagination: {
                  ...current.pagination,
                  total: Math.max(0, current.pagination.total - 1),
                },
              }
            : current,
      );
      await refresh();
    },
  });
  const subjectMutation = useMutation({
    mutationFn: ({
      classId,
      subjectId,
      active,
    }: {
      classId: string;
      subjectId: string;
      active: boolean;
    }) => changeManagedSubject(classId, subjectId, active),
    onSuccess: refresh,
  });

  const items = useMemo(() => classesQuery.data?.items ?? [], [classesQuery.data?.items]);
  const programs = programsQuery.data?.items ?? [];

  const instructorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      for (const program of item.programs) {
        map.set(program.instructor.id, program.instructor.name);
      }
    }
    return [...map.entries()];
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase("ko-KR");
    return items.filter(
      (item) =>
        (!status || item.derivedStatus === status) &&
        (!instructorId ||
          item.programs.some(
            (program) => program.instructor.id === instructorId,
          )) &&
        (!normalizedKeyword ||
          item.name.toLocaleLowerCase("ko-KR").includes(normalizedKeyword)),
    );
  }, [instructorId, items, keyword, status]);

  if (classesQuery.isLoading || programsQuery.isLoading)
    return <LoadingState message="반 정보를 불러오고 있습니다." />;
  if (classesQuery.isError || programsQuery.isError)
    return <ErrorState message="반 관리 정보를 불러오지 못했습니다." />;
  const selected =
    filteredItems.find((item) => item.id === selectedId) ??
    filteredItems[0] ??
    null;

  return (
    <div
      className={`page-stack classes-page ${
        mobileDetailOpen ? "page--mobile-detail-open" : ""
      }`}
    >
      <header className="page-header">
        <div>
          <h1>반 관리</h1>
          <p>반 개설부터 수강생 관리까지 반의 운영 정보를 관리합니다.</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => setEditor({})}
        >
          <CirclePlus size={18} /> 반 추가
        </button>
      </header>
      <div className="segmented-control" aria-label="반 목록 구분">
        <button
          className={`segmented-control__button ${!showArchived ? "segmented-control__button--active" : ""}`}
          type="button"
          onClick={() => {
            setShowArchived(false);
            setSelectedId(null);
            setMobileDetailOpen(false);
          }}
        >
          기본 목록
        </button>
        <button
          className={`segmented-control__button ${showArchived ? "segmented-control__button--active" : ""}`}
          type="button"
          onClick={() => {
            setShowArchived(true);
            setSelectedId(null);
            setMobileDetailOpen(false);
          }}
        >
          보관된 반
        </button>
      </div>

      <div className="filter-bar classes-filter-bar">
        <label className="filter-control">
          <span className="sr-only">상태</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as DerivedClassStatus | "");
              setSelectedId(null);
            }}
          >
            <option value="">전체 상태</option>
            {(Object.keys(STATUS) as DerivedClassStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS[value].label}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span className="sr-only">강사</span>
          <select
            value={instructorId}
            onChange={(event) => {
              setInstructorId(event.target.value);
              setSelectedId(null);
            }}
          >
            <option value="">전체 강사</option>
            {instructorOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="classes-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">반명 검색</span>
          <input
            placeholder="반명 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          title={
            items.length === 0
              ? showArchived
                ? "보관된 반이 없습니다."
                : "등록된 반이 없습니다."
              : "조건에 맞는 반이 없습니다."
          }
          description={
            items.length === 0
              ? "교육과정을 준비한 뒤 실제 운영할 반을 추가해 주세요."
              : "필터를 변경해 주세요."
          }
        />
      ) : (
        <div className="master-detail-layout workbench-layout classes-workbench">
          <section
            className={`surface-card master-pane master-pane--list classes-table-pane ${
              mobileDetailOpen ? "master-pane--mobile-hidden" : ""
            }`}
          >
            <div className="desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>반명</th>
                    <th>과정명/과목</th>
                    <th>강사</th>
                    <th>정원/수강생</th>
                    <th>운영 기간</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      data-selected={selected?.id === item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setMobileDetailOpen(true);
                        setDetailTab("overview");
                      }}
                    >
                      <td>{item.name}</td>
                      <td>
                        {item.programs.map((program) => program.name).join(", ") ||
                          "-"}
                      </td>
                      <td>
                        {item.programs
                          .map((program) => program.instructor.name)
                          .join(", ") || "-"}
                      </td>
                      <td>
                        {item.enrollmentCount}/{item.capacity}
                      </td>
                      <td>
                        {item.startDate} ~ {item.endDate}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${STATUS[item.derivedStatus].className}`}
                        >
                          {STATUS[item.derivedStatus].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-record-list">
              {filteredItems.map((item) => (
                <button
                  type="button"
                  className="classes-mobile-card"
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setMobileDetailOpen(true);
                    setDetailTab("overview");
                  }}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.startDate}~{item.endDate}
                    </small>
                  </span>
                  <span
                    className={`status-badge ${STATUS[item.derivedStatus].className}`}
                  >
                    {STATUS[item.derivedStatus].label}
                  </span>
                </button>
              ))}
            </div>
          </section>
          {selected && (
            <div
              className={`page-stack master-pane master-pane--detail class-workbench-detail ${
                mobileDetailOpen ? "" : "master-pane--mobile-hidden"
              }`}
            >
              <button
                type="button"
                className="mobile-detail-back"
                onClick={() => setMobileDetailOpen(false)}
              >
                <ChevronLeft size={18} /> 반 목록
              </button>

              {!selected.archived && (
                <div className="tabs detail-tabs" role="tablist" aria-label="반 상세 메뉴">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "overview"}
                    className={`tab ${detailTab === "overview" ? "tab--active" : ""}`}
                    onClick={() => setDetailTab("overview")}
                  >
                    기본 정보
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "schedule"}
                    className={`tab ${detailTab === "schedule" ? "tab--active" : ""}`}
                    onClick={() => setDetailTab("schedule")}
                  >
                    시간표·수업
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "students"}
                    className={`tab ${detailTab === "students" ? "tab--active" : ""}`}
                    onClick={() => setDetailTab("students")}
                  >
                    수강생
                  </button>
                </div>
              )}

              {(detailTab === "overview" || selected.archived) && (
                <section className="card">
                <div className="card-header">
                  <div>
                    <h2>{selected.name}</h2>
                    <p>
                      {selected.room || "강의실 미정"} · 정원{" "}
                      {selected.enrollmentCount}/{selected.capacity}명
                    </p>
                  </div>
                  <div className="cluster">
                    {!selected.archived &&
                      selected.derivedStatus !== "ENDED" && (
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => setEditor({ item: selected })}
                        >
                          <Pencil size={16} /> 수정
                        </button>
                      )}
                    <button
                      className="button button--danger"
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            selected.derivedStatus === "UPCOMING"
                              ? "이 반을 삭제할까요?"
                              : "운영 기록을 보존하고 목록에서 숨길까요?",
                          )
                        )
                          removeMutation.mutate(selected.id);
                      }}
                    >
                      <Trash2 size={16} /> 삭제
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span>운영 기간</span>
                      <strong>
                        {selected.startDate}~{selected.endDate}
                      </strong>
                    </div>
                    <div className="detail-item">
                      <span>자동 상태</span>
                      <strong>{STATUS[selected.derivedStatus].label}</strong>
                    </div>
                  </div>
                  {selected.programs.map((program) => (
                    <div className="detail-section" key={program.id}>
                      <h3>
                        {program.name} · {program.instructor.name}
                      </h3>
                      <div className="cluster">
                        {program.subjects.map((subject) => (
                          <button
                            key={subject.id}
                            type="button"
                            className={`subject-toggle ${
                              subject.active ? "subject-toggle--active" : ""
                            }`}
                            aria-pressed={subject.active}
                            disabled={
                              selected.derivedStatus !== "UPCOMING" ||
                              subjectMutation.isPending
                            }
                            onClick={() =>
                              subjectMutation.mutate({
                                classId: selected.id,
                                subjectId: subject.id,
                                active: !subject.active,
                              })
                            }
                          >
                            {subject.name} ·{" "}
                            {subject.active ? "사용" : "미사용"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                </section>
              )}
              {!selected.archived && detailTab === "schedule" && (
                <ClassSchedulePanel classItem={selected} />
              )}
              {!selected.archived && detailTab === "students" && (
                <ClassEnrollmentsPanel
                  classItem={selected}
                  onChanged={async () => {
                    await refresh();
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {editor && (
        <Modal
          title={editor.item ? "반 수정" : "반 추가"}
          description={
            editor.item?.derivedStatus === "OPERATING"
              ? "운영 중에는 반 이름만 변경할 수 있습니다."
              : editor.item
                ? "운영 시작 전에는 교육과정을 제외한 모든 정보를 변경할 수 있습니다."
                : "반에 포함할 교육과정은 생성할 때만 정할 수 있습니다."
          }
          onClose={() => setEditor(null)}
        >
          <form
            className="form-stack"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              saveMutation.mutate({
                item: editor.item,
                form: new FormData(event.currentTarget),
              });
            }}
          >
            <label className="field">
              <span>반 이름</span>
              <input
                name="name"
                required
                defaultValue={editor.item?.name ?? ""}
              />
            </label>
            {editor.item?.derivedStatus !== "OPERATING" && (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>시작일</span>
                    <input
                      name="startDate"
                      type="date"
                      required
                      defaultValue={editor.item?.startDate ?? ""}
                    />
                  </label>
                  <label className="field">
                    <span>종료일</span>
                    <input
                      name="endDate"
                      type="date"
                      required
                      defaultValue={editor.item?.endDate ?? ""}
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>정원</span>
                    <input
                      name="capacity"
                      type="number"
                      min={1}
                      required
                      defaultValue={editor.item?.capacity ?? 20}
                    />
                  </label>
                  <label className="field">
                    <span>강의실</span>
                    <input name="room" defaultValue={editor.item?.room ?? ""} />
                  </label>
                </div>
                {editor.item ? (
                  <div className="field">
                    <span>교육과정</span>
                    <p className="field-hint">
                      {editor.item.programs
                        .map(
                          (program) =>
                            `${program.name} · ${program.instructor.name}`,
                        )
                        .join(" / ")}
                    </p>
                    <p className="field-hint">
                      반 생성 후에는 교육과정을 변경할 수 없습니다. 구성이
                      잘못되었다면 이 반을 삭제하고 새로 만들어 주세요.
                    </p>
                  </div>
                ) : (
                  <fieldset className="field">
                    <legend>교육과정</legend>
                    {programs.map((program) => (
                      <label className="checkbox-label" key={program.id}>
                        <input
                          type="checkbox"
                          name="programIds"
                          value={program.id}
                        />{" "}
                        {program.name} · {program.instructor.name}
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
            {saveMutation.isError && (
              <p className="form-error">{errorMessage(saveMutation.error)}</p>
            )}
            <div className="dialog__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setEditor(null)}
              >
                취소
              </button>
              <button className="button button--primary" type="submit">
                저장
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
