import { BookPlus, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import type { ManagedClass } from "../classes/class-management.api";
import {
  createSubjectEnrollment,
  getSubjectEnrollmentCandidates,
  type SubjectEnrollmentType,
} from "./enrollments.api";

type SubjectEnrollmentPanelProps = {
  classItem: ManagedClass;
  onChanged: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function getInitialDate(classItem: ManagedClass): string {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });

  if (today < classItem.startDate) {
    return classItem.startDate;
  }

  if (today > classItem.endDate) {
    return classItem.startDate;
  }

  return today;
}

export function SubjectEnrollmentPanel({
  classItem,
  onChanged,
}: SubjectEnrollmentPanelProps) {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sourceEnrollmentId, setSourceEnrollmentId] = useState("");

  const candidatesQuery = useQuery({
    queryKey: [
      "classes",
      classItem.id,
      "subject-enrollment-candidates",
      keyword,
    ],
    queryFn: () =>
      getSubjectEnrollmentCandidates(classItem.id, keyword || undefined),
    enabled: editorOpen,
  });

  const createMutation = useMutation({
    mutationFn: ({
      sourceEnrollmentId,
      courseOfferingSubjectId,
      type,
      startsOn,
      endsOn,
      attendanceManaged,
      gradeManaged,
      reason,
    }: {
      sourceEnrollmentId: string;
      courseOfferingSubjectId: string;
      type: SubjectEnrollmentType;
      startsOn: string;
      endsOn: string;
      attendanceManaged: boolean;
      gradeManaged: boolean;
      reason: string;
    }) =>
      createSubjectEnrollment(classItem.id, {
        sourceEnrollmentId,
        courseOfferingSubjectId,
        type,
        startsOn,
        endsOn,
        attendanceManaged,
        gradeManaged,
        reason,
      }),
    onSuccess: async () => {
      setEditorOpen(false);
      setKeyword("");
      setKeywordDraft("");
      setSourceEnrollmentId("");

      await queryClient.invalidateQueries({
        queryKey: ["classes", classItem.id, "enrollments"],
      });

      await onChanged();
    },
  });

  const handleSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setKeyword(keywordDraft.trim());
    setSourceEnrollmentId("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    createMutation.mutate({
      sourceEnrollmentId: String(formData.get("sourceEnrollmentId") ?? ""),
      courseOfferingSubjectId: String(
        formData.get("courseOfferingSubjectId") ?? "",
      ),
      type: String(
        formData.get("type") ?? "SUPPLEMENT",
      ) as SubjectEnrollmentType,
      startsOn: String(formData.get("startsOn") ?? ""),
      endsOn: String(formData.get("endsOn") ?? ""),
      attendanceManaged: formData.get("attendanceManaged") === "on",
      gradeManaged: formData.get("gradeManaged") === "on",
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  const candidates = candidatesQuery.data?.items ?? [];
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === sourceEnrollmentId) ?? null;

  // 이 반이 운영하는 과목 중, 선택한 학생이 기본 수강 중인 과목만 대상이 된다.
  const availableSubjects = classItem.programs
    .flatMap((program) =>
      program.subjects
        .filter((subject) => subject.active)
        .map((subject) => ({
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          subjectName: subject.name,
        })),
    )
    .filter((targetSubject) =>
      selectedCandidate?.subjects.some(
        (sourceSubject) =>
          sourceSubject.courseOfferingSubjectId ===
          targetSubject.courseOfferingSubjectId,
      ),
    );

  const editable = !classItem.archived && classItem.derivedStatus !== "ENDED";

  return (
    <section className="nested-section">
      <header className="nested-section__header">
        <div>
          <h3>과목 단위 보충·보강</h3>
          <p>다른 반의 기본 수강생을 특정 운영 과목에 참여시킵니다.</p>
        </div>

        <button
          type="button"
          className="button button--secondary button--compact"
          disabled={!editable}
          onClick={() => setEditorOpen(true)}
        >
          <BookPlus size={15} />
          과목 참여 추가
        </button>
      </header>

      <div className="nested-section__body">
        <div className="info-banner">
          <BookPlus size={19} />
          <div>
            <strong>과목 단위 참여</strong>
            <p>
              기본 수강 반은 유지되며 선택한 반의 해당 과목 수업에만 보충 또는
              보강으로 참여합니다.
            </p>
          </div>
        </div>
      </div>

      {editorOpen && (
        <Modal
          title="과목 단위 보충·보강"
          description={`${classItem.name} 반의 운영 과목에 다른 반 학생을 배정합니다.`}
          onClose={() => setEditorOpen(false)}
        >
          <div className="stack">
            <form className="section-toolbar" onSubmit={handleSearch}>
              <label className="form-field form-field--flush">
                <span>학생 검색</span>
                <input
                  value={keywordDraft}
                  placeholder="이름, 아이디 또는 연락처"
                  onChange={(event) => setKeywordDraft(event.target.value)}
                />
              </label>

              <button type="submit" className="button button--secondary">
                <Search size={16} />
                검색
              </button>
            </form>

            {candidatesQuery.isError && (
              <div className="form-alert" role="alert">
                {getErrorMessage(candidatesQuery.error)}
              </div>
            )}

            <form className="stack" onSubmit={handleSubmit}>
              <label className="form-field form-field--flush">
                <span>기본 수강 학생</span>
                <select
                  name="sourceEnrollmentId"
                  value={sourceEnrollmentId}
                  disabled={
                    candidatesQuery.isLoading || candidates.length === 0
                  }
                  onChange={(event) =>
                    setSourceEnrollmentId(event.target.value)
                  }
                  required
                >
                  <option value="">
                    {candidatesQuery.isLoading
                      ? "학생 불러오는 중..."
                      : "학생을 선택해 주세요."}
                  </option>

                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.student.name} ·{" "}
                      {candidate.student.loginId || "아이디 없음"} ·{" "}
                      {candidate.startsOn}~{candidate.endsOn || "미정"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>참여 과목</span>
                <select
                  name="courseOfferingSubjectId"
                  disabled={
                    !selectedCandidate || availableSubjects.length === 0
                  }
                  required
                >
                  {!selectedCandidate && (
                    <option value="">학생을 먼저 선택해 주세요.</option>
                  )}

                  {selectedCandidate && availableSubjects.length === 0 && (
                    <option value="">
                      양쪽 반에 공통으로 연결된 과목이 없습니다.
                    </option>
                  )}

                  {availableSubjects.map((subject) => (
                    <option
                      key={subject.courseOfferingSubjectId}
                      value={subject.courseOfferingSubjectId}
                    >
                      {subject.subjectName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>참여 유형</span>
                <select name="type" defaultValue="SUPPLEMENT" required>
                  <option value="SUPPLEMENT">보충</option>
                  <option value="MAKEUP">보강</option>
                </select>
              </label>

              <div className="form-grid">
                <label className="form-field">
                  <span>참여 시작일</span>
                  <input
                    name="startsOn"
                    type="date"
                    min={classItem.startDate}
                    max={classItem.endDate}
                    defaultValue={getInitialDate(classItem)}
                    required
                  />
                </label>

                <label className="form-field">
                  <span>참여 종료일</span>
                  <input
                    name="endsOn"
                    type="date"
                    min={classItem.startDate}
                    max={classItem.endDate}
                    defaultValue={classItem.endDate}
                    required
                  />
                </label>
              </div>

              <label className="checkbox-field">
                <input
                  name="attendanceManaged"
                  type="checkbox"
                  defaultChecked
                />
                <span>
                  <strong>출석 관리</strong>
                  <small>해당 과목 수업의 출석 대상에 포함합니다.</small>
                </span>
              </label>

              <label className="checkbox-field">
                <input name="gradeManaged" type="checkbox" />
                <span>
                  <strong>성적 관리</strong>
                  <small>선택하면 해당 과목 시험·성적 대상에 포함합니다.</small>
                </span>
              </label>

              <label className="form-field">
                <span>배정 사유</span>
                <textarea
                  name="reason"
                  rows={4}
                  maxLength={1000}
                  placeholder="보충 또는 보강 배정 사유"
                  required
                />
              </label>

              {createMutation.isError && (
                <div className="form-alert" role="alert">
                  {getErrorMessage(createMutation.error)}
                </div>
              )}

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setEditorOpen(false)}
                >
                  취소
                </button>

                <button
                  type="submit"
                  className="button button--primary"
                  disabled={
                    createMutation.isPending ||
                    !selectedCandidate ||
                    availableSubjects.length === 0
                  }
                >
                  {createMutation.isPending ? "배정 중..." : "과목 참여 배정"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </section>
  );
}
