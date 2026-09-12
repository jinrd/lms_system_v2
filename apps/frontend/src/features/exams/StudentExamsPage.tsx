import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Send } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import { SCOPE_LABELS, STAGE_LABELS } from "../exam-templates/exam-template.utils";
import {
  getMyExams,
  getMyWrittenQuestions,
  saveMyWrittenAnswer,
  startMyWrittenExam,
  submitMyWrittenExam,
  type MyExamSummary,
  type MyWrittenQuestion,
} from "./student-exams.api";
import { StudentExamResultPanel } from "./StudentExamResultPanel";
import "./student-exams.css";

function readError(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function writtenLabel(status: string | null) {
  if (!status || status === "NOT_STARTED") return "응시 전";
  if (status === "IN_PROGRESS") return "응시 중";
  if (status === "SUBMITTED") return "제출 완료";
  return "처리 중";
}

export function StudentExamsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const list = useQuery({ queryKey: ["my-exams"], queryFn: getMyExams });
  const selected = list.data?.find((exam) => exam.examId === selectedId) ?? list.data?.[0] ?? null;
  if (list.isPending) return <LoadingState message="내 시험을 불러오는 중입니다." />;
  if (list.isError) return <ErrorState message={readError(list.error)} onRetry={() => void list.refetch()} />;
  return <div className={`page-stack student-exams-page ${mobileOpen ? "page--mobile-detail-open" : ""}`}><header className="page-header"><div><h1>내 시험</h1><p>응시할 시험의 기간과 진행 상태를 확인하고 답안을 제출합니다.</p></div></header>{list.data?.length === 0 ? <div className="surface-card"><EmptyState title="응시할 시험이 없습니다." description="새 시험이 배정되면 이곳에서 확인할 수 있습니다." /></div> : <section className="student-exam-layout workbench-layout"><aside className={`surface-card student-exam-list master-pane master-pane--list ${mobileOpen ? "master-pane--mobile-hidden" : ""}`} aria-label="내 시험 목록"><header className="card-header"><div><h2>시험 목록</h2><p>총 {list.data?.length ?? 0}개</p></div><CalendarClock size={20} /></header>{list.data?.map((exam) => <button type="button" key={exam.examId} className={selected?.examId === exam.examId ? "student-exam-item student-exam-item--selected" : "student-exam-item"} aria-pressed={selected?.examId === exam.examId} onClick={() => { setSelectedId(exam.examId); setMobileOpen(true); }}><span>{STAGE_LABELS[exam.stage as keyof typeof STAGE_LABELS]} · {SCOPE_LABELS[exam.scope as keyof typeof SCOPE_LABELS]}</span><strong>{exam.title}</strong><small>{exam.written ? writtenLabel(exam.written.submissionStatus) : "필기 없음"}</small><ChevronRight size={16} /></button>)}</aside>{selected && <div className={`master-pane master-pane--detail ${mobileOpen ? "" : "master-pane--mobile-hidden"}`}><button type="button" className="mobile-detail-back" onClick={() => setMobileOpen(false)}><ChevronLeft size={18} />시험 목록</button><StudentExamDetail key={selected.examId} exam={selected} /></div>}</section>}</div>;
}

