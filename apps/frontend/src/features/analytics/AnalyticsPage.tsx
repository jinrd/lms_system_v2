import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorState, LoadingState } from "../../components/ui/PageStates";
import {
  getInstructorClasses,
  getManagedClasses,
  type DerivedClassStatus,
} from "../classes/class-management.api";
import { getInquiries } from "../communications/communications.api";
import { getPrograms } from "../courses/programs.api";
import { getExams, type ExamStatus } from "../exams/exams.api";
import { getPendingStudents, getUsers } from "../users/users.api";
import "./analytics.css";

const CLASS_STATUS_LABELS: Record<DerivedClassStatus, string> = {
  UPCOMING: "운영 예정",
  OPERATING: "운영 중",
  ENDED: "종료",
};

const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: "작성 중",
  SCHEDULED: "예정",
  OPEN: "진행 중",
  CLOSED: "마감",
  GRADING: "채점 중",
  COMPLETED: "완료",
  CANCELED: "취소",
};

function AnalyticsLoading() {
  return <LoadingState message="운영 현황을 집계하고 있습니다." />;
}

function AnalyticsError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      message="운영 현황을 불러오지 못했습니다."
      onRetry={onRetry}
    />
  );
}

function percent(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

export function AnalyticsPage() {
  const { user } = useAuth();

  return user?.role === "INSTRUCTOR" ? (
    <InstructorAnalytics />
  ) : (
    <ManagementAnalytics />
  );
}

function ManagementAnalytics() {
  const [programId, setProgramId] = useState("");
  const [classStatus, setClassStatus] = useState<DerivedClassStatus | "">("");

  const classesQuery = useQuery({
    queryKey: ["analytics", "classes"],
    queryFn: () => getManagedClasses(false),
  });
  const programsQuery = useQuery({
    queryKey: ["analytics", "programs"],
    queryFn: () => getPrograms({ limit: 100 }),
  });
  const studentsQuery = useQuery({
    queryKey: ["analytics", "active-students"],
    queryFn: () =>
      getUsers({ role: "STUDENT", status: "ACTIVE", page: 1, limit: 1 }),
  });
  const pendingQuery = useQuery({
    queryKey: ["analytics", "pending-students"],
    queryFn: () => getPendingStudents(1),
  });
  const examsQuery = useQuery({
    queryKey: ["analytics", "exams"],
    queryFn: () => getExams({ page: 1, limit: 100 }),
  });
  const inquiriesQuery = useQuery({
    queryKey: ["analytics", "inquiries"],
    queryFn: () => getInquiries({ page: 1 }),
  });

  const queries = [
    classesQuery,
    programsQuery,
    studentsQuery,
    pendingQuery,
    examsQuery,
    inquiriesQuery,
  ];
  const retry = () => queries.forEach((query) => void query.refetch());

  const filteredClasses = useMemo(() => {
    const rows = classesQuery.data?.items ?? [];
    return rows.filter(
      (item) =>
        (!programId ||
          item.programs.some((program) => program.courseOfferingId === programId)) &&
        (!classStatus || item.derivedStatus === classStatus),
    );
  }, [classStatus, classesQuery.data?.items, programId]);

  if (queries.some((query) => query.isPending)) return <AnalyticsLoading />;
  if (queries.some((query) => query.isError)) {
    return <AnalyticsError onRetry={retry} />;
  }

  const exams = examsQuery.data?.items ?? [];
  const inquiries = inquiriesQuery.data?.items ?? [];
  const unresolvedInquiries = inquiries.filter(
    (item) => item.status === "RECEIVED" || item.status === "IN_PROGRESS",
  );
  const activeExams = exams.filter((item) =>
    ["SCHEDULED", "OPEN", "CLOSED", "GRADING"].includes(item.status),
  );
  const crowdedClasses = filteredClasses
    .filter((item) => item.capacity > 0 && item.enrollmentCount / item.capacity >= 0.9)
    .sort(
      (a, b) =>
        b.enrollmentCount / b.capacity - a.enrollmentCount / a.capacity,
    );

  return (
    <div className="page-stack analytics-page">
      <header className="page-header">
        <div>
          <h1>운영 통계</h1>
          <p>현재 운영 데이터에서 확인이 필요한 흐름과 예외를 찾습니다.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={retry}>
          <RefreshCw size={17} /> 새로고침
        </button>
      </header>

      <section className="filter-bar analytics-filters" aria-label="통계 필터">
        <label className="filter-control">
          <span>교육과정</span>
          <select value={programId} onChange={(event) => setProgramId(event.target.value)}>
            <option value="">전체 교육과정</option>
            {programsQuery.data?.items.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-control">
          <span>반 상태</span>
          <select
            value={classStatus}
            onChange={(event) =>
              setClassStatus(event.target.value as DerivedClassStatus | "")
            }
          >
            <option value="">전체 상태</option>
            {Object.entries(CLASS_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="analytics-summary" aria-label="운영 요약">
        <article>
          <Users size={19} />
          <span>활성 학생</span>
          <strong>{studentsQuery.data?.pagination.total ?? 0}</strong>
          <small>승인 대기 {pendingQuery.data?.pagination.total ?? 0}명</small>
        </article>
        <article>
          <BookOpenCheck size={19} />
          <span>선택 반</span>
          <strong>{filteredClasses.length}</strong>
          <small>운영 중 {filteredClasses.filter((item) => item.derivedStatus === "OPERATING").length}개</small>
        </article>
        <article>
          <BarChart3 size={19} />
          <span>진행 시험</span>
          <strong>{activeExams.length}</strong>
          <small>전체 시험 {examsQuery.data?.pagination.total ?? exams.length}개</small>
        </article>
        <article>
          <Clock3 size={19} />
          <span>미완료 문의</span>
          <strong>{unresolvedInquiries.length}</strong>
          <small>최근 조회 {inquiries.length}건 기준</small>
        </article>
      </section>

      <section className="analytics-grid">
        <article className="surface-card analytics-panel">
          <header className="card-header">
            <div>
              <h2>반 운영 현황</h2>
              <p>선택한 조건의 반 상태 분포입니다.</p>
            </div>
            <Link className="text-button" to="/classes">
              반 관리 <ArrowRight size={15} />
            </Link>
          </header>
          <div className="card-body distribution-list">
            {(Object.keys(CLASS_STATUS_LABELS) as DerivedClassStatus[]).map(
              (status) => {
                const count = filteredClasses.filter(
                  (item) => item.derivedStatus === status,
                ).length;
                return (
                  <div className="distribution-row" key={status}>
                    <span>{CLASS_STATUS_LABELS[status]}</span>
                    <div><i style={{ width: `${percent(count, filteredClasses.length)}%` }} /></div>
                    <strong>{count}</strong>
                  </div>
                );
              },
            )}
          </div>
        </article>

        <article className="surface-card analytics-panel">
          <header className="card-header">
            <div>
              <h2>시험 운영 현황</h2>
              <p>현재 시험의 진행 단계를 확인합니다.</p>
            </div>
            <Link className="text-button" to="/learning">
              시험 관리 <ArrowRight size={15} />
            </Link>
          </header>
          <div className="card-body distribution-list">
            {(["DRAFT", "SCHEDULED", "OPEN", "GRADING", "COMPLETED"] as ExamStatus[]).map(
              (status) => {
                const count = exams.filter((item) => item.status === status).length;
                return (
                  <div className="distribution-row" key={status}>
                    <span>{EXAM_STATUS_LABELS[status]}</span>
                    <div><i style={{ width: `${percent(count, exams.length)}%` }} /></div>
                    <strong>{count}</strong>
                  </div>
                );
              },
            )}
          </div>
        </article>

        <article className="surface-card analytics-exceptions">
          <header className="card-header">
            <div>
              <h2>주의가 필요한 항목</h2>
              <p>바로 확인할 수 있는 운영 예외입니다.</p>
            </div>
          </header>
          <div className="analytics-exception-list">
            {unresolvedInquiries.slice(0, 4).map((item) => (
              <Link to="/inquiries" key={item.id}>
                <AlertTriangle size={17} />
                <span><strong>{item.title}</strong><small>문의 · {item.className ?? "일반"}</small></span>
                <span className="status-badge status-badge--warning">{item.status === "RECEIVED" ? "접수" : "처리 중"}</span>
              </Link>
            ))}
            {crowdedClasses.slice(0, 4).map((item) => (
              <Link to="/classes" key={item.id}>
                <AlertTriangle size={17} />
                <span><strong>{item.name}</strong><small>정원 임박 · {item.enrollmentCount}/{item.capacity}명</small></span>
                <span className="status-badge status-badge--warning">{percent(item.enrollmentCount, item.capacity)}%</span>
              </Link>
            ))}
            {unresolvedInquiries.length === 0 && crowdedClasses.length === 0 && (
              <div className="analytics-all-clear">
                <CheckCircle2 size={20} />
                <span><strong>즉시 확인할 항목이 없습니다.</strong><small>현재 조회된 운영 데이터가 안정적입니다.</small></span>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function InstructorAnalytics() {
  const classesQuery = useQuery({
    queryKey: ["analytics", "instructor-classes"],
    queryFn: getInstructorClasses,
  });
  const examsQuery = useQuery({
    queryKey: ["analytics", "instructor-exams"],
    queryFn: () => getExams({ page: 1, limit: 100 }),
  });
  const inquiriesQuery = useQuery({
    queryKey: ["analytics", "instructor-inquiries"],
    queryFn: () => getInquiries({ page: 1 }),
  });
  const queries = [classesQuery, examsQuery, inquiriesQuery];
  const retry = () => queries.forEach((query) => void query.refetch());

  if (queries.some((query) => query.isPending)) return <AnalyticsLoading />;
  if (queries.some((query) => query.isError)) return <AnalyticsError onRetry={retry} />;

  const classes = classesQuery.data ?? [];
  const exams = examsQuery.data?.items ?? [];
  const inquiries = inquiriesQuery.data?.items ?? [];
  const openExams = exams.filter((item) => ["SCHEDULED", "OPEN", "GRADING"].includes(item.status));
  const unresolved = inquiries.filter((item) => item.status !== "ANSWERED" && item.status !== "CLOSED");

  return (
    <div className="page-stack analytics-page">
      <header className="page-header">
        <div><h1>운영 통계</h1><p>내 담당 반과 시험, 문의 업무를 한 화면에서 확인합니다.</p></div>
        <button type="button" className="button button--secondary" onClick={retry}><RefreshCw size={17} /> 새로고침</button>
      </header>
      <section className="analytics-summary analytics-summary--three">
        <article><BookOpenCheck size={19} /><span>담당 반</span><strong>{classes.length}</strong><small>연결 과목 {classes.reduce((sum, item) => sum + item.subjectCount, 0)}개</small></article>
        <article><BarChart3 size={19} /><span>진행 시험</span><strong>{openExams.length}</strong><small>전체 시험 {exams.length}개</small></article>
        <article><Clock3 size={19} /><span>처리할 문의</span><strong>{unresolved.length}</strong><small>최근 조회 {inquiries.length}건 기준</small></article>
      </section>
      <section className="analytics-grid">
        <article className="surface-card analytics-panel">
          <header className="card-header"><div><h2>담당 반</h2><p>과목 구성과 운영 기간을 확인합니다.</p></div><Link className="text-button" to="/schedule">일정 보기 <ArrowRight size={15} /></Link></header>
          <div className="analytics-compact-list">{classes.map((item) => <div key={`${item.id}:${item.courseOfferingId}`}><span><strong>{item.name}</strong><small>{item.courseOfferingName} · 과목 {item.subjectCount}개</small></span><small>{item.startDate}~{item.endDate}</small></div>)}</div>
        </article>
        <article className="surface-card analytics-panel">
          <header className="card-header"><div><h2>시험 흐름</h2><p>내가 확인할 시험의 현재 상태입니다.</p></div><Link className="text-button" to="/learning">시험 보기 <ArrowRight size={15} /></Link></header>
          <div className="analytics-compact-list">{openExams.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.courseOfferingName}</small></span><span className="status-badge status-badge--info">{EXAM_STATUS_LABELS[item.status]}</span></div>)}</div>
        </article>
      </section>
    </div>
  );
}
