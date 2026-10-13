import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { MdMenu, MdClose, MdCalendarToday, MdSearch, MdHelpOutline, MdArrowForward } from "react-icons/md";
import { AuthContext } from "./context/AuthContext";
import SideNav from "./pages/afterLogin/SideNav.jsx";
import "./operations.css";
import { Navigate } from "react-router-dom";
import TenantWorkspace from "./components/TenantWorkspace.jsx";

const PAGE_META = [
  ["/dashboard/home", "Start here", "Choose a common task or search using everyday words."],
  ["/dashboard/help", "Help & guides", "Step-by-step instructions for common school tasks."],
  ["/dashboard/notices", "Notices for staff", "Share a school reminder with teachers."],
  ["/dashboard/feesOverview", "Fee summary", "See money collected and fees still due."],
  ["/dashboard/attendanceOverview", "Past attendance", "Review saved attendance and absences."],
  ["/dashboard/studentRegister", "Children and families", "Add a child or find an existing family record."],
  ["/dashboard/teacherRegister", "Teachers and staff", "Add a teacher or update staff details."],
  ["/dashboard/fees", "Fees and payments", "Record money received and print a receipt."],
  ["/dashboard/attendanceEntryPage", "Take attendance", "Mark which children are here today."],
  ["/dashboard/calendar", "Events and holidays", "Add events, holidays and celebrations."],
  ["/dashboard/studentBirthday", "Student birthdays", "Find upcoming student birthdays."],
  ["/dashboard/teacherBirthday", "Teacher birthdays", "Find upcoming staff birthdays."],
  ["/dashboard/teacherWorkReport", "Teacher work reports", "Review daily classroom work logs."],
  ["/dashboard/users", "Login accounts", "Manage who can sign in to the software."],
  ["/dashboard/pdf", "Worksheets and PDFs", "Manage classroom documents."],
  ["/dashboard/video", "Learning videos", "Manage classroom videos."],
  ["/dashboard/gallery", "School photos", "Organize photos from school activities."],
  ["/dashboard/createReport", "Report cards", "Prepare student progress reports."],
  ["/dashboard/students", "Student report", "Enter marks and review a student report card."],
];

const COMMANDS = [
  { label: "Start here", detail: "The easiest way to begin a task", to: "/dashboard/home", terms: "home dashboard start welcome tasks" },
  { label: "Take attendance", detail: "Mark children present or absent", to: "/dashboard/attendanceEntryPage", terms: "daily roll call child absent present" },
  { label: "Fees & payments", detail: "Record money received or check a balance", to: "/dashboard/fees", terms: "payment money receipt due rupees" },
  { label: "Fee overview", detail: "Review collection and outstanding fees", to: "/dashboard/feesOverview", terms: "collection summary pending outstanding" },
  { label: "Students", detail: "Add, find or update a child", to: "/dashboard/studentRegister", terms: "admission parent guardian gr number" },
  { label: "Teachers", detail: "Add or update a staff member", to: "/dashboard/teacherRegister", terms: "staff faculty teacher employee" },
  { label: "Attendance records", detail: "Review attendance already recorded", to: "/dashboard/attendanceOverview", terms: "past absence records" },
  { label: "School calendar", detail: "Add an event, holiday or celebration", to: "/dashboard/calendar", terms: "festival holidays events planning" },
  { label: "Report cards", detail: "Enter marks and prepare reports", to: "/dashboard/createReport", terms: "marks grades results assessment" },
  { label: "Teacher work reports", detail: "Review daily classroom work logs", to: "/dashboard/teacherWorkReport", terms: "work log time daily teaching" },
  { label: "PDF resources", detail: "Manage worksheets and PDF learning material", to: "/dashboard/pdf", terms: "documents homework worksheets" },
  { label: "Video resources", detail: "Manage learning videos", to: "/dashboard/video", terms: "movie links classroom" },
  { label: "Photo gallery", detail: "Organize school activity photos", to: "/dashboard/gallery", terms: "images pictures album" },
  { label: "Birthday lists", detail: "Find student and teacher birthdays", to: "/dashboard/studentBirthday", terms: "birthday cake student teacher" },
  { label: "User access", detail: "Manage who can sign in", to: "/dashboard/users", terms: "accounts login permissions" },
  { label: "Help & guides", detail: "Read simple instructions and troubleshoot", to: "/dashboard/help", terms: "support help how to error problem" },
  { label: "School notices", detail: "Publish reminders, holidays and staff updates", to: "/dashboard/notices", terms: "announcement notice memo communication teachers" },
];

