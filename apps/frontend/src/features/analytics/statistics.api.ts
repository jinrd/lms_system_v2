import { apiRequest } from "../../lib/api-client";

export type AttendanceBucket = {
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  excused: number;
  unprocessed: number;
  lateCount: number;
  countedTotal: number;
  attendanceRate: number | null;
};

export type AttendanceStatisticsResponse = {
  range: { from: string | null; to: string | null };
  overall: AttendanceBucket;
  classes: Array<
    {
      classId: string;
      className: string;
      courseOfferingId: string;
      courseOfferingName: string;
    } & AttendanceBucket
  >;
  students: Array<
    { studentId: string; name: string; loginId: string | null } & AttendanceBucket
  > | null;
};

export type ExamStatRow = {
  examId: string;
  title: string;
  scope: string;
  stage: string;
  status: string;
  opensAt: string;
  closesAt: string;
  targetCount: number;
  attemptedCount: number;
  notStartedCount: number;
  notAttendedCount: number;
  incompleteCount: number;
  gradingPendingCount: number;
  passCount: number;
  failCount: number;
  writtenAvg: number | null;
  practicalAvg: number | null;
};

export type ExamStatisticsResponse = {
  range: { from: string | null; to: string | null };
  exams: ExamStatRow[];
  overall: {
    examCount: number;
    targetCount: number;
    attemptedCount: number;
    notAttendedCount: number;
    incompleteCount: number;
    passCount: number;
    failCount: number;
    passRate: number | null;
  };
};

export type StatisticsQuery = {
  courseOfferingId?: string;
  classId?: string;
  subjectId?: string;
  from?: string;
  to?: string;
};

function toQueryString(query: StatisticsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function getAttendanceStatistics(
  query: StatisticsQuery = {},
): Promise<AttendanceStatisticsResponse> {
  return apiRequest(`/statistics/attendance${toQueryString(query)}`);
}

export function getExamStatistics(
  query: StatisticsQuery = {},
): Promise<ExamStatisticsResponse> {
  return apiRequest(`/statistics/exams${toQueryString(query)}`);
}
