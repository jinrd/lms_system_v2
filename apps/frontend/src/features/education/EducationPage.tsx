import { BookOpen, ChevronLeft, ChevronRight, CirclePlus, Clock3, FileText, Layers3, Pencil, Power, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { Modal } from "../../components/ui/Modal";
import {
  changeEducationFieldActive, changeSubjectActive, createEducationField, createSubject,
  getEducationFields, getSubjects, updateEducationField, updateSubject,
  type EducationField, type EducationFieldInput, type Subject, type SubjectInput, type SubjectMode,
} from "./education.api";
import "./education.css";

type EditorState = { type: "field"; item?: EducationField } | { type: "subject"; item?: Subject } | null;
type MobileStage = "fields" | "subjects" | "detail";
type ActiveFilter = "" | "active" | "inactive";
const SUBJECT_MODE_LABELS: Record<SubjectMode, string> = { THEORY: "이론", PRACTICE: "실기", MIXED: "이론·실기" };

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function EducationPage() {
  const queryClient = useQueryClient();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<MobileStage>("fields");
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<"" | SubjectMode>("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("");
  const [editor, setEditor] = useState<EditorState>(null);

  const fieldsQuery = useQuery({ queryKey: ["education-fields"], queryFn: getEducationFields });
  const fields = fieldsQuery.data ?? [];
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0] ?? null;
  const effectiveFieldId = selectedField?.id ?? null;
  const subjectsQuery = useQuery({
    queryKey: ["education-fields", effectiveFieldId, "subjects"],
    queryFn: () => getSubjects(effectiveFieldId!),
    enabled: Boolean(effectiveFieldId),
  });
  const subjects = useMemo(() => subjectsQuery.data ?? [], [subjectsQuery.data]);
  const visibleSubjects = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase("ko-KR");
    return subjects.filter((subject) => {
      const matchesKeyword = !query || `${subject.name} ${subject.description ?? ""} ${subject.objective ?? ""}`.toLocaleLowerCase("ko-KR").includes(query);
      return matchesKeyword && (!mode || subject.mode === mode) && (!activeFilter || subject.active === (activeFilter === "active"));
    });
  }, [activeFilter, keyword, mode, subjects]);
  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? visibleSubjects[0] ?? null;

  const refreshFields = () => queryClient.invalidateQueries({ queryKey: ["education-fields"] });
  const refreshSubjects = () => queryClient.invalidateQueries({ queryKey: ["education-fields", effectiveFieldId, "subjects"] });
  const saveFieldMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: EducationFieldInput }) => id ? updateEducationField(id, input) : createEducationField(input),
    onSuccess: async (saved) => { setSelectedFieldId(saved.id); setSelectedSubjectId(null); setEditor(null); await refreshFields(); },
  });
  const toggleFieldMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => changeEducationFieldActive(id, active),
    onSuccess: async () => { setEditor(null); await refreshFields(); },
  });
  const saveSubjectMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SubjectInput }) => {
      if (!effectiveFieldId) throw new Error("교육 분야를 먼저 선택해 주세요.");
      return id ? updateSubject(effectiveFieldId, id, input) : createSubject(effectiveFieldId, input);
    },
    onSuccess: async (saved) => { setSelectedSubjectId(saved.id); setEditor(null); await refreshSubjects(); },
  });
  const toggleSubjectMutation = useMutation({
    mutationFn: ({ subjectId, active }: { subjectId: string; active: boolean }) => {
      if (!effectiveFieldId) throw new Error("교육 분야를 먼저 선택해 주세요.");
      return changeSubjectActive(effectiveFieldId, subjectId, active);
    },
    onSuccess: refreshSubjects,
  });

  const handleFieldSubmit = (event: FormEvent<HTMLFormElement>, item?: EducationField) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    saveFieldMutation.mutate({ id: item?.id, input: { name: String(data.get("name") ?? "").trim(), description: optionalString(data, "description"), displayOrder: Number(data.get("displayOrder")), active: true } });
  };
  const handleSubjectSubmit = (event: FormEvent<HTMLFormElement>, item?: Subject) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const duration = String(data.get("defaultDurationMinutes") ?? "");
    saveSubjectMutation.mutate({ id: item?.id, input: { name: String(data.get("name") ?? "").trim(), description: optionalString(data, "description"), objective: optionalString(data, "objective"), mode: String(data.get("mode")) as SubjectMode, defaultDurationMinutes: duration ? Number(duration) : undefined, displayOrder: Number(data.get("displayOrder")), active: true } });
  };
  const chooseField = (field: EducationField) => { setSelectedFieldId(field.id); setSelectedSubjectId(null); setKeyword(""); setMode(""); setActiveFilter(""); setMobileStage("subjects"); };
  const toggleSubject = (subject: Subject) => { const active = !subject.active; if (window.confirm(`${subject.name}을(를) ${active ? "사용" : "미사용"} 상태로 변경하시겠습니까?`)) toggleSubjectMutation.mutate({ subjectId: subject.id, active }); };

  if (fieldsQuery.isLoading) return <LoadingState message="교육 분야를 불러오고 있습니다." />;
  if (fieldsQuery.isError) return <ErrorState message={getErrorMessage(fieldsQuery.error)} onRetry={() => void fieldsQuery.refetch()} />;

  return <div className={`page-stack education-page education-page--${mobileStage}`}>
    <header className="page-header education-page-header"><div><h1>교육 분야·과목</h1><p>교육 체계를 분야별로 분류하고 실제 수업에 사용하는 과목을 관리합니다.</p></div></header>
    <section className={`education-workbench education-workbench--${mobileStage}`}>
      <aside className="surface-card education-field-pane">
        <header className="education-pane-header"><div><h2>교육 분야</h2><span>{fields.length}</span></div><button type="button" className="button button--primary button--compact" onClick={() => setEditor({ type: "field" })}><CirclePlus size={15} /> 분야 추가</button></header>
        {fields.length === 0 ? <EmptyState title="등록된 교육 분야가 없습니다." description="첫 번째 교육 분야를 추가해 주세요." /> : <nav className="education-field-list" aria-label="교육 분야 목록">{fields.map((field) => <button type="button" key={field.id} className={`education-field-item ${field.id === effectiveFieldId ? "education-field-item--selected" : ""}`} aria-current={field.id === effectiveFieldId ? "true" : undefined} onClick={() => chooseField(field)}><span className="education-field-item__icon"><BookOpen size={17} /></span><span><strong>{field.name}</strong><small>{field.description || "분야 설명 없음"}</small></span><i className={field.active ? "is-active" : ""} aria-label={field.active ? "사용 중" : "미사용"} /><ChevronRight size={15} /></button>)}</nav>}
        {selectedField && <footer className="education-field-footer"><button type="button" className="button button--secondary" onClick={() => setEditor({ type: "field", item: selectedField })}><Pencil size={15} /> 선택 분야 수정</button></footer>}
      </aside>

      <main className="surface-card education-subject-pane">
        <button type="button" className="mobile-detail-back" onClick={() => setMobileStage("fields")}><ChevronLeft size={18} /> 교육 분야</button>
        <header className="education-pane-header education-subject-header"><div><span className="education-pane-eyebrow">선택 분야</span><h2>{selectedField?.name ?? "과목 목록"}</h2><p>등록 과목 {subjects.length}개</p></div>{selectedField && <button type="button" className="button button--primary button--compact" onClick={() => setEditor({ type: "subject" })}><CirclePlus size={15} /> 과목 추가</button>}</header>
        {selectedField && <div className="education-subject-toolbar"><label className="education-search"><Search size={16} /><span className="sr-only">과목 검색</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="과목명, 설명 검색" /></label><label><span className="sr-only">교육 방식</span><select value={mode} onChange={(event) => setMode(event.target.value as "" | SubjectMode)}><option value="">전체 방식</option><option value="THEORY">이론</option><option value="PRACTICE">실기</option><option value="MIXED">이론·실기</option></select></label><label><span className="sr-only">사용 여부</span><select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}><option value="">사용 여부</option><option value="active">사용 중</option><option value="inactive">미사용</option></select></label></div>}
        {subjectsQuery.isLoading ? <LoadingState message="과목을 불러오고 있습니다." /> : subjectsQuery.isError ? <ErrorState message={getErrorMessage(subjectsQuery.error)} onRetry={() => void subjectsQuery.refetch()} /> : !selectedField ? <EmptyState title="교육 분야를 선택하세요." description="왼쪽 목록에서 과목을 확인할 분야를 선택해 주세요." /> : visibleSubjects.length === 0 ? <EmptyState title={subjects.length ? "조건에 맞는 과목이 없습니다." : "등록된 과목이 없습니다."} description={subjects.length ? "검색어나 필터를 변경해 주세요." : "선택한 분야에 첫 과목을 추가해 주세요."} /> : <div className="education-subject-table" role="table" aria-label={`${selectedField.name} 과목 목록`}><div className="education-subject-table__head" role="row"><span>과목명</span><span>교육 방식</span><span>기본 시간</span><span>사용 여부</span></div><div className="education-subject-table__body">{visibleSubjects.map((subject) => <button type="button" role="row" key={subject.id} className={`education-subject-row ${subject.id === selectedSubject?.id ? "education-subject-row--selected" : ""}`} onClick={() => { setSelectedSubjectId(subject.id); setMobileStage("detail"); }}><span className="education-subject-row__name" role="cell"><strong>{subject.name}</strong><small>{subject.description || "과목 설명 없음"}</small></span><span role="cell"><em className="education-mode-badge">{SUBJECT_MODE_LABELS[subject.mode]}</em></span><span role="cell">{subject.defaultDurationMinutes ? `${subject.defaultDurationMinutes}분` : "미설정"}</span><span role="cell"><em className={`status-badge ${subject.active ? "status-badge--success" : "status-badge--neutral"}`}>{subject.active ? "사용 중" : "미사용"}</em><ChevronRight size={15} /></span></button>)}</div></div>}
      </main>

      <aside className="surface-card education-detail-pane">
        <button type="button" className="mobile-detail-back" onClick={() => setMobileStage("subjects")}><ChevronLeft size={18} /> 과목 목록</button>
        {selectedSubject && selectedField ? <><header className="education-detail-header"><div className="education-detail-header__badges"><span className={`status-badge ${selectedSubject.active ? "status-badge--success" : "status-badge--neutral"}`}>{selectedSubject.active ? "사용 중" : "미사용"}</span><span>{SUBJECT_MODE_LABELS[selectedSubject.mode]}</span></div><h2>{selectedSubject.name}</h2><p>{selectedField.name}</p></header><div className="education-detail-body"><dl className="education-detail-meta"><div><dt><Layers3 size={15} /> 교육 방식</dt><dd>{SUBJECT_MODE_LABELS[selectedSubject.mode]}</dd></div><div><dt><Clock3 size={15} /> 기본 교육 시간</dt><dd>{selectedSubject.defaultDurationMinutes ? `${selectedSubject.defaultDurationMinutes}분` : "미설정"}</dd></div><div><dt><FileText size={15} /> 표시 순서</dt><dd>{selectedSubject.displayOrder}</dd></div></dl><section className="education-detail-copy"><h3>과목 설명</h3><p>{selectedSubject.description || "등록된 설명이 없습니다."}</p></section><section className="education-detail-copy"><h3>교육 목표</h3><p>{selectedSubject.objective || "등록된 교육 목표가 없습니다."}</p></section></div><footer className="education-detail-actions"><button type="button" className="button button--secondary" onClick={() => toggleSubject(selectedSubject)} disabled={toggleSubjectMutation.isPending}><Power size={15} />{selectedSubject.active ? "미사용 처리" : "사용 재개"}</button><button type="button" className="button button--primary" onClick={() => setEditor({ type: "subject", item: selectedSubject })}><Pencil size={15} /> 과목 수정</button></footer></> : <div className="education-detail-empty"><BookOpen size={26} /><strong>과목을 선택하세요</strong><p>과목의 상세 정보와 관리 기능이 여기에 표시됩니다.</p></div>}
      </aside>
    </section>

    {editor?.type === "field" && <Modal title={editor.item ? "교육 분야 수정" : "교육 분야 추가"} description="분야명과 화면 표시 순서를 입력합니다." onClose={() => setEditor(null)}><form className="stack education-editor-form" onSubmit={(event) => handleFieldSubmit(event, editor.item)}><label className="form-field form-field--flush"><span>교육 분야명</span><input name="name" defaultValue={editor.item?.name} maxLength={100} required /></label><label className="form-field"><span>설명</span><textarea name="description" defaultValue={editor.item?.description ?? ""} rows={4} /></label><label className="form-field"><span>표시 순서</span><input name="displayOrder" type="number" min={0} defaultValue={editor.item?.displayOrder ?? fields.length + 1} required /></label>{saveFieldMutation.isError && <div className="form-alert" role="alert">{getErrorMessage(saveFieldMutation.error)}</div>}<div className="dialog__actions dialog__actions--split"><div className="dialog__action-group">{editor.item && <button type="button" className={`button ${editor.item.active ? "button--danger" : "button--secondary"}`} disabled={toggleFieldMutation.isPending} onClick={() => { const active = !editor.item!.active; if (window.confirm(`${editor.item!.name}을(를) ${active ? "사용" : "미사용"} 상태로 변경하시겠습니까?`)) toggleFieldMutation.mutate({ id: editor.item!.id, active }); }}><Power size={16} />{editor.item.active ? "분야 미사용 처리" : "분야 사용"}</button>}</div><div className="dialog__action-group"><button type="button" className="button button--secondary" onClick={() => setEditor(null)}>취소</button><button type="submit" className="button button--primary" disabled={saveFieldMutation.isPending}>{saveFieldMutation.isPending ? "저장 중..." : "저장"}</button></div></div></form></Modal>}
    {editor?.type === "subject" && selectedField && <Modal title={editor.item ? "과목 수정" : "과목 추가"} description={`${selectedField.name} 분야의 과목을 설정합니다.`} onClose={() => setEditor(null)}><form className="stack education-editor-form" onSubmit={(event) => handleSubjectSubmit(event, editor.item)}><div className="form-grid"><label className="form-field form-field--flush"><span>과목명</span><input name="name" defaultValue={editor.item?.name} maxLength={150} required /></label><label className="form-field form-field--flush"><span>교육 방식</span><select name="mode" defaultValue={editor.item?.mode ?? "MIXED"} required><option value="THEORY">이론</option><option value="PRACTICE">실기</option><option value="MIXED">이론·실기</option></select></label></div><label className="form-field"><span>설명</span><textarea name="description" defaultValue={editor.item?.description ?? ""} rows={3} /></label><label className="form-field"><span>교육 목표</span><textarea name="objective" defaultValue={editor.item?.objective ?? ""} rows={3} /></label><div className="form-grid"><label className="form-field form-field--flush"><span>기본 교육 시간(분)</span><input name="defaultDurationMinutes" type="number" min={1} defaultValue={editor.item?.defaultDurationMinutes ?? undefined} /></label><label className="form-field form-field--flush"><span>표시 순서</span><input name="displayOrder" type="number" min={0} defaultValue={editor.item?.displayOrder ?? subjects.length + 1} required /></label></div>{saveSubjectMutation.isError && <div className="form-alert" role="alert">{getErrorMessage(saveSubjectMutation.error)}</div>}<div className="dialog__actions"><button type="button" className="button button--secondary" onClick={() => setEditor(null)}>취소</button><button type="submit" className="button button--primary" disabled={saveSubjectMutation.isPending}>{saveSubjectMutation.isPending ? "저장 중..." : "저장"}</button></div></form></Modal>}
  </div>;
}
