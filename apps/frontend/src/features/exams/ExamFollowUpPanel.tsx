import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  duplicateExam,
  getExamAttempt,
  publishExamResults,
  rescheduleExam,
  reviewExamResults,
  reviseExamResult,
  type AttemptDetail,
  type Exam,
  type PassStatus,
} from "./exams.api";

const RESULT_LABELS: Record<PassStatus, string> = { PENDING: "판정 대기", PASS: "합격", FAIL: "불합격" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function localInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ExamFollowUpPanel({ exam, onDuplicated }: { exam: Exam; onDuplicated: (exam: Exam) => void }) {
  const client = useQueryClient();
  const [rescheduling, setRescheduling] = useState(false);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(exam.status === "COMPLETED" ? exam.updatedAt : null);
  const reschedule = useMutation({
    mutationFn: (parts: Array<{ type: "WRITTEN" | "PRACTICAL"; opensAt: string; closesAt: string; durationMinutes?: number }>) => rescheduleExam(exam.id, { parts }),
    onSuccess: async (saved) => { client.setQueryData(["exam", saved.id], saved); setRescheduling(false); await client.invalidateQueries({ queryKey: ["exams"] }); },
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateExam(exam.id),
    onSuccess: async (saved) => { onDuplicated(saved); await client.invalidateQueries({ queryKey: ["exams"] }); },
  });
  const review = useMutation({ mutationFn: () => reviewExamResults(exam.id), onSuccess: (data) => setReviewedAt(data.reviewedAt) });
  const publish = useMutation({
    mutationFn: () => publishExamResults(exam.id),
    onSuccess: async (data) => { setPublishedAt(data.publishedAt); await Promise.all([client.invalidateQueries({ queryKey: ["exam", exam.id] }), client.invalidateQueries({ queryKey: ["exams"] })]); },
  });
  const resultStage = ["CLOSED", "GRADING", "COMPLETED"].includes(exam.status);
  const actionError = reschedule.error ?? duplicate.error ?? review.error ?? publish.error;

  return (
    <section className="surface-card">
      <header className="card-header"><div><h2>시험 후속 작업</h2><p>예약 일정, 취소 시험 복제와 결과 공개를 처리합니다.</p></div></header>
      <div className="card-body page-stack">
        {exam.status === "SCHEDULED" && <div><button type="button" className="button button--secondary" onClick={() => setRescheduling((value) => !value)}>시험 일정 변경</button></div>}
        {rescheduling && <RescheduleForm exam={exam} pending={reschedule.isPending} onCancel={() => setRescheduling(false)} onSubmit={(parts) => reschedule.mutate(parts)} />}
        {exam.status === "CANCELED" && <div><button type="button" className="button button--primary" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>{duplicate.isPending ? "복제 중…" : "새 초안으로 복제"}</button></div>}
        {resultStage && <div className="page-stack"><h3>결과 공개</h3><p>모든 응시가 채점 완료된 뒤 결과를 확인하고 학생에게 공개합니다.</p><div><button type="button" className="button button--secondary" disabled={review.isPending || exam.status === "COMPLETED"} onClick={() => review.mutate()}>{review.isPending ? "확인 중…" : "결과 검토 완료"}</button> <button type="button" className="button button--primary" disabled={publish.isPending || exam.status === "COMPLETED"} onClick={() => publish.mutate()}>{publish.isPending ? "공개 중…" : "학생에게 결과 공개"}</button></div>{reviewedAt && <p className="form-success">결과 검토 완료: {formatDateTime(reviewedAt)}</p>}{publishedAt && <p className="form-success">결과 공개 완료: {formatDateTime(publishedAt)}</p>}</div>}
        {actionError && <p className="form-error" role="alert">{message(actionError)}</p>}
      </div>
      {resultStage && <AttemptResultLookup examId={exam.id} />}
    </section>
  );
}

function RescheduleForm({ exam, pending, onCancel, onSubmit }: { exam: Exam; pending: boolean; onCancel: () => void; onSubmit: (parts: Array<{ type: "WRITTEN" | "PRACTICAL"; opensAt: string; closesAt: string; durationMinutes?: number }>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(exam.parts.map((part) => ({ type: part.type, opensAt: new Date(String(data.get(`${part.type}-opensAt`))).toISOString(), closesAt: new Date(String(data.get(`${part.type}-closesAt`))).toISOString(), ...(part.type === "WRITTEN" ? { durationMinutes: Number(data.get("WRITTEN-durationMinutes")) } : {}) })));
  };
  return <form className="page-stack" onSubmit={submit}><fieldset disabled={pending}>{exam.parts.map((part) => <div className="form-grid" key={part.type}><label className="form-field"><span>{part.type === "WRITTEN" ? "필기" : "실기"} 시작</span><input name={`${part.type}-opensAt`} type="datetime-local" defaultValue={localInput(part.opensAt)} required /></label><label className="form-field"><span>{part.type === "WRITTEN" ? "필기" : "실기"} 종료</span><input name={`${part.type}-closesAt`} type="datetime-local" defaultValue={localInput(part.closesAt)} required /></label>{part.type === "WRITTEN" && <label className="form-field"><span>제한 시간(분)</span><input name="WRITTEN-durationMinutes" type="number" min={1} max={1440} defaultValue={part.durationMinutes ?? 60} required /></label>}</div>)}</fieldset><div><button type="button" className="button button--ghost" onClick={onCancel}>취소</button> <button type="submit" className="button button--primary" disabled={pending}>{pending ? "변경 중…" : "일정 변경"}</button></div></form>;
}

function AttemptResultLookup({ examId }: { examId: string }) {
  const client = useQueryClient();
  const [input, setInput] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const detail = useQuery({ queryKey: ["exam-attempt", examId, attemptId], queryFn: () => getExamAttempt(examId, attemptId), enabled: Boolean(attemptId), retry: false });
  const revise = useMutation({
    mutationFn: (revision: { reason: string; writtenScore?: number; writtenResult?: PassStatus; finalResult?: PassStatus; writtenFeedback?: string }) => reviseExamResult(examId, attemptId, revision),
    onSuccess: (saved) => client.setQueryData(["exam-attempt", examId, attemptId], saved),
  });
  return <div className="card-body page-stack"><h3>개별 응시 결과</h3><p>현재 응시 대상 API에는 응시 기록 ID가 포함되지 않아, 기록 ID로 상세 결과를 조회합니다.</p><form className="form-grid" onSubmit={(event) => { event.preventDefault(); setAttemptId(input.trim()); }}><label className="form-field"><span>응시 기록 ID</span><input value={input} onChange={(event) => setInput(event.target.value)} required /></label><button type="submit" className="button button--secondary">결과 조회</button></form>{detail.isPending && attemptId ? <LoadingState /> : detail.isError ? <ErrorState message={message(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data ? <AttemptDetailView attempt={detail.data} pending={revise.isPending} error={revise.isError ? message(revise.error) : ""} onRevise={(value) => revise.mutate(value)} /> : null}</div>;
}

function AttemptDetailView({ attempt, pending, error, onRevise }: { attempt: AttemptDetail; pending: boolean; error: string; onRevise: (input: { reason: string; writtenScore?: number; writtenResult?: PassStatus; finalResult?: PassStatus; writtenFeedback?: string }) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const score = String(data.get("writtenScore") ?? "");
    const writtenResult = String(data.get("writtenResult") ?? "") as PassStatus;
    const finalResult = String(data.get("finalResult") ?? "") as PassStatus;
    onRevise({ reason: String(data.get("reason") ?? "").trim(), writtenScore: score ? Number(score) : undefined, writtenResult: writtenResult || undefined, finalResult: finalResult || undefined, writtenFeedback: String(data.get("writtenFeedback") ?? "") || undefined });
  };
  return <div className="page-stack"><dl><div><dt>학생 ID</dt><dd>{attempt.studentId}</dd></div><div><dt>응시 상태</dt><dd>{attempt.status}</dd></div><div><dt>필기 점수</dt><dd>{attempt.writtenScore ?? "-"}</dd></div><div><dt>최종 결과</dt><dd>{RESULT_LABELS[attempt.finalResult]}</dd></div></dl><div>{attempt.questions.map((question, index) => <article className="surface-card" key={question.examQuestionId}><strong>{index + 1}. {question.prompt}</strong><p>배점 {question.score}점 · 획득 {question.awardedScore ?? "-"}점 · {question.isCorrect === null ? "미채점" : question.isCorrect ? "정답" : "오답"}</p><p>제출 답안: {question.subjectiveText ?? (question.selectedOptionIds.join(", ") || "없음")}</p><details><summary>정답과 해설</summary><p>허용 정답: {question.acceptedAnswers.join(", ") || question.options.filter((option) => option.isCorrect).map((option) => option.content).join(", ") || "없음"}</p><p>{question.explanation ?? "해설 없음"}</p></details></article>)}</div><form className="page-stack" onSubmit={submit}><h4>결과 정정</h4><div className="form-grid"><label className="form-field"><span>필기 점수</span><input name="writtenScore" type="number" min={0} step="0.01" defaultValue={attempt.writtenScore ?? ""} /></label><label className="form-field"><span>필기 판정</span><select name="writtenResult" defaultValue={attempt.writtenResult}><option value="PENDING">판정 대기</option><option value="PASS">합격</option><option value="FAIL">불합격</option></select></label><label className="form-field"><span>최종 판정</span><select name="finalResult" defaultValue={attempt.finalResult}><option value="PENDING">판정 대기</option><option value="PASS">합격</option><option value="FAIL">불합격</option></select></label></div><label className="form-field"><span>학생 피드백</span><textarea name="writtenFeedback" rows={3} /></label><label className="form-field"><span>정정 사유</span><textarea name="reason" rows={3} maxLength={1000} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button--primary" disabled={pending}>{pending ? "정정 중…" : "결과 정정"}</button></form>{attempt.revisions.length > 0 && <details><summary>정정 이력 {attempt.revisions.length}건</summary>{attempt.revisions.map((revision, index) => <article key={`${revision.changedAt}-${index}`}><strong>{formatDateTime(revision.changedAt)}</strong><p>{revision.reason}</p><pre>{JSON.stringify({ before: revision.previousResult, after: revision.newResult }, null, 2)}</pre></article>)}</details>}</div>;
}
