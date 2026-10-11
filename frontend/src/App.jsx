import React, { createElement } from "react";
// import './App.css'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
// import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import Layout from "./Layout.jsx";
// import AdminDashboard from "./pages/afterLogin/AdminDashboard.jsx";
// import TeacherDashboard from "./pages/afterLogin/TeacherDashboard.jsx";
import TeacherDashboard from "./pages/afterLogin/TeacherDashboard2.jsx";
import { AuthProvider, AuthContext } from "./context/AuthContext.jsx";
import Login from "./components/Login.jsx";
// import "../ads.txt";

import Students from "./components/StudentsReport.jsx";
// import CreateReport from "./components/CreateReport.jsx";

import LayoutAdmin from "./LayoutAdmin.jsx";
import FeesOverviewPage from "./components/FeesOverviewPage.jsx";
import AttendancePage from "./components/AttendancePage.jsx";
import Fees from "./components/Fees.jsx";
import NewStudentRegister from "./components/NewStudentRegister.jsx";
import NewTeacherRegister from "./components/NewTeacherRegister.jsx";
// import StudentBirthday from "./components/AdminBirthday.jsx";
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

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = React.useContext(AuthContext);

  if (loading) {
    return <div>Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    // return <Navigate to="/login" />;
    return <Navigate to="/login" />;
  }
  return children;
  // return user ? children : <Navigate to="/login" />;
};
const App = () => {
  return (
    // <h1>hello</h1>
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="" element={<Login />} />
            <Route path="/login" element={<Login />} />
            {/* <Route path="/Management/Staff" element={<Staff />} /> */}
            {/* <Route path="/Management/Trustee" element={<Trustee />} /> */}
            {/* <Route path="/Management/HelpingHands" element={<HelpingHands />} /> */}
            {/* <Route path="/Activity" element={<Activity />} />
            <Route path="/Gallery" element={<Gallery />} />
            <Route path="/Achievement" element={<Achievement />} />
            <Route path="/Material/PDF" element={<PDF />} />
            <Route path="/Material/Video" element={<Video />} />
            <Route path="/register" element={<Register />} />

            
            <Route path="/create-report" element={<CreateReport />} />
            <Route path="/reports" element={<Reports />} /> */}

            {/* <Route
              path="/dashboard" 
              element={
                <PrivateRoute roles={["admin"]}>
                  <AdminDashboard />
                </PrivateRoute>
              }
            /> */}
            <Route
              path="/teacher-dashboard"
              element={
                <PrivateRoute roles={["teacher"]}>
                  <TeacherDashboard />
                </PrivateRoute>
              }
            />

            {/* <Route path="*" element={<Navigate to="/" />} /> */}
          </Route>
        </Routes>

        <Routes>
          <Route
            path="/dashboard"
            element={
              <PrivateRoute roles={["admin"]}>
                <LayoutAdmin />
              </PrivateRoute>
            }
          >
            <Route
              path="/dashboard/feesOverview"
              element={<FeesOverviewPage />}
            />
            <Route
              path="/dashboard/attendanceOverview"
              element={<AttendancePage />}
            />
            <Route path="/dashboard/fees" element={<Fees />} />
            <Route
              path="/dashboard/studentRegister"
              element={<NewStudentRegister />}
            />
            <Route
              path="/dashboard/teacherRegister"
              element={<NewTeacherRegister />}
            />
            <Route
              path="/dashboard/studentBirthday"
              element={<StudentBirthday />}
            />
            <Route
              path="/dashboard/teacherBirthday"
              element={<TeacherBirthday />}
            />
            <Route path="/dashboard/calendar" element={<CalendarPage />} />
            <Route
              path="/dashboard/attendanceEntryPage"
              element={<AttendanceEntryPage />}
            />
            <Route path="/dashboard/pdf" element={<AdminPdf />} />
            <Route path="/dashboard/video" element={<AdminVideo />} />
            <Route path="/dashboard/gallery" element={<GalleryDashboard />} />
            <Route path="/dashboard/createReport" element={<CreateReport />} />
            <Route
              path="/dashboard/teacherWorkReport"
              element={<TeacherWorkReport />}
            />
            <Route path="/dashboard/users" element={<AdminUsers />} />
            <Route
              path="/dashboard/students/:standard/:reportId"
              element={<Students />}
            />
            {/* path="/students/:standard/:reportId" */}

            <Route
              path="/dashboard/*"
              element={<Navigate to="/dashboard/feesOverview" />}
            />
            {/* <Route path="*" element={<Login />} /> */}
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
