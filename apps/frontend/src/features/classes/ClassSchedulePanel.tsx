import { CirclePlus, Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  createProgramSchedule,
  getProgramSchedules,
  updateProgramSchedule,
  type ManagedClass,
  type ProgramSchedule,
} from "./class-management.api";

const DAYS = ["", "월", "화", "수", "목", "금", "토", "일"];

export function ClassSchedulePanel({ classItem }: { classItem: ManagedClass }) {
  const client = useQueryClient();
  const [editor, setEditor] = useState<ProgramSchedule | "new" | null>(null);
  const query = useQuery({
    queryKey: ["managed-classes", classItem.id, "schedule"],
    queryFn: () => getProgramSchedules(classItem.id),
  });
  const mutation = useMutation({
    mutationFn: ({ item, form }: { item?: ProgramSchedule; form: FormData }) => {
      const input = {
        classSubjectId: String(form.get("classSubjectId") ?? ""),
        dayOfWeek: Number(form.get("dayOfWeek")),
        startTime: String(form.get("startTime") ?? ""),
        endTime: String(form.get("endTime") ?? ""),
        room: String(form.get("room") ?? "").trim(),
      };
      return item
        ? updateProgramSchedule(classItem.id, item.id, input)
        : createProgramSchedule(classItem.id, input);
    },
    onSuccess: async () => {
      setEditor(null);
      await client.invalidateQueries({ queryKey: ["managed-classes", classItem.id, "schedule"] });
    },
  });
  const activeMutation = useMutation({
    mutationFn: (item: ProgramSchedule) => updateProgramSchedule(classItem.id, item.id, { active: !item.active }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["managed-classes", classItem.id, "schedule"] }),
  });

  if (query.isLoading) return <LoadingState message="시간표를 불러오고 있습니다." />;
  if (query.isError) return <ErrorState message="시간표를 불러오지 못했습니다." />;
  const patterns = query.data ?? [];
  const editable = classItem.derivedStatus === "UPCOMING";

  return <section className="card">
    <div className="card-header">
      <div><h2>반복 시간표</h2><p>사용 중인 운영 과목의 수업 요일과 시간을 표시합니다.</p></div>
      {editable && <button className="button button--primary" type="button" onClick={() => setEditor("new")}><CirclePlus size={16} /> 시간표 추가</button>}
    </div>
    <div className="card-body">
      {patterns.length === 0 ? <EmptyState title="등록된 시간표가 없습니다." description="반 운영 시작 전에 시간표를 추가해 주세요." /> : <div className="data-list">
        {patterns.map((item) => <article className="list-row" key={item.id}>
          <div><strong>{item.subjectName} · {DAYS[item.dayOfWeek]}요일 {item.startTime.slice(0, 5)}~{item.endTime.slice(0, 5)}</strong><p>{item.programName} · {item.instructor.name} · {item.room || classItem.room || "강의실 미정"}</p></div>
          <div className="cluster"><span className={`status-badge ${item.active ? "status-badge--success" : "status-badge--neutral"}`}>{item.active ? "사용" : "미사용"}</span>{editable && <><button className="button button--secondary" type="button" onClick={() => setEditor(item)}><Pencil size={15} /> 수정</button><button className="button button--secondary" type="button" onClick={() => activeMutation.mutate(item)}>{item.active ? "미사용" : "사용"}</button></>}</div>
        </article>)}
      </div>}
    </div>
    {editor && <Modal title={editor === "new" ? "시간표 추가" : "시간표 수정"} onClose={() => setEditor(null)}>
      <form className="form-stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); mutation.mutate({ item: editor === "new" ? undefined : editor, form: new FormData(event.currentTarget) }); }}>
        <label className="field"><span>운영 과목</span><select name="classSubjectId" required defaultValue={editor === "new" ? "" : editor.classSubjectId}><option value="">선택</option>{classItem.programs.flatMap((program) => program.subjects.filter((subject) => subject.active).map((subject) => <option key={subject.id} value={subject.id}>{subject.name} · {program.name}</option>))}</select></label>
        <div className="form-grid"><label className="field"><span>요일</span><select name="dayOfWeek" required defaultValue={editor === "new" ? 1 : editor.dayOfWeek}>{DAYS.slice(1).map((day, index) => <option key={day} value={index + 1}>{day}요일</option>)}</select></label><label className="field"><span>강의실</span><input name="room" defaultValue={editor === "new" ? (classItem.room ?? "") : (editor.room ?? "")} /></label></div>
        <div className="form-grid"><label className="field"><span>시작</span><input type="time" name="startTime" required defaultValue={editor === "new" ? "09:00" : editor.startTime.slice(0, 5)} /></label><label className="field"><span>종료</span><input type="time" name="endTime" required defaultValue={editor === "new" ? "12:00" : editor.endTime.slice(0, 5)} /></label></div>
        {mutation.isError && <p className="form-error">{mutation.error instanceof Error ? mutation.error.message : "저장하지 못했습니다."}</p>}
        <div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => setEditor(null)}>취소</button><button className="button button--primary" type="submit">저장</button></div>
      </form>
    </Modal>}
  </section>;
}
