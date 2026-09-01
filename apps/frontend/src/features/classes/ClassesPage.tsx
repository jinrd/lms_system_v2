import { CirclePlus, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
  getManagedClasses,
  removeManagedClass,
  updateManagedClass,
  type ManagedClass,
  type ManagedClassPage,
} from "./class-management.api";

const STATUS = {
  UPCOMING: { label: "운영 전", className: "status-badge--neutral" },
  OPERATING: { label: "운영 중", className: "status-badge--success" },
  ENDED: { label: "운영 종료", className: "status-badge--primary" },
} as const;

type Editor = { item?: ManagedClass } | null;
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function ClassesPage() {
  const client = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      await refresh();
    },
  });
  const removeMutation = useMutation({
    mutationFn: removeManagedClass,
    onSuccess: async (_result, removedId) => {
      setSelectedId(null);
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

  if (classesQuery.isLoading || programsQuery.isLoading)
    return <LoadingState message="반 정보를 불러오고 있습니다." />;
  if (classesQuery.isError || programsQuery.isError)
    return <ErrorState message="반 관리 정보를 불러오지 못했습니다." />;
  const items = classesQuery.data?.items ?? [];
  const programs = programsQuery.data?.items ?? [];
  const selected =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>반 관리</h1>
          <p>반에 교육과정을 연결하고 운영 기간과 시간표를 관리합니다.</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => setEditor({})}
        >
          <CirclePlus size={18} /> 반 추가
        </button>
      </header>
      <div className="cluster">
        <button
          className={`button ${showArchived ? "button--secondary" : "button--primary"}`}
          type="button"
          onClick={() => setShowArchived(false)}
        >
          기본 목록
        </button>
        <button
          className={`button ${showArchived ? "button--primary" : "button--secondary"}`}
          type="button"
          onClick={() => setShowArchived(true)}
        >
          보관된 반
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={
            showArchived ? "보관된 반이 없습니다." : "등록된 반이 없습니다."
          }
          description="교육과정을 준비한 뒤 실제 운영할 반을 추가해 주세요."
        />
      ) : (
        <div className="master-detail-layout">
          <section className="data-list">
            {items.map((item) => (
              <button
                className={`selection-card ${selected?.id === item.id ? "selection-card--active" : ""}`}
                type="button"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
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
          </section>
          {selected && (
            <div className="page-stack">
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
                            className={`button ${subject.active ? "button--primary" : "button--secondary"}`}
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
              {!selected.archived && (
                <ClassSchedulePanel classItem={selected} />
              )}
              {!selected.archived && (
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
