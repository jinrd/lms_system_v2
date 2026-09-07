import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ListChecks,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { ApiError } from "../../lib/api-client";
import { getQuestions, type Question } from "../questions/questions.api";
import type { ExamTemplate } from "./exam-templates.api";
import {
  activateExamTemplate,
  deactivateExamTemplate,
  duplicateExamTemplate,
  getTemplatePracticalCriteria,
  getTemplateWrittenQuestions,
  replaceTemplatePracticalCriteria,
  replaceTemplateWrittenQuestions,
  validateExamTemplate,
  type TemplateCriterionInput,
  type TemplateQuestionInput,
  type ValidationResult,
} from "./exam-template-composition.api";

function readError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type CompositionProps = {
  template: ExamTemplate;
  onTemplateChange?: (template: ExamTemplate, message: string) => void;
  onDuplicate?: (template: ExamTemplate) => void;
};

export function ExamTemplateComposition(props: CompositionProps) {
  const { template } = props;
  const written = template.parts.some((part) => part.type === "WRITTEN");
  const practical = template.parts.some((part) => part.type === "PRACTICAL");
  return (
    <>
      <ActivationPanel {...props} />
      {written && <WrittenQuestionsPanel template={template} />}
      {practical && <PracticalCriteriaPanel template={template} />}
    </>
  );
}

export function ActivationPanel({ template, onTemplateChange, onDuplicate }: CompositionProps) {
  const client = useQueryClient();
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = (saved: ExamTemplate, message: string) => {
    client.setQueryData(["exam-template", saved.id], saved);
    void client.invalidateQueries({ queryKey: ["exam-templates"] });
    onTemplateChange?.(saved, message);
    setNotice(message);
    setResult(null);
  };
  const validate = useMutation({ mutationFn: () => validateExamTemplate(template.id), onSuccess: setResult });
  const activate = useMutation({ mutationFn: () => activateExamTemplate(template.id), onSuccess: (saved) => refresh(saved, "템플릿을 활성화했습니다.") });
  const deactivate = useMutation({ mutationFn: () => deactivateExamTemplate(template.id), onSuccess: (saved) => refresh(saved, "템플릿을 비활성화했습니다.") });
  const duplicate = useMutation({
    mutationFn: () => duplicateExamTemplate(template.id),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: ["exam-templates"] });
      setNotice(`복제본 “${saved.name}”을 만들었습니다.`);
      onDuplicate?.(saved);
    },
  });
  const mutations = [validate, activate, deactivate, duplicate];
  const busy = mutations.some((mutation) => mutation.isPending);
  const actionError = mutations.find((mutation) => mutation.isError)?.error;
  return (
    <section className="surface-card template-lifecycle" aria-labelledby="template-lifecycle-title">
      <header className="card-header">
        <div>
          <h2 id="template-lifecycle-title">사용 준비</h2>
          <p>{template.active ? "활성 템플릿은 새 시험을 만들 때 사용할 수 있습니다." : "구성을 검증하고 문제가 없으면 템플릿을 활성화하세요."}</p>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </header>
      <div className="card-body template-lifecycle__body">
        <div className="template-lifecycle__actions">
          <button type="button" className="button button--secondary" disabled={busy} onClick={() => { setNotice(""); validate.mutate(); }}><ListChecks size={16} />구성 검증</button>
          {template.active ? (
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => deactivate.mutate()}><PowerOff size={16} />비활성화</button>
          ) : (
            <button type="button" className="button button--primary" disabled={busy} onClick={() => activate.mutate()}><Power size={16} />활성화</button>
          )}
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => duplicate.mutate()}><Copy size={16} />초안으로 복제</button>
        </div>
        {busy && <p className="template-action-status" role="status">요청을 처리하고 있습니다.</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        {actionError && <p className="form-error" role="alert">{readError(actionError)}</p>}
        {result && <ValidationIssues result={result} />}
      </div>
    </section>
  );
}