export default function LayoutAdmin() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const commandInputRef = useRef(null);
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const page = PAGE_META.find(([path]) => location.pathname === path || location.pathname.startsWith(path + "/")) || PAGE_META[0];
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const matches = COMMANDS.filter((item) =>
      !query || [item.label, item.detail, item.terms].join(" ").toLowerCase().includes(query)
    );
    return query ? matches.slice(0, 8) : matches.slice(0, 7);
  }, [commandQuery]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        setCommandQuery("");
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (commandOpen) commandInputRef.current?.focus();
  }, [commandOpen]);

  const openCommand = () => {
    setCommandQuery("");
    setCommandOpen(true);
  };

  if (user?.hasInactiveWorkspaceMemberships &&
      (!Array.isArray(user?.memberships) || user.memberships.length === 0)) {
    return (
      <main className="container py-5">
        <section className="mx-auto p-4 border rounded-3 shadow-sm bg-white" style={{ maxWidth: "620px" }}>
          <div className="d-inline-flex align-items-center rounded-pill px-3 py-2 mb-3" style={{ background: "#fff4e5", color: "#8a4b08", fontSize: ".75rem", fontWeight: 800 }}>
            ACCESS NEEDS REVIEW
          </div>
          <h1 className="h3">School workspace access is inactive</h1>
          <p className="text-secondary">This account no longer has an active organization workspace. Your school data has not been deleted. Ask the preschool administrator to review your account access.</p>
          <button type="button" className="btn btn-primary" onClick={logout}>Sign out</button>
        </section>
      </main>
    );
  }

  if (Array.isArray(user?.memberships) && user.memberships.length > 0 &&
      user.memberships.every((membership) => membership.role === "parent")) {
    return <Navigate to="/parent-portal" replace />;
  }

  if (Array.isArray(user?.memberships) && user.memberships.some((membership) => membership.role !== "parent")) {
    return <TenantWorkspace />;
  }

  if (user && user.role !== "admin") {
    return <Navigate to="/login" replace />;
  }

  const goToCommand = (to) => {
    navigate(to);
    setCommandOpen(false);
    setCommandQuery("");
    setMenuOpen(false);
  };

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
          <div className="d-flex align-items-center gap-3 min-w-0">
            <button
              type="button"
              className="admin-menu-button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <MdClose size={23} /> : <MdMenu size={23} />}
            </button>
            <div className="admin-topbar-heading">
              <h1 className="admin-topbar-title">Your school</h1>
              <div className="admin-topbar-caption">{page[1]} · {page[2]}</div>
            </div>
          </div>
          <div className="admin-topbar-tools">
            <button type="button" className="admin-command-trigger" onClick={openCommand} aria-keyshortcuts="Control+K Meta+K">
              <MdSearch aria-hidden="true" />
              <span className="admin-command-label-text">Find a task</span>
              <kbd className="admin-command-shortcut">Ctrl K</kbd>
            </button>
            <Link to="/dashboard/help" className="admin-help-trigger" aria-label="Help and guides" title="Help & guides">
              <MdHelpOutline aria-hidden="true" />
              <span className="d-none d-xl-inline">Help</span>
            </Link>
            <div className="admin-topbar-date d-none d-lg-flex align-items-center gap-2 muted small">
              <MdCalendarToday aria-hidden="true" />
              <span>{today}</span>
            </div>
            <div className="admin-topbar-user d-none d-sm-flex align-items-center gap-2 ps-3 border-start">
              <div className="sidebar-brand-mark admin-avatar-mark">
                {(user?.username || "A").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="fw-semibold small">{user?.username || "Administrator"}</div>
                <div className="muted admin-user-role">{user?.role || "admin"}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="admin-main-content">
          <Outlet />
        </main>
      </div>

      {commandOpen && (
        <div
          className="admin-command-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCommandOpen(false);
          }}
        >
          <section
            className="admin-command-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-command-title"
          >
            <div className="admin-command-search">
              <MdSearch aria-hidden="true" />
              <label id="admin-command-title" className="visually-hidden">Find a page or task</label>
              <input
                ref={commandInputRef}
                type="search"
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="What would you like to do?"
                aria-label="Search school tasks"
                autoComplete="off"
              />
              <button type="button" className="admin-command-close" onClick={() => setCommandOpen(false)} aria-label="Close search">Esc</button>
            </div>
            <div className="admin-command-label">{commandQuery.trim() ? "Matching tasks" : "Popular tasks"}</div>
            <div className="admin-command-results">
              {filteredCommands.map((item) => (
                <button type="button" className="admin-command-result" key={item.to} onClick={() => goToCommand(item.to)}>
                  <MdArrowForward aria-hidden="true" />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
              ))}
              {filteredCommands.length === 0 && (
                <div className="admin-command-empty">No matching task. Try “student”, “fees” or “attendance”.</div>
              )}
            </div>
            <div className="admin-command-footer">
              <span>Search using everyday words</span>
              <span><kbd>Ctrl</kbd> + <kbd>K</kbd> to open · <kbd>Esc</kbd> to close</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
