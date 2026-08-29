import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  UserCheck,
  Users,
} from "lucide-react";

const summaryItems = [
  {
    label: "승인 대기 학생",
    value: "3",
    detail: "확인이 필요합니다",
    icon: UserCheck,
    tone: "blue",
  },
  {
    label: "전체 학생",
    value: "128",
    detail: "활성 학생 기준",
    icon: Users,
    tone: "green",
  },
  {
    label: "진행 중 강의",
    value: "8",
    detail: "12개 반 운영 중",
    icon: BookOpenCheck,
    tone: "purple",
  },
  {
    label: "오늘 수업",
    value: "14",
    detail: "다음 수업 10:30",
    icon: CalendarClock,
    tone: "orange",
  },
];

const tasks = [
  {
    title: "가입 승인 대기",
    description: "신규 학생 3명의 가입 정보를 확인해 주세요.",
    badge: "3건",
    tone: "warning",
  },
  {
    title: "미처리 출석",
    description: "오늘 수업에서 처리되지 않은 출석이 있습니다.",
    badge: "7건",
    tone: "danger",
  },
  {
    title: "최근 문의",
    description: "답변을 기다리는 일반 문의가 있습니다.",
    badge: "2건",
    tone: "info",
  },
];

export function DashboardPage() {
  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">2026년 8월 29일 토요일</p>
          <h1>운영 대시보드</h1>
          <p>학원 운영 현황과 처리할 업무를 확인합니다.</p>
        </div>

        <button type="button" className="button button--primary">
          운영 리포트
          <ArrowRight size={17} />
        </button>
      </section>

      <section className="summary-grid" aria-label="운영 요약">
        {summaryItems.map((item) => {
          const Icon = item.icon;

          return (
            <article className="summary-card" key={item.label}>
              <div className={`summary-card__icon tone-${item.tone}`}>
                <Icon size={22} />
              </div>

              <div>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span>{item.detail}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>처리할 업무</h2>
              <p>우선 확인이 필요한 항목입니다.</p>
            </div>

            <button type="button" className="text-button">
              전체 보기
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <button type="button" className="task-item" key={task.title}>
                <div className="task-item__icon">
                  <ClipboardList size={19} />
                </div>

                <div className="task-item__body">
                  <strong>{task.title}</strong>
                  <span>{task.description}</span>
                </div>

                <span className={`status-badge status-badge--${task.tone}`}>
                  {task.badge}
                </span>

                <ChevronRight className="task-item__arrow" size={18} />
              </button>
            ))}
          </div>
        </article>

        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>오늘 출석 현황</h2>
              <p>현재까지 처리된 출석입니다.</p>
            </div>
          </div>

          <div className="attendance-chart">
            <div className="attendance-chart__value">
              <strong>91%</strong>
              <span>전체 출석률</span>
            </div>
          </div>

          <div className="attendance-legend">
            <span>
              <i className="legend-dot legend-dot--success" />
              출석 96
            </span>
            <span>
              <i className="legend-dot legend-dot--warning" />
              지각 6
            </span>
            <span>
              <i className="legend-dot legend-dot--danger" />
              결석 4
            </span>
          </div>
        </article>
      </section>
    </>
  );
}

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <section className="page-header">
        <div>
          <p className="page-eyebrow">SKB ACADEMY</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <section className="content-card placeholder-card">
        <ClipboardList size={36} />
        <h2>{title} 화면 준비 완료</h2>
        <p>해당 백엔드 단계와 함께 실제 기능을 연결합니다.</p>
      </section>
    </>
  );
}
