import { Search, UserRoundPlus, UsersRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { ErrorState, LoadingState } from "../../components/ui/PageStates";
import type { ClassItem, ClassSession } from "../classes/classes.api";
import {
  assignSessionParticipant,
  getSessionParticipants,
  getSubjectEnrollmentCandidates,
  type SubjectEnrollmentType,
} from "./enrollments.api";

type SessionParticipantsActionProps = {
  courseOfferingId: string;
  classItem: ClassItem;
  session: ClassSession;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function getSessionDate(startsAt: string): string {
  return new Date(startsAt).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
}

function formatSessionDate(startsAt: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(startsAt));
}

export function SessionParticipantsAction({
  courseOfferingId,
  classItem,
  session,
}: SessionParticipantsActionProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sourceEnrollmentId, setSourceEnrollmentId] = useState("");

  const participantQueryKey = [
    "course-offerings",
    courseOfferingId,
    "classes",
    classItem.id,
    "sessions",
    session.id,
    "participants",
  ];

  const participantsQuery = useQuery({
    queryKey: participantQueryKey,
    queryFn: () =>
      getSessionParticipants(courseOfferingId, classItem.id, session.id),
    enabled: modalOpen,
  });

  const candidatesQuery = useQuery({
    queryKey: [
      "course-offerings",
      courseOfferingId,
      "classes",
      classItem.id,
      "session-participant-candidates",
      session.id,
      keyword,
    ],
    queryFn: () =>
      getSubjectEnrollmentCandidates(
        courseOfferingId,
        classItem.id,
        keyword || undefined,
      ),
    enabled: modalOpen,
  });

  const assignMutation = useMutation({
    mutationFn: ({
      sourceEnrollmentId,
      type,
      reason,
    }: {
      sourceEnrollmentId: string;
      type: SubjectEnrollmentType;
      reason: string;
    }) =>
      assignSessionParticipant(courseOfferingId, classItem.id, session.id, {
        sourceEnrollmentId,
        type,
        reason,
      }),
    onSuccess: async () => {
      setSourceEnrollmentId("");

      await queryClient.invalidateQueries({
        queryKey: participantQueryKey,
      });
    },
  });

  const handleSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setKeyword(keywordDraft.trim());
    setSourceEnrollmentId("");
  };

  const handleAssign = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    assignMutation.mutate({
      sourceEnrollmentId: String(formData.get("sourceEnrollmentId") ?? ""),
      type: String(
        formData.get("type") ?? "SUPPLEMENT",
      ) as SubjectEnrollmentType,
      reason: String(formData.get("reason") ?? "").trim(),
    });
  };

  if (session.status !== "SCHEDULED") {
    return null;
  }

  const sessionDate = getSessionDate(session.startsAt);
  const participants = participantsQuery.data ?? [];
  const participantStudentIds = new Set(
    participants.map((participant) => participant.student.id),
  );

  const candidates = (candidatesQuery.data?.items ?? []).filter((candidate) => {
    if (participantStudentIds.has(candidate.student.id)) {
      return false;
    }

    if (
      candidate.startsOn > sessionDate ||
      (candidate.endsOn && candidate.endsOn < sessionDate)
    ) {
      return false;
    }

    return candidate.subjects.some(
      (subject) =>
        subject.courseOfferingSubjectId === session.courseOfferingSubjectId &&
        subject.startsOn <= sessionDate &&
        (!subject.endsOn || subject.endsOn >= sessionDate),
    );
  });

  return (
    <>
      <button
        type="button"
        className="button button--secondary button--compact"
        onClick={() => setModalOpen(true)}
      >
        <UserRoundPlus size={14} />
        참여자 배정
      </button>

      {modalOpen && (
        <Modal
          title="개별 수업 참여자 배정"
          description={`${session.title || session.subjectName} 수업 한 회에만 보충·보강 학생을 배정합니다.`}
          onClose={() => setModalOpen(false)}
        >
          <div className="stack">
            <div className="info-banner">
              <UsersRound size={19} />
              <div>
                <strong>{formatSessionDate(session.startsAt)}</strong>
                <p>
                  {session.subjectName} ·{" "}
                  {session.room || classItem.room || "강의실 미설정"}
                </p>
              </div>
            </div>

            <section className="nested-section">
              <header className="nested-section__header">
                <div>
                  <h3>현재 추가 참여자</h3>
                  <p>총 {participants.length}명</p>
                </div>
              </header>

              {participantsQuery.isLoading && (
                <LoadingState message="참여자를 불러오고 있습니다." />
              )}

              {participantsQuery.isError && (
                <ErrorState
                  message={getErrorMessage(participantsQuery.error)}
                  onRetry={() => void participantsQuery.refetch()}
                />
              )}

              {!participantsQuery.isLoading &&
                !participantsQuery.isError &&
                (participants.length ? (
                  <div className="compact-list">
                    {participants.map((participant) => (
                      <article className="compact-row" key={participant.id}>
                        <div className="table-user__avatar">
                          {participant.student.name.slice(0, 1)}
                        </div>

                        <div className="compact-row__body">
                          <div className="cluster">
                            <strong>{participant.student.name}</strong>

                            <span className="status-badge status-badge--primary">
                              {participant.type === "MAKEUP" ? "보강" : "보충"}
                            </span>
                          </div>

                          <p>{participant.reason}</p>

                          <small>
                            {participant.student.loginId || "아이디 없음"}
                            {" · "}
                            {participant.assignedBy?.name || "배정자 없음"}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="nested-section__body">
                    <p className="table-secondary">
                      추가 배정된 참여자가 없습니다.
                    </p>
                  </div>
                ))}
            </section>

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

            <form className="stack" onSubmit={handleAssign}>
              <label className="form-field form-field--flush">
                <span>참여 학생</span>
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
                      {candidate.student.loginId || "아이디 없음"}
                    </option>
                  ))}
                </select>
              </label>

              {!candidatesQuery.isLoading && candidates.length === 0 && (
                <div className="info-banner">
                  <UsersRound size={19} />
                  <div>
                    <strong>배정 가능한 학생 없음</strong>
                    <p>
                      수업일에 해당 과목을 수강 중인 다른 반 학생이 없습니다.
                    </p>
                  </div>
                </div>
              )}

              <label className="form-field">
                <span>참여 유형</span>
                <select name="type" defaultValue="SUPPLEMENT" required>
                  <option value="SUPPLEMENT">보충</option>
                  <option value="MAKEUP">보강</option>
                </select>
              </label>

              <label className="form-field">
                <span>배정 사유</span>
                <textarea
                  name="reason"
                  rows={4}
                  maxLength={1000}
                  placeholder="개별 수업 참여 사유"
                  required
                />
              </label>

              {assignMutation.isError && (
                <div className="form-alert" role="alert">
                  {getErrorMessage(assignMutation.error)}
                </div>
              )}

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setModalOpen(false)}
                >
                  닫기
                </button>

                <button
                  type="submit"
                  className="button button--primary"
                  disabled={assignMutation.isPending || !sourceEnrollmentId}
                >
                  {assignMutation.isPending ? "배정 중..." : "참여자 배정"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
