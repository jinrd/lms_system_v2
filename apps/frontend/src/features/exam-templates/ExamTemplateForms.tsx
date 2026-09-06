import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { getEducationFields, getSubjects } from "../education/education.api";
import type {
  ExamPartInput,
  ExamPartType,
  ExamScope,
  ExamStage,
  ExamTemplate,
  ExamTemplateInput,
  ExamTemplatePart,
} from "./exam-templates.api";
import {
  errorMessage,
  MIB,
  PART_LABELS,
  PRACTICAL_FILE_SIZE_BYTES,
  SCOPE_LABELS,
  STAGE_LABELS,
  validatePart,
  validateTemplate,
} from "./exam-template.utils";

function useEditorHeading() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: "start" });
  }, []);
  return ref;
}

type FormProps<T> = {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onDirty: () => void;
  onSubmit: (input: T) => void;
};

export function TemplateEditor({
  template,
  pending,
  error,
  onCancel,
  onDirty,
  onSubmit,
}: FormProps<ExamTemplateInput> & { template?: ExamTemplate }) {
  const headingRef = useEditorHeading();
  const { user } = useAuth();
  const [scope, setScope] = useState<ExamScope>(template?.scope ?? "SUBJECT");
  const [subjectIds, setSubjectIds] = useState(
    template?.subjects.map((subject) => subject.subjectId) ?? [],
  );
  const [subjectSearch, setSubjectSearch] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const subjectsQuery = useQuery({
    queryKey: ["exam-template-subjects", user?.id],
    queryFn: async () => {
      const fields = await getEducationFields();
      const groups = await Promise.all(
        fields.map(async (field) =>
          (await getSubjects(field.id))
            .filter((subject) => subject.active)
            .map((subject) => ({
              subjectId: subject.id,
              name: subject.name,
              active: subject.active,
              fieldName: field.name,
            })),
        ),
      );
      return groups.flat();
    },
  });
  const options = new Map(
    (subjectsQuery.data ?? []).map((subject) => [subject.subjectId, subject]),
  );
  for (const subject of template?.subjects ?? []) {
    if (!options.has(subject.subjectId))
      options.set(subject.subjectId, {
        ...subject,
        fieldName: "기존 구성 과목",
      });
  }
  const visibleSubjects = [...options.values()].filter((subject) =>
    `${subject.fieldName} ${subject.name}`
      .toLowerCase()
      .includes(subjectSearch.toLowerCase()),
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const days = String(data.get("defaultOpenDays") ?? "");
    const input: ExamTemplateInput = {
      name: String(data.get("name")).trim(),
      description: String(data.get("description")).trim(),
      stage: String(data.get("stage")) as ExamStage,
      scope,
      subjectIds,
      ...(days ? { defaultOpenDays: Number(days) } : {}),
    };
    const message = validateTemplate(input);
    setValidation(message);
    if (!message) onSubmit(input);
  };
  return (
    <section className="surface-card template-editor">
      <header className="card-header">
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="template-editor__heading"
          >
            {template ? "기본 정보 수정" : "새 시험 템플릿"}
          </h2>
          <p>과목과 시험 단계를 정한 뒤 필기·실기 파트를 구성합니다.</p>
        </div>
      </header>
      <form
        className="card-body template-form"
        onSubmit={submit}
        onChange={() => {
          onDirty();
          setValidation(null);
        }}
      >
        <fieldset disabled={pending} className="template-form__fields">
          <label className="form-field">
            <span>
              템플릿 이름 <span aria-hidden="true">*</span>
            </span>
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={template?.name ?? ""}
              placeholder="예: 헤어 디자인 중간 평가"
            />
          </label>
          <label className="form-field">
            <span>설명</span>
            <textarea
              name="description"
              maxLength={10000}
              rows={3}
              defaultValue={template?.description ?? ""}
              placeholder="시험의 목적과 적용 대상을 작성하세요."
            />
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>시험 범위</span>
              <select
                name="scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as ExamScope)}
              >
                {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>시험 단계</span>
              <select name="stage" defaultValue={template?.stage ?? "REGULAR"}>
                {Object.entries(STAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-field">
            <span>
              기본 응시 기간 (일)
              {template?.defaultOpenDays != null ? "" : " · 선택"}
            </span>
            <input
              name="defaultOpenDays"
              type="number"
              min={1}
              max={365}
              step={1}
              required={template?.defaultOpenDays != null}
              defaultValue={template?.defaultOpenDays ?? ""}
              placeholder="1~365"
            />
            <small>
              {template?.defaultOpenDays != null
                ? "설정된 응시 기간은 1~365일 범위에서 변경할 수 있습니다."
                : "미입력 시 기본 응시 기간을 지정하지 않습니다."}
            </small>
          </label>
          <fieldset className="template-subject-picker">
            <legend>구성 과목 · {subjectIds.length}개 선택</legend>
            <p id="template-subject-help">
              {scope === "SUBJECT"
                ? "과목형은 과목을 정확히 1개 선택합니다."
                : "종합형은 과목을 1개 이상 선택합니다."}
            </p>
            {user?.role === "INSTRUCTOR" && (
              <p>
                현재 담당하는 반의 과목으로 구성해 주세요. 담당하지 않는 과목은
                저장할 수 없습니다.
              </p>
            )}
            <label className="form-field">
              <span className="sr-only">구성 과목 검색</span>
              <input
                type="search"
                value={subjectSearch}
                onChange={(event) => setSubjectSearch(event.target.value)}
                placeholder="분야 또는 과목 검색"
              />
            </label>
            {subjectsQuery.isPending && (
              <p role="status">선택 가능한 과목을 불러오는 중입니다.</p>
            )}
            {subjectsQuery.isError && (
              <div role="alert">
                <p>{errorMessage(subjectsQuery.error)}</p>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void subjectsQuery.refetch()}
                >
                  과목 다시 불러오기
                </button>
              </div>
            )}
            <div
              className="template-subject-options"
              aria-describedby="template-subject-help"
            >
              {visibleSubjects.map((subject) => (
                <label
                  className="template-subject-option"
                  key={subject.subjectId}
                >
                  <input
                    type="checkbox"
                    checked={subjectIds.includes(subject.subjectId)}
                    disabled={
                      !subject.active && !subjectIds.includes(subject.subjectId)
                    }
                    onChange={(event) =>
                      setSubjectIds((current) =>
                        event.target.checked
                          ? [...current, subject.subjectId]
                          : current.filter((id) => id !== subject.subjectId),
                      )
                    }
                  />
                  <span>
                    <strong>
                      {subject.name}
                      {!subject.active && " (사용 중지)"}
                    </strong>
                    <small>{subject.fieldName}</small>
                  </span>
                </label>
              ))}
            </div>
            {!subjectsQuery.isPending &&
              !subjectsQuery.isError &&
              visibleSubjects.length === 0 && (
                <p>
                  {subjectSearch
                    ? "검색 조건에 맞는 과목이 없습니다."
                    : "선택 가능한 활성 과목이 없습니다. 교육 분야·과목에서 과목을 등록해 주세요."}
                </p>
              )}
          </fieldset>
        </fieldset>
        {(validation || error) && (
          <p className="form-error" role="alert">
            {validation || error}
          </p>
        )}
        <div className="template-form__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={pending}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={pending || (!template && !subjectsQuery.isSuccess)}
          >
            {pending ? "저장 중…" : template ? "변경 사항 저장" : "초안 만들기"}
          </button>
        </div>
      </form>
    </section>
  );
}

function NumberField({
  label,
  name,
  value,
  min,
  max,
  step = 1,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number | "any";
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        required
        min={min}
        max={max}
        step={step}
        defaultValue={value}
      />
    </label>
  );
}

export function PartEditor({
  type,
  part,
  pending,
  error,
  onCancel,
  onDirty,
  onSubmit,
}: FormProps<ExamPartInput> & { type: ExamPartType; part?: ExamTemplatePart }) {
  const headingRef = useEditorHeading();
  const [validation, setValidation] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const number = (name: string) => Number(data.get(name));
    const input: ExamPartInput = {
      totalScore: number("totalScore"),
      passScore: number("passScore"),
      defaultOpenOffsetDays: number("defaultOpenOffsetDays"),
      defaultOpenDays: number("defaultOpenDays"),
      instructions: String(data.get("instructions")).trim(),
      ...(type === "WRITTEN"
        ? { durationMinutes: number("durationMinutes") }
        : {
            minFiles: number("minFiles"),
            maxFiles: number("maxFiles"),
            // 파일당 최대 크기는 서버가 5 MiB로 고정한다. 화면에서 편집하지 않는다.
            maxFileSizeBytes: PRACTICAL_FILE_SIZE_BYTES,
            maxTotalSizeBytes: Math.round(number("maxTotalSizeMiB") * MIB),
          }),
    };
    const message = validatePart(input);
    setValidation(message);
    if (!message) onSubmit(input);
  };
  return (
    <section className="surface-card template-editor">
      <header className="card-header">
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="template-editor__heading"
          >
            {PART_LABELS[type]} 파트 {part ? "수정" : "추가"}
          </h2>
          <p>평가 기준과 응시 조건을 설정합니다.</p>
        </div>
      </header>
      <form
        className="card-body template-form"
        onSubmit={submit}
        onChange={() => {
          onDirty();
          setValidation(null);
        }}
      >
        <fieldset disabled={pending} className="template-form__fields">
          <div className="form-grid">
            <NumberField
              label="총점"
              name="totalScore"
              value={part?.totalScore ?? 100}
              min={0.01}
              max={9999.99}
              step={0.01}
            />
            <NumberField
              label="합격 점수"
              name="passScore"
              value={part?.passScore ?? 60}
              min={0}
              max={9999.99}
              step={0.01}
            />
            <NumberField
              label="전체 시험 시작일로부터 (일 후)"
              name="defaultOpenOffsetDays"
              value={part?.defaultOpenOffsetDays ?? 0}
              min={0}
              max={3650}
            />
            <NumberField
              label="파트 응시 기간 (일)"
              name="defaultOpenDays"
              value={part?.defaultOpenDays ?? 7}
              min={1}
              max={365}
            />
          </div>
          <p className="field-hint">
            시작일 차이가 0이면 전체 시험 시작일부터 응시할 수 있습니다.
          </p>
          {type === "WRITTEN" ? (
            <NumberField
              label="필기 제한 시간 (분)"
              name="durationMinutes"
              value={part?.durationMinutes ?? 60}
              min={1}
              max={1440}
            />
          ) : (
            <>
              <h3 className="template-form__section-title">실기 제출 파일</h3>
              <div className="form-grid">
                <NumberField
                  label="최소 제출 파일 수 (개)"
                  name="minFiles"
                  value={part?.minFiles ?? 1}
                  min={1}
                  max={5}
                />
                <NumberField
                  label="최대 제출 파일 수 (개)"
                  name="maxFiles"
                  value={part?.maxFiles ?? 5}
                  min={1}
                  max={5}
                />
                <label className="form-field">
                  <span>파일당 최대 크기</span>
                  <input
                    type="text"
                    value={`${PRACTICAL_FILE_SIZE_BYTES / MIB} MiB 고정`}
                    readOnly
                    disabled
                  />
                </label>
                <NumberField
                  label="전체 최대 크기 (MiB)"
                  name="maxTotalSizeMiB"
                  value={(part?.maxTotalSizeBytes ?? 40 * MIB) / MIB}
                  min={1 / MIB}
                  max={40}
                  step="any"
                />
              </div>
              <p className="field-hint">
                최대 5개, 전체 40 MiB까지 설정할 수 있습니다. 파일당 최대 크기는
                5 MiB로 고정입니다. 1 MiB = 1,048,576바이트입니다.
              </p>
            </>
          )}
          <label className="form-field">
            <span>응시 안내</span>
            <textarea
              name="instructions"
              maxLength={10000}
              rows={5}
              defaultValue={part?.instructions ?? ""}
              placeholder="응시 방법과 주의 사항을 작성하세요."
            />
          </label>
        </fieldset>
        {(validation || error) && (
          <p className="form-error" role="alert">
            {validation || error}
          </p>
        )}
        <div className="template-form__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={pending}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={pending}
          >
            {pending ? "저장 중…" : `${PART_LABELS[type]} 파트 저장`}
          </button>
        </div>
      </form>
    </section>
  );
}
