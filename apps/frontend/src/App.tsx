import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";
import { AuthProvider, GuestOnly, RequireAuth } from "./auth/AuthProvider";
import { AppShell } from "./components/layout/AppShell";
import { ErrorState } from "./components/ui/PageStates";
import { ChangePasswordPage, LoginPage, SignupPage } from "./pages/AuthPages";
import { DashboardPage } from "./pages";
import { RequireRole } from "./auth/RequireRole";
import { EducationPage } from "./features/education/EducationPage";
import { CoursesPage } from "./features/courses/CoursePage";
import { ClassesPage } from "./features/classes/ClassesPage";
import { UsersPage } from "./features/users/UsersPage";
import { TermsPage } from "./features/terms/TermsPage";
import { InstructorSchedulePage } from "./features/instructor/InstructorSchedulePage";
import { AttendancePage } from "./features/attendance/AttendancePage";
import { QuestionsPage } from "./features/questions/QuestionsPage";

import { ExamTemplatesPage } from "./features/exam-templates/ExamTemplatesPage";
import { ExamWorkspacePage } from "./features/exams/ExamWorkspacePage";
import { HandoversPage } from "./features/communications/HandoversPage";
import { InquiriesPage } from "./features/communications/InquiriesPage";
import { NoticesPage } from "./features/communications/NoticesPage";
import { PendingConsentPage } from "./pages/PendingConsentPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { SystemOperationsPage } from "./features/operations/SystemOperationsPage";

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: "/signup",
    element: (
      <GuestOnly>
        <SignupPage />
      </GuestOnly>
    ),
  },
  {
    path: "/change-password",
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    path: "/consent",
    element: <PendingConsentPage />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: (
      <div className="standalone-state">
        <ErrorState message="페이지를 찾을 수 없습니다." />
      </div>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "notices",
        element: <NoticesPage />,
      },
      {
        path: "inquiries",
        element: <InquiriesPage />,
      },
      {
        path: "education",
        element: (
          <RequireRole roles={["MANAGER", "PRINCIPAL", "ADMIN"]}>
            <EducationPage />
          </RequireRole>
        ),
      },
      {
        path: "courses",
        element: (
          <RequireRole roles={["MANAGER", "PRINCIPAL", "ADMIN"]}>
            <CoursesPage />
          </RequireRole>
        ),
      },
      {
        path: "classes",
        element: (
          <RequireRole roles={["MANAGER", "PRINCIPAL", "ADMIN"]}>
            <ClassesPage />
          </RequireRole>
        ),
      },
      {
        path: "schedule",
        element: (
          <RequireRole roles={["INSTRUCTOR"]}>
            <InstructorSchedulePage />
          </RequireRole>
        ),
      },
      {
        path: "attendance",
        element: <AttendancePage />,
      },
      {
        path: "questions",
        element: (
          <RequireRole roles={["INSTRUCTOR", "MANAGER", "PRINCIPAL", "ADMIN"]}>
            <QuestionsPage />
          </RequireRole>
        ),
      },
      {
        path: "exam-templates",
        element: (
          <RequireRole roles={["INSTRUCTOR", "MANAGER", "PRINCIPAL", "ADMIN"]}>
            <ExamTemplatesPage />
          </RequireRole>
        ),
      },
      {
        path: "learning",
        element: <ExamWorkspacePage />,
      },
      {
        path: "handovers",
        element: (
          <RequireRole roles={["INSTRUCTOR", "MANAGER", "PRINCIPAL", "ADMIN"]}>
            <HandoversPage />
          </RequireRole>
        ),
      },
      {
        path: "users",
        element: (
          <RequireRole roles={["MANAGER", "PRINCIPAL", "ADMIN"]}>
            <UsersPage />
          </RequireRole>
        ),
      },
      {
        path: "terms",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <TermsPage />
          </RequireRole>
        ),
      },
      {
        path: "analytics",
        element: (
          <RequireRole roles={["INSTRUCTOR", "MANAGER", "PRINCIPAL", "ADMIN"]}>
            <AnalyticsPage />
          </RequireRole>
        ),
      },
      {
        path: "system",
        element: (
          <RequireRole roles={["MANAGER", "PRINCIPAL", "ADMIN"]}>
            <SystemOperationsPage />
          </RequireRole>
        ),
      },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
