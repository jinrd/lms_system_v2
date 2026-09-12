import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "../../components/ui/PageStates";
import { getMyExamResult, type MyExamResult } from "./student-exams.api";

const RESULT_LABELS = { PENDING: "판정 대기", PASS: "합격", FAIL: "불합격" } as const;
const PART_LABELS: Record<string, string> = { WRITTEN: "필기", PRACTICAL: "실기" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "결과를 불러오지 못했습니다.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function StudentExamResultPanel({ examId }: { examId: string }) {
  const result = useQuery({ queryKey: ["my-exam-result", examId], queryFn: () => getMyExamResult(examId), retry: false });
  return <section className="surface-card"><header className="card-header"><div><h2>시험 결과</h2><p>담당자가 공개한 점수와 피드백을 확인합니다.</p></div></header><div className="card-body">{result.isPending ? <LoadingState message="시험 결과를 확인하는 중입니다." /> : result.isError ? <ErrorState message={message(result.error)} onRetry={() => void result.refetch()} /> : result.data ? <ResultContent result={result.data} /> : null}</div></section>;
}

function ResultContent({ result }: { result: MyExamResult }) {
  if (!result.published) return <p>아직 결과가 공개되지 않았습니다. 채점과 검토가 끝난 뒤 이곳에 표시됩니다.</p>;
  return <div className="page-stack"><p><strong>최종 결과: {RESULT_LABELS[result.finalResult]}</strong></p><dl>{result.parts.map((part) => <div key={part.type}><dt>{PART_LABELS[part.type] ?? part.type}</dt><dd>{part.score ?? "-"}점 / 합격 기준 {part.passScore}점 · {RESULT_LABELS[part.result]}</dd></div>)}</dl>{result.writtenFeedback && <div><strong>담당자 피드백</strong><p className="preserve-lines">{result.writtenFeedback}</p></div>}<p>공개 시각: {formatDateTime(result.publishedAt!)}</p>{result.revisedAt && <p>최근 정정 시각: {formatDateTime(result.revisedAt)}</p>}</div>;
}
