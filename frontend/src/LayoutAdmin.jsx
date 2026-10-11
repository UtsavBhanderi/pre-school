import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { MdMenu, MdClose, MdCalendarToday, MdSearch, MdHelpOutline, MdArrowForward } from "react-icons/md";
import { AuthContext } from "./context/AuthContext";
import SideNav from "./pages/afterLogin/SideNav.jsx";
import "./operations.css";

const PAGE_META = [
  ["/dashboard/home", "Start here", "Choose a task or search using everyday words."],
  ["/dashboard/help", "Help & guides", "Step-by-step instructions for common school tasks."],
  ["/dashboard/feesOverview", "Fee overview", "A clear view of collection and outstanding balances."],
  ["/dashboard/attendanceOverview", "Attendance records", "Review attendance and follow up on absences."],
  ["/dashboard/studentRegister", "Student records", "Manage student profiles and family information."],
  ["/dashboard/teacherRegister", "Teacher records", "Manage teaching staff and their details."],
  ["/dashboard/fees", "Fees & payments", "Record payments and keep balances up to date."],
  ["/dashboard/attendanceEntryPage", "Take attendance", "Mark attendance for a class in a few steps."],
  ["/dashboard/calendar", "School calendar", "Keep events and important school dates organized."],
  ["/dashboard/studentBirthday", "Student birthdays", "Find upcoming student birthdays."],
  ["/dashboard/teacherBirthday", "Teacher birthdays", "Find upcoming staff birthdays."],
  ["/dashboard/teacherWorkReport", "Teacher work reports", "Review day-to-day classroom work reports."],
  ["/dashboard/users", "User access", "Manage accounts that can access the system."],
  ["/dashboard/pdf", "PDF resources", "Organize downloadable learning materials."],
  ["/dashboard/video", "Video resources", "Manage classroom video resources."],
  ["/dashboard/gallery", "Photo gallery", "Keep the school photo collection organized."],
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
];

export default function LayoutAdmin() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const commandInputRef = useRef(null);
  const { user } = useContext(AuthContext);
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
              <h1 className="admin-topbar-title">School management</h1>
              <div className="admin-topbar-caption">{page[1]} · {page[2]}</div>
            </div>
          </div>
          <div className="admin-topbar-tools">
            <button type="button" className="admin-command-trigger" onClick={openCommand} aria-keyshortcuts="Control+K Meta+K">
              <MdSearch aria-hidden="true" />
              <span className="admin-command-label-text">Find a page or task</span>
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
                aria-label="Search school pages and tasks"
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
