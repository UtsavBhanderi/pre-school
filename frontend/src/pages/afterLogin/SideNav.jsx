import React, { useContext } from "react";
import { NavLink } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import {
  MdCurrencyRupee, MdPeople, MdCake, MdCalendarMonth,
  MdFactCheck, MdPictureAsPdf, MdVideoLibrary, MdPhotoLibrary,
  MdAssessment, MdManageAccounts, MdLogout, MdSchool, MdChecklist,
  MdHome, MdHelpOutline, MdCampaign, MdExpandMore, MdDashboard,
} from "react-icons/md";

const navigation = [
  {
    label: "Everyday tasks",
    defaultOpen: true,
    items: [
      { to: "/dashboard/attendanceEntryPage", label: "Take attendance", icon: MdChecklist },
      { to: "/dashboard/fees", label: "Fees and payments", icon: MdCurrencyRupee },
    ],
  },
  {
    label: "Children and staff",
    items: [
      { to: "/dashboard/studentRegister", label: "Children and families", icon: MdPeople },
      { to: "/dashboard/teacherRegister", label: "Teachers and staff", icon: MdSchool },
      { to: "/dashboard/studentBirthday", label: "Children's birthdays", icon: MdCake },
      { to: "/dashboard/teacherBirthday", label: "Staff birthdays", icon: MdCake },
    ],
  },
  {
    label: "School activities",
    items: [
      { to: "/dashboard/calendar", label: "Events and holidays", icon: MdCalendarMonth },
      { to: "/dashboard/notices", label: "Notices for staff", icon: MdCampaign },
      { to: "/dashboard/gallery", label: "School photos", icon: MdPhotoLibrary },
    ],
  },
  {
    label: "Learning and reports",
    items: [
      { to: "/dashboard/createReport", label: "Report cards", icon: MdAssessment },
      { to: "/dashboard/teacherWorkReport", label: "Teacher work reports", icon: MdFactCheck },
      { to: "/dashboard/pdf", label: "Worksheets and PDFs", icon: MdPictureAsPdf },
      { to: "/dashboard/video", label: "Learning videos", icon: MdVideoLibrary },
    ],
  },
  {
    label: "School overview and access",
    items: [
      { to: "/dashboard/feesOverview", label: "Fee summary", icon: MdDashboard },
      { to: "/dashboard/attendanceOverview", label: "Past attendance", icon: MdFactCheck },
      { to: "/dashboard/users", label: "Login accounts", icon: MdManageAccounts },
    ],
  },
];

function SidebarLink({ to, label, icon: Icon, onNavigate }) {
  return (
    <li>
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
  );
}

export default function SideNav({ isOpen = false, onNavigate = () => {} }) {
  const { user, logout } = useContext(AuthContext);
  const displayName = user?.username || user?.name || "School administrator";

  return (
    <aside className={"admin-sidebar" + (isOpen ? " is-open" : "")} aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">S</div>
        <div>
          <div className="sidebar-brand-title">Pre-School</div>
          <div className="sidebar-brand-subtitle">School workspace</div>
        </div>
      </div>

      <nav className="sidebar-simple-nav" aria-label="School tasks">
        <div className="sidebar-pinned-links">
          <SidebarLink
            to="/dashboard/home"
            label="Start here"
            icon={MdHome}
            onNavigate={onNavigate}
          />
        </div>

        {navigation.map((group) => (
          <details
            className="sidebar-nav-group"
            key={group.label}
            open={group.defaultOpen ? true : undefined}
          >
            <summary className="sidebar-section-title">
              <span>{group.label}</span>
              <MdExpandMore className="sidebar-group-chevron" aria-hidden="true" />
            </summary>
            <ul className="sidebar-nav">
              {group.items.map((item) => (
                <SidebarLink {...item} key={item.to} onNavigate={onNavigate} />
              ))}
            </ul>
          </details>
        ))}

        <div className="sidebar-pinned-links sidebar-help-link">
          <SidebarLink
            to="/dashboard/help"
            label="Help and guides"
            icon={MdHelpOutline}
            onNavigate={onNavigate}
          />
        </div>
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
