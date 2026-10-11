import React, { useMemo, useState, useContext, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { Link } from "react-router-dom";
import {
  MdArrowForward, MdFactCheck, MdCurrencyRupee, MdPersonAddAlt1,
  MdPeopleAlt, MdCalendarMonth, MdAssessment, MdPhotoLibrary,
  MdPictureAsPdf, MdVideoLibrary, MdSearch, MdHelpOutline,
  MdOutlineTipsAndUpdates, MdOutlineSchool, MdOutlineChecklist, MdRefresh,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import "../operations.css";

const ACTIONS = [
  {
    title: "Take attendance",
    description: "Record which children are here today and note absences.",
    to: "/dashboard/attendanceEntryPage",
    Icon: MdFactCheck,
    group: "Every day",
    keywords: "present absent class children daily register roll call",
  },
  {
    title: "Record a fee payment",
    description: "Add a payment and check how much is still due.",
    to: "/dashboard/fees",
    Icon: MdCurrencyRupee,
    group: "Every day",
    keywords: "fees payment receipt money balance paid pending collection",
  },
  {
    title: "Register a student",
    description: "Add a child and their family contact information.",
    to: "/dashboard/studentRegister",
    Icon: MdPersonAddAlt1,
    group: "People",
    keywords: "admission add child parent family new student register",
  },
  {
    title: "Find a student",
    description: "Look up a child's record to review or update details.",
    to: "/dashboard/studentRegister",
    Icon: MdPeopleAlt,
    group: "People",
    keywords: "search student gr number phone edit profile",
  },
  {
    title: "Add a school event",
    description: "Keep holidays, celebrations and activities on the calendar.",
    to: "/dashboard/calendar",
    Icon: MdCalendarMonth,
    group: "Plan ahead",
    keywords: "event holiday function festival schedule date calendar",
  },
  {
    title: "Prepare report cards",
    description: "Set up a report and enter children's learning progress.",
    to: "/dashboard/createReport",
    Icon: MdAssessment,
    group: "Learning",
    keywords: "marks progress assessment report grade result print",
  },
  {
    title: "Share learning material",
    description: "Manage class PDFs and learning videos.",
    to: "/dashboard/pdf",
    Icon: MdPictureAsPdf,
    group: "Learning",
    keywords: "homework pdf worksheet notes document resources",
  },
  {
    title: "Manage school photos",
    description: "Add or organize photos from school activities.",
    to: "/dashboard/gallery",
    Icon: MdPhotoLibrary,
    group: "School life",
    keywords: "image picture album gallery event photograph",
  },
  {
    title: "Add a teacher",
    description: "Keep staff information and contact details up to date.",
    to: "/dashboard/teacherRegister",
    Icon: MdOutlineSchool,
    group: "People",
    keywords: "staff faculty employee teacher new add",
  },
  {
    title: "Review outstanding fees",
    description: "See the overall collection picture and balances still due.",
    to: "/dashboard/feesOverview",
    Icon: MdCurrencyRupee,
    group: "Money",
    keywords: "fees dues outstanding pending collection overview report",
  },
  {
    title: "Teacher work reports",
    description: "Review the work reports submitted by teachers.",
    to: "/dashboard/teacherWorkReport",
    Icon: MdOutlineChecklist,
    group: "School day",
    keywords: "daily work log time in time out teacher report",
  },
  {
    title: "Manage learning videos",
    description: "Add a video link or organize existing classroom videos.",
    to: "/dashboard/video",
    Icon: MdVideoLibrary,
    group: "Learning",
    keywords: "video movie clip link upload resources",
  },
];

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

export default function OperationsHome() {
  const { user } = useContext(AuthContext);
  const [query, setQuery] = useState("");
  const greeting = greetingForHour(new Date().getHours());
  const displayName = user?.username || user?.name || "there";
  const visibleActions = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return ACTIONS;
    return ACTIONS.filter((action) =>
      [action.title, action.description, action.group, action.keywords]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [query]);

  const [overview, setOverview] = useState({
    studentCount: null,
    attendanceCount: null,
    collectionToday: null,
    outstanding: null,
  });
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const loadOverview = async () => {
      setOverviewLoading(true);
      setOverviewError(false);
      const [studentsResult, attendanceResult, feesResult] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/api/students`),
        axios.get(`${API_BASE_URL}/api/attendance/attendances`, { params: { date } }),
        axios.get(`${API_BASE_URL}/api/fees/fees-collection-data`),
      ]);

      if (!active) return;
      const nextOverview = {
        studentCount: null,
        attendanceCount: null,
        collectionToday: null,
        outstanding: null,
      };

      if (studentsResult.status === "fulfilled" && Array.isArray(studentsResult.value.data)) {
        nextOverview.studentCount = studentsResult.value.data.length;
      }
      if (attendanceResult.status === "fulfilled" && Array.isArray(attendanceResult.value.data)) {
        const studentIds = new Set();
        attendanceResult.value.data.forEach((record) => {
          (record.studentDetails || []).forEach((entry) => {
            const id = entry.studentId?._id || entry.studentId;
            if (id) studentIds.add(String(id));
          });
        });
        nextOverview.attendanceCount = studentIds.size;
      }
      if (feesResult.status === "fulfilled" && feesResult.value.data) {
        const feeSummary = feesResult.value.data;
        if (Number.isFinite(Number(feeSummary.today?.totalPaid))) {
          nextOverview.collectionToday = Number(feeSummary.today?.totalPaid || 0);
        }
        if (Array.isArray(feeSummary.standardWise)) {
          nextOverview.outstanding = feeSummary.standardWise.reduce((sum, standard) =>
            sum + (Array.isArray(standard.students) ? standard.students.reduce((classSum, student) =>
              classSum + Math.max(
                0,
                Number(student.totalStandardFees || 0) -
                Number(student.discount ?? student.totalDiscount ?? 0) -
                Number(student.totalPaid ?? student.totalFeesPaid ?? 0)
              ), 0) : 0), 0);
        }
      }

      setOverview(nextOverview);
      setOverviewError(Object.values(nextOverview).every((value) => value === null));
      setOverviewLoading(false);
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
    <div className="ops-page">
      <section className="ops-welcome" aria-labelledby="ops-welcome-title">
        <div className="ops-welcome-copy">
          <span className="ops-eyebrow"><MdOutlineSchool aria-hidden="true" /> YOUR SCHOOL WORKSPACE</span>
          <h2 id="ops-welcome-title">{greeting}, {displayName}!</h2>
          <p>Let’s make today easy. Choose a task below and follow the simple steps on each page.</p>
          <div className="ops-date"><MdCalendarMonth aria-hidden="true" /> {dateLabel}</div>
        </div>
        <div className="ops-welcome-art" aria-hidden="true">
          <div className="ops-art-circle ops-art-circle-one" />
          <div className="ops-art-circle ops-art-circle-two" />
          <div className="ops-art-card">
            <span className="ops-art-check"><MdFactCheck /></span>
            <span className="ops-art-lines"><i /><i /><i /></span>
          </div>
          <span className="ops-art-sparkle">✦</span>
        </div>
      </section>

      <section className="ops-overview" aria-labelledby="ops-overview-title">
        <div className="ops-section-heading ops-overview-heading">
          <div>
            <h3 id="ops-overview-title">Today at your school</h3>
            <p>Live totals from saved records. Each figure takes you to the related page.</p>
          </div>
          <button
            type="button"
            className="ops-refresh-button"
            onClick={() => setRefreshVersion((version) => version + 1)}
            disabled={overviewLoading}
          >
            <MdRefresh aria-hidden="true" /> {overviewLoading ? "Updating…" : "Refresh"}
          </button>
        </div>
        <div className="ops-overview-grid" aria-live="polite">
          <Link to="/dashboard/studentRegister" className="ops-overview-tile">
            <span className="ops-overview-label">Children registered</span>
            <strong className="ops-overview-value">{overviewLoading ? "…" : overview.studentCount === null ? "—" : overview.studentCount.toLocaleString("en-IN")}</strong>
            <span className="ops-overview-note">{overview.studentCount === null && !overviewLoading ? "Could not load student count" : "View student records"} <MdArrowForward aria-hidden="true" /></span>
          </Link>
          <Link to="/dashboard/attendanceOverview" className="ops-overview-tile">
            <span className="ops-overview-label">Children with attendance today</span>
            <strong className="ops-overview-value">{overviewLoading ? "…" : overview.attendanceCount === null ? "—" : overview.attendanceCount.toLocaleString("en-IN")}</strong>
            <span className="ops-overview-note">{overview.attendanceCount === null && !overviewLoading ? "Could not load attendance" : "Unique children with saved entries"} <MdArrowForward aria-hidden="true" /></span>
          </Link>
          <Link to="/dashboard/fees" className="ops-overview-tile">
            <span className="ops-overview-label">Collected today</span>
            <strong className="ops-overview-value">{overviewLoading ? "…" : overview.collectionToday === null ? "—" : formatMetricCurrency(overview.collectionToday)}</strong>
            <span className="ops-overview-note">{overview.collectionToday === null && !overviewLoading ? "Could not load collection" : "View fees and payments"} <MdArrowForward aria-hidden="true" /></span>
          </Link>
          <Link to="/dashboard/feesOverview" className="ops-overview-tile">
            <span className="ops-overview-label">Fees still due</span>
            <strong className="ops-overview-value">{overviewLoading ? "…" : overview.outstanding === null ? "—" : formatMetricCurrency(overview.outstanding)}</strong>
            <span className="ops-overview-note">{overview.outstanding === null && !overviewLoading ? "Could not load balances" : "Review outstanding balances"} <MdArrowForward aria-hidden="true" /></span>
          </Link>
        </div>
        {overviewError && <p className="ops-overview-error" role="status">The summary could not be loaded. Check your connection or refresh; you can still open each task below.</p>}
      </section>

      <div className="ops-section-heading">
        <div>
          <h3>What would you like to do?</h3>
          <p>Use everyday words to find the right task. You don’t need to know the menu name.</p>
        </div>
        <Link className="ops-text-link" to="/dashboard/help">Need help? <MdArrowForward aria-hidden="true" /></Link>
      </div>

      <div className="ops-action-search">
        <MdSearch aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “attendance”, “fees”, “add a child” or “report card”"
          aria-label="Find a school task"
        />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear task search">Clear</button>}
      </div>

      <div className="ops-action-grid" aria-live="polite">
        {visibleActions.map(({ title, description, to, Icon, group }) => (
          <Link className="ops-action-card" to={to} key={title}>
            <span className="ops-action-icon"><Icon aria-hidden="true" /></span>
            <span className="ops-action-group">{group}</span>
            <strong>{title}</strong>
            <span className="ops-action-description">{description}</span>
            <span className="ops-action-link">Open task <MdArrowForward aria-hidden="true" /></span>
          </Link>
        ))}
        {visibleActions.length === 0 && (
          <div className="ops-no-results">
            <MdSearch aria-hidden="true" />
            <strong>No matching task found</strong>
            <span>Try a shorter word such as “student”, “money” or “photos”.</span>
            <button type="button" className="btn btn-outline-primary btn-sm mt-2" onClick={() => setQuery("")}>Show all tasks</button>
          </div>
        )}
      </div>

      <div className="ops-bottom-grid">
        <section className="ops-info-card">
          <span className="ops-info-icon"><MdOutlineTipsAndUpdates aria-hidden="true" /></span>
          <div>
            <h3>New to the software?</h3>
            <p>Learn each task in simple language, with step-by-step instructions and common fixes.</p>
            <Link to="/dashboard/help" className="ops-button-secondary">Open the help guide <MdArrowForward aria-hidden="true" /></Link>
          </div>
        </section>
        <section className="ops-info-card ops-info-card-soft">
          <span className="ops-info-icon"><MdOutlineChecklist aria-hidden="true" /></span>
          <div>
            <h3>A safe way to work</h3>
            <p>Check the child or class before saving. After saving, look for the success message before moving on.</p>
            <span className="ops-small-note">Tip: use “Start here” whenever you are unsure where to go.</span>
          </div>
        </section>
      </div>
      <p className="ops-footnote">This page helps you find tasks. School records change only when you make and save a change on the relevant page.</p>
    </div>
  );
}
