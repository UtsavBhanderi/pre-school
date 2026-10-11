import React, { useContext } from "react";
import { NavLink } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import {
  MdDashboard, MdCurrencyRupee, MdPeople, MdCake, MdCalendarMonth,
  MdFactCheck, MdPictureAsPdf, MdVideoLibrary, MdPhotoLibrary,
  MdAssessment, MdManageAccounts, MdLogout, MdSchool, MdChecklist,
  MdHome, MdHelpOutline,
} from "react-icons/md";

const navigation = [
  {
    label: "GET STARTED",
    items: [
      { to: "/dashboard/home", label: "Start here", icon: MdHome },
      { to: "/dashboard/feesOverview", label: "Fee overview", icon: MdDashboard },
    ],
  },
  {
    label: "DAILY SCHOOL WORK",
    items: [
      { to: "/dashboard/attendanceEntryPage", label: "Take attendance", icon: MdChecklist },
      { to: "/dashboard/fees", label: "Fees & payments", icon: MdCurrencyRupee },
      { to: "/dashboard/calendar", label: "School calendar", icon: MdCalendarMonth },
      { to: "/dashboard/attendanceOverview", label: "Attendance records", icon: MdFactCheck },
    ],
  },
  {
    label: "PEOPLE",
    items: [
      { to: "/dashboard/studentRegister", label: "Students", icon: MdPeople },
      { to: "/dashboard/teacherRegister", label: "Teachers", icon: MdSchool },
      { to: "/dashboard/studentBirthday", label: "Student birthdays", icon: MdCake },
      { to: "/dashboard/teacherBirthday", label: "Teacher birthdays", icon: MdCake },
      { to: "/dashboard/users", label: "User access", icon: MdManageAccounts },
    ],
  },
  {
    label: "LEARNING & SCHOOL LIFE",
    items: [
      { to: "/dashboard/createReport", label: "Report cards", icon: MdAssessment },
      { to: "/dashboard/teacherWorkReport", label: "Teacher work reports", icon: MdAssessment },
      { to: "/dashboard/pdf", label: "PDF resources", icon: MdPictureAsPdf },
      { to: "/dashboard/video", label: "Video resources", icon: MdVideoLibrary },
      { to: "/dashboard/gallery", label: "Photo gallery", icon: MdPhotoLibrary },
    ],
  },
  {
    label: "HELP",
    items: [
      { to: "/dashboard/help", label: "Help & guides", icon: MdHelpOutline },
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
                    end
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
