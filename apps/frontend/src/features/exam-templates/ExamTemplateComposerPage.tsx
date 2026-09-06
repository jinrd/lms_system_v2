import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import { ApiError } from "../../lib/api-client";
import { getQuestions, type Question } from "../questions/questions.api";
import {
  getExamTemplate,
  getExamTemplates,
  type ExamTemplate,
} from "./exam-templates.api";
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

// 5·6단계 테스트용 페이지다. 기존 ExamTemplatesPage 는 4단계(템플릿·파트 골격)까지만
// 다루므로, 파트 구성(문제 선택·실기 평가 항목)과 활성화 검증·활성/비활성·복제를
// 여기서 직접 호출해 확인한다. 스타일은 기존 클래스만 재사용한다.

function readError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "요청을 처리하지 못했습니다.";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ExamTemplateComposerPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["composer", "exam-templates"],
    queryFn: () => getExamTemplates({ page: 1, limit: 100 }),
  });

  const templateId = selectedId ?? list.data?.items[0]?.id ?? null;

  const detail = useQuery({
    queryKey: ["composer", "exam-template", templateId],
    queryFn: () => getExamTemplate(templateId!),
    enabled: Boolean(templateId),
  });

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>시험 템플릿 구성 (테스트)</h1>
          <p>
            필기 문제 선택, 실기 평가 항목, 활성화 검증·복제를 직접 호출해
            확인합니다.
          </p>
        </div>
      </header>

      <section className="surface-card">
        <header className="card-header">
          <div>
            <h2>템플릿 선택</h2>
            <p>
              {list.isPending
                ? "불러오는 중"
                : `총 ${list.data?.pagination.total ?? 0}개`}
            </p>
          </div>
        </header>
        <div className="card-body">
          {list.isPending ? (
            <LoadingState message="템플릿 목록을 불러오는 중입니다." />
          ) : list.isError ? (
            <ErrorState
              message={readError(list.error)}
              onRetry={() => void list.refetch()}
            />
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="템플릿이 없습니다."
              description="시험 템플릿 화면에서 초안을 먼저 만들어 주세요."
            />
          ) : (
            <label className="form-field">
              <span>템플릿</span>
              <select
                value={templateId ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {list.data?.items.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.active ? "활성" : "초안"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {detail.isPending && templateId ? (
        <LoadingState message="템플릿 상세를 불러오는 중입니다." />
      ) : detail.isError ? (
        <ErrorState
          message={readError(detail.error)}
          onRetry={() => void detail.refetch()}
        />
      ) : detail.data ? (
        <ComposerBody template={detail.data} />
      ) : null}
    </div>
  );
}

function ComposerBody({ template }: { template: ExamTemplate }) {
  const hasWritten = template.parts.some((part) => part.type === "WRITTEN");
  const hasPractical = template.parts.some((part) => part.type === "PRACTICAL");

  return (
    <>
      <ActivationPanel template={template} />
      {hasWritten ? (
        <WrittenQuestionsPanel template={template} />
      ) : (
        <section className="surface-card">
          <header className="card-header">
            <h2>필기 문제</h2>
          </header>
          <div className="card-body">
            <EmptyState
              title="필기 파트가 없습니다."
              description="시험 템플릿 화면에서 필기 파트를 먼저 추가하세요."
            />
          </div>
        </section>
      )}
      {hasPractical ? (
        <PracticalCriteriaPanel template={template} />
      ) : (
        <section className="surface-card">
          <header className="card-header">
            <h2>실기 평가 항목</h2>
          </header>
          <div className="card-body">
            <EmptyState
              title="실기 파트가 없습니다."
              description="시험 템플릿 화면에서 실기 파트를 먼저 추가하세요."
            />
          </div>
        </section>
      )}
    </>
  );
}

export function ActivationPanel({ template }: { template: ExamTemplate }) {
  const client = useQueryClient();
  const [result, setResult] = useState<ValidationResult | null>(null);

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["composer"] });
  };

  const validate = useMutation({
    mutationFn: () => validateExamTemplate(template.id),
    onSuccess: setResult,
  });
  const activate = useMutation({
    mutationFn: () => activateExamTemplate(template.id),
    onSuccess: invalidate,
  });
  const deactivate = useMutation({
    mutationFn: () => deactivateExamTemplate(template.id),
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateExamTemplate(template.id),
    onSuccess: invalidate,
  });

  const busy =
    validate.isPending ||
    activate.isPending ||
    deactivate.isPending ||
    duplicate.isPending;

  return (
    <section className="surface-card">
      <header className="card-header">
        <div>
          <h2>활성화 · 복제</h2>
          <p>
            현재 상태:{" "}
            <span
              className={`status-badge ${template.active ? "status-badge--success" : "status-badge--neutral"}`}
            >
              {template.active ? "활성" : "초안"}
            </span>
          </p>
        </div>
      </header>
      <div className="card-body">
        <div className="dialog__actions" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => validate.mutate()}
          >
            검증만 실행
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || template.active}
            onClick={() => activate.mutate()}
          >
            활성화
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy || !template.active}
            onClick={() => deactivate.mutate()}
          >
            비활성화
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={busy}
            onClick={() => duplicate.mutate()}
          >
            복제
          </button>
        </div>

        {activate.isError && (
          <p role="alert" className="form-error">
            활성화 실패: {readError(activate.error)}
          </p>
        )}
        {deactivate.isError && (
          <p role="alert" className="form-error">
            비활성화 실패: {readError(deactivate.error)}
          </p>
        )}
        {duplicate.isSuccess && (
          <p className="form-success" role="status">
            복제본 “{duplicate.data.name}”을(를) 만들었습니다.
          </p>
        )}
        {activate.isSuccess && (
          <p className="form-success" role="status">
            템플릿을 활성화했습니다.
          </p>
        )}

        {result && <ValidationIssues result={result} />}
      </div>
    </section>
  );
}

