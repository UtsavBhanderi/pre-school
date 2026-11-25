import React, { useContext } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import {
  MdCurrencyRupee, MdPeople, MdCake, MdCalendarMonth,
  MdFactCheck, MdPictureAsPdf, MdVideoLibrary, MdPhotoLibrary,
  MdAssessment, MdManageAccounts, MdLogout, MdSchool, MdChecklist,
  MdHome, MdHelpOutline, MdCampaign, MdExpandMore, MdDashboard, MdForum,
  MdChevronLeft, MdChevronRight, MdQueryStats,
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
      { to: "/dashboard/communications", label: "Parent communication", icon: MdForum },
      { to: "/dashboard/gallery", label: "School photos", icon: MdPhotoLibrary },
    ],
  },
  {
    label: "Learning and reports",
    items: [
      { to: "/dashboard/subjects", label: "Class subjects", icon: MdSchool },
      { to: "/dashboard/createReport", label: "Report cards", icon: MdAssessment },
      { to: "/dashboard/teacherWorkReport", label: "Teacher work reports", icon: MdFactCheck },
      { to: "/dashboard/pdf", label: "Worksheets and PDFs", icon: MdPictureAsPdf },
      { to: "/dashboard/video", label: "Learning videos", icon: MdVideoLibrary },
    ],
  },
  {
    label: "School overview and access",
    items: [
      { to: "/dashboard/insights", label: "Management insights", icon: MdQueryStats },
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
        title={label}
        className={({ isActive }) => "sidebar-nav-link" + (isActive ? " active" : "")}
      >
        <span className="sidebar-icon" aria-hidden="true"><Icon /></span>
        <span>{label}</span>
      </NavLink>
    </li>
  );
}

export default function SideNav({ isOpen = false, isCollapsed = false, onToggleCollapse = () => {}, onNavigate = () => {} }) {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const displayName = user?.username || user?.name || "School administrator";

  return (
    <aside id="admin-sidebar-navigation" className={"admin-sidebar" + (isOpen ? " is-open" : "") + (isCollapsed ? " is-collapsed" : "")} aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">S</div>
        <div className="sidebar-brand-copy">
          <div className="sidebar-brand-title">Pre-School</div>
          <div className="sidebar-brand-subtitle">School workspace</div>
        </div>
        <button type="button" className="sidebar-collapse-toggle" onClick={onToggleCollapse} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {isCollapsed ? <MdChevronRight aria-hidden="true" /> : <MdChevronLeft aria-hidden="true" />}
        </button>
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

        {navigation.map((group) => {
          const groupIsActive = group.items.some((item) =>
            location.pathname === item.to || location.pathname.startsWith(item.to + "/")
          );
          return (
          <details
            className="sidebar-nav-group"
            key={group.label}
            open={group.defaultOpen || groupIsActive || undefined}
          >
            <summary className={"sidebar-section-title" + (groupIsActive ? " group-has-active" : "")}>
              <span>{group.label}</span>
              <MdExpandMore className="sidebar-group-chevron" aria-hidden="true" />
            </summary>
            <ul className="sidebar-nav">
              {group.items.map((item) => (
                <SidebarLink {...item} key={item.to} onNavigate={onNavigate} />
              ))}
            </ul>
          </details>
          );
        })}

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
        <button type="button" onClick={logout} className="btn sidebar-logout d-flex align-items-center gap-2" title="Sign out">
          <MdLogout size={19} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
