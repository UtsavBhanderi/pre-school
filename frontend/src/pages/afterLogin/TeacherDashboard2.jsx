import React, { useContext, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import AttendanceEntryPage from "../../components/AttendanceEntryPage";
import WorkReport from "./TeacherDashboard";
import { FaPowerOff, FaRegCircleCheck } from "react-icons/fa6";
import { IoAnalyticsOutline } from "react-icons/io5";

const TeacherDashboard = () => {
  const [activeComponent, setActiveComponent] = useState("WorkReport");
  const { logout } = useContext(AuthContext);

  const renderComponent = () => {
    if (activeComponent === "AttEntry") return <AttendanceEntryPage />;
    return <WorkReport />;
  };

  return (
    <div className="d-flex" style={{ minHeight: "100vh", width: "100%" }}>
      <nav className="bg-light border-end p-3" style={{ width: "250px", flexShrink: 0 }}>
        <h4>Teacher Dashboard</h4>
        <ul className="nav flex-column row-gap-3">
          <li className="nav-item">
            <button
              type="button"
              onClick={() => setActiveComponent("WorkReport")}
              className="nav-link d-flex align-items-center gap-3 border-0 bg-transparent"
            >
              <IoAnalyticsOutline size={22} />
              <span>Work Report</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              onClick={() => setActiveComponent("AttEntry")}
              className="nav-link d-flex align-items-center gap-3 border-0 bg-transparent"
            >
              <FaRegCircleCheck size={22} />
              <span>Attendance Entry</span>
            </button>
          </li>
          <li className="nav-item mt-3">
            <button type="button" onClick={logout} className="btn btn-danger w-100 d-flex align-items-center justify-content-center gap-2">
              <FaPowerOff />
              Logout
            </button>
          </li>
        </ul>
      </nav>
      <main className="p-4 flex-grow-1" style={{ minWidth: 0 }}>
        {renderComponent()}
      </main>
    </div>
  );
};

export default TeacherDashboard;
