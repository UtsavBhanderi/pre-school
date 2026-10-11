import React, { useContext } from "react";
import { NavLink } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import {
  MdDashboard, MdCurrencyRupee, MdPeople, MdCake, MdCalendarMonth,
  MdFactCheck, MdPictureAsPdf, MdVideoLibrary, MdPhotoLibrary,
  MdAssessment, MdManageAccounts, MdLogout, MdSchool, MdChecklist,
} from "react-icons/md";

const navigation = [
  {
    label: "OVERVIEW",
    items: [
      { to: "/dashboard/feesOverview", label: "Dashboard", icon: MdDashboard },
      { to: "/dashboard/attendanceOverview", label: "Attendance overview", icon: MdFactCheck },
    ],
  },
  {
    label: "SCHOOL MANAGEMENT",
    items: [
      { to: "/dashboard/studentRegister", label: "Students", icon: MdPeople },
      { to: "/dashboard/teacherRegister", label: "Teachers", icon: MdSchool },
      { to: "/dashboard/fees", label: "Fees & payments", icon: MdCurrencyRupee },
      { to: "/dashboard/attendanceEntryPage", label: "Take attendance", icon: MdChecklist },
      { to: "/dashboard/calendar", label: "School calendar", icon: MdCalendarMonth },
    ],
  },
  {
    label: "SCHOOL COMMUNITY",
    items: [
      { to: "/dashboard/studentBirthday", label: "Student birthdays", icon: MdCake },
      { to: "/dashboard/teacherBirthday", label: "Teacher birthdays", icon: MdCake },
      { to: "/dashboard/teacherWorkReport", label: "Work reports", icon: MdAssessment },
      { to: "/dashboard/users", label: "User access", icon: MdManageAccounts },
    ],
  },
  {
    label: "LEARNING & MEDIA",
    items: [
      { to: "/dashboard/pdf", label: "PDF resources", icon: MdPictureAsPdf },
      { to: "/dashboard/video", label: "Video resources", icon: MdVideoLibrary },
      { to: "/dashboard/gallery", label: "Photo gallery", icon: MdPhotoLibrary },
      { to: "/dashboard/createReport", label: "Report cards", icon: MdAssessment },
    ],
  },
];

export default function SideNav({ isOpen = false, onNavigate = () => {} }) {
  const { user, logout } = useContext(AuthContext);
  const displayName = user?.username || user?.name || "School administrator";

  return (
    <aside className={"admin-sidebar" + (isOpen ? " is-open" : "")} aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">S</div>
        <div>
          <div className="sidebar-brand-title">Pre-School</div>
          <div className="sidebar-brand-subtitle">Management workspace</div>
        </div>
      </div>

      <nav aria-label="School management">
        {navigation.map((group) => (
          <div className="mb-3" key={group.label}>
            <div className="sidebar-section-title">{group.label}</div>
            <ul className="sidebar-nav">
              {group.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) => "sidebar-nav-link" + (isActive ? " active" : "")}
                  >
                    <span className="sidebar-icon" aria-hidden="true"><Icon /></span>
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-user">
        <div className="sidebar-user-name" title={displayName}>{displayName}</div>
        <div className="sidebar-user-role">{user?.role || "admin"} account</div>
        <button type="button" onClick={logout} className="btn sidebar-logout d-flex align-items-center gap-2">
          <MdLogout size={19} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
