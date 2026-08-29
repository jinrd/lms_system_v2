import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { UserRole } from "../../auth/auth.types";

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
        label: "개설 강의",
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
        roles: ALL_ROLES,
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
        label: "과제·시험",
        path: "/learning",
        icon: FileText,
        roles: ALL_ROLES,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) {
    return null;
  }

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(user.role)),
    }))
    .filter((group) => group.items.length > 0);

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
      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${mobileMenuOpen ? "sidebar--open" : ""}`}
        aria-label="주요 메뉴"
      >
        <div className="sidebar__brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>

          <div>
            <strong>SKB ACADEMY</strong>
            <span>Learning Management</span>
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

      <div className="app-main">
        <header className="mobile-header">
          <button
            type="button"
            className="icon-button"
            aria-label="메뉴 열기"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={23} />
          </button>

          <strong>SKB LMS</strong>

          <button type="button" className="icon-button" aria-label="알림">
            <Bell size={21} />
          </button>
        </header>

        <header className="desktop-header">
          <div className="desktop-header__location">
            <span>{ROLE_LABELS[user.role]} 화면</span>
            <ChevronDown size={16} />
          </div>

          <div className="desktop-header__user">
            <button type="button" className="notification-button">
              <Bell size={19} />
              <span>알림</span>
              <span className="notification-dot" aria-label="새 알림 있음" />
            </button>

            <span>{user.name}</span>
          </div>
        </header>

        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
