import { Archive, ArchiveRestore, BookOpen, CalendarDays, ChevronLeft, ChevronRight, CirclePlus, GraduationCap, Pencil, Search, UserRound, UsersRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { getEducationFields, getSubjects, type Subject } from "../education/education.api";
import { getActiveInstructors } from "../users/users.api";
import { changeProgramArchive, createProgram, getPrograms, updateProgram, type EducationProgram } from "./programs.api";
import "./courses.css";

type Editor = { mode: "create" } | { mode: "edit"; item: EducationProgram } | null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export function CoursesPage() {
  const client = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [fieldId, setFieldId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);

  const programsQuery = useQuery({ queryKey: ["education-programs", showArchived], queryFn: () => getPrograms({ archived: showArchived }) });
  const fieldsQuery = useQuery({ queryKey: ["education-fields"], queryFn: getEducationFields });
  const subjectsQuery = useQuery({
    queryKey: ["education-program-subjects", fieldsQuery.data?.map((item) => item.id)],
    enabled: Boolean(fieldsQuery.data),
    queryFn: async () => Promise.all((fieldsQuery.data ?? []).filter((field) => field.active).map(async (field) => ({ field, subjects: (await getSubjects(field.id)).filter((subject) => subject.active) }))),
  });
  const instructorsQuery = useQuery({ queryKey: ["users", "active-instructors"], queryFn: getActiveInstructors });

  const programs = useMemo(() => programsQuery.data?.items ?? [], [programsQuery.data?.items]);
  const instructors = instructorsQuery.data?.items ?? [];
  const subjectGroups = subjectsQuery.data ?? [];
  const visiblePrograms = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase("ko-KR");
    return programs.filter((program) => {
      const matchesKeyword = !query || `${program.name} ${program.primaryEducationField.name} ${program.instructor.name}`.toLocaleLowerCase("ko-KR").includes(query);
      return matchesKeyword && (!fieldId || program.primaryEducationField.id === fieldId) && (!instructorId || program.instructor.id === instructorId);
    });
  }, [fieldId, instructorId, keyword, programs]);
  const selected = programs.find((item) => item.id === selectedId) ?? visiblePrograms[0] ?? null;

  const refresh = () => client.invalidateQueries({ queryKey: ["education-programs"] });
  const saveMutation = useMutation({
    mutationFn: async ({ item, form }: { item?: EducationProgram; form: FormData }) => {
      const name = String(form.get("name") ?? "").trim();
      const nextInstructorId = String(form.get("instructorId") ?? "");
      if (item) return updateProgram(item.id, { name, instructorId: nextInstructorId });
      return createProgram({ name, instructorId: nextInstructorId, primaryEducationFieldId: String(form.get("primaryEducationFieldId") ?? ""), subjectIds: form.getAll("subjectIds").map(String) });
    },
    onSuccess: async (saved) => { setSelectedId(saved.id); setEditor(null); await refresh(); },
  });
  const archiveMutation = useMutation({
    mutationFn: (item: EducationProgram) => changeProgramArchive(item.id, !item.archived),
    onSuccess: async () => { setSelectedId(null); setMobileDetailOpen(false); await refresh(); },
  });

  if (programsQuery.isLoading || fieldsQuery.isLoading || subjectsQuery.isLoading || instructorsQuery.isLoading) return <LoadingState message="교육과정을 불러오고 있습니다." />;
  if (programsQuery.isError || fieldsQuery.isError || subjectsQuery.isError || instructorsQuery.isError) return <ErrorState message="교육과정 관리 정보를 불러오지 못했습니다." />;

  const submit = (event: FormEvent<HTMLFormElement>, item?: EducationProgram) => {
    event.preventDefault(); saveMutation.mutate({ item, form: new FormData(event.currentTarget) });
  };
  const resetSelection = () => { setSelectedId(null); setMobileDetailOpen(false); };

  return <div className={`page-stack courses-page ${mobileDetailOpen ? "courses-page--detail" : ""}`}>
    <header className="page-header courses-page-header">
      <div><h1>교육과정</h1><p>목적에 맞는 과정 구성과 운영 현황을 한눈에 관리합니다.</p></div>
      <button className="button button--primary" type="button" onClick={() => setEditor({ mode: "create" })}><CirclePlus size={17} /> 교육과정 등록</button>
    </header>

    <section className="courses-toolbar" aria-label="교육과정 필터">
      <label><span className="sr-only">운영 상태</span><select value={showArchived ? "archived" : "active"} onChange={(event) => { setShowArchived(event.target.value === "archived"); resetSelection(); }}><option value="active">운영 중</option><option value="archived">보관됨</option></select></label>
      <label><span className="sr-only">교육 분야</span><select value={fieldId} onChange={(event) => { setFieldId(event.target.value); resetSelection(); }}><option value="">전체 분야</option>{(fieldsQuery.data ?? []).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
      <label><span className="sr-only">담당 강사</span><select value={instructorId} onChange={(event) => { setInstructorId(event.target.value); resetSelection(); }}><option value="">전체 강사</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select></label>
      <label className="courses-search"><Search size={16} /><span className="sr-only">교육과정 검색</span><input value={keyword} onChange={(event) => { setKeyword(event.target.value); resetSelection(); }} placeholder="과정명, 분야, 강사 검색" /></label>
    </section>

    {programs.length === 0 ? <EmptyState title={showArchived ? "보관된 교육과정이 없습니다." : "교육과정이 없습니다."} description="교육 분야와 과목을 준비한 뒤 교육과정을 추가해 주세요." /> : <section className={`courses-workbench ${mobileDetailOpen ? "courses-workbench--detail" : ""}`}>
      <main className="surface-card courses-list-pane">
        <header className="courses-list-summary"><strong>교육과정 <span>{visiblePrograms.length}</span></strong><small>{showArchived ? "보관된 과정" : "현재 운영 가능한 과정"}</small></header>
        {visiblePrograms.length === 0 ? <EmptyState title="조건에 맞는 교육과정이 없습니다." description="검색어나 필터를 변경해 주세요." /> : <div className="courses-table" role="table" aria-label="교육과정 목록">
          <div className="courses-table__head" role="row"><span>과정명</span><span>분야</span><span>담당 강사</span><span>과목 수</span><span>상태</span></div>
          <div className="courses-table__body">{visiblePrograms.map((program) => <button type="button" role="row" key={program.id} className={`courses-row ${selected?.id === program.id ? "courses-row--selected" : ""}`} onClick={() => { setSelectedId(program.id); setMobileDetailOpen(true); }}><span className="courses-row__name" role="cell"><strong>{program.name}</strong><small>연결된 반 {program.classCount}개</small></span><span role="cell">{program.primaryEducationField.name}</span><span role="cell">{program.instructor.name}</span><span role="cell">{program.subjects.length}개</span><span role="cell"><em className={`status-badge ${program.archived ? "status-badge--neutral" : "status-badge--success"}`}>{program.archived ? "보관" : "운영 중"}</em><ChevronRight size={15} /></span></button>)}</div>
        </div>}
      </main>

      <aside className="surface-card courses-detail-pane">
        <button type="button" className="mobile-detail-back" onClick={() => setMobileDetailOpen(false)}><ChevronLeft size={18} /> 교육과정 목록</button>
        {selected ? <><header className="courses-detail-header"><div className="courses-detail-header__status"><span className={`status-badge ${selected.archived ? "status-badge--neutral" : "status-badge--success"}`}>{selected.archived ? "보관" : "운영 중"}</span></div><h2>{selected.name}</h2><p>{selected.primaryEducationField.name}</p></header>
          <div className="courses-detail-body">
            <dl className="courses-detail-meta"><div><dt><BookOpen size={15} /> 기본 교육 분야</dt><dd>{selected.primaryEducationField.name}</dd></div><div><dt><UserRound size={15} /> 담당 강사</dt><dd>{selected.instructor.name}</dd></div><div><dt><UsersRound size={15} /> 연결된 반</dt><dd>{selected.classCount}개</dd></div><div><dt><CalendarDays size={15} /> 등록일</dt><dd>{formatDate(selected.createdAt)}</dd></div></dl>
            <section className="courses-subject-section"><header><div><span>구성 과목</span><strong>{selected.subjects.length}</strong></div><small>생성 후에는 변경할 수 없습니다.</small></header>{selected.subjects.length === 0 ? <p className="courses-subject-empty">구성된 과목이 없습니다.</p> : <ol>{selected.subjects.map((subject, index) => <li key={subject.id}><span>{index + 1}</span><div><strong>{subject.name}</strong><small>{subject.educationFieldName}</small></div></li>)}</ol>}</section>
          </div>
          <footer className="courses-detail-actions">{!selected.archived && <button className="button button--primary" type="button" onClick={() => setEditor({ mode: "edit", item: selected })}><Pencil size={15} /> 과정 수정</button>}<button className="button button--secondary" type="button" onClick={() => archiveMutation.mutate(selected)} disabled={archiveMutation.isPending}>{selected.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{selected.archived ? "보관 해제" : "과정 보관"}</button></footer>
        </> : <div className="courses-detail-empty"><GraduationCap size={28} /><strong>교육과정을 선택하세요</strong><p>과정의 담당 강사와 구성 과목이 여기에 표시됩니다.</p></div>}
      </aside>
    </section>}

    {editor && <Modal title={editor.mode === "create" ? "교육과정 등록" : "교육과정 수정"} description={editor.mode === "create" ? "과정을 만들 때 기본 분야와 과목 구성을 확정합니다." : "과정명과 담당 강사를 변경합니다."} onClose={() => setEditor(null)}><form className="form-stack courses-editor" onSubmit={(event) => submit(event, editor.mode === "edit" ? editor.item : undefined)}><label className="field"><span>교육과정명</span><input name="name" required maxLength={200} defaultValue={editor.mode === "edit" ? editor.item.name : ""} /></label><label className="field"><span>담당 강사</span><select name="instructorId" required defaultValue={editor.mode === "edit" ? editor.item.instructor.id : ""}><option value="">선택</option>{instructors.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.loginId})</option>)}</select></label>{editor.mode === "create" && <><label className="field"><span>기본 교육 분야</span><select name="primaryEducationFieldId" required defaultValue=""><option value="">선택</option>{(fieldsQuery.data ?? []).filter((field) => field.active).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><fieldset className="field courses-subject-picker"><legend>포함 과목</legend>{subjectGroups.map(({ field, subjects }) => <section key={field.id}><h3>{field.name}</h3><div>{subjects.map((subject: Subject) => <label key={subject.id}><input type="checkbox" name="subjectIds" value={subject.id} /><span>{subject.name}</span></label>)}</div></section>)}</fieldset></>}{saveMutation.isError && <p className="form-error">{errorMessage(saveMutation.error)}</p>}<div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => setEditor(null)}>취소</button><button className="button button--primary" type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "저장 중..." : "저장"}</button></div></form></Modal>}
  </div>;
}
