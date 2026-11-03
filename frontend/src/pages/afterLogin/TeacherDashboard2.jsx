import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  MdSchool, MdDashboard, MdFactCheck, MdAssignment, MdForum, MdCampaign,
  MdHelpOutline, MdMenu, MdClose, MdLogout, MdArrowForward, MdCalendarToday,
  MdRefresh, MdCheckCircle, MdAccessTime, MdNotifications, MdPerson,
} from "react-icons/md";
import { IoAnalyticsOutline } from "react-icons/io5";
import { AuthContext } from "../../context/AuthContext";
import { API_BASE_URL } from "../../api.js";
import AttendanceEntryPage from "../../components/AttendanceEntryPage";
import WorkReport from "./TeacherDashboard";
import TeacherHelp from "../../components/TeacherHelp.jsx";
import AnnouncementsPage from "../../components/AnnouncementsPage.jsx";
import SchoolCommunication from "../../components/SchoolCommunication.jsx";
import "../../teacher-workspace.css";

const NAV_GROUPS = [
  {
    label: "My classroom",
    items: [
      { id: "home", label: "Overview", title: "Your teaching day", description: "Your classroom workspace at a glance.", Icon: MdDashboard },
      { id: "attendance", label: "Take attendance", title: "Take attendance", description: "Mark every child present or absent, then save your register.", Icon: MdFactCheck },
      { id: "reports", label: "Daily work report", title: "Daily work report", description: "Record the lessons, activities and classroom work you completed.", Icon: MdAssignment },
    ],
  },
  {
    label: "Stay connected",
    items: [
      { id: "communication", label: "Parent communication", title: "Parent communication", description: "Share homework, respond to families and manage school polls.", Icon: MdForum },
      { id: "notices", label: "School notices", title: "School notices", description: "Read the latest updates and important reminders from your school.", Icon: MdCampaign },
    ],
  },
  {
    label: "Support",
    items: [
      { id: "help", label: "Quick help", title: "Quick help", description: "Simple step-by-step guidance for your everyday school tasks.", Icon: MdHelpOutline },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const localDateKey = (value = new Date()) => {
  const date = new Date(value);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
};
const formatDate = (value = new Date()) => new Intl.DateTimeFormat("en-IN", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
}).format(new Date(value));
const formatShortDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short",
  }).format(date);
};
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};
const initials = (value) => String(value || "Teacher").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function QuickAction({ icon: Icon, title, detail, onClick, tone = "blue" }) {
  return (
    <button type="button" className={"teacher-quick-action " + tone} onClick={onClick}>
      <span className="teacher-quick-action-icon"><Icon aria-hidden="true" /></span>
      <span className="teacher-quick-action-copy"><strong>{title}</strong><small>{detail}</small></span>
      <MdArrowForward className="teacher-quick-action-arrow" aria-hidden="true" />
    </button>
  );
}

function SummaryCard({ label, value, note, icon: Icon, tone = "blue" }) {
  return (
    <article className={"teacher-summary-card " + tone}>
      <span className="teacher-summary-icon"><Icon aria-hidden="true" /></span>
      <div className="teacher-summary-copy"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>
    </article>
  );
}

