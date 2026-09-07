import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ClipboardPen,
  FileText,
  LockKeyhole,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { getInstructorClasses, getManagedClasses } from "../classes/class-management.api";
import { getPrograms } from "../courses/programs.api";
import { getExamTemplates, type ExamTemplate } from "../exam-templates/exam-templates.api";
import { PART_LABELS, SCOPE_LABELS, STAGE_LABELS } from "../exam-templates/exam-template.utils";
import { getQuestions, type Question } from "../questions/questions.api";
import {
  createExam,
  addExamTarget,
  cancelExam,
  deleteExamPart,
  getExam,
  getExamCriteria,
  getExamQuestions,
  getExamTargets,
  getExams,
  replaceExamCriteria,
  rebuildExamTargets,
  replaceExamQuestions,
  removeExamTarget,
  scheduleExam,
  saveExamPart,
  lockExamTargets,
  updateExam,
  validateExam,
  type CreateExamInput,
  type Exam,
  type ExamCriterionInput,
  type ExamPartInput,
  type ExamPartType,
  type ExamQuestionInput,
  type ExamScope,
  type ExamStage,
  type ExamStatus,
  type ExamScheduleValidationResult,
  type UpdateExamInput,
} from "./exams.api";
import "./exams.css";

const STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: "초안",
  SCHEDULED: "예약",
  OPEN: "응시 중",
  CLOSED: "응시 종료",
  GRADING: "채점 중",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const STATUS_CLASSES: Record<ExamStatus, string> = {
  DRAFT: "status-badge--neutral",
  SCHEDULED: "status-badge--info",
  OPEN: "status-badge--success",
  CLOSED: "status-badge--warning",
  GRADING: "status-badge--primary",
  COMPLETED: "status-badge--success",
  CANCELED: "status-badge--danger",
};

