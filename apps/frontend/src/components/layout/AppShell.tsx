import {
  ArrowRightLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { UserRole } from "../../auth/auth.types";

import { useFocusContainment } from "../../hooks/useFocusContainment";

type NavigationItem = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  roles: readonly UserRole[];
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const ALL_ROLES: readonly UserRole[] = [
  "STUDENT",
  "INSTRUCTOR",
  "MANAGER",
  "PRINCIPAL",
  "ADMIN",
];

const STAFF_ROLES: readonly UserRole[] = [
  "INSTRUCTOR",
  "MANAGER",
  "PRINCIPAL",
  "ADMIN",
];

const MANAGEMENT_ROLES: readonly UserRole[] = ["MANAGER", "PRINCIPAL", "ADMIN"];

const navigationGroups: NavigationGroup[] = [
  {
    label: "기본",
    items: [
      {
        label: "대시보드",
        path: "/dashboard",
        icon: LayoutDashboard,
        roles: ALL_ROLES,
      },
      {
        label: "공지사항",
        path: "/notices",
        icon: Bell,
        roles: ALL_ROLES,
      },
      {
        label: "문의사항",
        path: "/inquiries",
        icon: CircleHelp,
        roles: ALL_ROLES,
      },
    ],
  },
  {
    label: "교육 관리",
    items: [
      {
        label: "교육 분야·과목",
        path: "/education",
        icon: BookOpen,
        roles: MANAGEMENT_ROLES,
      },
      {
        label: "교육과정",
        path: "/courses",
        icon: GraduationCap,
        roles: MANAGEMENT_ROLES,
      },
      {
        label: "반 관리",
        path: "/classes",
        icon: Users,
        roles: MANAGEMENT_ROLES,
      },
      {
        label: "수업 일정",
        path: "/schedule",
        icon: CalendarDays,
        roles: ["INSTRUCTOR", "ADMIN", "MANAGER", "PRINCIPAL"],
      },
    ],
  },
  {
    label: "학습 관리",
    items: [
      {
        label: "출석",
        path: "/attendance",
        icon: ClipboardCheck,
        roles: ALL_ROLES,
      },
      {
        label: "문제은행",
        path: "/questions",
        icon: ListChecks,
        roles: STAFF_ROLES,
      },
      {
        label: "시험 템플릿",
        path: "/exam-templates",
        icon: ClipboardList,
        roles: STAFF_ROLES,
      },
      {
        label: "시험",
        path: "/learning",
        icon: FileText,
        roles: ALL_ROLES,
      },
      {
        label: "강사 인수인계",
        path: "/handovers",
        icon: ArrowRightLeft,
        roles: STAFF_ROLES,
      },
    ],
  },
  {
    label: "분석 및 운영",
    items: [
      {
        label: "운영 통계",
        path: "/analytics",
        icon: BarChart3,
        roles: STAFF_ROLES,
      },
      {
        label: "사용자 관리",
        path: "/users",
        icon: ShieldCheck,
        roles: MANAGEMENT_ROLES,
      },
    ],
  },
  {
    label: "시스템 관리",
    items: [
      {
        label: "시스템 설정",
        path: "/system",
        icon: Settings,
        roles: ["ADMIN"],
      },
      {
        label: "약관 관리",
        path: "/terms",
        icon: ScrollText,
        roles: ["ADMIN"],
      },
    ],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: "학생",
  INSTRUCTOR: "강사",
  MANAGER: "실장",
  PRINCIPAL: "원장",
  ADMIN: "관리자",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useFocusContainment(sidebarRef, mobileMenuOpen && isMobile);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileMenuOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  if (!user) {
    return null;
  }

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => user.role === "ADMIN" || item.roles.includes(user.role),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const currentPageLabel =
    navigationGroups
      .flatMap((group) => group.items)
      .find((item) => item.path === location.pathname)?.label ?? "업무 화면";
  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  const handleLogout = async (): Promise<void> => {
    setLoggingOut(true);

    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        본문 바로가기
      </a>

      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        id="primary-navigation"
        ref={sidebarRef}
        tabIndex={-1}
        inert={isMobile && !mobileMenuOpen}
        role={isMobile && mobileMenuOpen ? "dialog" : undefined}
        aria-modal={isMobile && mobileMenuOpen ? true : undefined}
        className={`sidebar ${mobileMenuOpen ? "sidebar--open" : ""}`}
        aria-label="주요 메뉴"
      >
        <div className="sidebar__brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>

          <div>
            <strong>SKB 학원관리</strong>
            <span>교육 운영 시스템</span>
          </div>

          <button
            type="button"
            className="sidebar__close"
            aria-label="메뉴 닫기"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={22} />
          </button>
        </div>

        <nav className="sidebar__navigation">
          {visibleGroups.map((group) => (
            <section className="navigation-group" key={group.label}>
              <p className="navigation-group__label">{group.label}</p>

              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `navigation-item ${
                        isActive ? "navigation-item--active" : ""
                      }`
                    }
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={19} strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar__account">
          <div className="account-avatar">{user.name.slice(0, 1)}</div>

          <div className="account-info">
            <strong>{user.name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>

          <button
            type="button"
            className="icon-button"
            aria-label="로그아웃"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="app-main" inert={isMobile && mobileMenuOpen}>
        <header className="mobile-header">
          <button
            type="button"
            className="icon-button"
            aria-label="메뉴 열기"
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={23} />
          </button>

          <strong>{currentPageLabel}</strong>

          <span className="mobile-header__account" aria-label={user.name}>
            {user.name.slice(0, 1)}
          </span>
        </header>

        <header className="desktop-header">
          <div className="desktop-header__location" aria-label="현재 위치">
            <span>SKB 운영실</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{currentPageLabel}</strong>
          </div>

          <div className="desktop-header__user">
            <time className="desktop-header__date">
              <CalendarDays size={15} aria-hidden="true" />
              {todayLabel}
            </time>
            <span className="desktop-header__avatar" aria-hidden="true">
              {user.name.slice(0, 1)}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
        </header>

        <main className="page-container" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