function TeacherOverview({ user, reports, notices, complaints, homework, loading, onNavigate, onRefresh, refreshError }) {
  const todayKey = localDateKey();
  const reportsToday = reports.filter((report) => String(report.date || "").slice(0, 10) === todayKey).length;
  const openMessages = complaints.filter((item) => item.status !== "resolved").length;
  const reportTotalHours = reports.reduce((sum, item) => sum + (Number(item.todaysWorkingHours) || 0), 0);
  const urgentNotices = notices.filter((item) => item.priority === "urgent").length;
  const recentNotices = notices.slice(0, 3);
  const latestReports = [...reports].sort((a, b) => {
    const left = String(a.date || "") + String(a.TimeOut || "");
    const right = String(b.date || "") + String(b.TimeOut || "");
    return right.localeCompare(left);
  }).slice(0, 3);

  return (
    <div className="teacher-overview">
      <section className="teacher-welcome-card">
        <div className="teacher-welcome-copy">
          <span className="teacher-eyebrow"><MdSchool aria-hidden="true" /> YOUR CLASSROOM SPACE</span>
          <h2>{greeting()}, {user?.username?.split(" ")[0] || "Teacher"}.</h2>
          <p>Everything you need for today’s school day, thoughtfully organised in one place.</p>
          <div className="teacher-welcome-meta"><MdCalendarToday aria-hidden="true" /> {formatDate()}</div>
          <div className="teacher-welcome-actions">
            <button type="button" className="teacher-welcome-primary" onClick={() => onNavigate("attendance")}><MdFactCheck /> Take attendance</button>
            <button type="button" className="teacher-welcome-secondary" onClick={() => onNavigate("reports")}><MdAssignment /> Daily report</button>
          </div>
        </div>
        <div className="teacher-welcome-art" aria-hidden="true">
          <div className="teacher-art-orbit orbit-one" />
          <div className="teacher-art-orbit orbit-two" />
          <div className="teacher-art-card">
            <span><MdCheckCircle /></span>
            <div><i /><i /><i /></div>
          </div>
          <div className="teacher-art-spark">✦</div>
        </div>
      </section>

      <section className="teacher-summary-grid" aria-label="Your activity summary">
        <SummaryCard label="Reports today" value={reportsToday} note="Daily classroom updates" icon={MdAssignment} tone="blue" />
        <SummaryCard label="Parent messages" value={openMessages} note="Awaiting follow-up" icon={MdForum} tone="amber" />
        <SummaryCard label="Homework posts" value={homework.length} note="Published assignments" icon={MdCheckCircle} tone="green" />
        <SummaryCard label="Hours reported" value={reportTotalHours.toFixed(1)} note="Across your reports" icon={MdAccessTime} tone="violet" />
      </section>

      {refreshError && <div className="teacher-overview-note" role="status">{refreshError}</div>}

      <section className="teacher-overview-section">
        <div className="teacher-section-heading">
          <div><h3>Quick actions</h3><p>Start a common task without searching through menus.</p></div>
        </div>
        <div className="teacher-quick-grid">
          <QuickAction icon={MdFactCheck} title="Take attendance" detail="Mark today’s class register" onClick={() => onNavigate("attendance")} tone="blue" />
          <QuickAction icon={MdAssignment} title="Submit daily report" detail="Share your classroom work" onClick={() => onNavigate("reports")} tone="green" />
          <QuickAction icon={MdForum} title="Parent communication" detail="Homework, messages and polls" onClick={() => onNavigate("communication")} tone="violet" />
        </div>
      </section>

      <section className="teacher-overview-columns">
        <article className="teacher-overview-panel">
          <div className="teacher-section-heading">
            <div><h3>School notices</h3><p>Updates shared by your school administrator.</p></div>
            <button type="button" className="teacher-text-link" onClick={() => onNavigate("notices")}>View all <MdArrowForward /></button>
          </div>
          {loading ? <div className="teacher-panel-empty">Loading school updates…</div> : recentNotices.length ? (
            <div className="teacher-notice-preview-list">
              {recentNotices.map((notice) => (
                <button type="button" className="teacher-notice-preview" key={notice._id} onClick={() => onNavigate("notices")}>
                  <span className={"teacher-notice-dot " + (notice.priority || "normal")} />
                  <span className="teacher-notice-preview-copy"><strong>{notice.title}</strong><small>{formatShortDate(notice.createdAt)} · {notice.priority || "normal"}</small></span>
                  <MdArrowForward aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : <div className="teacher-panel-empty">No new notices. You’re all caught up.</div>}
          {urgentNotices > 0 && <div className="teacher-urgent-hint"><MdNotifications /> {urgentNotices} urgent update{urgentNotices === 1 ? "" : "s"} need your attention.</div>}
        </article>

        <article className="teacher-overview-panel">
          <div className="teacher-section-heading">
            <div><h3>Recent work reports</h3><p>Your latest classroom activity updates.</p></div>
            <button type="button" className="teacher-text-link" onClick={() => onNavigate("reports")}>View reports <MdArrowForward /></button>
          </div>
          {loading ? <div className="teacher-panel-empty">Loading your reports…</div> : latestReports.length ? (
            <div className="teacher-report-preview-list">
              {latestReports.map((report, index) => (
                <div className="teacher-report-preview" key={report._id || index}>
                  <span className="teacher-report-preview-icon"><IoAnalyticsOutline aria-hidden="true" /></span>
                  <span className="teacher-report-preview-copy"><strong>{report.subject || "Classroom activity"}</strong><small>{report.standard || "Class"} · {formatShortDate(report.date)}</small></span>
                  <span className="teacher-report-hours">{(Number(report.todaysWorkingHours) || 0).toFixed(1)}h</span>
                </div>
              ))}
            </div>
          ) : <div className="teacher-panel-empty">Your submitted daily reports will appear here.</div>}
        </article>
      </section>

      <div className="teacher-overview-footer">
        <span>Need a hand with a task?</span>
        <button type="button" onClick={() => onNavigate("help")}>Open teacher help <MdArrowForward /></button>
        <button type="button" className="teacher-overview-refresh" onClick={onRefresh} disabled={loading}><MdRefresh /> {loading ? "Refreshing…" : "Refresh overview"}</button>
      </div>
    </div>
  );
}

export default function TeacherDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [reports, setReports] = useState([]);
  const [notices, setNotices] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [homework, setHomework] = useState([]);

  const activeItem = ALL_ITEMS.find((item) => item.id === activePage) || ALL_ITEMS[0];
  const teacherName = user?.username || "Teacher";

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    const results = await Promise.allSettled([
      axios.get(API_BASE_URL + "/api/dailyWorkReport"),
      axios.get(API_BASE_URL + "/api/announcements"),
      axios.get(API_BASE_URL + "/api/school-engagement/staff/complaints"),
      axios.get(API_BASE_URL + "/api/school-engagement/staff/homework"),
    ]);
    let failed = 0;
    if (results[0].status === "fulfilled") setReports(Array.isArray(results[0].value.data) ? results[0].value.data : []);
    else failed += 1;
    if (results[1].status === "fulfilled") setNotices(Array.isArray(results[1].value.data) ? results[1].value.data : []);
    else failed += 1;
    if (results[2].status === "fulfilled") setComplaints(results[2].value.data?.complaints || []);
    else failed += 1;
    if (results[3].status === "fulfilled") setHomework(results[3].value.data?.homework || []);
    else failed += 1;
    if (failed === 4) setOverviewError("We couldn’t load your overview data. Your quick actions are still available; try refreshing.");
    else if (failed > 0) setOverviewError("Some overview details are temporarily unavailable. Use Refresh to try again.");
    setOverviewLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const navigateTo = (pageId) => {
    setActivePage(pageId);
    setSidebarOpen(false);
    if (pageId === "home") loadOverview();
  };

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const pageSubtitle = useMemo(() => activeItem.description, [activeItem]);

  return (
    <div className="teacher-workspace">
      {sidebarOpen && <button type="button" className="teacher-sidebar-backdrop" aria-label="Close teacher navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={"teacher-sidebar " + (sidebarOpen ? "is-open" : "")} aria-label="Teacher workspace navigation">
        <div className="teacher-brand">
          <span className="teacher-brand-mark"><MdSchool aria-hidden="true" /></span>
          <span className="teacher-brand-copy"><strong>Pre-School</strong><small>Teacher workspace</small></span>
          <button type="button" className="teacher-sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><MdClose /></button>
        </div>

        <div className="teacher-nav-caption">YOUR WORKSPACE</div>
        <nav className="teacher-navigation">
          {NAV_GROUPS.map((group) => (
            <div className="teacher-nav-group" key={group.label}>
              <div className="teacher-nav-group-label">{group.label}</div>
              {group.items.map(({ id, label, Icon }) => (
                <button type="button" key={id} className={"teacher-nav-link " + (activePage === id ? "active" : "")} onClick={() => navigateTo(id)} aria-current={activePage === id ? "page" : undefined}>
                  <Icon aria-hidden="true" /><span>{label}</span>{id === "communication" && complaints.filter((item) => item.status !== "resolved").length > 0 && <small>{complaints.filter((item) => item.status !== "resolved").length}</small>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="teacher-sidebar-bottom">
          <div className="teacher-sidebar-profile">
            <span className="teacher-profile-avatar">{initials(teacherName)}</span>
            <span className="teacher-profile-copy"><strong>{teacherName}</strong><small>{user?.email || "Teacher account"}</small></span>
          </div>
          <button type="button" className="teacher-signout-button" onClick={signOut}><MdLogout aria-hidden="true" /> Sign out</button>
        </div>
      </aside>

      <div className="teacher-workspace-main">
        <header className="teacher-topbar">
          <div className="teacher-topbar-left">
            <button type="button" className="teacher-menu-button" aria-label="Open teacher navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><MdMenu /></button>
            <div className="teacher-breadcrumb"><span>Teacher workspace</span><MdArrowForward aria-hidden="true" /><strong>{activeItem.label}</strong></div>
          </div>
          <div className="teacher-topbar-right">
            <span className="teacher-topbar-date"><MdCalendarToday aria-hidden="true" /> {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span>
            <span className="teacher-topbar-divider" />
            <span className="teacher-topbar-user"><span className="teacher-topbar-avatar">{initials(teacherName)}</span><span><strong>{teacherName}</strong><small>Teacher</small></span></span>
          </div>
        </header>

        <main className="teacher-main-content" id="teacher-main-content">
          <div className="teacher-page-heading">
            <div><span className="teacher-page-kicker">TEACHER PORTAL</span><h1>{activeItem.title}</h1><p>{pageSubtitle}</p></div>
            {activePage !== "home" && <button type="button" className="teacher-page-home-link" onClick={() => navigateTo("home")}><MdDashboard /> Overview</button>}
          </div>

          {activePage === "home" && (
            <TeacherOverview
              user={user}
              reports={reports}
              notices={notices}
              complaints={complaints}
              homework={homework}
              loading={overviewLoading}
              refreshError={overviewError}
              onNavigate={navigateTo}
              onRefresh={loadOverview}
            />
          )}
          {activePage === "attendance" && <div className="teacher-feature-content"><AttendanceEntryPage /></div>}
          {activePage === "reports" && <div className="teacher-feature-content"><WorkReport /></div>}
          {activePage === "communication" && <div className="teacher-feature-content"><SchoolCommunication embedded /></div>}
          {activePage === "notices" && <div className="teacher-feature-content"><AnnouncementsPage readOnly /></div>}
          {activePage === "help" && <div className="teacher-feature-content"><TeacherHelp /></div>}
        </main>

        <footer className="teacher-workspace-footer"><span>{user?.email || "Your teacher account"}</span><span>Need access help? Contact your school administrator.</span></footer>
      </div>
    </div>
  );
}