function readError(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function localInput(value: string) {
  const date = new Date(value);
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return seoul.toISOString().slice(0, 16);
}

function iso(value: FormDataEntryValue | null) {
  return new Date(String(value)).toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type ProgramOption = { id: string; name: string; subjects: Array<{ subjectId: string; name: string }> };
type ClassOption = { id: string; name: string; courseOfferingIds: string[] };

export function ExamsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const management = user?.role !== "INSTRUCTOR";
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<ExamStatus | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [partEditor, setPartEditor] = useState<ExamPartType | null>(null);
  const [notice, setNotice] = useState("");

  const list = useQuery({
    queryKey: ["exams", { page, keyword, status }],
    queryFn: () => getExams({ page, limit: 20, keyword: keyword || undefined, status: status || undefined }),
    placeholderData: (previous) => previous,
  });
  const id = selectedId ?? list.data?.items[0]?.id ?? null;
  const detail = useQuery({ queryKey: ["exam", id], queryFn: () => getExam(id!), enabled: Boolean(id) });
  const templates = useQuery({ queryKey: ["exam-source-templates"], queryFn: () => getExamTemplates({ page: 1, limit: 100, active: true }) });
  const programs = useQuery({
    queryKey: ["exam-program-options", user?.id],
    queryFn: async (): Promise<ProgramOption[]> => {
      if (management) {
        const response = await getPrograms({ page: 1, limit: 100 });
        return response.items.map((program) => ({ id: program.id, name: program.name, subjects: program.subjects.map((subject) => ({ subjectId: subject.subjectId, name: subject.name })) }));
      }
      const rows = await getInstructorClasses();
      return [...new Map(rows.map((row) => [row.courseOfferingId, { id: row.courseOfferingId, name: row.courseOfferingName, subjects: [] }])).values()];
    },
  });
  const classes = useQuery({
    queryKey: ["exam-class-options", user?.id],
    queryFn: async (): Promise<ClassOption[]> => {
      if (management) {
        const response = await getManagedClasses(false);
        return response.items.map((item) => ({ id: item.id, name: item.name, courseOfferingIds: item.programs.map((program) => program.courseOfferingId) }));
      }
      const rows = await getInstructorClasses();
      return [...new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, courseOfferingIds: [row.courseOfferingId] }])).values()];
    },
  });

  const save = useMutation({
    mutationFn: (input: CreateExamInput | { id: string; update: UpdateExamInput }) => "id" in input ? updateExam(input.id, input.update) : createExam(input),
    onSuccess: (saved) => {
      client.setQueryData(["exam", saved.id], saved);
      void client.invalidateQueries({ queryKey: ["exams"] });
      setSelectedId(saved.id);
      setEditor(null);
      setMobileOpen(true);
      setNotice("시험 정보를 저장했습니다.");
    },
  });
  const savePart = useMutation({
    mutationFn: ({ examId, type, input }: { examId: string; type: ExamPartType; input: ExamPartInput }) => saveExamPart(examId, type, input),
    onSuccess: (saved) => {
      client.setQueryData(["exam", saved.id], saved);
      void client.invalidateQueries({ queryKey: ["exams"] });
      setPartEditor(null);
      setNotice("시험 파트를 저장했습니다.");
    },
  });
  const removePart = useMutation({
    mutationFn: ({ examId, type }: { examId: string; type: ExamPartType }) => deleteExamPart(examId, type),
    onSuccess: (saved) => {
      client.setQueryData(["exam", saved.id], saved);
      void client.invalidateQueries({ queryKey: ["exams"] });
      setNotice("시험 파트를 삭제했습니다.");
    },
  });

  return (
    <div className={`page-stack exams-page ${mobileOpen ? "page--mobile-detail-open" : ""}`}>
      <header className="page-header">
        <div><h1>시험 운영</h1><p>템플릿을 실제 교육과정과 반에 연결하고 응시 구성을 확정합니다.</p></div>
        <button type="button" className="button button--primary" onClick={() => { setEditor("create"); setMobileOpen(true); setNotice(""); }}><CirclePlus size={18} />새 시험</button>
      </header>
      <form className="filter-bar exam-filters" role="search" onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput.trim()); setPage(1); }}>
        <label className="form-field"><span>시험 제목</span><div className="template-search-input"><Search size={17} /><input type="search" value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="제목으로 검색" /></div></label>
        <label className="form-field"><span>상태</span><select value={status} onChange={(event) => { setStatus(event.target.value as ExamStatus | ""); setPage(1); }}><option value="">전체 상태</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" className="button button--secondary">검색</button>
      </form>
      {notice && <p className="form-success" role="status">{notice}</p>}
      <section className="master-detail-layout workbench-layout exam-workbench">
        <section className={`surface-card master-pane master-pane--list exam-list-pane ${mobileOpen ? "master-pane--mobile-hidden" : ""}`} aria-label="시험 목록">
          <header className="card-header"><div><h2>시험 목록</h2><p>{list.data ? `총 ${list.data.pagination.total}개` : "목록을 불러오는 중"}</p></div><ClipboardPen size={20} /></header>
          {list.isPending ? <LoadingState message="시험을 불러오는 중입니다." /> : list.isError ? <ErrorState message={readError(list.error)} onRetry={() => void list.refetch()} /> : list.data?.items.length === 0 ? <EmptyState title="등록된 시험이 없습니다." description="새 시험을 눌러 첫 시험 초안을 만드세요." /> : <div className="exam-list">{list.data?.items.map((exam) => <button type="button" key={exam.id} aria-pressed={id === exam.id && !editor} className={`exam-list-item ${id === exam.id && !editor ? "exam-list-item--selected" : ""}`} onClick={() => { setSelectedId(exam.id); setEditor(null); setPartEditor(null); setMobileOpen(true); setNotice(""); }}><span><span>{STAGE_LABELS[exam.stage]} · {SCOPE_LABELS[exam.scope]}</span><ExamStatusBadge status={exam.status} /></span><strong>{exam.title}</strong><small>{exam.courseOfferingName}</small><span><time>{formatDateTime(exam.opensAt)}</time><ChevronRight size={16} /></span></button>)}</div>}
          {(list.data?.pagination.totalPages ?? 0) > 1 && <nav className="pagination" aria-label="시험 목록 페이지"><button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} />이전</button><span>{page} / {list.data?.pagination.totalPages}</span><button type="button" className="button button--secondary" disabled={page >= (list.data?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>다음<ChevronRight size={16} /></button></nav>}
        </section>
        <div className={`master-pane master-pane--detail exam-detail-pane ${mobileOpen ? "" : "master-pane--mobile-hidden"}`}>
          <button type="button" className="mobile-detail-back" onClick={() => { if (editor || partEditor) { setEditor(null); setPartEditor(null); } else setMobileOpen(false); }}><ChevronLeft size={18} />{editor || partEditor ? "편집 닫기" : "시험 목록"}</button>
          {editor ? <ExamEditor exam={editor === "edit" ? detail.data : undefined} programs={programs.data ?? []} classes={classes.data ?? []} templates={templates.data?.items ?? []} pending={save.isPending} error={save.isError ? readError(save.error) : ""} onCancel={() => setEditor(null)} onSubmit={(input) => save.mutate(editor === "edit" && detail.data ? { id: detail.data.id, update: input as UpdateExamInput } : input as CreateExamInput)} /> : detail.isPending && id ? <LoadingState message="시험 상세를 불러오는 중입니다." /> : detail.isError ? <ErrorState message={readError(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data ? partEditor ? <ExamPartEditor exam={detail.data} type={partEditor} pending={savePart.isPending} error={savePart.isError ? readError(savePart.error) : ""} onCancel={() => setPartEditor(null)} onSubmit={(input) => savePart.mutate({ examId: detail.data!.id, type: partEditor, input })} /> : <ExamDetail exam={detail.data} onEdit={() => setEditor("edit")} onPart={setPartEditor} onDeletePart={(type) => removePart.mutate({ examId: detail.data!.id, type })} /> : <div className="surface-card"><EmptyState title="시험을 선택하세요" description="목록에서 시험을 선택하거나 새 시험을 만드세요." /></div>}
        </div>
      </section>
    </div>
  );
}

function ExamStatusBadge({ status }: { status: ExamStatus }) {
  return <span className={`status-badge ${STATUS_CLASSES[status]}`}>{STATUS_LABELS[status]}</span>;
}

function ExamEditor({ exam, programs, classes, templates, pending, error, onCancel, onSubmit }: { exam?: Exam; programs: ProgramOption[]; classes: ClassOption[]; templates: ExamTemplate[]; pending: boolean; error: string; onCancel: () => void; onSubmit: (input: CreateExamInput | UpdateExamInput) => void }) {
  const [programId, setProgramId] = useState(exam?.courseOfferingId ?? programs[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [scope, setScope] = useState<ExamScope>(exam?.scope ?? "SUBJECT");
  const [stage, setStage] = useState<ExamStage>(exam?.stage ?? "REGULAR");
  const effectiveProgramId = programId || programs[0]?.id || "";
  const program = programs.find((item) => item.id === effectiveProgramId);
  const [subjectIds, setSubjectIds] = useState(exam?.subjects.map((item) => item.subjectId) ?? []);
  const [classIds, setClassIds] = useState(exam?.classTargets.map((item) => item.classId) ?? []);
  const availableClasses = classes.filter((item) => item.courseOfferingIds.includes(effectiveProgramId));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const base = { title: String(data.get("title")).trim(), description: String(data.get("description")).trim() || undefined, scope, stage, opensAt: iso(data.get("opensAt")), closesAt: iso(data.get("closesAt")) };
    if (new Date(base.opensAt) >= new Date(base.closesAt)) return;
    onSubmit(exam ? { ...base, subjectIds, classTargetIds: classIds } : { ...base, courseOfferingId: effectiveProgramId, sourceTemplateId: templateId || undefined });
  };
  return <section className="surface-card exam-editor"><header className="card-header"><div><h2>{exam ? "시험 정보 수정" : "새 시험 만들기"}</h2><p>{exam ? "응시 기간과 대상 과목·반을 조정합니다." : "교육과정과 템플릿을 골라 실제 시험 초안을 만듭니다."}</p></div></header><form className="card-body exam-form" onSubmit={submit}><fieldset disabled={pending}><label className="form-field"><span>시험 제목</span><input name="title" maxLength={200} defaultValue={exam?.title ?? ""} required /></label><label className="form-field"><span>설명</span><textarea name="description" maxLength={10000} rows={3} defaultValue={exam?.description ?? ""} /></label><div className="form-grid"><label className="form-field"><span>교육과정</span><select value={effectiveProgramId} disabled={Boolean(exam)} onChange={(event) => { setProgramId(event.target.value); setClassIds([]); setSubjectIds([]); }} required>{programs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{!exam && <label className="form-field"><span>시험 템플릿 <small>(선택)</small></span><select value={templateId} onChange={(event) => { const nextId = event.target.value; const next = templates.find((item) => item.id === nextId); setTemplateId(nextId); if (next) { setScope(next.scope); setStage(next.stage); } }}><option value="">빈 초안으로 시작</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div><div className="form-grid"><label className="form-field"><span>시험 범위</span><select name="scope" value={scope} onChange={(event) => setScope(event.target.value as ExamScope)}>{Object.entries(SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>시험 단계</span><select name="stage" value={stage} onChange={(event) => setStage(event.target.value as ExamStage)}>{Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>응시 시작</span><input name="opensAt" type="datetime-local" defaultValue={exam ? localInput(exam.opensAt) : ""} required /></label><label className="form-field"><span>응시 종료</span><input name="closesAt" type="datetime-local" defaultValue={exam ? localInput(exam.closesAt) : ""} required /></label></div>{exam && <><ChoiceGroup title="대상 과목" items={(program?.subjects.length ? program.subjects : exam.subjects).map((item) => ({ id: item.subjectId, name: item.name }))} selected={subjectIds} onChange={setSubjectIds} empty="이 교육과정에서 선택할 수 있는 과목이 없습니다." /><ChoiceGroup title="대상 반" items={availableClasses} selected={classIds} onChange={setClassIds} empty="이 교육과정에 연결된 반이 없습니다." /></>}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="template-form__actions"><button type="button" className="button button--ghost" onClick={onCancel} disabled={pending}>취소</button><button type="submit" className="button button--primary" disabled={pending || !effectiveProgramId}>{pending ? "저장 중…" : exam ? "변경 저장" : "시험 초안 만들기"}</button></div></form></section>;
}

function ChoiceGroup({ title, items, selected, onChange, empty }: { title: string; items: Array<{ id: string; name: string }>; selected: string[]; onChange: (ids: string[]) => void; empty: string }) {
  return <fieldset className="exam-choice-group"><legend>{title}</legend>{items.length === 0 ? <p>{empty}</p> : <div>{items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /><span>{item.name}</span></label>)}</div>}</fieldset>;
}

function ExamDetail({ exam, onEdit, onPart, onDeletePart }: { exam: Exam; onEdit: () => void; onPart: (type: ExamPartType) => void; onDeletePart: (type: ExamPartType) => void }) {
  const draft = exam.status === "DRAFT";
  return <div className="exam-detail"><section className="surface-card"><header className="card-header"><div><div className="template-detail__tags"><ExamStatusBadge status={exam.status} /><span>{STAGE_LABELS[exam.stage]} · {SCOPE_LABELS[exam.scope]}</span></div><h2>{exam.title}</h2><p>{exam.courseOfferingName}</p></div>{draft && <button type="button" className="button button--secondary" onClick={onEdit}><Pencil size={16} />시험 정보 수정</button>}</header><div className="card-body exam-overview">{exam.description && <p>{exam.description}</p>}<dl><div><dt>응시 기간</dt><dd>{formatDateTime(exam.opensAt)}<br />~ {formatDateTime(exam.closesAt)}</dd></div><div><dt>대상 과목</dt><dd>{exam.subjects.map((item) => item.name).join(" · ") || "미지정"}</dd></div><div><dt>대상 반</dt><dd>{exam.classTargets.map((item) => item.name).join(" · ") || "미지정"}</dd></div><div><dt>생성 방식</dt><dd>{exam.sourceTemplateId ? "템플릿에서 생성" : "빈 초안에서 생성"}</dd></div></dl></div></section><ExamLifecyclePanel exam={exam} /><ExamTargetsPanel exam={exam} /><section className="surface-card"><header className="card-header"><div><h2>시험 파트</h2><p>각 파트의 응시 시간과 채점 기준을 구성합니다.</p></div><CalendarClock size={20} /></header>{(["WRITTEN", "PRACTICAL"] as const).map((type) => { const part = exam.parts.find((item) => item.type === type); return <section className="exam-part" key={type}><header><div><FileText size={18} /><h3>{PART_LABELS[type]}</h3><span>{part ? `${part.totalScore}점` : "미구성"}</span></div>{draft && <div><button type="button" className="button button--secondary" onClick={() => onPart(type)}>{part ? <Pencil size={15} /> : <Plus size={15} />}{part ? "수정" : "추가"}</button>{part && <button type="button" className="button button--ghost" onClick={() => onDeletePart(type)}><Trash2 size={15} />삭제</button>}</div>}</header>{part ? <dl><div><dt>합격 점수</dt><dd>{part.passScore}점</dd></div><div><dt>응시 시간</dt><dd>{formatDateTime(part.opensAt)} ~ {formatDateTime(part.closesAt)}</dd></div>{type === "WRITTEN" ? <div><dt>제한 시간</dt><dd>{part.durationMinutes}분</dd></div> : <div><dt>파일 제출</dt><dd>{part.minFiles}~{part.maxFiles}개 · 전체 최대 {Math.round((part.maxTotalSizeBytes ?? 0) / 1048576)} MiB</dd></div>}</dl> : <p>이 파트를 추가해 시험 구성을 시작하세요.</p>}</section>; })}</section>{exam.parts.some((part) => part.type === "WRITTEN") && <ExamWrittenPanel exam={exam} />}{exam.parts.some((part) => part.type === "PRACTICAL") && <ExamCriteriaPanel exam={exam} />}</div>;
}

function ExamLifecyclePanel({ exam }: { exam: Exam }) {
  const client = useQueryClient();
  const [validation, setValidation] = useState<ExamScheduleValidationResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = (saved: Exam) => {
    client.setQueryData(["exam", saved.id], saved);
    void client.invalidateQueries({ queryKey: ["exams"] });
    setValidation(null);
    setCancelOpen(false);
  };
  const validate = useMutation({ mutationFn: () => validateExam(exam.id), onSuccess: setValidation });
  const schedule = useMutation({ mutationFn: () => scheduleExam(exam.id), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => cancelExam(exam.id, reason.trim()), onSuccess: refresh });
  const busy = validate.isPending || schedule.isPending || cancel.isPending;
  const error = validate.error ?? schedule.error ?? cancel.error;
  const cancelable = exam.status !== "CANCELED" && exam.status !== "COMPLETED";
  return <section className="surface-card exam-lifecycle"><header className="card-header"><div><h2>운영 준비</h2><p>{exam.status === "DRAFT" ? "구성을 검증한 뒤 시험을 예약하세요." : "현재 운영 상태와 취소 가능 여부를 확인합니다."}</p></div><ShieldCheck size={20} /></header><div className="card-body exam-lifecycle__body"><div className="exam-lifecycle__actions">{exam.status === "DRAFT" && <><button type="button" className="button button--secondary" disabled={busy} onClick={() => validate.mutate()}><ClipboardPen size={16} />예약 전 검증</button><button type="button" className="button button--primary" disabled={busy} onClick={() => schedule.mutate()}><Power size={16} />시험 예약</button></>}{cancelable && <button type="button" className="button button--ghost" disabled={busy} onClick={() => setCancelOpen((open) => !open)}>시험 취소</button>}</div>{cancelOpen && <div className="exam-cancel-form"><label className="form-field"><span>취소 사유</span><textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="수강생과 운영 기록에 남길 사유를 입력하세요." /></label><div><button type="button" className="button button--ghost" onClick={() => setCancelOpen(false)}>닫기</button><button type="button" className="button button--danger" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate()}>취소 확정</button></div></div>}{error && <p className="form-error" role="alert">{readError(error)}</p>}{validation && (validation.valid ? <div className="exam-validation exam-validation--success"><CheckCircle2 size={18} /><div><strong>예약 준비가 완료되었습니다.</strong><p>모든 필수 구성이 유효합니다.</p></div></div> : <div className="exam-validation exam-validation--error"><ShieldCheck size={18} /><div><strong>예약 전에 {validation.issues.length}개 항목을 확인해 주세요.</strong><ul>{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></div></div>)}</div></section>;
}

function ExamTargetsPanel({ exam }: { exam: Exam }) {
  const client = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const targets = useQuery({ queryKey: ["exam-targets", exam.id], queryFn: () => getExamTargets(exam.id) });
  const update = (data: Awaited<ReturnType<typeof getExamTargets>>) => client.setQueryData(["exam-targets", exam.id], data);
  const rebuild = useMutation({ mutationFn: () => rebuildExamTargets(exam.id), onSuccess: update });
  const lock = useMutation({ mutationFn: () => lockExamTargets(exam.id), onSuccess: update });
  const add = useMutation({ mutationFn: () => addExamTarget(exam.id, studentId.trim()), onSuccess: (data) => { update(data); setStudentId(""); } });
  const remove = useMutation({ mutationFn: (id: string) => removeExamTarget(exam.id, id), onSuccess: update });
  const busy = rebuild.isPending || lock.isPending || add.isPending || remove.isPending;
  const error = rebuild.error ?? lock.error ?? add.error ?? remove.error;
  const editableStatus = exam.status === "DRAFT" || exam.status === "SCHEDULED";
  const editable = editableStatus && !targets.data?.locked;
  return <section className="surface-card exam-targets"><header className="card-header"><div><h2>응시 대상자</h2><p>{targets.data?.locked ? `명단 확정 · ${targets.data.targets.length}명` : `현재 ${targets.data?.targets.length ?? 0}명 · 예약 전 수강 정보로 명단을 확인하세요.`}</p></div>{targets.data?.locked ? <LockKeyhole size={20} /> : <UserPlus size={20} />}</header><div className="card-body exam-targets__body">{targets.isPending ? <LoadingState message="응시 대상자를 불러오는 중입니다." /> : targets.isError ? <ErrorState message={readError(targets.error)} onRetry={() => void targets.refetch()} /> : <>{editable && <div className="exam-target-actions"><button type="button" className="button button--secondary" disabled={busy} onClick={() => rebuild.mutate()}><RefreshCw size={16} />자동 후보 다시 만들기</button><button type="button" className="button button--secondary" disabled={busy || (targets.data?.targets.length ?? 0) === 0} onClick={() => lock.mutate()}><LockKeyhole size={16} />명단 확정</button></div>}{editable && <div className="exam-target-add"><label className="form-field"><span>학생 ID로 수동 추가</span><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="학생 UUID" /></label><button type="button" className="button button--secondary" disabled={busy || !studentId.trim()} onClick={() => add.mutate()}><Plus size={16} />추가</button></div>}{error && <p className="form-error" role="alert">{readError(error)}</p>}{targets.data?.targets.length === 0 ? <EmptyState title="응시 대상자가 없습니다." description={editable ? "대상 반과 과목을 확인한 뒤 자동 후보를 만들어 주세요." : "확정된 응시 대상자가 없습니다."} /> : <div className="exam-target-table"><table><thead><tr><th>학생</th><th>반</th><th>상태</th>{editable && <th><span className="sr-only">관리</span></th>}</tr></thead><tbody>{targets.data?.targets.map((target) => <tr key={target.studentId}><td>{target.studentName}</td><td>{target.className}</td><td>{target.status === "NOT_STARTED" ? "응시 전" : target.status === "IN_PROGRESS" ? "응시 중" : "응시 완료"}</td>{editable && <td><button type="button" className="icon-button icon-button--danger" disabled={busy || target.status !== "NOT_STARTED"} aria-label={`${target.studentName} 대상에서 제외`} onClick={() => remove.mutate(target.studentId)}><X size={16} /></button></td>}</tr>)}</tbody></table></div>}</>}</div></section>;
}

function ExamPartEditor({ exam, type, pending, error, onCancel, onSubmit }: { exam: Exam; type: ExamPartType; pending: boolean; error: string; onCancel: () => void; onSubmit: (input: ExamPartInput) => void }) {
  const part = exam.parts.find((item) => item.type === type);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const base: ExamPartInput = { totalScore: Number(data.get("totalScore")), passScore: Number(data.get("passScore")), opensAt: iso(data.get("opensAt")), closesAt: iso(data.get("closesAt")), instructions: String(data.get("instructions")).trim() || undefined }; onSubmit(type === "WRITTEN" ? { ...base, durationMinutes: Number(data.get("durationMinutes")) } : { ...base, minFiles: Number(data.get("minFiles")), maxFiles: Number(data.get("maxFiles")), maxTotalSizeBytes: Number(data.get("maxTotalSizeMiB")) * 1048576 }); };
  return <section className="surface-card exam-editor"><header className="card-header"><div><h2>{PART_LABELS[type]} 파트 {part ? "수정" : "추가"}</h2><p>실제 응시 시간과 점수 조건을 입력합니다.</p></div></header><form className="card-body exam-form" onSubmit={submit}><fieldset disabled={pending}><div className="form-grid"><label className="form-field"><span>총점</span><input name="totalScore" type="number" min="0.01" max="9999.99" step="0.01" defaultValue={part?.totalScore ?? 100} required /></label><label className="form-field"><span>합격 점수</span><input name="passScore" type="number" min="0" max="9999.99" step="0.01" defaultValue={part?.passScore ?? 60} required /></label></div><div className="form-grid"><label className="form-field"><span>파트 시작</span><input name="opensAt" type="datetime-local" defaultValue={localInput(part?.opensAt ?? exam.opensAt)} required /></label><label className="form-field"><span>파트 종료</span><input name="closesAt" type="datetime-local" defaultValue={localInput(part?.closesAt ?? exam.closesAt)} required /></label></div>{type === "WRITTEN" ? <label className="form-field"><span>제한 시간 (분)</span><input name="durationMinutes" type="number" min="1" max="1440" defaultValue={part?.durationMinutes ?? 60} required /></label> : <div className="form-grid exam-file-limits"><label className="form-field"><span>최소 파일 수</span><input name="minFiles" type="number" min="1" max="20" defaultValue={part?.minFiles ?? 1} required /></label><label className="form-field"><span>최대 파일 수</span><input name="maxFiles" type="number" min="1" max="20" defaultValue={part?.maxFiles ?? 5} required /></label><label className="form-field"><span>전체 최대 용량 (MiB)</span><input name="maxTotalSizeMiB" type="number" min="1" defaultValue={Math.round((part?.maxTotalSizeBytes ?? 31457280) / 1048576)} required /></label></div>}<label className="form-field"><span>응시 안내</span><textarea name="instructions" rows={4} maxLength={10000} defaultValue={part?.instructions ?? ""} /></label></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="template-form__actions"><button type="button" className="button button--ghost" onClick={onCancel}>취소</button><button type="submit" className="button button--primary" disabled={pending}>{pending ? "저장 중…" : "파트 저장"}</button></div></form></section>;
}

type QuestionDraft = { key: string; input: ExamQuestionInput; prompt: string };
function ExamWrittenPanel({ exam }: { exam: Exam }) {
  const client = useQueryClient();
  const draftMode = exam.status === "DRAFT";
  const current = useQuery({ queryKey: ["exam-questions", exam.id], queryFn: () => getExamQuestions(exam.id) });
  const [rows, setRows] = useState<QuestionDraft[] | null>(null);
  const [subjectId, setSubjectId] = useState(exam.subjects[0]?.subjectId ?? "");
  const bank = useQuery({ queryKey: ["exam-question-bank", subjectId], queryFn: () => getQuestions({ subjectId, active: true, limit: 100 }), enabled: draftMode && Boolean(subjectId) });
  const saved = useMemo<QuestionDraft[]>(() => (current.data?.questions ?? []).map((item) => ({ key: item.id, prompt: item.prompt, input: item.sourceQuestionId ? { sourceQuestionId: item.sourceQuestionId, score: item.score } : { type: item.type, prompt: item.prompt, explanation: item.explanation ?? undefined, options: item.options.map((option) => ({ content: option.content, isCorrect: option.isCorrect })), acceptedAnswers: item.acceptedAnswers.map((answer) => answer.answerText), score: item.score } })), [current.data]);
  const draft = rows ?? saved;
  const save = useMutation({ mutationFn: () => replaceExamQuestions(exam.id, draft.map((item) => item.input)), onSuccess: (data) => { client.setQueryData(["exam-questions", exam.id], data); setRows(null); } });
  const sum = draft.reduce((total, item) => total + item.input.score, 0);
  const add = (question: Question) => { if (!draft.some((item) => item.input.sourceQuestionId === question.id)) setRows([...draft, { key: question.id, prompt: question.prompt, input: { sourceQuestionId: question.id, score: question.defaultScore } }]); };
  return <section className="surface-card exam-composition"><header className="card-header"><div><h2>필기 문제</h2><p>문제은행의 문제를 시험용 스냅샷으로 구성합니다.</p></div><strong className="exam-score-summary">{sum} / {current.data?.partTotalScore ?? 0}점</strong></header><div className="card-body exam-composition__body">{current.isPending ? <LoadingState message="시험 문제를 불러오는 중입니다." /> : current.isError ? <ErrorState message={readError(current.error)} onRetry={() => void current.refetch()} /> : draft.length === 0 ? <EmptyState title="담긴 문제가 없습니다." description="문제은행에서 출제할 문제를 추가하세요." /> : <ol className="exam-composition-list">{draft.map((item, index) => <li key={item.key}><span>{index + 1}</span><p>{item.prompt}</p><label className="form-field"><span>배점</span><input type="number" min="0.01" max="9999.99" step="0.01" value={item.input.score} disabled={!draftMode} onChange={(event) => { const next = [...draft]; next[index] = { ...item, input: { ...item.input, score: Number(event.target.value) } }; setRows(next); }} /></label>{draftMode && <button type="button" className="icon-button icon-button--danger" aria-label={`${index + 1}번 문제 제거`} onClick={() => setRows(draft.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} /></button>}</li>)}</ol>}{draftMode && <><div className="exam-bank-picker"><label className="form-field"><span>과목</span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{exam.subjects.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.name}</option>)}</select></label><div>{bank.data?.items.map((question) => <button type="button" className="exam-bank-item" key={question.id} disabled={draft.some((item) => item.input.sourceQuestionId === question.id)} onClick={() => add(question)}><span><strong>{question.prompt}</strong><small>{question.defaultScore}점</small></span><Plus size={16} /></button>)}</div></div><div className="exam-composition-actions">{save.isError && <p className="form-error">{readError(save.error)}</p>}{save.isSuccess && <p className="form-success">필기 문제 구성을 저장했습니다.</p>}<button type="button" className="button button--primary" disabled={rows === null || save.isPending} onClick={() => save.mutate()}>문제 구성 저장</button></div></>}</div></section>;
}

type CriterionDraft = ExamCriterionInput & { key: string };
function ExamCriteriaPanel({ exam }: { exam: Exam }) {
  const client = useQueryClient();
  const draftMode = exam.status === "DRAFT";
  const current = useQuery({ queryKey: ["exam-criteria", exam.id], queryFn: () => getExamCriteria(exam.id) });
  const [rows, setRows] = useState<CriterionDraft[] | null>(null);
  const saved = useMemo<CriterionDraft[]>(() => (current.data?.criteria ?? []).map((item) => ({ key: item.id, name: item.name, description: item.description ?? "", maxScore: item.maxScore })), [current.data]);
  const draft = rows ?? saved;
  const save = useMutation({ mutationFn: () => replaceExamCriteria(exam.id, draft.map(({ name, description, maxScore }) => ({ name: name.trim(), description: description?.trim() || undefined, maxScore }))), onSuccess: (data) => { client.setQueryData(["exam-criteria", exam.id], data); setRows(null); } });
  const invalid = draft.some((item) => !item.name.trim() || item.maxScore < 0.01);
  return <section className="surface-card exam-composition"><header className="card-header"><div><h2>실기 평가 기준</h2><p>실기 채점 항목과 항목별 최대 점수를 정합니다.</p></div><strong className="exam-score-summary">{draft.reduce((total, item) => total + item.maxScore, 0)} / {current.data?.partTotalScore ?? 0}점</strong></header><div className="card-body exam-composition__body">{current.isPending ? <LoadingState message="평가 기준을 불러오는 중입니다." /> : current.isError ? <ErrorState message={readError(current.error)} onRetry={() => void current.refetch()} /> : draft.length === 0 ? <EmptyState title="평가 기준이 없습니다." description="채점할 평가 항목을 추가하세요." /> : <ol className="exam-criteria-list">{draft.map((item, index) => <li key={item.key}><span>{index + 1}</span><div><label className="form-field"><span>평가 항목명</span><input value={item.name} disabled={!draftMode} onChange={(event) => { const next = [...draft]; next[index] = { ...item, name: event.target.value }; setRows(next); }} /></label><label className="form-field"><span>설명</span><textarea rows={2} value={item.description} disabled={!draftMode} onChange={(event) => { const next = [...draft]; next[index] = { ...item, description: event.target.value }; setRows(next); }} /></label></div><label className="form-field"><span>최대 점수</span><input type="number" min="0.01" max="9999.99" step="0.01" value={item.maxScore} disabled={!draftMode} onChange={(event) => { const next = [...draft]; next[index] = { ...item, maxScore: Number(event.target.value) }; setRows(next); }} /></label>{draftMode && <button type="button" className="icon-button icon-button--danger" aria-label={`${index + 1}번 평가 기준 제거`} onClick={() => setRows(draft.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} /></button>}</li>)}</ol>}{draftMode && <><button type="button" className="button button--secondary" onClick={() => setRows([...draft, { key: `criterion-${Date.now()}`, name: "", description: "", maxScore: 10 }])}><Plus size={16} />평가 항목 추가</button><div className="exam-composition-actions">{invalid && <p className="form-error">평가 항목명과 0.01점 이상의 최대 점수를 입력하세요.</p>}{save.isError && <p className="form-error">{readError(save.error)}</p>}{save.isSuccess && <p className="form-success">실기 평가 기준을 저장했습니다.</p>}<button type="button" className="button button--primary" disabled={rows === null || invalid || save.isPending} onClick={() => save.mutate()}>평가 기준 저장</button></div></>}</div></section>;
}