export function ValidationIssues({ result }: { result: ValidationResult }) {
  if (result.valid) {
    return <div className="template-validation template-validation--success" role="status"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>구성 검증을 통과했습니다.</strong><p>이 템플릿을 활성화할 수 있습니다.</p></div></div>;
  }
  return (
    <div className="template-validation template-validation--error" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <div><strong>활성화 전에 {result.issues.length}개 항목을 확인해 주세요.</strong><ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${issue.questionId ?? index}`}>{issue.message}</li>)}</ul></div>
    </div>
  );
}

type QuestionRow = { questionId: string; prompt: string; score: number };

export function WrittenQuestionsPanel({ template }: { template: ExamTemplate }) {
  const client = useQueryClient();
  const part = template.parts.find((item) => item.type === "WRITTEN")!;
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [subjectId, setSubjectId] = useState(template.subjects[0]?.subjectId ?? "");
  const current = useQuery({ queryKey: ["exam-template-composition", template.id, "written"], queryFn: () => getTemplateWrittenQuestions(template.id) });
  const available = useQuery({ queryKey: ["exam-template-questions", template.id, subjectId], queryFn: () => getQuestions({ subjectId, active: true, limit: 100 }), enabled: Boolean(subjectId) && !template.active });
  const savedRows = useMemo<QuestionRow[]>(() => (current.data?.questions ?? []).map((entry) => ({ questionId: entry.questionId, prompt: entry.question.prompt, score: entry.score })), [current.data]);
  const draft = rows ?? savedRows;
  const sum = round2(draft.reduce((total, row) => total + (row.score || 0), 0));
  const difference = round2(sum - part.totalScore);
  const save = useMutation({
    mutationFn: () => replaceTemplateWrittenQuestions(template.id, draft.map(({ questionId, score }) => ({ questionId, score } satisfies TemplateQuestionInput))),
    onSuccess: (data) => { client.setQueryData(["exam-template-composition", template.id, "written"], data); setRows(null); },
  });
  const update = (next: QuestionRow[]) => setRows(next);
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };
  const add = (question: Question) => {
    if (!draft.some((row) => row.questionId === question.id)) update([...draft, { questionId: question.id, prompt: question.prompt, score: question.defaultScore }]);
  };
  return (
    <section className="surface-card template-composer" aria-labelledby="written-composer-title">
      <header className="card-header template-composer__header"><div><h2 id="written-composer-title">필기 문제 구성</h2><p>문제 순서와 배점을 정합니다. 배점 합계는 필기 총점과 같아야 합니다.</p></div><ScoreBalance total={part.totalScore} assigned={sum} /></header>
      <div className="card-body template-composer__body">
        {current.isPending ? <LoadingState message="필기 문제 구성을 불러오는 중입니다." /> : current.isError ? <ErrorState message={readError(current.error)} onRetry={() => void current.refetch()} /> : draft.length === 0 ? <EmptyState title="필기 문제가 아직 없습니다." description={template.active ? "활성화 당시 필기 문제가 구성되지 않았습니다." : "아래 문제 목록에서 시험에 담을 문제를 추가하세요."} /> : (
          <ol className="template-composer-rows">
            {draft.map((row, index) => <li key={row.questionId}>
              <span className="template-composer-row__order" aria-hidden="true">{index + 1}</span><p>{row.prompt}</p>
              <label className="form-field template-score-input"><span>배점</span><input type="number" min={0.01} max={9999.99} step={0.01} value={row.score} disabled={template.active} aria-label={`${index + 1}번 문제 배점`} onChange={(event) => { const next = [...draft]; next[index] = { ...row, score: Number(event.target.value) }; update(next); }} /></label>
              {!template.active && <div className="template-row-actions"><button type="button" className="icon-button" disabled={index === 0} aria-label={`${index + 1}번 문제 위로`} onClick={() => move(index, -1)}><ArrowUp size={17} /></button><button type="button" className="icon-button" disabled={index === draft.length - 1} aria-label={`${index + 1}번 문제 아래로`} onClick={() => move(index, 1)}><ArrowDown size={17} /></button><button type="button" className="icon-button icon-button--danger" aria-label={`${index + 1}번 문제 제거`} onClick={() => update(draft.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} /></button></div>}
            </li>)}
          </ol>
        )}
        {!template.active && <section className="template-question-picker" aria-labelledby="question-picker-title">
          <header><div><h3 id="question-picker-title">문제은행에서 추가</h3><p>활성 상태이며 템플릿 과목에 속한 문제만 표시됩니다.</p></div><label className="form-field"><span>과목</span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{template.subjects.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.name}</option>)}</select></label></header>
          {available.isPending ? <LoadingState message="추가할 문제를 불러오는 중입니다." /> : available.isError ? <ErrorState message={readError(available.error)} onRetry={() => void available.refetch()} /> : (available.data?.items.length ?? 0) === 0 ? <EmptyState title="추가할 수 있는 문제가 없습니다." description="문제은행에서 이 과목의 문제를 먼저 활성화해 주세요." /> : <ul className="template-question-options">{available.data?.items.map((question) => { const added = draft.some((row) => row.questionId === question.id); return <li key={question.id}><div><strong>{question.prompt}</strong><span>{question.defaultScore}점 · {question.type === "SHORT_ANSWER" ? "단답형" : question.type === "MULTIPLE_CHOICE" ? "복수 선택" : "단일 선택"}</span></div><button type="button" className="button button--secondary" disabled={added} onClick={() => add(question)}><Plus size={15} />{added ? "담김" : "추가"}</button></li>; })}</ul>}
        </section>}
        {!template.active && <div className="template-composer__save">{difference !== 0 && <p className="field-hint">현재 배점이 필기 총점보다 {Math.abs(difference)}점 {difference > 0 ? "많습니다" : "부족합니다"}.</p>}{save.isError && <p className="form-error" role="alert">{readError(save.error)}</p>}{save.isSuccess && <p className="form-success" role="status">필기 문제 구성을 저장했습니다.</p>}<div><button type="button" className="button button--ghost" disabled={rows === null || save.isPending} onClick={() => setRows(null)}>변경 취소</button><button type="button" className="button button--primary" disabled={rows === null || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "저장 중…" : "문제 구성 저장"}</button></div></div>}
      </div>
    </section>
  );
}

type CriterionRow = { key: string; name: string; description: string; maxScore: number };

export function PracticalCriteriaPanel({ template }: { template: ExamTemplate }) {
  const client = useQueryClient();
  const part = template.parts.find((item) => item.type === "PRACTICAL")!;
  const [rows, setRows] = useState<CriterionRow[] | null>(null);
  const current = useQuery({ queryKey: ["exam-template-composition", template.id, "practical"], queryFn: () => getTemplatePracticalCriteria(template.id) });
  const savedRows = useMemo<CriterionRow[]>(() => (current.data?.criteria ?? []).map((entry) => ({ key: entry.id, name: entry.name, description: entry.description ?? "", maxScore: entry.maxScore })), [current.data]);
  const draft = rows ?? savedRows;
  const sum = round2(draft.reduce((total, row) => total + (row.maxScore || 0), 0));
  const difference = round2(sum - part.totalScore);
  const save = useMutation({ mutationFn: () => replaceTemplatePracticalCriteria(template.id, draft.map(({ name, description, maxScore }) => ({ name: name.trim(), description: description.trim() || undefined, maxScore } satisfies TemplateCriterionInput))), onSuccess: (data) => { client.setQueryData(["exam-template-composition", template.id, "practical"], data); setRows(null); } });
  const update = (next: CriterionRow[]) => setRows(next);
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= draft.length) return; const next = [...draft]; [next[index], next[target]] = [next[target], next[index]]; update(next); };
  const invalid = draft.length > 100 || draft.some((row) => !row.name.trim() || row.maxScore < 0.01 || row.maxScore > 9999.99);
  return (
    <section className="surface-card template-composer" aria-labelledby="practical-composer-title">
      <header className="card-header template-composer__header"><div><h2 id="practical-composer-title">실기 평가 항목</h2><p>채점할 항목, 기준 설명과 각 항목의 최대 점수를 정합니다.</p></div><ScoreBalance total={part.totalScore} assigned={sum} /></header>
      <div className="card-body template-composer__body">
        {current.isPending ? <LoadingState message="실기 평가 항목을 불러오는 중입니다." /> : current.isError ? <ErrorState message={readError(current.error)} onRetry={() => void current.refetch()} /> : draft.length === 0 ? <EmptyState title="실기 평가 항목이 없습니다." description={template.active ? "활성화 당시 평가 항목이 구성되지 않았습니다." : "평가 항목을 추가하고 실기 총점에 맞게 점수를 배분하세요."} /> : <ol className="template-composer-rows template-criterion-rows">{draft.map((row, index) => <li key={row.key}>
          <span className="template-composer-row__order" aria-hidden="true">{index + 1}</span><div className="template-criterion-fields"><label className="form-field"><span>평가 항목명</span><input type="text" maxLength={200} required value={row.name} disabled={template.active} aria-label={`${index + 1}번 평가 항목명`} onChange={(event) => { const next = [...draft]; next[index] = { ...row, name: event.target.value }; update(next); }} /></label><label className="form-field"><span>평가 기준 설명</span><textarea rows={2} maxLength={2000} value={row.description} disabled={template.active} aria-label={`${index + 1}번 평가 기준 설명`} onChange={(event) => { const next = [...draft]; next[index] = { ...row, description: event.target.value }; update(next); }} /></label></div>
          <label className="form-field template-score-input"><span>최대 점수</span><input type="number" min={0.01} max={9999.99} step={0.01} value={row.maxScore} disabled={template.active} aria-label={`${index + 1}번 최대 점수`} onChange={(event) => { const next = [...draft]; next[index] = { ...row, maxScore: Number(event.target.value) }; update(next); }} /></label>
          {!template.active && <div className="template-row-actions"><button type="button" className="icon-button" disabled={index === 0} aria-label={`${index + 1}번 평가 항목 위로`} onClick={() => move(index, -1)}><ArrowUp size={17} /></button><button type="button" className="icon-button" disabled={index === draft.length - 1} aria-label={`${index + 1}번 평가 항목 아래로`} onClick={() => move(index, 1)}><ArrowDown size={17} /></button><button type="button" className="icon-button icon-button--danger" aria-label={`${index + 1}번 평가 항목 제거`} onClick={() => update(draft.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} /></button></div>}
        </li>)}</ol>}
        {!template.active && <><button type="button" className="button button--secondary" disabled={draft.length >= 100} onClick={() => update([...draft, { key: `criterion-${Date.now()}-${draft.length}`, name: "", description: "", maxScore: 10 }])}><Plus size={16} />평가 항목 추가</button><div className="template-composer__save">{invalid && <p className="form-error" role="alert">평가 항목명을 입력하고 최대 점수를 0.01~9999.99점으로 설정해 주세요.</p>}{!invalid && difference !== 0 && <p className="field-hint">현재 점수 합계가 실기 총점보다 {Math.abs(difference)}점 {difference > 0 ? "많습니다" : "부족합니다"}.</p>}{save.isError && <p className="form-error" role="alert">{readError(save.error)}</p>}{save.isSuccess && <p className="form-success" role="status">실기 평가 항목을 저장했습니다.</p>}<div><button type="button" className="button button--ghost" disabled={rows === null || save.isPending} onClick={() => setRows(null)}>변경 취소</button><button type="button" className="button button--primary" disabled={rows === null || invalid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "저장 중…" : "평가 항목 저장"}</button></div></div></>}
      </div>
    </section>
  );
}

function ScoreBalance({ total, assigned }: { total: number; assigned: number }) {
  const difference = round2(assigned - total);
  const balanced = difference === 0;
  return <div className={`template-score-balance ${balanced ? "template-score-balance--complete" : ""}`}><span>배점 합계</span><strong>{assigned} / {total}점</strong><small>{balanced ? "총점과 일치" : `${Math.abs(difference)}점 ${difference > 0 ? "초과" : "부족"}`}</small></div>;
}
