import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import * as XLSX from "xlsx";
import {
  FaBirthdayCake,
  FaCalendarAlt,
  FaSearch,
  FaDownload,
  FaSyncAlt,
  FaPrint,
  FaUserGraduate,
  FaGift,
  FaRegCalendarCheck,
  FaFilter,
  FaEye,
  FaExclamationTriangle,
  FaSmileBeam,
} from "react-icons/fa";


  const linkone = API_BASE_URL;


// Default placeholder avatar shown when a student has no photo on file.
const DEFAULT_AVATAR =
  "https://ui-avatars.com/api/?background=6C63FF&color=fff&bold=true&name=";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Quick filter definitions - label + internal key used for one-click filtering.
const QUICK_FILTERS = [
  { key: "TODAY", label: "Today" },
  { key: "TOMORROW", label: "Tomorrow" },
  { key: "NEXT_7_DAYS", label: "Next 7 Days" },
  { key: "THIS_WEEK", label: "This Week" },
  { key: "NEXT_WEEK", label: "Next Week" },
  { key: "THIS_MONTH", label: "This Month" },
  { key: "NEXT_MONTH", label: "Next Month" },
  { key: "ALL", label: "All Students" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// =======================
// Helper Functions
// =======================

/** Returns true if the given year is a leap year. */
const isLeapYear = (year) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Strips the time portion off a Date so day-level comparisons are safe. */
const stripTime = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Normalizes text values used by filters so casing/extra spaces do not break matches. */
const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

/** Creates a local date from an HTML <input type="date"> value. */
const parseDateInput = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : stripTime(date);
};

/** Safely parses a DOB into a local Date object.
 * Important: "YYYY-MM-DD" must NOT be passed directly to new Date(),
 * because JavaScript treats date-only ISO strings as UTC and can shift
 * the birthday to the previous day in India/other positive timezones.
 */
const parseDOB = (dob) => {
  if (!dob) return null;

  if (dob instanceof Date) {
    const parsed = new Date(dob);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const value = String(dob).trim();
  if (!value) return null;

  // Handle YYYY-MM-DD and ISO strings beginning with YYYY-MM-DD as a
  // calendar date in the browser's local timezone.
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Formats a Date as DD/MM/YYYY for display. */
const formatDateDMY = (date) => {
  if (!date) return "-";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

/** Builds a full display name from first/middle/last name parts. */
const getFullName = (student) => {
  const parts = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.join(" ");
};

/** Resolves the photo URL for a student, falling back to a generated avatar. */
const getPhotoUrl = (student) => {
  if (student.studentPhoto) {
    return `${linkone}/${student.studentPhoto}`;
  }
  return `${DEFAULT_AVATAR}${encodeURIComponent(getFullName(student) || "Student")}`;
};

/**
 * Given a student's DOB and "today", calculates:
 * - nextBirthday: the Date of their next birthday occurrence (this year or next)
 * - daysRemaining: whole days until that birthday (0 = today)
 * - turningAge: the age they will be turning on that next birthday
 * - isToday / isTomorrow flags for quick classification
 * Correctly handles December -> January rollover and Feb 29 leap birthdays.
 */
const calculateBirthdayInfo = (dob, today) => {
  const birthDate = parseDOB(dob);
  if (!birthDate) return null;

  const todayClean = stripTime(today);
  const birthMonth = birthDate.getMonth();
  const birthDay = birthDate.getDate();
  const birthYear = birthDate.getFullYear();

  // Handle Feb 29 birthdays landing in non-leap years by celebrating Feb 28.
  const resolveCelebrationDay = (year) => {
    if (birthMonth === 1 && birthDay === 29 && !isLeapYear(year)) {
      return 28;
    }
    return birthDay;
  };

  let candidateYear = todayClean.getFullYear();
  let nextBirthday = new Date(
    candidateYear,
    birthMonth,
    resolveCelebrationDay(candidateYear)
  );

  // If this year's occurrence has already passed, roll over to next year.
  if (stripTime(nextBirthday) < todayClean) {
    candidateYear += 1;
    nextBirthday = new Date(
      candidateYear,
      birthMonth,
      resolveCelebrationDay(candidateYear)
    );
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.round(
    (stripTime(nextBirthday) - todayClean) / msPerDay
  );

  const turningAge = candidateYear - birthYear;

  return {
    birthDate,
    nextBirthday,
    daysRemaining,
    turningAge,
    isToday: daysRemaining === 0,
    isTomorrow: daysRemaining === 1,
  };
};

/** Human-friendly badge text for the "remaining days" column. */
const getRemainingLabel = (daysRemaining) => {
  if (daysRemaining === 0) return "Today";
  if (daysRemaining === 1) return "Tomorrow";
  if (daysRemaining <= 7) return `${daysRemaining} Days`;
  if (daysRemaining <= 30) return `${daysRemaining} Days`;
  return "Next Month+";
};

/** Bootstrap contextual class for the remaining-days badge. */
const getRemainingBadgeClass = (daysRemaining) => {
  if (daysRemaining === 0) return "bg-success text-white";
  if (daysRemaining === 1) return "bg-warning text-dark";
  if (daysRemaining <= 7) return "bg-info text-dark";
  if (daysRemaining <= 30) return "bg-primary";
  return "bg-secondary";
};

/** Returns the ISO week start (Monday) for a given date. */
const getWeekStart = (date) => {
  const clean = stripTime(date);
  const day = clean.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // shift so Monday is start
  const monday = new Date(clean);
  monday.setDate(clean.getDate() + diff);
  return monday;
};

// =======================
// API
// =======================

/** Fetches the raw student birthday list from the School ERP backend. */
const fetchStudentBirthdays = async () => {
//   const response = await axios.get("/api/students/birthdays");
  const response = await axios.get(`${linkone}/api/students/birthdays`);

  return Array.isArray(response.data) ? response.data : response.data?.data || [];
};

// =======================
// Main Component
// =======================
const Birthday = () => {
  // =======================
  // States
  // =======================
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeQuickFilter, setActiveQuickFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [standardFilter, setStandardFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [birthMonthFilter, setBirthMonthFilter] = useState("");
  const [birthWeekdayFilter, setBirthWeekdayFilter] = useState("");
  const [minAgeFilter, setMinAgeFilter] = useState("");
  const [maxAgeFilter, setMaxAgeFilter] = useState("");
  const [photoFilter, setPhotoFilter] = useState("");
  const [minDaysFilter, setMinDaysFilter] = useState("");
  const [maxDaysFilter, setMaxDaysFilter] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const today = useMemo(() => stripTime(new Date()), []);

  // =======================
  // API Loading
  // =======================
  const loadBirthdays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudentBirthdays();
      setStudents(data);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to load birthday data. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBirthdays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =======================
  // Enrichment (attach computed birthday info to every student)
  // =======================
  const enrichedStudents = useMemo(() => {
    return students
      .map((student) => {
        const info = calculateBirthdayInfo(student.dob, today);
        if (!info) return null;
        return { ...student, ...info };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [students, today]);

  // =======================
  // Statistics
  // =======================
  const stats = useMemo(() => {
    const todays = enrichedStudents.filter((s) => s.daysRemaining === 0);
    const tomorrows = enrichedStudents.filter((s) => s.daysRemaining === 1);
    const next7 = enrichedStudents.filter(
      (s) => s.daysRemaining >= 0 && s.daysRemaining <= 7
    );
    const thisMonth = enrichedStudents.filter(
      (s) => s.nextBirthday.getMonth() === today.getMonth()
    );

    // Birthdays grouped by standard (for the "This Month" style breakdown card).
    const byStandard = {};
    enrichedStudents.forEach((s) => {
      const std = s.standard || "Unassigned";
      byStandard[std] = (byStandard[std] || 0) + 1;
    });

    // Monthly distribution across all 12 months, based on birth month.
    const byMonth = new Array(12).fill(0);
    enrichedStudents.forEach((s) => {
      byMonth[s.birthDate.getMonth()] += 1;
    });
    const maxMonthCount = Math.max(1, ...byMonth);

    return {
      todayCount: todays.length,
      tomorrowCount: tomorrows.length,
      next7Count: next7.length,
      thisMonthCount: thisMonth.length,
      byStandard,
      byMonth,
      maxMonthCount,
    };
  }, [enrichedStudents, today]);

  // =======================
  // Filtering
  // =======================

  /** Applies the currently active quick filter using calendar-date ranges. */
  const applyQuickFilter = useCallback(
    (list) => {
      const todayStart = stripTime(today);

      const addDays = (date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return stripTime(result);
      };

      const isBetweenInclusive = (date, start, end) =>
        date >= start && date <= end;

      switch (activeQuickFilter) {
        case "TODAY":
          return list.filter((s) => s.daysRemaining === 0);

        case "TOMORROW":
          return list.filter((s) => s.daysRemaining === 1);

        case "NEXT_7_DAYS":
          // Includes today + the following 6 calendar days = 7 calendar days.
          return list.filter((s) =>
            isBetweenInclusive(s.nextBirthday, todayStart, addDays(todayStart, 6))
          );

        case "THIS_WEEK": {
          const weekStart = getWeekStart(todayStart);
          const weekEnd = addDays(weekStart, 6);
          return list.filter((s) =>
            isBetweenInclusive(s.nextBirthday, weekStart, weekEnd)
          );
        }

        case "NEXT_WEEK": {
          const nextWeekStart = addDays(getWeekStart(todayStart), 7);
          const nextWeekEnd = addDays(nextWeekStart, 6);
          return list.filter((s) =>
            isBetweenInclusive(s.nextBirthday, nextWeekStart, nextWeekEnd)
          );
        }

        case "THIS_MONTH": {
          const monthStart = new Date(
            todayStart.getFullYear(),
            todayStart.getMonth(),
            1
          );
          const monthEnd = new Date(
            todayStart.getFullYear(),
            todayStart.getMonth() + 1,
            0
          );
          return list.filter((s) =>
            isBetweenInclusive(s.nextBirthday, monthStart, stripTime(monthEnd))
          );
        }

        case "NEXT_MONTH": {
          const nextMonthStart = new Date(
            todayStart.getFullYear(),
            todayStart.getMonth() + 1,
            1
          );
          const nextMonthEnd = new Date(
            todayStart.getFullYear(),
            todayStart.getMonth() + 2,
            0
          );
          return list.filter((s) =>
            isBetweenInclusive(
              s.nextBirthday,
              stripTime(nextMonthStart),
              stripTime(nextMonthEnd)
            )
          );
        }

        case "ALL":
        default:
          return list;
      }
    },
    [activeQuickFilter, today]
  );

  /** Applies global search + all advanced birthday/student filters. */
  const applyAdvancedFilters = useCallback(
    (list) => {
      let result = list;

      const normalizedSearch = normalizeText(searchTerm);
      const normalizedStandard = normalizeText(standardFilter);
      const normalizedGender = normalizeText(genderFilter);
      const pickedDate = parseDateInput(customDate);
      const selectedMonth = birthMonthFilter === "" ? null : Number(birthMonthFilter);
      const selectedWeekday =
        birthWeekdayFilter === "" ? null : Number(birthWeekdayFilter);
      const minAge = minAgeFilter === "" ? null : Number(minAgeFilter);
      const maxAge = maxAgeFilter === "" ? null : Number(maxAgeFilter);
      const minDays = minDaysFilter === "" ? null : Number(minDaysFilter);
      const maxDays = maxDaysFilter === "" ? null : Number(maxDaysFilter);

      if (normalizedSearch) {
        result = result.filter((s) => {
          const searchableValues = [
            getFullName(s),
            s.firstName,
            s.middleName,
            s.lastName,
            s.stuNo,
            s.standard,
            s.gender,
          ];

          return searchableValues.some((value) =>
            normalizeText(value).includes(normalizedSearch)
          );
        });
      }

      if (normalizedStandard) {
        result = result.filter(
          (s) => normalizeText(s.standard) === normalizedStandard
        );
      }

      if (normalizedGender) {
        result = result.filter(
          (s) => normalizeText(s.gender) === normalizedGender
        );
      }

      if (pickedDate) {
        result = result.filter(
          (s) =>
            s.birthDate.getMonth() === pickedDate.getMonth() &&
            s.birthDate.getDate() === pickedDate.getDate()
        );
      }

      if (selectedMonth !== null) {
        result = result.filter(
          (s) => s.birthDate.getMonth() === selectedMonth
        );
      }

      if (selectedWeekday !== null) {
        result = result.filter(
          (s) => s.birthDate.getDay() === selectedWeekday
        );
      }

      if (minAge !== null && Number.isFinite(minAge)) {
        result = result.filter((s) => s.turningAge >= minAge);
      }

      if (maxAge !== null && Number.isFinite(maxAge)) {
        result = result.filter((s) => s.turningAge <= maxAge);
      }

      if (photoFilter === "WITH_PHOTO") {
        result = result.filter((s) => Boolean(s.studentPhoto));
      }

      if (photoFilter === "WITHOUT_PHOTO") {
        result = result.filter((s) => !s.studentPhoto);
      }

      if (minDays !== null && Number.isFinite(minDays)) {
        result = result.filter((s) => s.daysRemaining >= minDays);
      }

      if (maxDays !== null && Number.isFinite(maxDays)) {
        result = result.filter((s) => s.daysRemaining <= maxDays);
      }

      return result;
    },
    [
      searchTerm,
      standardFilter,
      genderFilter,
      customDate,
      birthMonthFilter,
      birthWeekdayFilter,
      minAgeFilter,
      maxAgeFilter,
      photoFilter,
      minDaysFilter,
      maxDaysFilter,
    ]
  );

  const filteredStudents = useMemo(() => {
    const quickFiltered = applyQuickFilter(enrichedStudents);
    return applyAdvancedFilters(quickFiltered);
  }, [enrichedStudents, applyQuickFilter, applyAdvancedFilters]);

  // Distinct standards for the dropdown filter, derived from full dataset.
  const standardOptions = useMemo(() => {
    const set = new Set(
      enrichedStudents
        .map((s) => String(s.standard ?? "").trim())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [enrichedStudents]);

  // =======================
  // Pagination
  // =======================
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  // Reset to page 1 whenever filters change the result set shape.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeQuickFilter,
    searchTerm,
    standardFilter,
    genderFilter,
    customDate,
    birthMonthFilter,
    birthWeekdayFilter,
    minAgeFilter,
    maxAgeFilter,
    photoFilter,
    minDaysFilter,
    maxDaysFilter,
    pageSize,
  ]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  // Guard against stale page numbers after filtering or data refresh.
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  // =======================
  // Handlers
  // =======================
  const handleResetFilters = useCallback(() => {
    setSearchTerm("");
    setStandardFilter("");
    setGenderFilter("");
    setCustomDate("");
    setBirthMonthFilter("");
    setBirthWeekdayFilter("");
    setMinAgeFilter("");
    setMaxAgeFilter("");
    setPhotoFilter("");
    setMinDaysFilter("");
    setMaxDaysFilter("");
    setActiveQuickFilter("ALL");
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // =======================
  // Export
  // =======================
  const handleExportExcel = useCallback(() => {
    const exportRows = filteredStudents.map((s) => ({
      "GR No": s.stuNo || "",
      "Student Name": getFullName(s),
      DOB: formatDateDMY(s.birthDate),
      Standard: s.standard || "",
      Gender: s.gender || "",
      Age: s.turningAge,
      "Birthday Weekday": WEEKDAY_NAMES[s.birthDate.getDay()],
      "Birthday Month": MONTH_NAMES[s.birthDate.getMonth()],
      "Photo": s.studentPhoto ? "Yes" : "No",
      "Days Remaining": s.daysRemaining,
      Remaining: getRemainingLabel(s.daysRemaining),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Birthdays");

    const fileName = `Student_Birthdays_${formatDateDMY(today).replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [filteredStudents, today]);

  // =======================
  // Derived Display Data
  // =======================
  const todaysBirthdayStudents = useMemo(
    () => enrichedStudents.filter((s) => s.daysRemaining === 0),
    [enrichedStudents]
  );

  const upcomingBirthdayStudents = useMemo(
    () =>
      enrichedStudents
        .filter((s) => s.daysRemaining > 0 && s.daysRemaining <= 7)
        .slice(0, 7),
    [enrichedStudents]
  );

  const currentDateLabel = useMemo(() => {
    const weekday = WEEKDAY_NAMES[today.getDay()];
    const month = MONTH_NAMES[today.getMonth()];
    return `${weekday}, ${month} ${today.getDate()}, ${today.getFullYear()}`;
  }, [today]);

  // =======================
  // JSX
  // =======================
  return (
    <div className="container-fluid py-4 px-3 px-md-4 birthday-page">
      {/* Print-only styling: hide interactive chrome, keep table clean */}
      <style>{`
        .birthday-page .stat-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .birthday-page .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 0.75rem 1.5rem rgba(0,0,0,0.1) !important;
        }
        .birthday-page .spotlight-card {
          transition: transform 0.15s ease;
        }
        .birthday-page .spotlight-card:hover {
          transform: translateY(-3px);
        }
        .birthday-page .avatar-circle {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px #e9ecef;
        }
        .birthday-page .avatar-circle-lg {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #fff;
          box-shadow: 0 0 0 2px #eef0ff;
        }
        .birthday-page .quick-filter-pill {
          border-radius: 50rem;
          font-weight: 500;
        }
        .birthday-page .sticky-table-header th {
          position: sticky;
          top: 0;
          z-index: 2;
          background-color: #f8f9fc;
        }
        .birthday-page .table-scroll-wrap {
          max-height: 560px;
          overflow: auto;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .birthday-page .table-scroll-wrap {
            max-height: none;
            overflow: visible;
          }
        }
      `}</style>

      {/* ================= Header ================= */}
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1 text-dark">
            {/* <FaBirthdayCake className="text-danger me-2" /> */}
            Student Birthday Management
          </h2>
          <p className="text-muted mb-0">Celebrate every student's special day.</p>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2 no-print">
          <button
            type="button"
            className="btn btn-outline-secondary d-flex align-items-center gap-2"
            onClick={loadBirthdays}
            disabled={loading}
          >
            <FaSyncAlt className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-success d-flex align-items-center gap-2"
            onClick={handleExportExcel}
            disabled={loading || filteredStudents.length === 0}
          >
            <FaDownload />
            Export Excel
          </button>
          {/* <button
            type="button"
            className="btn btn-primary d-flex align-items-center gap-2"
            onClick={handlePrint}
            disabled={loading}
          >
            <FaPrint />
            Print
          </button> */}
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-3 mb-4">
        <span className="badge bg-dark-subtle text-dark border px-3 py-2 fs-6">
          <FaUserGraduate className="me-1 text-primary" />
          Total Students: <strong>{students.length}</strong>
        </span>
        <span className="badge bg-light text-dark border px-3 py-2 fs-6">
          <FaCalendarAlt className="me-1 text-primary" />
          {currentDateLabel}
        </span>
      </div>

      {/* ================= Loading State ================= */}
      {loading && (
        <div className="d-flex flex-column align-items-center justify-content-center py-5">
          <div className="spinner-border text-primary" style={{ width: "3rem", height: "3rem" }} role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted mt-3 mb-0">Loading birthday data...</p>
        </div>
      )}

      {/* ================= Error State ================= */}
      {!loading && error && (
        <div className="alert alert-danger d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div className="d-flex align-items-center gap-2">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadBirthdays}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ================= Dashboard Summary Cards ================= */}
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card stat-card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted small mb-1">Today's Birthdays</p>
                    <h3 className="fw-bold mb-0 text-success">{stats.todayCount}</h3>
                  </div>
                  <div className="fs-1 text-danger opacity-75">🎂</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card stat-card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted small mb-1">Tomorrow</p>
                    <h3 className="fw-bold mb-0 text-warning">{stats.tomorrowCount}</h3>
                  </div>
                  <div className="fs-1 text-warning opacity-75">📅</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card stat-card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted small mb-1">Next 7 Days</p>
                    <h3 className="fw-bold mb-0 text-info">{stats.next7Count}</h3>
                  </div>
                  <div className="fs-1 text-info opacity-75">🎈</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card stat-card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted small mb-1">This Month</p>
                    <h3 className="fw-bold mb-0 text-primary">{stats.thisMonthCount}</h3>
                  </div>
                  <div className="fs-1 text-primary opacity-75">🎉</div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= Birthday Spotlight ================= */}
          <div className="mb-4">
            <h5 className="fw-bold mb-3">Today's Birthday 🎂</h5>
            {todaysBirthdayStudents.length > 0 ? (
              <div className="row g-3">
                {todaysBirthdayStudents.map((student) => (
                  <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={student._id}>
                    <div className="card spotlight-card border-0 shadow-sm rounded-4 h-100">
                      <div className="card-body text-center">
                        <img
                          src={getPhotoUrl(student)}
                          alt={getFullName(student)}
                          className="avatar-circle-lg mb-2"
                        />
                        <h6 className="fw-bold mb-1">{getFullName(student)}</h6>
                        <p className="text-muted small mb-1">
                          {student.standard} &bull; GR: {student.stuNo}
                        </p>
                        <p className="mb-2 fw-semibold text-primary">
                          Turns {student.turningAge} Years
                        </p>
                        <span className="badge bg-success text-white rounded-pill px-3 py-2">
                          🎉 Happy Birthday!
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="alert alert-light border rounded-4 d-flex align-items-center gap-2 mb-0">
                <FaSmileBeam className="text-warning fs-4" />
                <span>🎈 No birthdays today.</span>
              </div>
            )}
          </div>

          {/* ================= Upcoming Birthdays ================= */}
          <div className="mb-4">
            <h5 className="fw-bold mb-3">Upcoming Birthdays</h5>
            {upcomingBirthdayStudents.length > 0 ? (
              <div className="row g-3">
                {upcomingBirthdayStudents.map((student) => (
                  <div className="col-12 col-md-6 col-xl-3" key={student._id}>
                    <div className="card border-0 shadow-sm rounded-4 h-100">
                      <div className="card-body d-flex align-items-center gap-3">
                        <img
                          src={getPhotoUrl(student)}
                          alt={getFullName(student)}
                          className="avatar-circle"
                        />
                        <div className="flex-grow-1">
                          <h6 className="fw-bold mb-0">{getFullName(student)}</h6>
                          <p className="text-muted small mb-1">{student.standard}</p>
                          <div className="d-flex justify-content-between align-items-center">
                            <span className="small text-muted">
                              {formatDateDMY(student.nextBirthday)}
                            </span>
                            <span
                              className={`badge rounded-pill ${getRemainingBadgeClass(
                                student.daysRemaining
                              )}`}
                            >
                              {getRemainingLabel(student.daysRemaining)}
                            </span>
                          </div>
                          <p className="small text-primary fw-semibold mt-1 mb-0">
                            Turns {student.turningAge}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="alert alert-light border rounded-4 mb-0">
                No upcoming birthdays in the next 7 days.
              </div>
            )}
          </div>

          {/* ================= Quick Filters ================= */}
          <div className="mb-3 no-print">
            <h6 className="fw-bold mb-2 d-flex align-items-center gap-2">
              <FaFilter className="text-primary" /> Quick Filters
            </h6>
            <div className="d-flex flex-wrap gap-2">
              {QUICK_FILTERS.map((qf) => (
                <button
                  key={qf.key}
                  type="button"
                  className={`btn btn-sm quick-filter-pill ${
                    activeQuickFilter === qf.key
                      ? "btn-primary"
                      : "btn-outline-primary"
                  }`}
                  onClick={() => setActiveQuickFilter(qf.key)}
                >
                  {qf.label}
                </button>
              ))}
            </div>
          </div>

          {/* ================= Advanced Filters ================= */}
          <div className="birthday-advanced-filters card border-0 shadow-sm rounded-4 mb-4 no-print">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
                  <FaFilter className="text-primary" /> Advanced Filters
                </h6>
                <span className="small text-muted">
                  {filteredStudents.length} matching student{filteredStudents.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="row g-2">
                {/* Search */}
                <div className="col-12 col-lg-4">
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <FaSearch className="text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Search name, GR No, standard, gender..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Standard */}
                <div className="col-6 col-md-3 col-lg-2">
                  <select
                    className="form-select"
                    value={standardFilter}
                    onChange={(e) => setStandardFilter(e.target.value)}
                    aria-label="Filter by standard"
                  >
                    <option value="">All Standards</option>
                    {standardOptions.map((std) => (
                      <option key={std} value={std}>{std}</option>
                    ))}
                  </select>
                </div>

                {/* Gender */}
                <div className="col-6 col-md-3 col-lg-2">
                  <select
                    className="form-select"
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value)}
                    aria-label="Filter by gender"
                  >
                    <option value="">All Genders</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Birthday month */}
                <div className="col-6 col-md-3 col-lg-2">
                  <select
                    className="form-select"
                    value={birthMonthFilter}
                    onChange={(e) => setBirthMonthFilter(e.target.value)}
                    aria-label="Filter by birth month"
                  >
                    <option value="">All Birth Months</option>
                    {MONTH_NAMES.map((month, index) => (
                      <option key={month} value={index}>{month}</option>
                    ))}
                  </select>
                </div>

                {/* Birthday weekday */}
                <div className="col-6 col-md-3 col-lg-2">
                  <select
                    className="form-select"
                    value={birthWeekdayFilter}
                    onChange={(e) => setBirthWeekdayFilter(e.target.value)}
                    aria-label="Filter by birthday weekday"
                  >
                    <option value="">All Weekdays</option>
                    {WEEKDAY_NAMES.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </div>

                {/* Exact date */}
                <div className="col-6 col-md-3 col-lg-2">
                  <input
                    type="date"
                    className="form-control"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    aria-label="Filter birthdays by exact date"
                    title="Filter by exact birth date (month and day)"
                  />
                </div>

                {/* Minimum age */}
                <div className="col-6 col-md-3 col-lg-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="form-control"
                    placeholder="Min Age"
                    value={minAgeFilter}
                    onChange={(e) => setMinAgeFilter(e.target.value)}
                    aria-label="Minimum age"
                  />
                </div>

                {/* Maximum age */}
                <div className="col-6 col-md-3 col-lg-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="form-control"
                    placeholder="Max Age"
                    value={maxAgeFilter}
                    onChange={(e) => setMaxAgeFilter(e.target.value)}
                    aria-label="Maximum age"
                  />
                </div>

                {/* Photo */}
                {/* <div className="col-6 col-md-3 col-lg-2">
                  <select
                    className="form-select"
                    value={photoFilter}
                    onChange={(e) => setPhotoFilter(e.target.value)}
                    aria-label="Filter by student photo"
                  >
                    <option value="">All Photos</option>
                    <option value="WITH_PHOTO">With Photo</option>
                    <option value="WITHOUT_PHOTO">Without Photo</option>
                  </select>
                </div> */}

                {/* Minimum days remaining */}
                <div className="col-6 col-md-3 col-lg-2">
                  <input
                    type="number"
                    min="0"
                    max="366"
                    className="form-control"
                    placeholder="Min Days"
                    value={minDaysFilter}
                    onChange={(e) => setMinDaysFilter(e.target.value)}
                    aria-label="Minimum days until birthday"
                  />
                </div>

                {/* Maximum days remaining */}
                <div className="col-6 col-md-3 col-lg-2">
                  <input
                    type="number"
                    min="0"
                    max="366"
                    className="form-control"
                    placeholder="Max Days"
                    value={maxDaysFilter}
                    onChange={(e) => setMaxDaysFilter(e.target.value)}
                    aria-label="Maximum days until birthday"
                  />
                </div>

                {/* Reset */}
                <div className="col-12 col-md-3 col-lg-2 d-grid">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={handleResetFilters}
                  >
                    Reset All
                  </button>
                </div>
              </div>

              {/* <div className="d-flex flex-wrap gap-2 mt-3">
                <span className="badge bg-light text-dark border">
                  Birthday Month
                </span>
                <span className="badge bg-light text-dark border">
                  Weekday
                </span>
                <span className="badge bg-light text-dark border">
                  Age Range
                </span>
                <span className="badge bg-light text-dark border">
                  Photo Status
                </span>
                <span className="badge bg-light text-dark border">
                  Days Until Birthday
                </span>
              </div> */}
            </div>
          </div>

          {/* ================= Table ================= */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-0">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-5">
                  <div className="fs-1 mb-2">🎂</div>
                  <p className="text-muted mb-0 fs-5">No birthdays found.</p>
                </div>
              ) : (
                <div className="table-scroll-wrap">
                  <table className="table table-striped table-hover table-bordered mb-0 align-middle">
                    <thead className="sticky-table-header">
                      <tr>
                        <th>#</th>
                        <th>Photo</th>
                        <th>GR No</th>
                        <th>Student Name</th>
                        <th>Standard</th>
                        <th>Gender</th>
                        <th>DOB</th>
                        <th>Turning Age</th>
                        <th>Next Birthday</th>
                        <th>Remaining</th>
                        {/* <th className="no-print">Action</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.map((student, index) => (
                        <tr key={student._id}>
                          <td>{(currentPage - 1) * pageSize + index + 1}</td>
                          <td>
                            <img
                              src={getPhotoUrl(student)}
                              alt={getFullName(student)}
                              className="avatar-circle"
                            />
                          </td>
                          <td>{student.stuNo}</td>
                          <td className="fw-bold">{getFullName(student)}</td>
                          <td>{student.standard}</td>
                          <td>{student.gender}</td>
                          <td>{formatDateDMY(student.birthDate)}</td>
                          <td>Turns {student.turningAge} Years</td>
                          <td>{formatDateDMY(student.nextBirthday)}</td>
                          <td>
                            <span
                              className={`badge ${getRemainingBadgeClass(
                                student.daysRemaining
                              )}`}
                            >
                              {getRemainingLabel(student.daysRemaining)}
                            </span>
                          </td>
                          {/* <td className="no-print">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                              title="View student details"
                            >
                              <FaEye /> View
                            </button>
                          </td> */}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ================= Pagination ================= */}
            {filteredStudents.length > 0 && (
              <div className="card-footer bg-white border-0 rounded-bottom-4 d-flex flex-wrap justify-content-between align-items-center gap-2 no-print">
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted">Page size</span>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: "auto" }}
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <span className="small text-muted">
                    Showing {(currentPage - 1) * pageSize + 1}-
                    {Math.min(currentPage * pageSize, filteredStudents.length)} of{" "}
                    {filteredStudents.length}
                  </span>
                </div>

                <nav>
                  <ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${currentPage === 1 ? "disabled" : ""}`}>
                      <button
                        className="page-link"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                    </li>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (page) =>
                          page === 1 ||
                          page === totalPages ||
                          Math.abs(page - currentPage) <= 1
                      )
                      .map((page, idx, arr) => (
                        <React.Fragment key={page}>
                          {idx > 0 && arr[idx - 1] !== page - 1 && (
                            <li className="page-item disabled">
                              <span className="page-link">...</span>
                            </li>
                          )}
                          <li
                            className={`page-item ${
                              currentPage === page ? "active" : ""
                            }`}
                          >
                            <button
                              className="page-link"
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </button>
                          </li>
                        </React.Fragment>
                      ))}
                    <li
                      className={`page-item ${
                        currentPage === totalPages ? "disabled" : ""
                      }`}
                    >
                      <button
                        className="page-link"
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        Next
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            )}
          </div>

          {/* ================= Statistics ================= */}
          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-5">
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                    <FaGift className="text-primary" /> Birthdays by Standard
                  </h6>
                  {Object.keys(stats.byStandard).length === 0 ? (
                    <p className="text-muted small mb-0">No data available.</p>
                  ) : (
                    <ul className="list-group list-group-flush">
                      {Object.entries(stats.byStandard)
                        .sort((a, b) => b[1] - a[1])
                        .map(([standard, count]) => (
                          <li
                            key={standard}
                            className="list-group-item d-flex justify-content-between align-items-center px-0"
                          >
                            {standard}
                            <span className="badge bg-primary rounded-pill">{count}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-7">
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                    <FaRegCalendarCheck className="text-primary" /> Monthly Birthday
                    Distribution
                  </h6>
                  {MONTH_NAMES.map((monthName, idx) => (
                    <div key={monthName} className="mb-2">
                      <div className="d-flex justify-content-between small mb-1">
                        <span>{monthName}</span>
                        <span className="text-muted">{stats.byMonth[idx]}</span>
                      </div>
                      <div className="progress" style={{ height: "8px" }}>
                        <div
                          className="progress-bar bg-primary"
                          role="progressbar"
                          style={{
                            width: `${
                              (stats.byMonth[idx] / stats.maxMonthCount) * 100
                            }%`,
                          }}
                          aria-valuenow={stats.byMonth[idx]}
                          aria-valuemin="0"
                          aria-valuemax={stats.maxMonthCount}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Birthday;
