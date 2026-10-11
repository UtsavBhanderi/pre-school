import React, { useContext, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import AttendanceEntryPage from "../../components/AttendanceEntryPage";
import WorkReport from "./TeacherDashboard";
import { FaPowerOff, FaRegCircleCheck } from "react-icons/fa6";
import { IoAnalyticsOutline } from "react-icons/io5";

const TeacherDashboard = () => {
  const [activeComponent, setActiveComponent] = useState("WorkReport");
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="teacher-dashboard-layout">
      <aside className="teacher-sidebar" aria-label="Teacher navigation">
        <h1 className="teacher-sidebar-title">Pre-School <span className="d-block small fw-normal mt-1" style={{ color: "#aebce0" }}>Teacher workspace</span></h1>
        <button
          type="button"
          onClick={() => setActiveComponent("WorkReport")}
          className={"teacher-side-link" + (activeComponent === "WorkReport" ? " active" : "")}
          aria-current={activeComponent === "WorkReport" ? "page" : undefined}
        >
          <IoAnalyticsOutline size={21} aria-hidden="true" />
          <span>Daily work report</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveComponent("AttEntry")}
          className={"teacher-side-link" + (activeComponent === "AttEntry" ? " active" : "")}
          aria-current={activeComponent === "AttEntry" ? "page" : undefined}
        >
          <FaRegCircleCheck size={20} aria-hidden="true" />
          <span>Attendance entry</span>
        </button>
        <div className="mt-auto pt-3">
          <div className="small mb-2 px-2" style={{ color: "#aebce0" }}>
            Signed in as <strong style={{ color: "#fff" }}>{user?.username || "Teacher"}</strong>
          </div>
          <button type="button" onClick={logout} className="teacher-side-link w-100">
            <FaPowerOff size={19} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="teacher-main">
        <div className="page-header">
          <div>
            <h2 className="mb-0">{activeComponent === "AttEntry" ? "Attendance entry" : "Daily work report"}</h2>
            <p className="page-subtitle">
              {activeComponent === "AttEntry"
                ? "Choose a class and date, then record each student’s attendance."
                : "Submit classroom activity and working-time details for the school day."}
            </p>
          </div>
        </div>
        {activeComponent === "AttEntry" ? <AttendanceEntryPage /> : <WorkReport />}
      </main>
    </div>
  );
};

export default TeacherDashboard;