export function ValidationIssues({ result }: { result: ValidationResult }) {
  if (result.valid) {
    return (
      <p className="form-success" role="status">
        검증 통과: 활성화할 수 있습니다.
      </p>
    );
  }
  return (
    <div role="alert">
      <p className="form-error">검증 실패 ({result.issues.length}건)</p>
      <ul>
        {result.issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`}>
            <strong>{issue.code}</strong>
            {issue.part ? ` · ${issue.part}` : ""} — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

type QuestionRow = { questionId: string; prompt: string; score: number };

export function WrittenQuestionsPanel({
  template,
}: {
  template: ExamTemplate;
}) {
  const client = useQueryClient();
  const writtenPart = template.parts.find((part) => part.type === "WRITTEN")!;
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [pickSubjectId, setPickSubjectId] = useState(
    template.subjects[0]?.subjectId ?? "",
  );

  const current = useQuery({
    queryKey: ["composer", "written", template.id],
    queryFn: () => getTemplateWrittenQuestions(template.id),
  });

  const picker = useQuery({
    queryKey: ["composer", "pick-questions", pickSubjectId],
    queryFn: () =>
      getQuestions({ subjectId: pickSubjectId, active: true, limit: 100 }),
    enabled: Boolean(pickSubjectId),
  });

  const serverRows: QuestionRow[] = useMemo(
    () =>
      (current.data?.questions ?? []).map((entry) => ({
        questionId: entry.questionId,
        prompt: entry.question.prompt,
        score: entry.score,
      })),
    [current.data],
  );

  const draft = rows ?? serverRows;
  const dirty = rows !== null;
  const localSum = round2(draft.reduce((sum, row) => sum + (row.score || 0), 0));
  const total = writtenPart.totalScore;

  const save = useMutation({
    mutationFn: () => {
      const payload: TemplateQuestionInput[] = draft.map((row) => ({
        questionId: row.questionId,
        score: row.score,
      }));
      return replaceTemplateWrittenQuestions(template.id, payload);
    },
    onSuccess: (data) => {
      client.setQueryData(["composer", "written", template.id], data);
      setRows(null);
    },
  });

  const update = (next: QuestionRow[]) => setRows(next);
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };
  const addQuestion = (question: Question) => {
    if (draft.some((row) => row.questionId === question.id)) return;
    update([
      ...draft,
      {
        questionId: question.id,
        prompt: question.prompt,
        score: question.defaultScore,
      },
    ]);
  };

  return (
    <section className="surface-card">
      <header className="card-header">
        <div>
          <h2>필기 문제 구성</h2>
          <p>
            총점 {total}점 / 담긴 점수 {localSum}점 ·{" "}
            <strong>
              차이 {round2(localSum - total) > 0 ? "+" : ""}
              {round2(localSum - total)}점
            </strong>
            {current.data
              ? ` (서버 기준 ${current.data.assignedScoreSum}점, 차이 ${current.data.difference}점)`
              : ""}
          </p>
        </div>
      </header>
      <div className="card-body">
        {template.active && (
          <p className="form-error">
            활성 템플릿의 구성은 변경할 수 없습니다. 복제 후 편집하세요.
          </p>
        )}

        {current.isPending ? (
          <LoadingState message="문제 구성을 불러오는 중입니다." />
        ) : current.isError ? (
          <ErrorState
            message={readError(current.error)}
            onRetry={() => void current.refetch()}
          />
        ) : draft.length === 0 ? (
          <EmptyState
            title="담긴 문제가 없습니다."
            description="아래에서 과목을 골라 문제를 추가하세요."
          />
        ) : (
          <ol className="composer-rows">
            {draft.map((row, index) => (
              <li
                key={row.questionId}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.35rem 0",
                }}
              >
                <span style={{ flex: 1 }}>
                  {index + 1}. {row.prompt}
                </span>
                <label className="form-field" style={{ width: "6rem" }}>
                  <span className="sr-only">배점</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.5}
                    value={row.score}
                    disabled={template.active}
                    aria-label={`${index + 1}번 문제 배점`}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = {
                        ...row,
                        score: Number(event.target.value),
                      };
                      update(next);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={template.active || index === 0}
                  aria-label={`${index + 1}번 위로`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={template.active || index === draft.length - 1}
                  aria-label={`${index + 1}번 아래로`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={template.active}
                  aria-label={`${index + 1}번 제거`}
                  onClick={() =>
                    update(draft.filter((_, i) => i !== index))
                  }
                >
                  제거
                </button>
              </li>
            ))}
          </ol>
        )}

        {!template.active && (
          <div className="composer-picker">
            <label className="form-field">
              <span>과목</span>
              <select
                value={pickSubjectId}
                onChange={(event) => setPickSubjectId(event.target.value)}
              >
                {template.subjects.map((subject) => (
                  <option key={subject.subjectId} value={subject.subjectId}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            {picker.isPending ? (
              <LoadingState message="문제를 불러오는 중입니다." />
            ) : picker.isError ? (
              <ErrorState message={readError(picker.error)} />
            ) : (
              <ul>
                {(picker.data?.items ?? []).map((question) => {
                  const added = draft.some(
                    (row) => row.questionId === question.id,
                  );
                  return (
                    <li
                      key={question.id}
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ flex: 1 }}>{question.prompt}</span>
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={added}
                        onClick={() => addQuestion(question)}
                      >
                        {added ? "담김" : "추가"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {save.isError && (
          <p role="alert" className="form-error">
            저장 실패: {readError(save.error)}
          </p>
        )}
        <div className="dialog__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={!dirty || save.isPending}
            onClick={() => setRows(null)}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={template.active || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "저장 중…" : "문제 구성 저장"}
          </button>
        </div>
      </div>
    </section>
  );
}

type CriterionRow = { name: string; description: string; maxScore: number };

export function PracticalCriteriaPanel({
  template,
}: {
  template: ExamTemplate;
}) {
  const client = useQueryClient();
  const practicalPart = template.parts.find(
    (part) => part.type === "PRACTICAL",
  )!;
  const [rows, setRows] = useState<CriterionRow[] | null>(null);

  const current = useQuery({
    queryKey: ["composer", "criteria", template.id],
    queryFn: () => getTemplatePracticalCriteria(template.id),
  });

  const serverRows: CriterionRow[] = useMemo(
    () =>
      (current.data?.criteria ?? []).map((criterion) => ({
        name: criterion.name,
        description: criterion.description ?? "",
        maxScore: criterion.maxScore,
      })),
    [current.data],
  );

  const draft = rows ?? serverRows;
  const dirty = rows !== null;
  const localSum = round2(
    draft.reduce((sum, row) => sum + (row.maxScore || 0), 0),
  );
  const total = practicalPart.totalScore;

  const save = useMutation({
    mutationFn: () => {
      const payload: TemplateCriterionInput[] = draft.map((row) => ({
        name: row.name,
        description: row.description || undefined,
        maxScore: row.maxScore,
      }));
      return replaceTemplatePracticalCriteria(template.id, payload);
    },
    onSuccess: (data) => {
      client.setQueryData(["composer", "criteria", template.id], data);
      setRows(null);
    },
  });

  const update = (next: CriterionRow[]) => setRows(next);
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  return (
    <section className="surface-card">
      <header className="card-header">
        <div>
          <h2>실기 평가 항목</h2>
          <p>
            총점 {total}점 / 항목 합계 {localSum}점 ·{" "}
            <strong>
              차이 {round2(localSum - total) > 0 ? "+" : ""}
              {round2(localSum - total)}점
            </strong>
            {current.data
              ? ` (서버 기준 ${current.data.assignedScoreSum}점, 차이 ${current.data.difference}점)`
              : ""}
          </p>
        </div>
      </header>
      <div className="card-body">
        {template.active && (
          <p className="form-error">
            활성 템플릿의 구성은 변경할 수 없습니다. 복제 후 편집하세요.
          </p>
        )}

        {current.isPending ? (
          <LoadingState message="평가 항목을 불러오는 중입니다." />
        ) : current.isError ? (
          <ErrorState
            message={readError(current.error)}
            onRetry={() => void current.refetch()}
          />
        ) : (
          <ol className="composer-rows">
            {draft.map((row, index) => (
              <li
                key={index}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                  padding: "0.35rem 0",
                }}
              >
                <label className="form-field" style={{ flex: 1 }}>
                  <span className="sr-only">항목명</span>
                  <input
                    type="text"
                    value={row.name}
                    maxLength={200}
                    disabled={template.active}
                    aria-label={`${index + 1}번 항목명`}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = { ...row, name: event.target.value };
                      update(next);
                    }}
                  />
                </label>
                <label className="form-field" style={{ flex: 1 }}>
                  <span className="sr-only">설명</span>
                  <input
                    type="text"
                    value={row.description}
                    maxLength={2000}
                    disabled={template.active}
                    aria-label={`${index + 1}번 설명`}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = {
                        ...row,
                        description: event.target.value,
                      };
                      update(next);
                    }}
                  />
                </label>
                <label className="form-field" style={{ width: "6rem" }}>
                  <span className="sr-only">최대 점수</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.5}
                    value={row.maxScore}
                    disabled={template.active}
                    aria-label={`${index + 1}번 최대 점수`}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = {
                        ...row,
                        maxScore: Number(event.target.value),
                      };
                      update(next);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={template.active || index === 0}
                  aria-label={`${index + 1}번 위로`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={template.active || index === draft.length - 1}
                  aria-label={`${index + 1}번 아래로`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={template.active}
                  aria-label={`${index + 1}번 제거`}
                  onClick={() =>
                    update(draft.filter((_, i) => i !== index))
                  }
                >
                  제거
                </button>
              </li>
            ))}
          </ol>
        )}

        {!template.active && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() =>
              update([
                ...draft,
                { name: "", description: "", maxScore: 10 },
              ])
            }
          >
            평가 항목 추가
          </button>
        )}

        {save.isError && (
          <p role="alert" className="form-error">
            저장 실패: {readError(save.error)}
          </p>
        )}
        <div className="dialog__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={!dirty || save.isPending}
            onClick={() => setRows(null)}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={template.active || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "저장 중…" : "평가 항목 저장"}
          </button>
        </div>
      </div>
    </section>
  );
}
