import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ListChecks,
  Pencil,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/PageStates";
import {
  getEducationFields,
  getSubjects,
} from "../education/education.api";
import {
  changeQuestionActive,
  createQuestion,
  getQuestions,
  updateQuestion,
  type DifficultyLevel,
  type Question,
  type QuestionInput,
  type QuestionOptionInput,
  type QuestionType,
} from "./questions.api";

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "단일 선택",
  MULTIPLE_CHOICE: "복수 선택",
  SHORT_ANSWER: "단답형",
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  EASY: "쉬움",
  NORMAL: "보통",
  HARD: "어려움",
};

type SubjectOption = {
  id: string;
  name: string;
  fieldName: string;
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; question: Question }
  | null;

type ActiveFilter = "" | "true" | "false";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function QuestionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [type, setType] = useState<QuestionType | "">("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel | "">("");
  const [active, setActive] = useState<ActiveFilter>("");
  const [createdByMe, setCreatedByMe] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);

  const fieldsQuery = useQuery({
    queryKey: ["education-fields", "question-bank"],
    queryFn: getEducationFields,
  });
  const subjectsQuery = useQuery({
    queryKey: [
      "question-bank-subjects",
      fieldsQuery.data?.map((field) => field.id),
    ],
    enabled: Boolean(fieldsQuery.data),
    queryFn: async (): Promise<SubjectOption[]> => {
      const activeFields = (fieldsQuery.data ?? []).filter(
        (field) => field.active,
      );
      const groups = await Promise.all(
        activeFields.map(async (field) => ({
          field,
          subjects: (await getSubjects(field.id)).filter(
            (subject) => subject.active,
          ),
        })),
      );

      return groups.flatMap(({ field, subjects }) =>
        subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          fieldName: field.name,
        })),
      );
    },
  });
  const questionsQuery = useQuery({
    queryKey: [
      "questions",
      { page, keyword, subjectId, type, difficulty, active, createdByMe },
    ],
    queryFn: () =>
      getQuestions({
        page,
        limit: 20,
        keyword: keyword || undefined,
        subjectId: subjectId || undefined,
        type: type || undefined,
        difficulty: difficulty || undefined,
        active: active === "" ? undefined : active === "true",
        createdByMe: createdByMe || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["questions"] });
  const saveMutation = useMutation({
    mutationFn: ({ question, input }: { question?: Question; input: QuestionInput }) =>
      question ? updateQuestion(question.id, input) : createQuestion(input),
    onSuccess: async (saved) => {
      setEditor(null);
      setSelectedId(saved.id);
      setMobileDetailOpen(true);
      await refresh();
    },
  });
  const activeMutation = useMutation({
    mutationFn: (question: Question) =>
      changeQuestionActive(question.id, !question.active),
    onSuccess: async (saved) => {
      setSelectedId(saved.id);
      await refresh();
    },
  });

  const subjects = subjectsQuery.data ?? [];
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const questionPage = questionsQuery.data;
  const questions = questionPage?.items ?? [];
  const selected =
    questions.find((question) => question.id === selectedId) ??
    questions[0] ??
    null;
  const hasFilters = Boolean(
    keyword || subjectId || type || difficulty || active || createdByMe,
  );

  const resetFilters = (): void => {
    setPage(1);
    setKeywordInput("");
    setKeyword("");
    setSubjectId("");
    setType("");
    setDifficulty("");
    setActive("");
    setCreatedByMe(false);
    setSelectedId(null);
    setMobileDetailOpen(false);
  };

  if (fieldsQuery.isLoading || subjectsQuery.isLoading) {
    return <LoadingState message="문제은행의 과목 정보를 불러오고 있습니다." />;
  }

  if (fieldsQuery.isError || subjectsQuery.isError) {
    return <ErrorState message="문제은행의 과목 정보를 불러오지 못했습니다." />;
  }

  return (
    <div
      className={`page-stack questions-page ${
        mobileDetailOpen ? "page--mobile-detail-open" : ""
      }`}
    >
      <header className="page-header">
        <div>
          <h1>문제은행</h1>
          <p>과목별 필기 문제와 정답 기준을 작성하고 출제 상태를 관리합니다.</p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            saveMutation.reset();
            setEditor({ mode: "create" });
            setMobileDetailOpen(true);
          }}
        >
          <CirclePlus size={18} />새 문제
        </button>
      </header>

      <form
        className="filter-bar question-filter"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setKeyword(keywordInput.trim());
          setSelectedId(null);
        }}
      >
        <label className="filter-control question-filter__keyword">
          <span className="sr-only">문제 내용 검색</span>
          <Search size={17} aria-hidden="true" />
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="문제 내용 검색"
            maxLength={200}
          />
        </label>

        <label className="filter-control">
          <span className="sr-only">과목</span>
          <select
            value={subjectId}
            onChange={(event) => {
              setPage(1);
              setSubjectId(event.target.value);
              setSelectedId(null);
            }}
          >
            <option value="">전체 과목</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.fieldName} · {subject.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span className="sr-only">문제 유형</span>
          <select
            value={type}
            onChange={(event) => {
              setPage(1);
              setType(event.target.value as QuestionType | "");
              setSelectedId(null);
            }}
          >
            <option value="">전체 유형</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span className="sr-only">난이도</span>
          <select
            value={difficulty}
            onChange={(event) => {
              setPage(1);
              setDifficulty(event.target.value as DifficultyLevel | "");
              setSelectedId(null);
            }}
          >
            <option value="">전체 난이도</option>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span className="sr-only">출제 상태</span>
          <select
            value={active}
            onChange={(event) => {
              setPage(1);
              setActive(event.target.value as ActiveFilter);
              setSelectedId(null);
            }}
          >
            <option value="">전체 상태</option>
            <option value="true">출제 가능</option>
            <option value="false">출제 중지</option>
          </select>
        </label>

        <label className="checkbox-label question-filter__mine">
          <input
            type="checkbox"
            checked={createdByMe}
            onChange={(event) => {
              setPage(1);
              setCreatedByMe(event.target.checked);
              setSelectedId(null);
            }}
          />
          내가 작성한 문제
        </label>

        <div className="question-filter__actions">
          {hasFilters && (
            <button type="button" className="button button--ghost" onClick={resetFilters}>
              초기화
            </button>
          )}
          <button type="submit" className="button button--secondary">
            검색
          </button>
        </div>
      </form>

      {questionsQuery.isError ? (
        <ErrorState
          message={getErrorMessage(questionsQuery.error)}
          onRetry={() => void questionsQuery.refetch()}
        />
      ) : questionsQuery.isLoading ? (
        <LoadingState message="문제를 불러오고 있습니다." />
      ) : questions.length === 0 && !editor ? (
        <EmptyState
          title={hasFilters ? "조건에 맞는 문제가 없습니다." : "등록된 문제가 없습니다."}
          description={
            hasFilters
              ? "검색 조건을 바꾸거나 초기화해 주세요."
              : "첫 번째 문제를 등록해 문제은행을 시작하세요."
          }
        />
      ) : (
        <section className="master-detail-layout workbench-layout question-workbench">
          <div
            className={`surface-card master-pane master-pane--list question-list-pane ${
              mobileDetailOpen ? "master-pane--mobile-hidden" : ""
            }`}
          >
            <header className="card-header">
              <div>
                <h2>문제 목록</h2>
                <p>총 {questionPage?.pagination.total ?? 0}개</p>
              </div>
            </header>

            <div className="question-list">
              {questions.map((question) => {
                const subject = subjectMap.get(question.subjectId);

                return (
                  <button
                    type="button"
                    className={`question-list-item ${
                      selected?.id === question.id && !editor
                        ? "question-list-item--active"
                        : ""
                    }`}
                    key={question.id}
                    onClick={() => {
                      saveMutation.reset();
                      setEditor(null);
                      setSelectedId(question.id);
                      setMobileDetailOpen(true);
                    }}
                  >
                    <span className="question-list-item__meta">
                      <span>{subject?.name ?? "과목 정보 없음"}</span>
                      <span>{TYPE_LABELS[question.type]}</span>
                    </span>
                    <strong>{question.prompt}</strong>
                    <span className="question-list-item__footer">
                      <span>{DIFFICULTY_LABELS[question.difficulty]} · {question.defaultScore}점</span>
                      <span
                        className={`status-badge ${
                          question.active
                            ? "status-badge--success"
                            : "status-badge--neutral"
                        }`}
                      >
                        {question.active ? "출제 가능" : "출제 중지"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {(questionPage?.pagination.totalPages ?? 0) > 1 && (
              <nav className="pagination" aria-label="문제 목록 페이지">
                <button
                  type="button"
                  className="button button--secondary button--compact"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((current) => Math.max(1, current - 1));
                    setSelectedId(null);
                  }}
                >
                  <ChevronLeft size={16} />이전
                </button>
                <span>
                  {page} / {questionPage?.pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="button button--secondary button--compact"
                  disabled={page >= (questionPage?.pagination.totalPages ?? 1)}
                  onClick={() => {
                    setPage((current) => current + 1);
                    setSelectedId(null);
                  }}
                >
                  다음<ChevronRight size={16} />
                </button>
              </nav>
            )}
          </div>

          <div
            className={`master-pane master-pane--detail question-detail-pane ${
              mobileDetailOpen ? "" : "master-pane--mobile-hidden"
            }`}
          >
            <button
              type="button"
              className="mobile-detail-back"
              onClick={() => {
                saveMutation.reset();
                setEditor(null);
                setMobileDetailOpen(false);
              }}
            >
              <ChevronLeft size={18} />문제 목록
            </button>

            {editor ? (
              <QuestionEditor
                key={
                  editor.mode === "edit"
                    ? `edit:${editor.question.id}`
                    : "create"
                }
                question={editor.mode === "edit" ? editor.question : undefined}
                subjects={subjects}
                pending={saveMutation.isPending}
                error={saveMutation.isError ? getErrorMessage(saveMutation.error) : null}
                onCancel={() => {
                  saveMutation.reset();
                  setEditor(null);
                  if (!selected) setMobileDetailOpen(false);
                }}
                onSubmit={(input) =>
                  saveMutation.mutate({
                    question: editor.mode === "edit" ? editor.question : undefined,
                    input,
                  })
                }
              />
            ) : selected ? (
              <QuestionDetail
                question={selected}
                subject={subjectMap.get(selected.subjectId)}
                changingActive={activeMutation.isPending}
                activeError={
                  activeMutation.isError ? getErrorMessage(activeMutation.error) : null
                }
                onEdit={() => {
                  saveMutation.reset();
                  setEditor({ mode: "edit", question: selected });
                }}
                onChangeActive={() => activeMutation.mutate(selected)}
              />
            ) : (
              <div className="surface-card">
                <EmptyState
                  title="확인할 문제를 선택해 주세요."
                  description="목록에서 문제를 선택하면 정답과 해설을 확인할 수 있습니다."
                />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

type QuestionDetailProps = {
  question: Question;
  subject?: SubjectOption;
  changingActive: boolean;
  activeError: string | null;
  onEdit: () => void;
  onChangeActive: () => void;
};

function QuestionDetail({
  question,
  subject,
  changingActive,
  activeError,
  onEdit,
  onChangeActive,
}: QuestionDetailProps) {
  return (
    <article className="surface-card question-detail-card">
      <header className="card-header">
        <div>
          <h2>문제 상세</h2>
          <p>
            {subject ? `${subject.fieldName} · ${subject.name}` : "과목 정보 없음"}
          </p>
        </div>
        <div className="button-group">
          <button type="button" className="button button--secondary" onClick={onEdit}>
            <Pencil size={16} />수정
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={changingActive}
            onClick={onChangeActive}
          >
            <Power size={16} />
            {question.active ? "출제 중지" : "출제 재개"}
          </button>
        </div>
      </header>

      <div className="card-body question-detail-body">
        <div className="detail-grid">
          <div className="detail-item">
            <span>문제 유형</span>
            <strong>{TYPE_LABELS[question.type]}</strong>
          </div>
          <div className="detail-item">
            <span>난이도</span>
            <strong>{DIFFICULTY_LABELS[question.difficulty]}</strong>
          </div>
          <div className="detail-item">
            <span>기본 배점</span>
            <strong>{question.defaultScore}점</strong>
          </div>
          <div className="detail-item">
            <span>출제 상태</span>
            <strong>{question.active ? "출제 가능" : "출제 중지"}</strong>
          </div>
        </div>

        <section className="question-content-section">
          <h3>문제</h3>
          <p className="question-prompt">{question.prompt}</p>
        </section>

        <section className="question-content-section">
          <h3>{question.type === "SHORT_ANSWER" ? "허용 정답" : "보기와 정답"}</h3>
          {question.type === "SHORT_ANSWER" ? (
            <ol className="answer-list">
              {question.acceptedAnswers.map((answer) => (
                <li key={answer.id}>
                  <Check size={16} aria-hidden="true" />
                  <span>{answer.answerText}</span>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="answer-list">
              {question.options.map((option) => (
                <li
                  className={option.isCorrect ? "answer-list__correct" : ""}
                  key={option.id}
                >
                  <span className="answer-index">{option.displayOrder + 1}</span>
                  <span>{option.content}</span>
                  {option.isCorrect && <strong>정답</strong>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="question-content-section">
          <h3>해설</h3>
          <p className={question.explanation ? "question-explanation" : "muted"}>
            {question.explanation || "등록된 해설이 없습니다."}
          </p>
        </section>

        <dl className="question-detail-meta">
          <div>
            <dt>등록일</dt>
            <dd>{formatDateTime(question.createdAt)}</dd>
          </div>
          <div>
            <dt>최근 수정</dt>
            <dd>{formatDateTime(question.updatedAt)}</dd>
          </div>
        </dl>

        {activeError && <p className="form-error">{activeError}</p>}
      </div>
    </article>
  );
}

type QuestionEditorProps = {
  question?: Question;
  subjects: SubjectOption[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: QuestionInput) => void;
};

function QuestionEditor({
  question,
  subjects,
  pending,
  error,
  onCancel,
  onSubmit,
}: QuestionEditorProps) {
  const [type, setType] = useState<QuestionType>(
    question?.type ?? "SINGLE_CHOICE",
  );
  const [options, setOptions] = useState<QuestionOptionInput[]>(
    question?.options.map((option) => ({
      content: option.content,
      isCorrect: option.isCorrect,
    })) ?? [
      { content: "", isCorrect: true },
      { content: "", isCorrect: false },
    ],
  );
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question?.acceptedAnswers.map((answer) => answer.answerText) ?? [""],
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const changeType = (nextType: QuestionType): void => {
    setType(nextType);
    setClientError(null);

    if (nextType === "SHORT_ANSWER") {
      setAcceptedAnswers([""]);
      setOptions([]);
    } else {
      setOptions([
        { content: "", isCorrect: true },
        { content: "", isCorrect: false },
      ]);
      setAcceptedAnswers([]);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setClientError(null);
    const form = new FormData(event.currentTarget);
    const prompt = String(form.get("prompt") ?? "").trim();
    const explanation = String(form.get("explanation") ?? "").trim();
    const defaultScore = Number(form.get("defaultScore"));
    const cleanedOptions = options.map((option) => ({
      content: option.content.trim(),
      isCorrect: option.isCorrect,
    }));
    const cleanedAnswers = acceptedAnswers.map((answer) => answer.trim());

    if (!prompt) {
      setClientError("문제 내용을 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(defaultScore) || defaultScore < 0.01 || defaultScore > 9999.99) {
      setClientError("기본 배점은 0.01점 이상 9999.99점 이하로 입력해 주세요.");
      return;
    }
    if (type === "SHORT_ANSWER") {
      if (cleanedAnswers.length === 0 || cleanedAnswers.some((answer) => !answer)) {
        setClientError("허용 정답을 한 개 이상 입력해 주세요.");
        return;
      }
      const uniqueAnswers = new Set(
        cleanedAnswers.map((answer) => answer.toLocaleLowerCase("ko-KR")),
      );
      if (uniqueAnswers.size !== cleanedAnswers.length) {
        setClientError("중복된 허용 정답을 제거해 주세요.");
        return;
      }
    } else {
      if (cleanedOptions.length < 2 || cleanedOptions.some((option) => !option.content)) {
        setClientError("객관식 보기를 두 개 이상 모두 입력해 주세요.");
        return;
      }
      const correctCount = cleanedOptions.filter((option) => option.isCorrect).length;
      if (type === "SINGLE_CHOICE" && correctCount !== 1) {
        setClientError("단일 선택 문제는 정답을 정확히 한 개 선택해 주세요.");
        return;
      }
      if (type === "MULTIPLE_CHOICE" && correctCount < 1) {
        setClientError("복수 선택 문제는 정답을 한 개 이상 선택해 주세요.");
        return;
      }
    }

    onSubmit({
      subjectId: String(form.get("subjectId") ?? ""),
      type,
      prompt,
      explanation: explanation || undefined,
      defaultScore,
      difficulty: String(form.get("difficulty")) as DifficultyLevel,
      options: type === "SHORT_ANSWER" ? [] : cleanedOptions,
      acceptedAnswers: type === "SHORT_ANSWER" ? cleanedAnswers : [],
    });
  };

  return (
    <section className="surface-card question-editor-card">
      <header className="card-header">
        <div>
          <h2>{question ? "문제 수정" : "새 문제"}</h2>
          <p>문제 유형에 맞는 보기 또는 허용 정답을 입력합니다.</p>
        </div>
      </header>

      <form className="card-body question-editor" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>과목</span>
            <select name="subjectId" required defaultValue={question?.subjectId ?? ""}>
              <option value="">선택</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.fieldName} · {subject.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>문제 유형</span>
            <select
              value={type}
              onChange={(event) => changeType(event.target.value as QuestionType)}
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>문제 내용</span>
          <textarea
            name="prompt"
            rows={5}
            required
            maxLength={10000}
            defaultValue={question?.prompt ?? ""}
            placeholder="학생에게 제시할 문제를 입력하세요."
          />
        </label>

        <div className="form-grid">
          <label className="field">
            <span>난이도</span>
            <select name="difficulty" defaultValue={question?.difficulty ?? "NORMAL"}>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>기본 배점</span>
            <input
              name="defaultScore"
              type="number"
              min="0.01"
              max="9999.99"
              step="0.01"
              required
              defaultValue={question?.defaultScore ?? 1}
            />
          </label>
        </div>

        {type === "SHORT_ANSWER" ? (
          <fieldset className="question-builder">
            <legend>허용 정답</legend>
            <p>띄어쓰기와 대소문자는 서버에서 정규화하여 비교합니다.</p>
            <div className="question-builder__rows">
              {acceptedAnswers.map((answer, index) => (
                <div
                  className="question-builder-row question-builder-row--answer"
                  key={index}
                >
                  <span className="answer-index">{index + 1}</span>
                  <input
                    value={answer}
                    maxLength={2000}
                    aria-label={`허용 정답 ${index + 1}`}
                    onChange={(event) =>
                      setAcceptedAnswers((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button bordered-icon-button"
                    aria-label={`허용 정답 ${index + 1} 삭제`}
                    disabled={acceptedAnswers.length <= 1}
                    onClick={() =>
                      setAcceptedAnswers((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button button--secondary button--compact"
              disabled={acceptedAnswers.length >= 50}
              onClick={() => setAcceptedAnswers((current) => [...current, ""])}
            >
              <CirclePlus size={16} />허용 정답 추가
            </button>
          </fieldset>
        ) : (
          <fieldset className="question-builder">
            <legend>보기와 정답</legend>
            <p>
              {type === "SINGLE_CHOICE"
                ? "정답을 한 개 선택합니다."
                : "정답을 한 개 이상 선택합니다."}
            </p>
            <div className="question-builder__rows">
              {options.map((option, index) => (
                <div
                  className="question-builder-row question-builder-row--option"
                  key={index}
                >
                  <input
                    type={type === "SINGLE_CHOICE" ? "radio" : "checkbox"}
                    name="correctOption"
                    checked={option.isCorrect}
                    aria-label={`보기 ${index + 1} 정답`}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item, itemIndex) => ({
                          ...item,
                          isCorrect:
                            type === "SINGLE_CHOICE"
                              ? itemIndex === index
                              : itemIndex === index
                                ? event.target.checked
                                : item.isCorrect,
                        })),
                      )
                    }
                  />
                  <span className="answer-index">{index + 1}</span>
                  <input
                    value={option.content}
                    maxLength={2000}
                    aria-label={`보기 ${index + 1} 내용`}
                    placeholder={`보기 ${index + 1}`}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, content: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button bordered-icon-button"
                    aria-label={`보기 ${index + 1} 삭제`}
                    disabled={options.length <= 2}
                    onClick={() =>
                      setOptions((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button button--secondary button--compact"
              disabled={options.length >= 20}
              onClick={() =>
                setOptions((current) => [
                  ...current,
                  { content: "", isCorrect: false },
                ])
              }
            >
              <CirclePlus size={16} />보기 추가
            </button>
          </fieldset>
        )}

        <label className="field">
          <span>해설</span>
          <textarea
            name="explanation"
            rows={4}
            maxLength={10000}
            defaultValue={question?.explanation ?? ""}
            placeholder="정답의 근거나 풀이를 입력하세요."
          />
        </label>

        {(clientError || error) && (
          <p className="form-error" role="alert">
            {clientError || error}
          </p>
        )}

        <div className="question-editor__actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>
            취소
          </button>
          <button type="submit" className="button button--primary" disabled={pending}>
            <ListChecks size={17} />
            {pending ? "저장 중" : "저장"}
          </button>
        </div>
      </form>
    </section>
  );
}
