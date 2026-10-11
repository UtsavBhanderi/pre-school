import React, { useContext, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MdMenu, MdClose, MdCalendarToday } from "react-icons/md";
import { AuthContext } from "./context/AuthContext";
import SideNav from "./pages/afterLogin/SideNav.jsx";

const PAGE_META = [
  ["/dashboard/feesOverview", "Dashboard", "A clear view of school activity and fee collection."],
  ["/dashboard/attendanceOverview", "Attendance overview", "Review attendance and follow up on absences."],
  ["/dashboard/studentRegister", "Student records", "Manage student profiles and family information."],
  ["/dashboard/teacherRegister", "Teacher records", "Manage teaching staff and their details."],
  ["/dashboard/fees", "Fees & payments", "Record payments and keep balances up to date."],
  ["/dashboard/attendanceEntryPage", "Take attendance", "Mark attendance for a class in a few steps."],
  ["/dashboard/calendar", "School calendar", "Keep events and important school dates organized."],
  ["/dashboard/studentBirthday", "Student birthdays", "Find upcoming student birthdays."],
  ["/dashboard/teacherBirthday", "Teacher birthdays", "Find upcoming staff birthdays."],
  ["/dashboard/teacherWorkReport", "Work reports", "Review day-to-day classroom work reports."],
  ["/dashboard/users", "User access", "Manage accounts that can access the system."],
  ["/dashboard/pdf", "PDF resources", "Organize downloadable learning materials."],
  ["/dashboard/video", "Video resources", "Manage classroom video resources."],
  ["/dashboard/gallery", "Photo gallery", "Keep the school photo collection organized."],
  ["/dashboard/createReport", "Report cards", "Prepare student progress reports."],
];

export default function LayoutAdmin() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const page = PAGE_META.find(([path]) => location.pathname.startsWith(path)) || PAGE_META[0];
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="admin-layout">
      {menuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <SideNav isOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="admin-menu-button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <MdClose size={23} /> : <MdMenu size={23} />}
            </button>
            <div>
              <h1 className="admin-topbar-title">School management</h1>
              <div className="admin-topbar-caption">{page[1]} · {page[2]}</div>
            </div>
          </div>
          <div className="d-flex align-items-center gap-3">
            <div className="d-none d-md-flex align-items-center gap-2 muted small">
              <MdCalendarToday aria-hidden="true" />
              <span>{today}</span>
            </div>
            <div className="d-none d-sm-flex align-items-center gap-2 ps-3 border-start">
              <div className="sidebar-brand-mark" style={{ width: 36, height: 36, flexBasis: 36, borderRadius: 12, fontSize: "0.85rem" }}>
                {(user?.username || "A").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="fw-semibold small">{user?.username || "Administrator"}</div>
                <div className="muted" style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>{user?.role || "admin"}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="admin-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
