import React, { useMemo, useState, useContext, useEffect } from "react";
import { createAuthenticatedApi } from "../api.js";
import { Link } from "react-router-dom";
import {
  MdArrowForward, MdFactCheck, MdCurrencyRupee, MdPersonAddAlt1,
  MdPeopleAlt, MdCalendarMonth, MdAssessment, MdPhotoLibrary,
  MdPictureAsPdf, MdVideoLibrary, MdSearch, MdHelpOutline,
  MdOutlineSchool, MdOutlineChecklist, MdRefresh, MdCampaign,
  MdManageAccounts, MdCake, MdExpandMore, MdClose,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import "../operations.css";

const ACTIONS = [
  {
    title: "Take attendance",
    description: "Mark which children are here today.",
    to: "/dashboard/attendanceEntryPage",
    Icon: MdFactCheck,
    group: "Daily work",
    primary: true,
    keywords: "present absent class children daily register roll call",
  },
  {
    title: "Record a fee payment",
    description: "Record money received and print a receipt.",
    to: "/dashboard/fees",
    Icon: MdCurrencyRupee,
    group: "Money",
    primary: true,
    keywords: "fees payment receipt money balance paid pending collection",
  },
  {
    title: "Add or find a child",
    description: "Register a new child or open an existing record.",
    to: "/dashboard/studentRegister",
    Icon: MdPersonAddAlt1,
    group: "Children and staff",
    primary: true,
    keywords: "admission add child parent family student register search gr number phone edit profile",
  },
  {
    title: "View management insights",
    description: "See school attendance, new admissions and fee trends together.",
    to: "/dashboard/insights",
    Icon: MdAssessment,
    group: "School setup",
    keywords: "management insights analytics overview dashboard attendance admission collection trend report",
  },
  {
    title: "Review past attendance",
    description: "Check attendance already saved for a class or date.",
    to: "/dashboard/attendanceOverview",
    Icon: MdFactCheck,
    group: "Daily work",
    keywords: "attendance records history absence",
  },
  {
    title: "Review fee balances",
    description: "See how much has been collected and what is still due.",
    to: "/dashboard/feesOverview",
    Icon: MdCurrencyRupee,
    group: "Money",
    keywords: "fees dues outstanding pending collection overview report",
  },
  {
    title: "Add or update a teacher",
    description: "Keep staff names and contact details up to date.",
    to: "/dashboard/teacherRegister",
    Icon: MdOutlineSchool,
    group: "Children and staff",
    keywords: "staff faculty employee teacher new add edit",
  },
  {
    title: "Find birthdays",
    description: "See upcoming birthdays for children and staff.",
    to: "/dashboard/studentBirthday",
    Icon: MdCake,
    group: "Children and staff",
    keywords: "birthday date celebration child teacher",
  },
  {
    title: "Manage login accounts",
    description: "Choose who can sign in to the school software.",
    to: "/dashboard/users",
    Icon: MdManageAccounts,
    group: "School setup",
    keywords: "users accounts login permissions access password",
  },
  {
    title: "Add a school event",
    description: "Record holidays, celebrations, meetings or activities.",
    to: "/dashboard/calendar",
    Icon: MdCalendarMonth,
    group: "School activities",
    keywords: "event holiday function festival schedule date calendar",
  },
  {
    title: "Share a school notice",
    description: "Post an update or reminder for teachers and staff.",
    to: "/dashboard/notices",
    Icon: MdCampaign,
    group: "School activities",
    keywords: "notice announcement memo staff teacher reminder communication",
  },
  {
    title: "Manage school photos",
    description: "Add or organize photos from school activities.",
    to: "/dashboard/gallery",
    Icon: MdPhotoLibrary,
    group: "School activities",
    keywords: "image picture album gallery event photograph",
  },
  {
    title: "Set up class subjects",
    description: "Configure subjects before entering student report-card marks.",
    to: "/dashboard/subjects",
    Icon: MdOutlineSchool,
    group: "Learning",
    keywords: "subjects curriculum syllabus class learning report card setup",
  },
  {
    title: "Prepare report cards",
    description: "Enter learning progress and prepare student reports.",
    to: "/dashboard/createReport",
    Icon: MdAssessment,
    group: "Learning",
    keywords: "marks progress assessment report grade result",
  },
  {
    title: "Share worksheets and PDFs",
    description: "Manage worksheets and other class documents.",
    to: "/dashboard/pdf",
    Icon: MdPictureAsPdf,
    group: "Learning",
    keywords: "homework pdf worksheet notes document resources file",
  },
  {
    title: "Manage learning videos",
    description: "Add or organize classroom video links.",
    to: "/dashboard/video",
    Icon: MdVideoLibrary,
    group: "Learning",
    keywords: "video movie clip link resources",
  },
  {
    title: "Review teacher work reports",
    description: "Review daily classroom work reports submitted by teachers.",
    to: "/dashboard/teacherWorkReport",
    Icon: MdOutlineChecklist,
    group: "Learning",
    keywords: "daily work log time in time out teacher report",
  },
];

const QUICK_ACTIONS = ACTIONS.filter((action) => action.primary);
const EXTRA_ACTIONS = ACTIONS.filter((action) => !action.primary);
const GROUP_ORDER = [
  "Daily work",
  "Children and staff",
  "Money",
  "School activities",
  "Learning",
  "School setup",
];

const api = createAuthenticatedApi();

const dateLabel = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function TaskLink({ action, compact = false }) {
  const Icon = action.Icon;
  return (
    <Link
      to={action.to}
      className={compact ? "ops-simple-task-row" : "ops-simple-quick-task"}
      key={action.title}
    >
      <span className="ops-simple-task-icon"><Icon aria-hidden="true" /></span>
      <span className="ops-simple-task-copy">
        <strong>{action.title}</strong>
        <span>{action.description}</span>
      </span>
      <MdArrowForward className="ops-simple-task-arrow" aria-hidden="true" />
    </Link>
  );
}

export default function OperationsHome() {
  const { user } = useContext(AuthContext);
  const [query, setQuery] = useState("");
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [overview, setOverview] = useState({
    studentCount: null,
    attendanceCount: null,
    collectionToday: null,
    outstanding: null,
  });
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const greeting = greetingForHour(new Date().getHours());
  const displayName = user?.username || user?.name || "";
  const filteredActions = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return ACTIONS.filter((action) =>
      [action.title, action.description, action.group, action.keywords]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [query]);

  useEffect(() => {
    let active = true;
    const today = new Date();
    const date = today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");

    const loadOverview = async () => {
      setOverviewLoading(true);
      setOverviewError(false);
      try {
        const response = await api.get("/api/admin/overview", {
          params: { startDate: date, endDate: date },
        });
        if (!active) return;
        const data = response.data || {};
        setOverview({
          studentCount: Number.isFinite(Number(data.students?.active)) ? Number(data.students.active) : null,
          attendanceCount: Number.isFinite(Number(data.attendance?.marked)) ? Number(data.attendance.marked) : null,
          collectionToday: Number.isFinite(Number(data.fees?.collectedInRange)) ? Number(data.fees.collectedInRange) : null,
          outstanding: Number.isFinite(Number(data.fees?.outstanding)) ? Number(data.fees.outstanding) : null,
        });
      } catch (error) {
        if (!active) return;
        console.error("Unable to load school management overview:", error);
        setOverview({
          studentCount: null,
          attendanceCount: null,
          collectionToday: null,
          outstanding: null,
        });
        setOverviewError(true);
      } finally {
        if (active) setOverviewLoading(false);
      }
    };

    loadOverview();
    return () => { active = false; };
  }, [refreshVersion]);

  const formatMetricCurrency = (value) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  return (
    <div className="ops-page ops-simple-home">
      <section className="ops-simple-welcome" aria-labelledby="ops-simple-welcome-title">
        <div>
          <p className="ops-simple-eyebrow">YOUR SCHOOL</p>
          <h2 id="ops-simple-welcome-title">
            {greeting}{displayName ? ", " + displayName : ""}.
          </h2>
          <p>What would you like to do today? Choose one of the common tasks below.</p>
        </div>
        <div className="ops-simple-date">
          <MdCalendarMonth aria-hidden="true" />
          <span>{dateLabel}</span>
        </div>
      </section>

      {!query.trim() && (
        <section className="ops-simple-section" aria-labelledby="ops-common-tasks">
          <div className="ops-simple-section-heading">
            <h3 id="ops-common-tasks">Common tasks</h3>
            <p>Start here for the things school staff do most often.</p>
          </div>
          <div className="ops-simple-quick-grid">
            {QUICK_ACTIONS.map((action) => <TaskLink action={action} key={action.title} />)}
          </div>
        </section>
      )}

      <section className="ops-simple-find" aria-labelledby="ops-find-title">
        <label id="ops-find-title" htmlFor="ops-simple-task-search">
          Need to do something else?
        </label>
        <div className="ops-simple-search">
          <MdSearch aria-hidden="true" />
          <input
            id="ops-simple-task-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowAllTasks(false);
            }}
            placeholder="Type a simple word, such as teacher, holiday or marks"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear task search">
              <MdClose aria-hidden="true" /> Clear
            </button>
          )}
        </div>
        <p>Examples: add a child, payment receipt, report card, photos, holidays.</p>
      </section>

      {query.trim() ? (
        <section className="ops-simple-results" aria-live="polite" aria-labelledby="ops-search-results-title">
          <h3 id="ops-search-results-title">Tasks that match your search</h3>
          {filteredActions.length ? (
            <div className="ops-simple-task-list">
              {filteredActions.map((action) => <TaskLink action={action} compact key={action.title} />)}
            </div>
          ) : (
            <div className="ops-simple-empty">
              <strong>No task found for “{query.trim()}”.</strong>
              <span>Try another word, or clear the search to see the common tasks.</span>
              <button type="button" onClick={() => setQuery("")} className="ops-simple-secondary-button">
                Clear search
              </button>
              <Link to="/dashboard/help" className="ops-simple-inline-link">Open help and guides</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="ops-simple-more" aria-labelledby="ops-more-tasks-title">
          <button
            type="button"
            className="ops-simple-more-toggle"
            onClick={() => setShowAllTasks((shown) => !shown)}
            aria-expanded={showAllTasks}
            aria-controls="ops-more-tasks"
          >
            <span>
              <strong id="ops-more-tasks-title">More school tasks</strong>
              <small>{showAllTasks ? "Choose a task below" : "Open this only when you need another feature"}</small>
            </span>
            <span className="ops-simple-toggle-action">
              {showAllTasks ? "Hide tasks" : "Show all " + EXTRA_ACTIONS.length + " tasks"}
              <MdExpandMore className={showAllTasks ? "is-rotated" : ""} aria-hidden="true" />
            </span>
          </button>
          {showAllTasks && (
            <div id="ops-more-tasks" className="ops-simple-groups">
              {GROUP_ORDER.map((group) => {
                const items = EXTRA_ACTIONS.filter((action) => action.group === group);
                if (!items.length) return null;
                return (
                  <section className="ops-simple-task-group" key={group} aria-label={group}>
                    <h4>{group}</h4>
                    <div className="ops-simple-task-list">
                      {items.map((action) => <TaskLink action={action} compact key={action.title} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}

      <details className="ops-simple-summary">
        <summary>
          <MdOutlineSchool aria-hidden="true" />
          <span>
            <strong>School summary</strong>
            <small>Optional figures from saved school records</small>
          </span>
          <MdExpandMore className="ops-simple-summary-chevron" aria-hidden="true" />
        </summary>
        <div className="ops-simple-summary-body">
          <div className="ops-simple-summary-top">
            <p>These figures are for a quick overview. Open the related page to review the records.</p>
            <button
              type="button"
              className="ops-simple-refresh"
              onClick={() => setRefreshVersion((version) => version + 1)}
              disabled={overviewLoading}
            >
              <MdRefresh aria-hidden="true" /> {overviewLoading ? "Updating…" : "Refresh figures"}
            </button>
          </div>
          <div className="ops-simple-summary-grid" aria-live="polite">
            <Link to="/dashboard/studentRegister">
              <span>Active children</span>
              <strong>{overviewLoading ? "…" : overview.studentCount === null ? "—" : overview.studentCount.toLocaleString("en-IN")}</strong>
            </Link>
            <Link to="/dashboard/attendanceOverview">
              <span>Attendance entries recorded today</span>
              <strong>{overviewLoading ? "…" : overview.attendanceCount === null ? "—" : overview.attendanceCount.toLocaleString("en-IN")}</strong>
            </Link>
            <Link to="/dashboard/fees">
              <span>Money collected today</span>
              <strong>{overviewLoading ? "…" : overview.collectionToday === null ? "—" : formatMetricCurrency(overview.collectionToday)}</strong>
            </Link>
            <Link to="/dashboard/feesOverview">
              <span>Fees still due</span>
              <strong>{overviewLoading ? "…" : overview.outstanding === null ? "—" : formatMetricCurrency(overview.outstanding)}</strong>
            </Link>
          </div>
          {overviewError && (
            <p className="ops-simple-summary-error" role="status">
              Some figures could not be loaded. You can still open each school page, or try refreshing.
            </p>
          )}
        </div>
      </details>

      <section className="ops-simple-help">
        <span className="ops-simple-help-icon"><MdHelpOutline aria-hidden="true" /></span>
        <div>
          <strong>Not sure what to do?</strong>
          <p>The help guide explains common tasks one step at a time.</p>
        </div>
        <Link to="/dashboard/help" className="ops-simple-secondary-button">
          Open help guide <MdArrowForward aria-hidden="true" />
        </Link>
      </section>
      <p className="ops-simple-footnote">
        Changes are saved only when you use the Save button on a task page. Always check the child’s name and class before saving.
      </p>
    </div>
  );
}
