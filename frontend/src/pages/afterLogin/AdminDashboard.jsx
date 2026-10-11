import React, { useState, useContext } from "react";
import Fees from "../../components/Fees";
import AdminPdf from "../../components/AdminPdf";
import AdminVideo from "../../components/AdminVideo";
import NewRegister from "../../components/NewStudentRegister";
import TeacherRegister from "../../components/NewTeacherRegister";
import GalleryDashboard from "../../components/GalleryDashboard";
import TeacherDashboard from "../../components/TeachersEntry";
import UserDashboard from "../../components/AdminUsers";
import { AuthContext } from "../../context/AuthContext";
import AdminBirthday from "../../components/AdminBirthday";
import TeacherBirthday from "../../components/TeacherBirthday";
// import ReportCard from "../../components/CreateReportCard";
import ReportCard from "../../components/Reports";
// import Graph from "../../components/Graph";
import Graph from "../../components/FeesOverviewPage";
import CalendarPage from "../../components/CalendarPage";

import { LiaBirthdayCakeSolid } from "react-icons/lia";
import { FaRegFilePdf } from "react-icons/fa6";
import { FiVideo } from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { GrGallery } from "react-icons/gr";
import { FaRegUser } from "react-icons/fa";
import { TbReport } from "react-icons/tb";
import { FaPowerOff } from "react-icons/fa6";
import { IoAnalyticsOutline } from "react-icons/io5";
import { SiReacthookform } from "react-icons/si";
import { LuCalendarCheck } from "react-icons/lu";
import { LuClipboardList } from "react-icons/lu";
import { BsCake } from "react-icons/bs";
import { MdCheckCircleOutline } from "react-icons/md";
import { FaRegCheckCircle } from "react-icons/fa";
import { FaRegCircleCheck } from "react-icons/fa6";

import StudentAttendance from "../../components/StudentAttendance";
import AttendancePage from "../../components/AttendancePage";
import AttendanceEntryPage from "../../components/AttendanceEntryPage";


function AdminDashboard() {
  const [activeComponent, setActiveComponent] = useState("fees");
  const { user, logout } = useContext(AuthContext);

  const renderComponent = () => {
    switch (activeComponent) {
      case "graph":
        return <Graph />;
      case "fees":
        return <Fees />;
      case "calendar":
        return <CalendarPage />;
      case "pdf":
        return <AdminPdf />;
      case "video":
        return <AdminVideo />;
      case "Register":
        return <NewRegister />;
      case "TRegister":
        return <TeacherRegister />;
      case "Birthday":
        return <AdminBirthday />;
      case "TBirthday":
        return <TeacherBirthday />;
      case "GalleryDashboard":
        return <GalleryDashboard />;
      case "TeacherDashboard":
        return <TeacherDashboard />;
      case "UserDashboard":
        return <UserDashboard />;
      case "ReportCard":
        return <ReportCard />;
      case "StuAtt":
        return <StudentAttendance />;
      case "AttPage":
        return <AttendancePage />;
      case "AttEntry":
        return <AttendanceEntryPage />;

      default:
        return <Graph />;
    }
  };
  return (
    <>
      <div className="d-flex">
        <nav className="bg-light border-end vh-auto p-3 min-vh-100">
          <h4>Admin Dashboard</h4>
          <ul className="nav flex-column row-gap-3">
            
            
            {/* <li className="nav-item">
              <div
                onClick={() => setActiveComponent("StuAtt")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <IoAnalyticsOutline  />
                </h2>
                <h5>Student attendence</h5>
              </div>
            </li> */}
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("graph")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <IoAnalyticsOutline  />
                </h2>
                <h5>Dashboard</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("AttPage")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <IoAnalyticsOutline  />
                </h2>
                <h5>Attendence</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("fees")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <MdCurrencyRupee />
                </h2>
                <h5>Fees</h5>
              </div>
            </li>
            
            <li className="nav-item">
              <div
                className="dropdown-toggle d-flex align-items-baseline nav-link gap-3"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <h2> <LuClipboardList /></h2>
               <h5>
                 Register
                </h5>
              </div>
              <ul className="dropdown-menu dropdown-menu-dark">
                <li>
                  <div
                    onClick={() => setActiveComponent("Register")}
                    className="nav-link dropdown-item"
                  >
                    Student
                  </div>
                </li>
                <li>
                  <div
                    onClick={() => setActiveComponent("TRegister")}
                    className="nav-link dropdown-item"
                  >
                    Teacher
                  </div>
                </li>
              </ul>
            </li>
            <li className="nav-item">
              <div
                className="dropdown-toggle d-flex align-items-baseline nav-link gap-3"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <h2>
                  <BsCake />
                </h2>
                <h5>Birthday</h5>
              </div>
              <ul className="dropdown-menu dropdown-menu-dark">
              {/* <li>
                  <NavLink className="dropdown-item" to="Management/Trustee">
                    Trustee
                  </NavLink>
                </li> */}
                <li>
                  <span
                    onClick={() => setActiveComponent("Birthday")}
                    className="nav-link dropdown-item"
                  >
                    Student
                  </span>
                </li>
                <li>
                  <div
                    onClick={() => setActiveComponent("TBirthday")}
                    className="nav-link dropdown-item"
                  >
                    Teacher
                  </div>
                </li>
              </ul>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("calendar")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <LuCalendarCheck />
                </h2>
                <h5>Calendar</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("AttEntry")}
                className="nav-link d-flex align-items-center gap-3"
              >
                <h2>
                  <FaRegCircleCheck />
                  {/* <FaRegCheckCircle /> */}
                </h2>
                <h5>Attendence Entry</h5>
              </div>
            </li>
            {/* <li className="nav-item">
              <div
                onClick={() => setActiveComponent("Register")}
                className="nav-link"
              >
                Student Register
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("TRegister")}
                className="nav-link"
              >
                Teacher Register
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("Birthday")}
                className="nav-link"
              >
                <LiaBirthdayCakeSolid />
                <h5>
                  Student Birthday
                  </h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("TBirthday")}
                className="nav-link">
                Teacher Birthday
              </div>
            </li> */}
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("pdf")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <FaRegFilePdf />
                </h2>
                <h5>PDF</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("video")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <FiVideo />
                </h2>
                <h5>Videos</h5>
              </div>
            </li>

            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("GalleryDashboard")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <GrGallery />
                </h2>
                <h5>Gallery</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("ReportCard")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <TbReport />
                </h2>
                <h5>Report card</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("TeacherDashboard")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <TbReport />
                </h2>
                <h5>Work Report</h5>
              </div>
            </li>
            <li className="nav-item">
              <div
                onClick={() => setActiveComponent("UserDashboard")}
                className="nav-link d-flex align-items-baseline gap-3"
              >
                <h2>
                  <FaRegUser />
                </h2>
                <h5>User</h5>
              </div>
            </li>
            <li className="nav-item">
              <button onClick={logout} className="btn btn-danger w-75 gap-3 d-flex align-items-baseline">
                <h5>
                <FaPowerOff />
                </h5>
                <h5>Logout</h5>
              </button>
            </li>
          </ul>
        </nav>
        <main className="p-4 w-100">{renderComponent()}</main>
      </div>
    </>
  );
}

export default AdminDashboard;
