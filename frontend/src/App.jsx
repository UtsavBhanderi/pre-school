import React, { useContext } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

import Layout from "./Layout.jsx";
import LayoutAdmin from "./LayoutAdmin.jsx";
import TeacherDashboard from "./pages/afterLogin/TeacherDashboard2.jsx";
import { AuthProvider, AuthContext } from "./context/AuthContext.jsx";
import Login from "./components/Login.jsx";
import StudentsReport from "./components/StudentsReport.jsx";
import FeesOverviewPage from "./components/FeesOverviewPage.jsx";
import AttendancePage from "./components/AttendancePage.jsx";
import Fees from "./components/Fees.jsx";
import NewStudentRegister from "./components/NewStudentRegister.jsx";
import NewTeacherRegister from "./components/NewTeacherRegister.jsx";
import StudentBirthday from "./components/Birthday.jsx";
import TeacherBirthday from "./components/TeacherBirthday.jsx";
import CalendarPage from "./components/CalendarPage.jsx";
import AttendanceEntryPage from "./components/AttendanceEntryPage.jsx";
import AdminPdf from "./components/AdminPdf.jsx";
import AdminVideo from "./components/AdminVideo.jsx";
import GalleryDashboard from "./components/GalleryDashboard.jsx";
import CreateReport from "./components/Reports.jsx";
import TeacherWorkReport from "./components/TeachersEntry.jsx";
import AdminUsers from "./components/AdminUsers.jsx";
import OperationsHome from "./components/OperationsHome.jsx";
import HelpCenter from "./components/HelpCenter.jsx";
import AnnouncementsPage from "./components/AnnouncementsPage.jsx";

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="p-4" role="status" aria-live="polite">
        Loading your school workspace…
      </div>
    );
  }
  if (!user || (roles && !roles.includes(user.role))) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const App = () => (
  <AuthProvider>
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Login />} />
          <Route path="login" element={<Login />} />
          <Route
            path="teacher-dashboard"
            element={
              <PrivateRoute roles={["teacher"]}>
                <TeacherDashboard />
              </PrivateRoute>
            }
          />
        </Route>

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <LayoutAdmin />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard/home" replace />} />
          <Route path="home" element={<OperationsHome />} />
          <Route path="help" element={<HelpCenter />} />
          <Route path="notices" element={<AnnouncementsPage />} />
          <Route path="feesOverview" element={<FeesOverviewPage />} />
          <Route path="attendanceOverview" element={<AttendancePage />} />
          <Route path="fees" element={<Fees />} />
          <Route path="studentRegister" element={<NewStudentRegister />} />
          <Route path="teacherRegister" element={<NewTeacherRegister />} />
          <Route path="studentBirthday" element={<StudentBirthday />} />
          <Route path="teacherBirthday" element={<TeacherBirthday />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="attendanceEntryPage" element={<AttendanceEntryPage />} />
          <Route path="pdf" element={<AdminPdf />} />
          <Route path="video" element={<AdminVideo />} />
          <Route path="gallery" element={<GalleryDashboard />} />
          <Route path="createReport" element={<CreateReport />} />
          <Route path="teacherWorkReport" element={<TeacherWorkReport />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="students/:standard/:reportId" element={<StudentsReport />} />
          <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  </AuthProvider>
);

export default App;
