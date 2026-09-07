import { Archive, ArchiveRestore, ChevronLeft, CirclePlus, Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { getEducationFields, getSubjects, type Subject } from "../education/education.api";
import { getActiveInstructors } from "../users/users.api";
import {
  changeProgramArchive,
  createProgram,
  getPrograms,
  updateProgram,
  type EducationProgram,
} from "./programs.api";

type Editor = { mode: "create" } | { mode: "edit"; item: EducationProgram } | null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function CoursesPage() {
  const client = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);

  const programsQuery = useQuery({
    queryKey: ["education-programs", showArchived],
    queryFn: () => getPrograms({ archived: showArchived }),
  });
  const fieldsQuery = useQuery({ queryKey: ["education-fields"], queryFn: getEducationFields });
  const subjectsQuery = useQuery({
    queryKey: ["education-program-subjects", fieldsQuery.data?.map((item) => item.id)],
    enabled: Boolean(fieldsQuery.data),
    queryFn: async () => {
      const groups = await Promise.all(
        (fieldsQuery.data ?? []).filter((field) => field.active).map(async (field) => ({
          field,
          subjects: (await getSubjects(field.id)).filter((subject) => subject.active),
        })),
      );
      return groups;
    },
  });
  const instructorsQuery = useQuery({
    queryKey: ["users", "active-instructors"],
    queryFn: getActiveInstructors,
  });

  const refresh = () => client.invalidateQueries({ queryKey: ["education-programs"] });
  const saveMutation = useMutation({
    mutationFn: async (payload: { item?: EducationProgram; form: FormData }) => {
      const name = String(payload.form.get("name") ?? "").trim();
      const instructorId = String(payload.form.get("instructorId") ?? "");
      if (payload.item) return updateProgram(payload.item.id, { name, instructorId });
      return createProgram({
        name,
        instructorId,
        primaryEducationFieldId: String(payload.form.get("primaryEducationFieldId") ?? ""),
        subjectIds: payload.form.getAll("subjectIds").map(String),
      });
    },
    onSuccess: async () => { setEditor(null); await refresh(); },
  });
  const archiveMutation = useMutation({
    mutationFn: (item: EducationProgram) => changeProgramArchive(item.id, !item.archived),
    onSuccess: async () => {
      setSelectedId(null);
      setMobileDetailOpen(false);
      await refresh();
    },
  });

  if (programsQuery.isLoading || fieldsQuery.isLoading || subjectsQuery.isLoading || instructorsQuery.isLoading) {
    return <LoadingState message="교육과정을 불러오고 있습니다." />;
  }
  if (programsQuery.isError || fieldsQuery.isError || subjectsQuery.isError || instructorsQuery.isError) {
    return <ErrorState message="교육과정 관리 정보를 불러오지 못했습니다." />;
  }

  const programs = programsQuery.data?.items ?? [];
  const instructors = instructorsQuery.data?.items ?? [];
  const subjectGroups = subjectsQuery.data ?? [];
  const selected = programs.find((item) => item.id === selectedId) ?? programs[0] ?? null;

  const submit = (event: FormEvent<HTMLFormElement>, item?: EducationProgram) => {
    event.preventDefault();
    saveMutation.mutate({ item, form: new FormData(event.currentTarget) });
  };

  return (
    <div
      className={`page-stack courses-page ${
        mobileDetailOpen ? "page--mobile-detail-open" : ""
      }`}
    >
      <header className="page-header">
        <div><h1>교육과정</h1><p>반을 만들 때 선택할 교육과정과 실제 담당 강사를 관리합니다.</p></div>
        <button className="button button--primary" type="button" onClick={() => setEditor({ mode: "create" })}>
          <CirclePlus size={18} /> 교육과정 추가
        </button>
      </header>

      <div className="segmented-control" aria-label="교육과정 목록 구분">
        <button className={`segmented-control__button ${!showArchived ? "segmented-control__button--active" : ""}`} type="button" onClick={() => { setShowArchived(false); setSelectedId(null); setMobileDetailOpen(false); }}>사용 중</button>
        <button className={`segmented-control__button ${showArchived ? "segmented-control__button--active" : ""}`} type="button" onClick={() => { setShowArchived(true); setSelectedId(null); setMobileDetailOpen(false); }}>보관됨</button>
      </div>

      {programs.length === 0 ? (
        <EmptyState title={showArchived ? "보관된 교육과정이 없습니다." : "교육과정이 없습니다."} description="교육 분야와 과목을 준비한 뒤 교육과정을 추가해 주세요." />
      ) : (
        <section className="master-detail-layout workbench-layout">
          <div className={`data-list card master-pane master-pane--list ${mobileDetailOpen ? "master-pane--mobile-hidden" : ""}`}>
            {programs.map((item) => (
              <button
                className={`selection-card ${selected?.id === item.id ? "selection-card--active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => { setSelectedId(item.id); setMobileDetailOpen(true); }}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.primaryEducationField.name} · {item.instructor.name}</small>
                </span>
                <span className="status-badge status-badge--neutral">반 {item.classCount}</span>
              </button>
            ))}
          </div>

          {selected && (
            <article className={`card program-detail master-pane master-pane--detail ${mobileDetailOpen ? "" : "master-pane--mobile-hidden"}`}>
              <button type="button" className="mobile-detail-back" onClick={() => setMobileDetailOpen(false)}>
                <ChevronLeft size={18} /> 교육과정 목록
              </button>
              <header className="card-header">
                <div>
                  <h2>{selected.name}</h2>
                  <p>{selected.primaryEducationField.name} · 담당 강사 {selected.instructor.name}</p>
                </div>
                <div className="cluster">
                  {!selected.archived && (
                    <button className="button button--secondary" type="button" onClick={() => setEditor({ mode: "edit", item: selected })}>
                      <Pencil size={16} /> 수정
                    </button>
                  )}
                  <button className="button button--secondary" type="button" onClick={() => archiveMutation.mutate(selected)} disabled={archiveMutation.isPending}>
                    {selected.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    {selected.archived ? "보관 해제" : "보관"}
                  </button>
                </div>
              </header>

              <div className="card-body">
                <section className="detail-section">
                  <h3>포함 과목</h3>
                  <ul className="program-subject-list">
                    {selected.subjects.map((subject) => (
                      <li key={subject.id}>
                        <span>{subject.educationFieldName}</span>
                        <strong>{subject.name}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
                <p className="muted program-detail__note">
                  사용 중인 반 {selected.classCount}개 · 생성 후 과목 구성은 변경할 수 없습니다.
                </p>
              </div>
            </article>
          )}
        </section>
      )}

      {editor && (
        <Modal title={editor.mode === "create" ? "교육과정 추가" : "교육과정 수정"} description={editor.mode === "create" ? "생성 후에는 이름과 담당 강사만 변경할 수 있습니다." : "과목이 잘못된 경우 이 과정을 보관하고 새로 생성해 주세요."} onClose={() => setEditor(null)}>
          <form className="form-stack" onSubmit={(event) => submit(event, editor.mode === "edit" ? editor.item : undefined)}>
            <label className="field"><span>교육과정명</span><input name="name" required maxLength={200} defaultValue={editor.mode === "edit" ? editor.item.name : ""} /></label>
            <label className="field"><span>담당 강사</span><select name="instructorId" required defaultValue={editor.mode === "edit" ? editor.item.instructor.id : ""}><option value="">선택</option>{instructors.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.loginId})</option>)}</select></label>
            {editor.mode === "create" && <>
              <label className="field"><span>기본 교육 분야</span><select name="primaryEducationFieldId" required defaultValue=""><option value="">선택</option>{(fieldsQuery.data ?? []).filter((field) => field.active).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
              <fieldset className="field"><legend>포함 과목</legend>{subjectGroups.map(({ field, subjects }) => <div key={field.id} className="detail-section"><h3>{field.name}</h3><div className="cluster">{subjects.map((subject: Subject) => <label key={subject.id} className="checkbox-label"><input type="checkbox" name="subjectIds" value={subject.id} /> {subject.name}</label>)}</div></div>)}</fieldset>
            </>}
            {saveMutation.isError && <p className="form-error">{errorMessage(saveMutation.error)}</p>}
            <div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => setEditor(null)}>취소</button><button className="button button--primary" type="submit" disabled={saveMutation.isPending}>저장</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