function StudentExamDetail({ exam }: { exam: MyExamSummary }) {
  const client = useQueryClient();
  const [started, setStarted] = useState(exam.written?.submissionStatus === "IN_PROGRESS");
  const [confirming, setConfirming] = useState(false);
  const written = useQuery({ queryKey: ["my-written-exam", exam.examId], queryFn: () => getMyWrittenQuestions(exam.examId), enabled: started });
  const start = useMutation({ mutationFn: () => startMyWrittenExam(exam.examId), onSuccess: (data) => { client.setQueryData(["my-written-exam", exam.examId], data); setStarted(true); void client.invalidateQueries({ queryKey: ["my-exams"] }); } });
  const submit = useMutation({ mutationFn: () => submitMyWrittenExam(exam.examId), onSuccess: (data) => { client.setQueryData(["my-written-exam", exam.examId], data); setConfirming(false); void client.invalidateQueries({ queryKey: ["my-exams"] }); } });
  const submitted = exam.written?.submissionStatus === "SUBMITTED" || written.data?.submissionStatus === "SUBMITTED";
  return <main className="student-exam-detail"><section className="surface-card"><header className="card-header"><div><span className="status-badge status-badge--info">{exam.written ? writtenLabel(exam.written.submissionStatus) : "안내"}</span><h2>{exam.title}</h2><p>{formatDateTime(exam.opensAt)} ~ {formatDateTime(exam.closesAt)}</p></div></header><div className="card-body student-exam-summary">{exam.written ? <><dl><div><dt>필기 응시 기간</dt><dd>{formatDateTime(exam.written.opensAt)} ~ {formatDateTime(exam.written.closesAt)}</dd></div><div><dt>제한 시간</dt><dd>{exam.written.durationMinutes}분</dd></div></dl>{!started && !submitted && <div className="student-start-callout"><Clock3 size={22} /><div><strong>시작하면 제한 시간이 적용됩니다.</strong><p>안정적인 네트워크 환경에서 충분한 시간을 확보한 뒤 시작하세요.</p></div><button type="button" className="button button--primary" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? "시작 중…" : "필기 시험 시작"}</button></div>}{start.isError && <p className="form-error" role="alert">{readError(start.error)}</p>}</> : <EmptyState title="필기 시험이 없습니다." description="이 시험에는 온라인 필기 파트가 포함되지 않았습니다." />}</div></section><StudentExamResultPanel examId={exam.examId} />{started && (written.isPending ? <LoadingState message="시험 문제를 준비하는 중입니다." /> : written.isError ? <ErrorState message={readError(written.error)} onRetry={() => void written.refetch()} /> : written.data ? <section className="student-written"><header className="student-written__header"><div><h2>필기 문제</h2><p>답안은 문항별로 저장됩니다.</p></div><div><span>마감 시각</span><strong>{formatDateTime(written.data.deadlineAt)}</strong></div></header>{written.data.questions.map((question, index) => <StudentAnswer key={question.examQuestionId} examId={exam.examId} question={question} number={index + 1} disabled={submitted} />)}{submitted ? <div className="student-submitted"><CheckCircle2 size={22} /><div><strong>답안을 제출했습니다.</strong><p>제출한 답안은 더 이상 변경할 수 없습니다.</p></div></div> : confirming ? <div className="student-submit-confirm"><div><strong>필기 답안을 최종 제출할까요?</strong><p>제출 후에는 답안을 바꿀 수 없습니다.</p></div><div><button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>계속 검토</button><button type="button" className="button button--primary" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "제출 중…" : "최종 제출"}</button></div></div> : <button type="button" className="button button--primary student-submit-button" onClick={() => setConfirming(true)}><Send size={17} />필기 답안 제출</button>}{submit.isError && <p className="form-error">{readError(submit.error)}</p>}</section> : null)}</main>;
}

function StudentAnswer({ examId, question, number, disabled }: { examId: string; question: MyWrittenQuestion; number: number; disabled: boolean }) {
  const [text, setText] = useState(question.answer?.subjectiveText ?? "");
  const [selected, setSelected] = useState(question.answer?.selectedOptionIds ?? []);
  const [version, setVersion] = useState(question.answer?.version ?? 0);
  const save = useMutation({ mutationFn: (answer: { subjectiveText?: string; selectedOptionIds?: string[] }) => saveMyWrittenAnswer(examId, question.examQuestionId, { version, ...answer }), onSuccess: (data) => setVersion(data.version) });
  const choose = (optionId: string, checked: boolean) => {
    const next = question.type === "SINGLE_CHOICE" ? [optionId] : checked ? [...selected, optionId] : selected.filter((id) => id !== optionId);
    setSelected(next);
    save.mutate({ selectedOptionIds: next });
  };
  return <article className="surface-card student-question"><header><span>{number}</span><div><h3>{question.prompt}</h3><p>{question.score}점</p></div></header><div className="student-question__body">{question.type === "SHORT_ANSWER" ? <label className="form-field"><span>답안</span><textarea rows={4} maxLength={5000} value={text} disabled={disabled || save.isPending} onChange={(event) => setText(event.target.value)} onBlur={() => save.mutate({ subjectiveText: text })} placeholder="답안을 입력하세요." /></label> : <fieldset className="student-options" disabled={disabled || save.isPending}><legend className="sr-only">답안 선택</legend>{question.options.map((option) => <label key={option.examQuestionOptionId}><input type={question.type === "SINGLE_CHOICE" ? "radio" : "checkbox"} name={`answer-${question.examQuestionId}`} checked={selected.includes(option.examQuestionOptionId)} onChange={(event) => choose(option.examQuestionOptionId, event.target.checked)} /><span>{option.content}</span></label>)}</fieldset>}<p className={save.isError ? "student-save-status student-save-status--error" : "student-save-status"} role="status">{save.isPending ? "저장 중…" : save.isError ? "저장하지 못했습니다. 화면을 새로고침한 뒤 다시 입력해 주세요." : save.isSuccess ? "저장됨" : question.answer?.savedAt ? "저장된 답안" : "아직 답하지 않음"}</p></div></article>;
}
