import { useAuth } from "../../auth/AuthProvider";
import { ExamsPage } from "./ExamsPage";
import { StudentExamsPage } from "./StudentExamsPage";

export function ExamWorkspacePage() {
  const { user } = useAuth();
  return user?.role === "STUDENT" ? <StudentExamsPage /> : <ExamsPage />;
}
