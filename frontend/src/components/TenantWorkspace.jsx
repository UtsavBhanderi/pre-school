import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  MdSchool, MdLogout, MdDashboard, MdPeople, MdFactCheck, MdCurrencyRupee,
  MdApartment, MdManageAccounts, MdSearch, MdRefresh, MdAdd, MdArrowForward,
  MdCheckCircle, MdErrorOutline, MdCalendarMonth, MdReceiptLong, MdHistory,
  MdShield, MdClose, MdExpandMore, MdSettings, MdPrint, MdCampaign, MdAssessment, MdDownload, MdAssignment, MdFolderOpen,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../child-health.css";
import "../owner-setup-guide.css";
import "../invitations.css";
import "../class-config.css";
import "../organization-settings.css";
import OrganizationSettingsPanel from "./OrganizationSettingsPanel.jsx";
import "../tenant-notices.css";
import "../tenant-reports.css";
import "../tenant-calendar.css";
import "../tenant-handover.css";
import "../tenant-work-reports.css";
import TenantMediaLibrary from "./TenantMediaLibrary.jsx";

const TABS = [
  { id: "overview", label: "Overview", Icon: MdDashboard },
  { id: "setup", label: "Getting started", Icon: MdCheckCircle },
  { id: "reports", label: "Reports & exports", Icon: MdAssessment },
  { id: "workreports", label: "Teacher work reports", Icon: MdAssignment },
  { id: "calendar", label: "Calendar & holidays", Icon: MdCalendarMonth },
  { id: "notices", label: "School notices", Icon: MdCampaign },
  { id: "resources", label: "Media library", Icon: MdFolderOpen },
  { id: "children", label: "Children", Icon: MdPeople },
  { id: "attendance", label: "Attendance", Icon: MdFactCheck },
  { id: "handover", label: "Arrival & pickup", Icon: MdShield },
  { id: "fees", label: "Fees & payments", Icon: MdCurrencyRupee },
  { id: "classes", label: "Classes & fees", Icon: MdSchool },
  { id: "branches", label: "Branches", Icon: MdApartment },
  { id: "settings", label: "Organization settings", Icon: MdSettings },
  { id: "subscription", label: "Plan & usage", Icon: MdReceiptLong },
  { id: "team", label: "Team & activity", Icon: MdManageAccounts },
];

const todayLocal = () => {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
};

const localDateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
};

const localDateTimeInputNow = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const localDateTimeInputAfter = (minutes) => {
  const date = new Date(Date.now() + minutes * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const academicYearNow = () => {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 3 ? year : year - 1;
  return startYear + "-" + (startYear + 1);
};

const formatMoney = (value, currency = "INR") => new Intl.NumberFormat("en-IN", {
  style: "currency", currency, maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const displayError = (error) => error?.response?.data?.message || "Something went wrong. Please try again.";
const createBlankChildDraft = (className = "") => ({
  firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "",
  className, academicYear: academicYearNow(), address: "",
  guardianName: "", guardianPhone: "", guardianEmail: "", guardianRelationship: "mother",
  guardianPickup: true, guardianBilling: true, guardianEmergency: true, guardianUpdates: true,
  communicationConsent: "unknown", photoConsent: "unknown",
});

const createBlankHealthDraft = () => ({
  allergies: [{ name: "", reaction: "", severity: "unknown", emergencyAction: "" }],
  medications: [{ name: "", dosage: "", instructions: "", startDate: "", endDate: "", administerAtSchool: false, parentAuthorizationRecorded: false, authorizationNotes: "" }],
  dietaryRestrictions: [{ name: "", details: "" }],
  specialCareInstructions: "",
  emergencyInstructions: "",
  physicianName: "",
  physicianPhone: "",
  medicalNotes: "",
});


const tokenHeaders = (organizationId, branchId) => {
  const token = localStorage.getItem("token");
  return {
    ...(token ? { "x-auth-token": token } : {}),
    ...(organizationId ? { "x-organization-id": organizationId } : {}),
    ...(branchId ? { "x-branch-id": branchId } : {}),
  };
};

async function saasRequest(path, { method = "GET", data, params, organizationId, branchId } = {}) {
  const response = await axios({
    url: API_BASE_URL + path,
    method,
    data,
    params,
    headers: tokenHeaders(organizationId, branchId),
  });
  return response.data;
}

function MetricCard({ label, value, detail, Icon }) {
  return (
    <article className="saas-metric-card">
      <span className="saas-metric-icon"><Icon aria-hidden="true" /></span>
      <div className="saas-metric-label">{label}</div>
      <div className="saas-metric-value">{value}</div>
      <div className="saas-metric-detail">{detail}</div>
    </article>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="saas-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function BlankState({ title, detail, action }) {
  return (
    <div className="saas-empty-state">
      <span className="saas-empty-icon"><MdSchool aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export default function TenantWorkspace() {
  const { user, logout } = useContext(AuthContext);
  const memberships = useMemo(
    () => (Array.isArray(user?.memberships) ? user.memberships.filter((item) => item?.organization?.id && item.role !== 'parent') : []),
    [user?.memberships],
  );
  const [organizationId, setOrganizationId] = useState(() => memberships[0]?.organization?.id || "");
  const activeMembership = memberships.find((item) => item.organization.id === organizationId) || memberships[0];
  const organization = activeMembership?.organization || null;
  const role = activeMembership?.role || '';
  const canSeeAllBranches = Boolean(activeMembership?.accessAllBranches);
  const canManageOrganization = ['organization_owner', 'head_office_admin'].includes(role);
  const canManagePeople = ['organization_owner', 'head_office_admin', 'branch_admin'].includes(role);
  const canUploadChildPhotos = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'].includes(role);
  const canEditChildHealth = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'].includes(role);
  const canManageNotices = canManagePeople;
  const canViewAttendanceReports = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'teacher'].includes(role);
  const canViewFeeReports = ['organization_owner', 'head_office_admin', 'branch_admin', 'accountant'].includes(role);
  const visibleTabs = TABS.filter((item) => {
    if (item.id === 'subscription') return canManageOrganization;
    if (item.id === 'setup') return canManageOrganization;
    if (item.id === 'overview') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'accountant', 'teacher', 'hr_manager', 'transport_staff'].includes(role);
    if (item.id === 'calendar') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'accountant', 'teacher', 'hr_manager', 'transport_staff'].includes(role);
    if (item.id === 'notices') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'accountant', 'teacher', 'hr_manager', 'transport_staff'].includes(role);
    if (item.id === 'resources') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'teacher', 'transport_staff'].includes(role);
    if (item.id === 'reports') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'accountant', 'teacher'].includes(role);
    if (item.id === 'workreports') return ['organization_owner', 'head_office_admin', 'branch_admin', 'teacher'].includes(role);
    if (item.id === 'children') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'].includes(role);
    if (item.id === 'handover') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'teacher', 'transport_staff'].includes(role);
    if (item.id === 'attendance') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'teacher'].includes(role);
    if (item.id === 'fees') return ['organization_owner', 'head_office_admin', 'branch_admin', 'accountant'].includes(role);
    if (item.id === 'classes') return ['organization_owner', 'head_office_admin', 'branch_admin'].includes(role);
    if (item.id === 'branches') return ['organization_owner', 'head_office_admin', 'branch_admin'].includes(role);
    if (item.id === 'team') return canManagePeople;
    return false;
  });
  const [branchId, setBranchId] = useState(() => activeMembership?.accessAllBranches ? "" : activeMembership?.branchIds?.[0]?.id || "");
  const [branches, setBranches] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [setupChecklist, setSetupChecklist] = useState(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [classes, setClasses] = useState([]);
  const [children, setChildren] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [members, setMembers] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarFrom, setCalendarFrom] = useState(() => localDateDaysAgo(7));
  const [calendarTo, setCalendarTo] = useState(() => localDateDaysAgo(-90));
  const [editingCalendarId, setEditingCalendarId] = useState("");
  const [calendarDraft, setCalendarDraft] = useState(() => ({
    title: "", description: "", type: "school_event", audience: "all",
    startsAt: localDateTimeInputNow(), endsAt: localDateTimeInputAfter(60),
    allDay: false, location: "", reason: "",
  }));
  const [reportFrom, setReportFrom] = useState(() => localDateDaysAgo(29));
  const [reportTo, setReportTo] = useState(todayLocal);
  const [reportDownloading, setReportDownloading] = useState("");
  const [editingNoticeId, setEditingNoticeId] = useState("");
  const [noticeDraft, setNoticeDraft] = useState(() => ({
    title: "",
    message: "",
    audience: "all",
    priority: "normal",
    startsAt: localDateTimeInputNow(),
    expiresAt: "",
    reason: "",
  }));
  const [editingMemberId, setEditingMemberId] = useState("");
  const [memberEditDraft, setMemberEditDraft] = useState(null);
  const [ownerTransferDraft, setOwnerTransferDraft] = useState({ targetMembershipId: "", confirmOrganizationSlug: "", confirmPassword: "", reason: "" });
  const [memberEditClassOptions, setMemberEditClassOptions] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteDraft, setInviteDraft] = useState({ fullName: '', email: '', role: 'teacher', branchIds: [], guardianIds: [], classNames: [] });
  const [invitationUrl, setInvitationUrl] = useState('');
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [showChildForm, setShowChildForm] = useState(false);
  const [editingChildId, setEditingChildId] = useState("");
  const [healthTarget, setHealthTarget] = useState(null);
  const [healthDraft, setHealthDraft] = useState(() => createBlankHealthDraft());
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthSaving, setHealthSaving] = useState(false);
  const [healthError, setHealthError] = useState("");
  const [healthSuccess, setHealthSuccess] = useState("");
  const [childDraft, setChildDraft] = useState(() => createBlankChildDraft());
  const [childPhotoFile, setChildPhotoFile] = useState(null);
  const [childPhotoParentVisible, setChildPhotoParentVisible] = useState(false);
  const [childPhotoUrls, setChildPhotoUrls] = useState({});
  const [branchDraft, setBranchDraft] = useState({ name: "", code: "", phone: "", email: "", city: "", state: "", postalCode: "" });
  const [classDraft, setClassDraft] = useState({ name: "", code: "", minAgeMonths: "", maxAgeMonths: "", defaultFee: "0", feeFrequency: "annual", capacity: "30", description: "", status: "active" });
  const [editingClassId, setEditingClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayLocal);
  const [attendanceClass, setAttendanceClass] = useState("");
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [handoverChildren, setHandoverChildren] = useState([]);
  const [handoverEvents, setHandoverEvents] = useState([]);
  const [handoverFrom, setHandoverFrom] = useState(() => localDateDaysAgo(6));
  const [handoverTo, setHandoverTo] = useState(todayLocal);
  const [handoverQuery, setHandoverQuery] = useState("");
  const [handoverTarget, setHandoverTarget] = useState(null);
  const [handoverDraft, setHandoverDraft] = useState({ method: "family", guardianId: "", personName: "", idChecked: false, staffNote: "" });
  const [workReports, setWorkReports] = useState([]);
  const [workReportFrom, setWorkReportFrom] = useState(() => localDateDaysAgo(29));
  const [workReportTo, setWorkReportTo] = useState(todayLocal);
  const [workReportClassFilter, setWorkReportClassFilter] = useState("");
  const [workReportStatusFilter, setWorkReportStatusFilter] = useState("all");
  const [editingWorkReportId, setEditingWorkReportId] = useState("");
  const [workReportDraft, setWorkReportDraft] = useState({ reportDate: todayLocal(), className: "", subject: "", startTime: "09:00", endTime: "12:00", workSummary: "", studentsPresent: "0" });
  const [feeDraft, setFeeDraft] = useState({
    childId: "", academicYear: academicYearNow(), description: "Tuition fee", amount: "", discount: "0", dueDate: "", notes: "",
  });
  const [transactionDrafts, setTransactionDrafts] = useState({});
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentDraft, setPaymentDraft] = useState({ amount: "", method: "cash", reference: "", type: "payment", relatedTransactionId: "", reason: "" });

  useEffect(() => {
    if (!memberships.length) return;
    if (!memberships.some((item) => item.organization.id === organizationId)) {
      const next = memberships[0];
      setOrganizationId(next.organization.id);
      setBranchId(next.accessAllBranches ? "" : next.branchIds?.[0]?.id || "");
    }
  }, [memberships, organizationId]);

  const activeBranch = branches.find((item) => item._id === branchId || item.id === branchId) || null;
  const memberEditBranchKey = (memberEditDraft?.branchIds || []).join("|");
  const currency = organization?.currency || "INR";
  const availableGuardianContacts = useMemo(() => {
    const unique = new Map();
    for (const child of children) {
      for (const guardian of child.guardians || []) {
        if (!guardian.id) continue;
        if (!unique.has(guardian.id)) unique.set(guardian.id, {
          id: guardian.id,
          name: guardian.name || "Parent / guardian",
          email: String(guardian.email || "").toLowerCase(),
          phone: guardian.phone || "",
          relationship: guardian.relationship || "guardian",
          childName: child.fullName || "Child",
          primaryContact: Boolean(guardian.primaryContact),
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [children]);

  const loadBranches = useCallback(async () => {
    if (!organizationId) return;
    const data = await saasRequest("/api/saas/branches", { organizationId });
    const nextBranches = (Array.isArray(data) ? data : []).map((item) => ({
      ...item,
      id: String(item._id || item.id),
    }));
    setBranches(nextBranches);
    setBranchId((current) => {
      if (canSeeAllBranches && !current) return "";
      if (current && nextBranches.some((item) => item.id === current)) return current;
      if (canSeeAllBranches) return "";
      return nextBranches[0]?.id || "";
    });
  }, [organizationId, canSeeAllBranches]);

  const loadSummary = useCallback(async () => {
    if (!organizationId) return;
    const data = await saasRequest("/api/saas/operations/summary", { organizationId, branchId });
    setSummary(data);
  }, [organizationId, branchId]);

  const loadClasses = useCallback(async () => {
    if (!organizationId || !branchId) {
      setClasses([]);
      return [];
    }
    const data = await saasRequest("/api/saas/operations/classes", { organizationId, branchId });
    const result = Array.isArray(data) ? data : [];
    setClasses(result);
    return result;
  }, [organizationId, branchId]);

  const loadChildren = useCallback(async (search = "") => {
    if (!organizationId || !branchId) {
      setChildren([]);
      return [];
    }
    const data = await saasRequest("/api/saas/operations/children", {
      organizationId, branchId, params: { q: search || undefined },
    });
    const result = data.children || [];
    setChildren(result);
    return result;
  }, [organizationId, branchId]);

  const loadChildPhotos = useCallback(async () => {
    if (!organizationId || !branchId || !canUploadChildPhotos) {
      setChildPhotoUrls({});
      return {};
    }
    const data = await saasRequest("/api/saas/media", {
      organizationId,
      branchId,
      params: { category: "child_photo" },
    });
    const next = {};
    for (const asset of data.assets || []) {
      if (asset.childId && asset.url && !next[asset.childId]) next[asset.childId] = asset.url;
    }
    setChildPhotoUrls(next);
    return next;
  }, [organizationId, branchId, canUploadChildPhotos]);

  const loadInvoices = useCallback(async () => {
    if (!organizationId || !branchId) {
      setInvoices([]);
      return [];
    }
    const data = await saasRequest("/api/saas/operations/fees/invoices", { organizationId, branchId });
    const result = data.invoices || [];
    setInvoices(result);
    return result;
  }, [organizationId, branchId]);

  const loadMembersAndAudit = useCallback(async () => {
    if (!organizationId) return;
    const [memberResult, auditResult, invitationResult] = await Promise.allSettled([
      saasRequest("/api/saas/members", { organizationId }),
      saasRequest("/api/saas/audit", { organizationId, params: { limit: 50 } }),
      saasRequest("/api/saas/invitations", { organizationId }),
    ]);
    setMembers(memberResult.status === "fulfilled" ? memberResult.value : []);
    setAuditEvents(auditResult.status === "fulfilled" ? auditResult.value : []);
    setInvitations(invitationResult.status === "fulfilled" ? invitationResult.value : []);
    if (memberResult.status === "rejected" && auditResult.status === "rejected" && invitationResult.status === "rejected") {
      throw invitationResult.reason;
    }
  }, [organizationId]);

  const loadWorkReports = useCallback(async () => {
    if (!organizationId || !branchId) {
      setWorkReports([]);
      return [];
    }
    const params = { from: workReportFrom, to: workReportTo };
    if (workReportClassFilter) params.className = workReportClassFilter;
    if (workReportStatusFilter !== "all") params.status = workReportStatusFilter;
    const data = await saasRequest("/api/saas/work-reports", {
      organizationId,
      branchId,
      params,
    });
    const result = Array.isArray(data?.reports) ? data.reports : [];
    setWorkReports(result);
    return result;
  }, [organizationId, branchId, workReportFrom, workReportTo, workReportClassFilter, workReportStatusFilter]);

  const loadHandover = useCallback(async () => {
    if (!organizationId) return;
    const historyPromise = saasRequest("/api/saas/handover", {
      organizationId,
      branchId: branchId || undefined,
      params: { from: handoverFrom, to: handoverTo },
    });
    const rosterPromise = branchId
      ? saasRequest("/api/saas/handover/children", { organizationId, branchId, params: { q: handoverQuery || undefined } })
      : Promise.resolve({ children: [] });
    const [history, roster] = await Promise.all([historyPromise, rosterPromise]);
    setHandoverEvents(Array.isArray(history?.events) ? history.events : []);
    setHandoverChildren(Array.isArray(roster?.children) ? roster.children : []);
  }, [organizationId, branchId, handoverFrom, handoverTo, handoverQuery]);

  const loadCalendar = useCallback(async () => {
    if (!organizationId) return [];
    const data = await saasRequest("/api/saas/calendar", {
      organizationId,
      branchId: branchId || undefined,
      params: {
        from: calendarFrom,
        to: calendarTo,
        includeCancelled: canManageNotices ? "true" : undefined,
      },
    });
    const result = Array.isArray(data?.events) ? data.events : [];
    setCalendarEvents(result);
    return result;
  }, [organizationId, branchId, calendarFrom, calendarTo, canManageNotices]);

  const loadNotices = useCallback(async () => {
    if (!organizationId) return [];
    const endpoint = canManageNotices ? "/api/saas/notices/manage" : "/api/saas/notices";
    const data = await saasRequest(endpoint, { organizationId, branchId: branchId || undefined });
    const result = Array.isArray(data) ? data : [];
    setNotices(result);
    return result;
  }, [organizationId, branchId, canManageNotices]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!organizationId) return;
      try {
        await loadBranches();
      } catch (error) {
        if (active) setErrorMessage(displayError(error));
      }
    };
    run();
    return () => { active = false; };
  }, [organizationId, loadBranches]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!organizationId) return;
      try {
        const data = await saasRequest("/api/saas/operations/summary", { organizationId, branchId });
        if (active) setSummary(data);
      } catch (error) {
        if (active) setErrorMessage(displayError(error));
      }
    };
    run();
    return () => { active = false; };
  }, [organizationId, branchId, refreshVersion]);

  useEffect(() => {
    let active = true;
    const loadTab = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        if (!organizationId) return;
        if (activeTab === "branches") {
          await loadBranches();
        } else if (activeTab === "classes") {
          if (!branchId) return;
          await loadClasses();
        } else if (activeTab === "children") {
          if (!branchId) return;
          await Promise.all([loadClasses(), loadChildren(appliedQuery), loadChildPhotos()]);
        } else if (activeTab === "attendance") {
          if (!branchId) return;
          const classOptions = await loadClasses();
          const selectedClass = attendanceClass || classOptions[0]?.name || "";
          if (!attendanceClass && selectedClass) setAttendanceClass(selectedClass);
          if (!selectedClass) {
            setAttendanceRows([]);
            return;
          }
          const [rosterData, savedAttendance] = await Promise.all([
            saasRequest("/api/saas/operations/children", {
              organizationId, branchId, params: { className: selectedClass },
            }),
            saasRequest("/api/saas/operations/attendance", {
              organizationId, branchId, params: { date: attendanceDate, className: selectedClass },
            }),
          ]);
          const roster = rosterData.children || [];
          const savedByChild = new Map();
          for (const record of savedAttendance) {
            for (const child of record.children || []) savedByChild.set(child.id, child);
          }
          if (active) {
            setChildren(roster);
            setAttendanceRows(roster.map((child) => {
              const saved = savedByChild.get(child.id);
              return {
                childId: child.id,
                name: child.fullName,
                admissionNumber: child.admissionNumber,
                classroomHealth: child.classroomHealth || null,
                status: saved?.status || "",
                reason: saved?.reason || "",
              };
            }));
          }
        } else if (activeTab === "fees") {
          if (!branchId) return;
          await Promise.all([loadClasses(), loadChildren(""), loadInvoices()]);
        } else if (activeTab === "workreports") {
          if (!branchId) return;
          await Promise.all([loadClasses(), loadWorkReports()]);
        } else if (activeTab === "handover") {
          await loadHandover();
        } else if (activeTab === "calendar") {
          await loadCalendar();
        } else if (activeTab === "notices") {
          await loadNotices();
        } else if (activeTab === "team") {
          await Promise.all([loadBranches(), loadMembersAndAudit(), branchId ? loadChildren("") : Promise.resolve([]), branchId ? loadClasses() : Promise.resolve([])]);
        } else if (activeTab === "setup") {
          const data = await saasRequest("/api/saas/operations/onboarding", { organizationId });
          if (active) setSetupChecklist(data);
        } else if (activeTab === "subscription") {
          if (!canManageOrganization) return;
          const data = await saasRequest("/api/saas/subscription", { organizationId });
          if (active) setSubscriptionInfo(data);
        } else if (activeTab === "overview") {
          const tasks = [
            saasRequest("/api/saas/operations/summary", { organizationId, branchId }),
            canManageOrganization
              ? saasRequest("/api/saas/operations/onboarding", { organizationId })
              : Promise.resolve(null),
            canManageOrganization
              ? saasRequest("/api/saas/subscription", { organizationId })
              : Promise.resolve(null),
          ];
          const [data, checklist, planSummary] = await Promise.all(tasks);
          if (active) {
            setSummary(data);
            if (checklist) setSetupChecklist(checklist);
            if (planSummary) setSubscriptionInfo(planSummary);
          }
        }
      } catch (error) {
        if (active) setErrorMessage(displayError(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    loadTab();
    return () => { active = false; };
  }, [
    organizationId, branchId, activeTab, appliedQuery, attendanceDate, attendanceClass,
    refreshVersion, canManageOrganization, loadBranches, loadClasses, loadChildren, loadChildPhotos, loadInvoices, loadMembersAndAudit, loadNotices, loadCalendar, loadHandover, loadWorkReports,
  ]);

  useEffect(() => {
    if (!paymentTarget) return;
    setPaymentDraft({ amount: "", method: "cash", reference: "", type: "payment", relatedTransactionId: "", reason: "" });
  }, [paymentTarget]);

  useEffect(() => {
    if (!editingMemberId || memberEditDraft?.role !== "teacher" || memberEditDraft?.accessAllBranches) {
      setMemberEditClassOptions([]);
      return undefined;
    }
    const branchIds = memberEditBranchKey ? memberEditBranchKey.split("|").filter(Boolean) : [];
    if (!branchIds.length) {
      setMemberEditClassOptions([]);
      return undefined;
    }

    let active = true;
    Promise.all(branchIds.map((selectedBranchId) =>
      saasRequest("/api/saas/operations/classes", { organizationId, branchId: selectedBranchId })
    )).then((classLists) => {
      if (!active) return;
      const first = Array.isArray(classLists[0]) ? classLists[0] : [];
      const available = first
        .filter((classItem) => classLists.every((list) => Array.isArray(list) && list.some((item) => item.name === classItem.name)))
        .map((classItem) => classItem.name);
      setMemberEditClassOptions(available);
      setMemberEditDraft((draft) => draft
        ? { ...draft, classNames: (draft.classNames || []).filter((name) => available.includes(name)) }
        : draft);
    }).catch((error) => {
      if (active) setErrorMessage(displayError(error));
    });

    return () => { active = false; };
  }, [editingMemberId, memberEditDraft?.role, memberEditDraft?.accessAllBranches, memberEditBranchKey, organizationId]);

  const changeOrganization = (nextId) => {
    setOrganizationId(nextId);
    const membership = memberships.find((item) => item.organization.id === nextId);
    setBranchId(membership?.accessAllBranches ? "" : membership?.branchIds?.[0]?.id || "");
    setBranches([]);
    setSummary(null);
    setSetupChecklist(null);
    setSubscriptionInfo(null);
    setChildren([]);
    setInvoices([]);
    setWorkReports([]);
    setEditingWorkReportId("");
    setWorkReportClassFilter("");
    setHandoverChildren([]);
    setHandoverEvents([]);
    setHandoverTarget(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const changeBranch = (nextId) => {
    setBranchId(nextId);
    setSummary(null);
    setChildren([]);
    setInvoices([]);
    setAttendanceRows([]);
    setWorkReports([]);
    setEditingWorkReportId("");
    setWorkReportClassFilter("");
    setHandoverChildren([]);
    setHandoverEvents([]);
    setHandoverTarget(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setErrorMessage("");
    setRefreshVersion((version) => version + 1);
  };

  const updateChildDraft = (event) => {
    const { name, value } = event.target;
    setChildDraft((current) => ({ ...current, [name]: value }));
    if (name === "photoConsent" && value !== "granted") setChildPhotoParentVisible(false);
  };

  const beginChildEdit = (child) => {
    const primary = child.guardians?.find((guardian) => guardian.primaryContact) || child.guardians?.[0] || null;
    setEditingChildId(child.id);
    setChildPhotoFile(null);
    setChildPhotoParentVisible(false);
    setChildDraft({
      firstName: child.firstName || "",
      middleName: child.middleName || "",
      lastName: child.lastName || "",
      dateOfBirth: child.dateOfBirth || "",
      gender: child.gender || "",
      className: child.className || "",
      academicYear: child.academicYear || academicYearNow(),
      address: child.address || "",
      guardianName: primary?.name || "",
      guardianPhone: primary?.phone || "",
      guardianEmail: primary?.email || "",
      guardianRelationship: primary?.relationship || "guardian",
      guardianPickup: Boolean(primary?.authorizedPickup),
      guardianBilling: Boolean(primary?.billingContact),
      guardianEmergency: Boolean(primary?.emergencyContact),
      guardianUpdates: primary?.receivesSchoolUpdates !== false,
      communicationConsent: primary?.consent?.schoolCommunication || "unknown",
      photoConsent: primary?.consent?.photoUse || "unknown",
    });
    setShowChildForm(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const closeChildForm = () => {
    setShowChildForm(false);
    setEditingChildId("");
    setChildDraft(createBlankChildDraft(classes[0]?.name || ""));
    setChildPhotoFile(null);
    setChildPhotoParentVisible(false);
    setErrorMessage("");
  };

  const openHealthProfile = async (child) => {
    setHealthTarget(child);
    setHealthDraft(createBlankHealthDraft());
    setHealthLoading(true);
    setHealthError("");
    setHealthSuccess("");
    try {
      const result = await saasRequest(
        "/api/saas/operations/children/" + encodeURIComponent(child.id) + "/health",
        { organizationId, branchId },
      );
      const health = result.health || createBlankHealthDraft();
      setHealthDraft({
        ...createBlankHealthDraft(),
        ...health,
        allergies: Array.isArray(health.allergies) && health.allergies.length
          ? health.allergies.map((item) => ({ name: "", reaction: "", severity: "unknown", emergencyAction: "", ...item }))
          : createBlankHealthDraft().allergies,
        medications: Array.isArray(health.medications) && health.medications.length
          ? health.medications.map((item) => ({ name: "", dosage: "", instructions: "", startDate: "", endDate: "", administerAtSchool: false, parentAuthorizationRecorded: false, authorizationNotes: "", ...item }))
          : createBlankHealthDraft().medications,
        dietaryRestrictions: Array.isArray(health.dietaryRestrictions) && health.dietaryRestrictions.length
          ? health.dietaryRestrictions.map((item) => ({ name: "", details: "", ...item }))
          : createBlankHealthDraft().dietaryRestrictions,
      });
    } catch (error) {
      setHealthError(displayError(error));
    } finally {
      setHealthLoading(false);
    }
  };

  const closeHealthProfile = () => {
    setHealthTarget(null);
    setHealthDraft(createBlankHealthDraft());
    setHealthError("");
    setHealthSuccess("");
  };

  const updateHealthArray = (listName, index, field, value) => {
    setHealthDraft((current) => ({
      ...current,
      [listName]: current[listName].map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addHealthArrayItem = (listName) => {
    const blanks = {
      allergies: { name: "", reaction: "", severity: "unknown", emergencyAction: "" },
      medications: { name: "", dosage: "", instructions: "", startDate: "", endDate: "", administerAtSchool: false, parentAuthorizationRecorded: false, authorizationNotes: "" },
      dietaryRestrictions: { name: "", details: "" },
    };
    setHealthDraft((current) => current[listName].length >= 20
      ? current
      : { ...current, [listName]: [...current[listName], blanks[listName]] });
  };

  const removeHealthArrayItem = (listName, index) => {
    setHealthDraft((current) => ({ ...current, [listName]: current[listName].filter((_, itemIndex) => itemIndex !== index) }));
  };

  const saveHealthProfile = async (event) => {
    event.preventDefault();
    if (!healthTarget || !organizationId || !branchId) return;
    const unsafeMedication = healthDraft.medications.find((item) =>
      item.administerAtSchool && (!item.parentAuthorizationRecorded || !String(item.dosage || "").trim() || !String(item.instructions || "").trim())
    );
    if (unsafeMedication) {
      setHealthError("Before a medicine can be given at school, record parent or guardian authorization, dosage and administration instructions.");
      return;
    }
    if (!window.confirm("Save the health and emergency profile for " + (healthTarget.fullName || "this child") + "? Only authorized staff will see the full profile.")) return;

    setHealthSaving(true);
    setHealthError("");
    setHealthSuccess("");
    const payload = {
      allergies: healthDraft.allergies,
      medications: healthDraft.medications,
      dietaryRestrictions: healthDraft.dietaryRestrictions,
      specialCareInstructions: healthDraft.specialCareInstructions,
      emergencyInstructions: healthDraft.emergencyInstructions,
      physicianName: healthDraft.physicianName,
      physicianPhone: healthDraft.physicianPhone,
      medicalNotes: healthDraft.medicalNotes,
    };

    try {
      const result = await saasRequest(
        "/api/saas/operations/children/" + encodeURIComponent(healthTarget.id) + "/health",
        { method: "PUT", organizationId, branchId, data: payload },
      );
      setHealthDraft({
        ...createBlankHealthDraft(),
        ...result.health,
        allergies: Array.isArray(result.health?.allergies) && result.health.allergies.length ? result.health.allergies : createBlankHealthDraft().allergies,
        medications: Array.isArray(result.health?.medications) && result.health.medications.length ? result.health.medications : createBlankHealthDraft().medications,
        dietaryRestrictions: Array.isArray(result.health?.dietaryRestrictions) && result.health.dietaryRestrictions.length ? result.health.dietaryRestrictions : createBlankHealthDraft().dietaryRestrictions,
      });
      setHealthSuccess(result.message || "Health and emergency information saved.");
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      const fieldErrors = error?.response?.data?.errors;
      const firstFieldError = fieldErrors && Object.values(fieldErrors).find(Boolean);
      setHealthError(firstFieldError ? String(firstFieldError) : displayError(error));
    } finally {
      setHealthSaving(false);
    }
  };

  const saveChild = async (event) => {
    event.preventDefault();
    if (!organizationId || !branchId) return;
    if (!classes.some((classroom) => classroom.name === childDraft.className && classroom.status !== "inactive")) {
      setErrorMessage("Choose an active class configured for this branch.");
      return;
    }
    if (childPhotoParentVisible && childDraft.photoConsent !== "granted") {
      setErrorMessage("Record photo-use consent before making a child photo visible to the parent portal.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const wasEditing = Boolean(editingChildId);
    const payload = {
      firstName: childDraft.firstName.trim(),
      middleName: childDraft.middleName.trim(),
      lastName: childDraft.lastName.trim(),
      dateOfBirth: childDraft.dateOfBirth,
      gender: childDraft.gender,
      className: childDraft.className,
      academicYear: childDraft.academicYear,
      address: childDraft.address,
      guardians: [{
        name: childDraft.guardianName,
        phone: childDraft.guardianPhone,
        email: childDraft.guardianEmail,
        relationship: childDraft.guardianRelationship,
        isPrimaryContact: true,
        isBillingContact: childDraft.guardianBilling,
        isEmergencyContact: childDraft.guardianEmergency,
        authorizedPickup: childDraft.guardianPickup,
        receivesSchoolUpdates: childDraft.guardianUpdates,
        preferredLanguage: "en",
        consent: {
          schoolCommunication: childDraft.communicationConsent,
          photoUse: childDraft.photoConsent,
        },
      }],
    };

    try {
      const result = wasEditing
        ? await saasRequest("/api/saas/operations/children/" + editingChildId, {
            method: "PUT",
            organizationId,
            branchId,
            data: {
              firstName: payload.firstName,
              middleName: payload.middleName,
              lastName: payload.lastName,
              dob: payload.dateOfBirth,
              gender: payload.gender,
              standard: payload.className,
              batchYear: payload.academicYear,
              address: payload.address,
              primaryGuardian: {
                fullName: childDraft.guardianName,
                phone: childDraft.guardianPhone,
                email: childDraft.guardianEmail,
                relationship: childDraft.guardianRelationship,
                authorizedPickup: childDraft.guardianPickup,
                receivesSchoolUpdates: childDraft.guardianUpdates,
                isBillingContact: childDraft.guardianBilling,
                isEmergencyContact: childDraft.guardianEmergency,
                consent: {
                  schoolCommunication: childDraft.communicationConsent,
                  photoUse: childDraft.photoConsent,
                  notes: "",
                },
              },
            },
          })
        : await saasRequest("/api/saas/operations/children", {
            method: "POST", data: payload, organizationId, branchId,
          });

      const savedChildId = String(editingChildId || result.child?.id || result.child?._id || "");
      let photoUploadError = "";
      let photoUploaded = false;
      if (childPhotoFile) {
        if (!canUploadChildPhotos) {
          photoUploadError = "Your role cannot upload child photos.";
        } else if (!savedChildId) {
          photoUploadError = "The child record was saved, but its ID could not be confirmed for the photo upload.";
        } else {
          try {
            const formData = new FormData();
            formData.append("file", childPhotoFile);
            await axios.post(
              API_BASE_URL + "/api/saas/media/upload/child_photo?childId=" + encodeURIComponent(savedChildId) + "&parentVisible=" + (childPhotoParentVisible ? "true" : "false"),
              formData,
              { headers: tokenHeaders(organizationId, branchId) },
            );
            photoUploaded = true;
          } catch (error) {
            photoUploadError = displayError(error);
          }
        }
      }

      closeChildForm();
      setRefreshVersion((version) => version + 1);
      await Promise.all([loadChildren(appliedQuery), loadClasses(), loadChildPhotos()]);
      if (photoUploadError) {
        setErrorMessage("Child record saved, but the photo was not uploaded: " + photoUploadError + " You can edit this child and retry.");
        setSuccessMessage("");
      } else {
        const baseMessage = result.message || (wasEditing ? "Child and family details saved." : "Child registered.");
        setSuccessMessage(photoUploaded ? baseMessage + " Child photo uploaded privately." : baseMessage);
        setErrorMessage("");
      }
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const loadAttendanceDraftsForClass = async (className) => {
    if (!branchId || !className) return;
    setAttendanceClass(className);
    try {
      setLoading(true);
      const [rosterData, savedAttendance] = await Promise.all([
        saasRequest("/api/saas/operations/children", { organizationId, branchId, params: { className } }),
        saasRequest("/api/saas/operations/attendance", { organizationId, branchId, params: { date: attendanceDate, className } }),
      ]);
      const roster = rosterData.children || [];
      const savedByChild = new Map();
      for (const record of savedAttendance) for (const child of record.children || []) savedByChild.set(child.id, child);
      setChildren(roster);
      setAttendanceRows(roster.map((child) => {
        const saved = savedByChild.get(child.id);
        return { childId: child.id, name: child.fullName, admissionNumber: child.admissionNumber, classroomHealth: child.classroomHealth || null, status: saved?.status || "", reason: saved?.reason || "" };
      }));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setLoading(false);
    }
  };

  const markAttendance = (childId, status) => {
    setAttendanceRows((rows) => rows.map((row) => row.childId === childId
      ? { ...row, status, reason: status === "present" ? "" : row.reason }
      : row));
  };

  const saveAttendance = async () => {
    if (!branchId || !attendanceClass || !attendanceRows.length) return;
    if (attendanceRows.some((row) => !row.status || (row.status === "absent" && !row.reason.trim()))) {
      setErrorMessage("Mark every child Present or Absent, and add a reason for each absence.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/operations/attendance", {
        method: "POST",
        organizationId,
        branchId,
        data: {
          date: attendanceDate,
          className: attendanceClass,
          children: attendanceRows.map(({ childId, status, reason }) => ({ childId, status, reason })),
        },
      });
      showSuccess(result.message || "Attendance saved.");
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const printTransactionReceipt = (invoice, transaction) => {
    const receiptDate = transaction.transactionAt
      ? new Date(transaction.transactionAt)
      : new Date();
    const dateLabel = Number.isNaN(receiptDate.getTime())
      ? "—"
      : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: activeBranch?.timezone || organization?.timezone || "Asia/Kolkata",
      }).format(receiptDate);
    const branchName = activeBranch?.name || summary?.branch?.name || "All branches";
    const transactionLabel = transaction.type === "refund" ? "Refund receipt" : "Payment receipt";
    const transactionDescription = transaction.type === "refund" ? "Refund issued" : "Payment received";
    const signedAmount = (transaction.type === "refund" ? "−" : "") + formatMoney(transaction.amount, currency);
    const popup = window.open("", "_blank", "popup,width=820,height=920");
    if (!popup) {
      setErrorMessage("Your browser blocked the receipt window. Allow pop-ups for this school website and try again.");
      return;
    }

    const rows = [
      ["Receipt number", transaction.receiptNumber],
      ["Transaction date", dateLabel],
      ["Transaction type", transactionLabel],
      ["Payment method", String(transaction.method || "").replaceAll("_", " ")],
      ["Reference", transaction.reference || "—"],
      ["Invoice number", invoice.invoiceNumber],
      ["Academic year", invoice.academicYear],
      ["Child", invoice.child?.name || "—"],
      ["Admission number", invoice.child?.admissionNumber || "—"],
      ["Class", invoice.child?.className || "—"],
      ["Invoice total", formatMoney(invoice.totalAmount, currency)],
      ["Discount", formatMoney(invoice.discount, currency)],
      [transactionDescription, signedAmount],
      ["Paid to date", formatMoney(invoice.paid, currency)],
      ["Current balance", formatMoney(invoice.outstanding, currency)],
    ];
    const tableRows = rows.map(([label, value]) =>
      "<tr><th>" + escapeHtml(label) + "</th><td>" + escapeHtml(value) + "</td></tr>"
    ).join("");
    const refundReason = transaction.type === "refund" && transaction.reason
      ? "<p class='reason'><strong>Reason:</strong> " + escapeHtml(transaction.reason) + "</p>"
      : "";
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(transactionLabel)} — ${escapeHtml(transaction.receiptNumber)}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:28px;color:#1e2f46;font:14px/1.5 Arial,Helvetica,sans-serif;background:#fff}
  .receipt{max-width:700px;margin:0 auto;border:1px solid #dbe3ef;padding:30px}
  header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #243a66;padding-bottom:18px}
  .brand{font-size:22px;font-weight:800;letter-spacing:-.3px}.branch{margin-top:4px;color:#68778c;font-size:12px}
  .doc{text-align:right}.doc h1{margin:0;font-size:19px}.doc p{margin:4px 0;color:#60718a;font-size:12px}
  .status{margin:20px 0;padding:12px 14px;border:1px solid #c9e5d4;background:#f2faf5;color:#276441;font-weight:800}
  .status.refund{border-color:#f0d4d6;background:#fff6f6;color:#974148}
  table{width:100%;border-collapse:collapse;margin:0}th,td{padding:10px 8px;border-bottom:1px solid #e7ecf3;text-align:left;vertical-align:top}
  th{width:40%;color:#64748b;font-weight:600}td{color:#24364d;font-weight:700;overflow-wrap:anywhere}
  .reason{margin:15px 0;padding:10px;background:#fafbfe;border-left:3px solid #d5deed}.note{margin-top:18px;color:#6c7b90;font-size:11px}
  .signature{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:48px}.signature span{border-top:1px solid #8d9ab0;padding-top:8px;color:#65748a;font-size:11px}
  .print-actions{max-width:700px;margin:14px auto 0;display:flex;gap:8px}.print-actions button{border:0;border-radius:6px;padding:10px 14px;color:white;background:#3655ce;font-weight:700;cursor:pointer}
  .print-actions button.secondary{color:#31445f;background:#eef2f8}
  @media print{body{padding:0}.receipt{max-width:none;border:0;padding:0}.print-actions{display:none}}
</style>
</head>
<body>
  <main class="receipt">
    <header>
      <div><div class="brand">${escapeHtml(organization?.name || "Preschool")}</div><div class="branch">${escapeHtml(branchName)}</div></div>
      <div class="doc"><h1>${escapeHtml(transactionLabel)}</h1><p>Computer-generated transaction record</p></div>
    </header>
    <div class="status ${transaction.type === "refund" ? "refund" : ""}">${escapeHtml(transactionDescription)} · ${escapeHtml(signedAmount)}</div>
    <table><tbody>${tableRows}</tbody></table>
    ${refundReason}
    <p class="note">The current balance shown above may include payments or refunds recorded after this transaction. Keep this receipt for your records. This copy confirms the transaction entry saved in the preschool system.</p>
    <div class="signature"><span>Received / authorized by</span><span>School stamp / signature</span></div>
  </main>
  <div class="print-actions"><button onclick="window.print()">Print / Save as PDF</button><button class="secondary" onclick="window.close()">Close</button></div>
</body>
</html>`;
    popup.addEventListener("load", () => popup.print(), { once: true });
    popup.addEventListener("afterprint", () => popup.close(), { once: true });
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  };

  const updateFeeDraft = (event) => {
    const { name, value } = event.target;
    setFeeDraft((current) => ({ ...current, [name]: value }));
  };

  const createInvoice = async (event) => {
    event.preventDefault();
    if (!branchId) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/operations/fees/invoices", {
        method: "POST",
        organizationId,
        branchId,
        data: {
          childId: feeDraft.childId,
          academicYear: feeDraft.academicYear,
          lineItems: [{ description: feeDraft.description, quantity: 1, unitAmount: feeDraft.amount }],
          discount: feeDraft.discount || "0",
          dueDate: feeDraft.dueDate,
          notes: feeDraft.notes,
        },
      });
      setFeeDraft({ childId: "", academicYear: academicYearNow(), description: "Tuition fee", amount: "", discount: "0", dueDate: "", notes: "" });
      showSuccess(result.message || "Invoice created.");
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (invoice, type = "payment", originalTransaction = null) => {
    setPaymentTarget({ invoice, type, originalTransaction });
    setPaymentDraft({
      amount: type === "refund" && originalTransaction ? String(originalTransaction.amount) : "",
      method: originalTransaction?.method || "cash",
      reference: originalTransaction?.reference || "",
      type,
      relatedTransactionId: originalTransaction?.id || "",
      reason: "",
    });
  };

  const recordTransaction = async (event) => {
    event.preventDefault();
    if (!paymentTarget || !branchId) return;
    const { invoice, type, originalTransaction } = paymentTarget;
    if (type === "refund" && !paymentDraft.reason.trim()) {
      setErrorMessage("Enter a reason for the refund.");
      return;
    }
    const message = type === "refund"
      ? "Record a refund of " + formatMoney(paymentDraft.amount, currency) + " against receipt " + originalTransaction?.receiptNumber + "?"
      : "Record a payment of " + formatMoney(paymentDraft.amount, currency) + " for " + invoice.invoiceNumber + "?";
    if (!window.confirm(message)) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/operations/fees/invoices/" + invoice.id + "/transactions", {
        method: "POST",
        organizationId,
        branchId,
        data: {
          amount: paymentDraft.amount,
          method: paymentDraft.method,
          reference: paymentDraft.reference,
          type,
          relatedTransactionId: paymentDraft.relatedTransactionId,
          reason: paymentDraft.reason,
        },
      });
      setPaymentTarget(null);
      showSuccess((result.message || "Transaction recorded.") + (result.transaction?.receiptNumber ? " Receipt: " + result.transaction.receiptNumber : ""));
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const downloadTenantReport = async (reportType) => {
    if (!branchId) {
      setErrorMessage("Choose the branch you want to report on.");
      return;
    }
    if (!reportFrom || !reportTo || reportFrom > reportTo) {
      setErrorMessage("Choose a valid start date and end date.");
      return;
    }
    if (reportType === "attendance" && !canViewAttendanceReports) {
      setErrorMessage("Your account does not have permission to export attendance.");
      return;
    }
    if (reportType === "fees" && !canViewFeeReports) {
      setErrorMessage("Your account does not have permission to export fee transactions.");
      return;
    }

    setReportDownloading(reportType);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const endpoint = reportType === "attendance"
        ? "/api/saas/operations/reports/attendance.csv"
        : "/api/saas/operations/reports/fees.csv";
      const response = await axios.get(API_BASE_URL + endpoint, {
        headers: tokenHeaders(organizationId, branchId),
        params: { from: reportFrom, to: reportTo },
        responseType: "blob",
      });
      const fileName = (reportType === "attendance" ? "attendance-" : "fee-transactions-") +
        reportFrom + "-to-" + reportTo + ".csv";
      const blob = new Blob([response.data], { type: response.headers?.["content-type"] || "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setSuccessMessage((reportType === "attendance" ? "Attendance" : "Fee transaction") +
        " report exported for " + reportFrom + " through " + reportTo + ". The export was recorded in the audit history.");
    } catch (error) {
      let message = displayError(error);
      const responseData = error.response?.data;
      if (responseData instanceof Blob) {
        try {
          const payload = JSON.parse(await responseData.text());
          if (payload?.message) message = payload.message;
        } catch {
          // Keep the ordinary request error if the response is not JSON.
        }
      }
      setErrorMessage(message);
    } finally {
      setReportDownloading("");
    }
  };

  const updateNoticeDraft = (event) => {
    const { name, value } = event.target;
    setNoticeDraft((draft) => ({ ...draft, [name]: value }));
  };

  const resetNoticeEditor = () => {
    setEditingNoticeId("");
    setNoticeDraft({
      title: "",
      message: "",
      audience: "all",
      priority: "normal",
      startsAt: localDateTimeInputNow(),
      expiresAt: "",
      reason: "",
    });
  };

  const beginNoticeEdit = (notice) => {
    if (!canManageNotices) return;
    setEditingNoticeId(notice.id);
    setNoticeDraft({
      title: notice.title || "",
      message: notice.message || "",
      audience: notice.audience || "all",
      priority: notice.priority || "normal",
      startsAt: toLocalDateTimeInput(notice.startsAt),
      expiresAt: toLocalDateTimeInput(notice.expiresAt),
      reason: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const saveNotice = async (event) => {
    event.preventDefault();
    if (!canManageNotices) return;
    if (!editingNoticeId && !branchId) {
      setErrorMessage("Choose a branch above before publishing a notice.");
      return;
    }

    const startsAt = new Date(noticeDraft.startsAt);
    const expiresAt = noticeDraft.expiresAt ? new Date(noticeDraft.expiresAt) : null;
    if (!noticeDraft.startsAt || Number.isNaN(startsAt.getTime())) {
      setErrorMessage("Choose a valid start date and time.");
      return;
    }
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt)) {
      setErrorMessage("The end date and time must be later than the start date and time.");
      return;
    }
    if (noticeDraft.reason.trim().length > 500) {
      setErrorMessage("The audit note must be 500 characters or fewer.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        title: noticeDraft.title.trim(),
        message: noticeDraft.message.trim(),
        audience: noticeDraft.audience,
        priority: noticeDraft.priority,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        reason: noticeDraft.reason.trim(),
      };
      const result = editingNoticeId
        ? await saasRequest("/api/saas/notices/" + editingNoticeId, {
          method: "PUT", organizationId, branchId: branchId || undefined, data: payload,
        })
        : await saasRequest("/api/saas/notices", {
          method: "POST", organizationId, branchId, data: payload,
        });
      setSuccessMessage(result.message || (editingNoticeId ? "Notice updated." : "Notice published."));
      resetNoticeEditor();
      await loadNotices();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const resetWorkReportEditor = () => {
    setEditingWorkReportId("");
    setWorkReportDraft({
      reportDate: todayLocal(),
      className: classes[0]?.name || "",
      subject: "",
      startTime: "09:00",
      endTime: "12:00",
      workSummary: "",
      studentsPresent: "0",
    });
  };

  const editWorkReport = (report) => {
    setEditingWorkReportId(report.id);
    setWorkReportDraft({
      reportDate: report.reportDate,
      className: report.className,
      subject: report.subject || "",
      startTime: report.startTime || "09:00",
      endTime: report.endTime || "12:00",
      workSummary: report.workSummary || "",
      studentsPresent: String(report.studentsPresent ?? 0),
    });
    setErrorMessage("");
    setSuccessMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveWorkReport = async (event) => {
    event.preventDefault();
    if (!branchId) {
      setErrorMessage("Choose a branch before submitting a work report.");
      return;
    }
    if (!workReportDraft.className) {
      setErrorMessage("Choose one of your assigned classes.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        reportDate: workReportDraft.reportDate,
        className: workReportDraft.className,
        subject: workReportDraft.subject.trim(),
        startTime: workReportDraft.startTime,
        endTime: workReportDraft.endTime,
        workSummary: workReportDraft.workSummary.trim(),
        studentsPresent: Number(workReportDraft.studentsPresent),
      };
      const result = editingWorkReportId
        ? await saasRequest("/api/saas/work-reports/" + editingWorkReportId, {
          method: "PUT", organizationId, branchId, data: payload,
        })
        : await saasRequest("/api/saas/work-reports", {
          method: "POST", organizationId, branchId, data: payload,
        });
      resetWorkReportEditor();
      setSuccessMessage(result.message || "Daily work report submitted.");
      setErrorMessage("");
      await loadWorkReports();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const reviewWorkReport = async (report, status) => {
    if (!canManagePeople) return;
    const needsFollowUp = status === "needs_follow_up";
    const reviewNote = needsFollowUp
      ? window.prompt("What should the teacher clarify or complete?")
      : window.prompt("Review note (optional):") || "";
    if (needsFollowUp && (!reviewNote || reviewNote.trim().length < 3)) return;
    if (!window.confirm(needsFollowUp
      ? "Request follow-up for this report?"
      : "Mark this work report as reviewed?")) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/work-reports/" + report.id + "/review", {
        method: "PATCH",
        organizationId,
        branchId,
        data: { status, reviewNote: String(reviewNote || "").trim() },
      });
      setSuccessMessage(result.message || "Work report review saved.");
      setErrorMessage("");
      await loadWorkReports();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const openHandoverForm = (child, action) => {
    const eligibleGuardians = action === "check_out"
      ? (child.guardians || []).filter((guardian) => guardian.authorizedPickup)
      : (child.guardians || []);
    const preferred = eligibleGuardians.find((guardian) => guardian.isPrimaryContact) || eligibleGuardians[0];
    setHandoverTarget({ child, action });
    setHandoverDraft({
      method: action === "check_in" ? "family" : "family",
      guardianId: preferred?.guardianId || "",
      personName: "",
      idChecked: false,
      staffNote: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const submitHandover = async (event) => {
    event.preventDefault();
    if (!handoverTarget || !branchId) return;
    const { child, action } = handoverTarget;
    if (action === "check_in" && handoverDraft.method === "family" && !handoverDraft.guardianId) {
      setErrorMessage("Choose the linked family member who brought the child.");
      return;
    }
    if (action === "check_in" && handoverDraft.method !== "family" && handoverDraft.personName.trim().length < 2) {
      setErrorMessage("Enter the name of the person bringing the child.");
      return;
    }
    if (handoverDraft.staffNote.trim().length > 500) {
      setErrorMessage("The staff note must be 500 characters or fewer.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        childId: child.id,
        guardianId: handoverDraft.guardianId || "",
        method: action === "check_in" ? handoverDraft.method : "family",
        personName: handoverDraft.personName.trim(),
        idChecked: handoverDraft.idChecked,
        staffNote: handoverDraft.staffNote.trim(),
      };
      const result = await saasRequest("/api/saas/handover/" + (action === "check_in" ? "check-in" : "check-out"), {
        method: "POST", organizationId, branchId, data: payload,
      });
      setHandoverTarget(null);
      setSuccessMessage(result.message || (action === "check_in" ? "Arrival recorded." : "Pickup recorded."));
      await loadHandover();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
      // A 409 response may mean a refusal was safely logged by the server.
      // Refresh the event history without clearing the form, so staff can review it.
      try { await loadHandover(); } catch { /* Keep the original actionable message. */ }
    } finally {
      setSaving(false);
    }
  };

  const resetCalendarEditor = () => {
    setEditingCalendarId("");
    setCalendarDraft({
      title: "",
      description: "",
      type: "school_event",
      audience: "all",
      startsAt: localDateTimeInputNow(),
      endsAt: localDateTimeInputAfter(60),
      allDay: false,
      location: "",
      reason: "",
    });
  };

  const editCalendarEvent = (event) => {
    setEditingCalendarId(event.id);
    setCalendarDraft({
      title: event.title || "",
      description: event.description || "",
      type: event.type || "school_event",
      audience: event.audience || "all",
      startsAt: toLocalDateTimeInput(event.startsAt),
      endsAt: toLocalDateTimeInput(event.endsAt),
      allDay: Boolean(event.allDay),
      location: event.location || "",
      reason: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveCalendarEvent = async (event) => {
    event.preventDefault();
    if (!canManageNotices) return;
    if (!editingCalendarId && !branchId) {
      setErrorMessage("Choose a branch above before adding a calendar event.");
      return;
    }
    const startsAt = new Date(calendarDraft.startsAt);
    const endsAt = new Date(calendarDraft.endsAt);
    if (!calendarDraft.title.trim() || calendarDraft.title.trim().length < 3) {
      setErrorMessage("Enter an event title with at least 3 characters.");
      return;
    }
    if (!calendarDraft.startsAt || Number.isNaN(startsAt.getTime()) ||
        !calendarDraft.endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setErrorMessage("Choose a valid start and end. The end must be later than the start.");
      return;
    }
    if (calendarDraft.reason.trim().length > 500) {
      setErrorMessage("The audit note must be 500 characters or fewer.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        title: calendarDraft.title.trim(),
        description: calendarDraft.description.trim(),
        type: calendarDraft.type,
        audience: calendarDraft.audience,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        allDay: Boolean(calendarDraft.allDay),
        location: calendarDraft.location.trim(),
        reason: calendarDraft.reason.trim(),
      };
      const result = editingCalendarId
        ? await saasRequest("/api/saas/calendar/" + editingCalendarId, {
          method: "PUT", organizationId, branchId: branchId || undefined, data: payload,
        })
        : await saasRequest("/api/saas/calendar", {
          method: "POST", organizationId, branchId, data: payload,
        });
      setSuccessMessage(result.message || (editingCalendarId ? "Calendar event updated." : "Calendar event created."));
      resetCalendarEditor();
      await loadCalendar();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const changeCalendarEventStatus = async (event, status) => {
    if (!canManageNotices) return;
    const cancel = status === "cancelled";
    const reason = cancel ? window.prompt("Why is this event being cancelled?") : "Event restored by an authorized school administrator.";
    if (cancel && (!reason || reason.trim().length < 3)) return;
    if (!window.confirm(cancel
      ? "Cancel this event: " + event.title + "?"
      : "Restore this event: " + event.title + "?")) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/calendar/" + event.id + "/status", {
        method: "PATCH",
        organizationId,
        branchId: branchId || undefined,
        data: { status, reason: String(reason || "").trim() },
      });
      setSuccessMessage(result.message || "Calendar event status updated.");
      if (editingCalendarId === event.id) resetCalendarEditor();
      await loadCalendar();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const changeNoticeStatus = async (notice, status) => {
    if (!canManageNotices) return;
    const action = status === "archived" ? "archive" : "restore";
    if (!window.confirm("Are you sure you want to " + action + " this notice: " + notice.title + "?")) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/notices/" + notice.id + "/status", {
        method: "PATCH",
        organizationId,
        branchId: branchId || undefined,
        data: { status, reason: "Notice " + action + "d through the school workspace." },
      });
      setSuccessMessage(result.message || "Notice status updated.");
      if (editingNoticeId === notice.id) resetNoticeEditor();
      await loadNotices();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const createBranch = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/branches", {
        method: "POST",
        organizationId,
        data: {
          name: branchDraft.name,
          code: branchDraft.code,
          phone: branchDraft.phone,
          email: branchDraft.email,
          timezone: "Asia/Kolkata",
          address: { city: branchDraft.city, state: branchDraft.state, postalCode: branchDraft.postalCode, country: "India" },
        },
      });
      setBranchDraft({ name: "", code: "", phone: "", email: "", city: "", state: "", postalCode: "" });
      setSuccessMessage(result.message || "Branch created.");
      setErrorMessage("");
      await loadBranches();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };


  const updateClassDraft = (event) => {
    const { name, value } = event.target;
    setClassDraft((draft) => ({ ...draft, [name]: value }));
  };

  const beginClassEdit = (classroom) => {
    setEditingClassId(classroom.id);
    setClassDraft({
      name: classroom.name,
      code: classroom.code,
      minAgeMonths: classroom.minAgeMonths ?? "",
      maxAgeMonths: classroom.maxAgeMonths ?? "",
      defaultFee: String(classroom.defaultFee ?? 0),
      feeFrequency: classroom.feeFrequency || "annual",
      capacity: String(classroom.capacity || 30),
      description: classroom.description || "",
      status: classroom.status || "active",
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const cancelClassEdit = () => {
    setEditingClassId("");
    setClassDraft({ name: "", code: "", minAgeMonths: "", maxAgeMonths: "", defaultFee: "0", feeFrequency: "annual", capacity: "30", description: "", status: "active" });
  };

  const saveClass = async (event) => {
    event.preventDefault();
    if (!branchId) {
      setErrorMessage("Choose a branch before configuring classes.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        minAgeMonths: classDraft.minAgeMonths,
        maxAgeMonths: classDraft.maxAgeMonths,
        defaultFee: classDraft.defaultFee,
        feeFrequency: classDraft.feeFrequency,
        capacity: classDraft.capacity,
        description: classDraft.description,
      };
      const result = editingClassId
        ? await saasRequest("/api/saas/operations/classes/" + editingClassId, {
            method: "PUT", organizationId, branchId, data: payload,
          })
        : await saasRequest("/api/saas/operations/classes", {
            method: "POST",
            organizationId,
            branchId,
            data: { ...payload, name: classDraft.name, code: classDraft.code },
          });
      setSuccessMessage(result.message || (editingClassId ? "Class settings saved." : "Class created."));
      setErrorMessage("");
      cancelClassEdit();
      await loadClasses();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const archiveClass = async (classroom) => {
    if (!window.confirm("Archive " + classroom.name + "? It will no longer be available for new admissions or attendance. Classes with enrolled children cannot be archived.")) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/operations/classes/" + classroom.id, {
        method: "PUT", organizationId, branchId, data: { status: "inactive" },
      });
      setSuccessMessage(result.message || "Class archived.");
      await loadClasses();
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const updateInvitationDraft = (field, value) => {
    setInviteDraft((draft) => ({ ...draft, [field]: value }));
  };

  const changeInvitationRole = (nextRole) => {
    setInviteDraft((draft) => ({ ...draft, role: nextRole, classNames: [], guardianIds: [] }));
    setInvitationUrl("");
  };

  const toggleInviteBranch = (id, checked) => {
    setInviteDraft((draft) => ({
      ...draft,
      branchIds: checked ? [...new Set([...draft.branchIds, id])] : draft.branchIds.filter((value) => value !== id),
    }));
  };

  const toggleInviteClass = (name, checked) => {
    setInviteDraft((draft) => ({
      ...draft,
      classNames: checked ? [...new Set([...draft.classNames, name])] : draft.classNames.filter((value) => value !== name),
    }));
  };

  const toggleInviteGuardian = (guardian, checked) => {
    setInviteDraft((draft) => {
      const guardianIds = checked
        ? [...new Set([...draft.guardianIds, guardian.id])]
        : draft.guardianIds.filter((id) => id !== guardian.id);
      return {
        ...draft,
        guardianIds,
        fullName: checked && !draft.fullName.trim() ? guardian.name : draft.fullName,
        email: checked && !draft.email.trim() ? guardian.email : draft.email,
      };
    });
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    if (inviteDraft.role === "parent" && !inviteDraft.guardianIds.length) {
      setErrorMessage("Choose at least one existing parent/guardian contact to link to this invitation.");
      return;
    }
    if (inviteDraft.role === "teacher" && !inviteDraft.classNames.length) {
      setErrorMessage("Assign at least one class to this teacher.");
      return;
    }
    if (inviteDraft.role !== "parent" && !inviteDraft.branchIds.length) {
      setErrorMessage("Select at least one branch for this team member.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    setInvitationUrl("");
    try {
      const result = await saasRequest("/api/saas/invitations", {
        method: "POST",
        organizationId,
        branchId: branchId || undefined,
        data: {
          fullName: inviteDraft.fullName,
          email: inviteDraft.email,
          role: inviteDraft.role,
          branchIds: inviteDraft.role === "parent" ? [] : inviteDraft.branchIds,
          guardianIds: inviteDraft.role === "parent" ? inviteDraft.guardianIds : [],
          classNames: inviteDraft.role === "teacher" ? inviteDraft.classNames : [],
        },
      });
      setSuccessMessage(result.message || "Invitation created.");
      setErrorMessage("");
      setInvitationUrl(result.invitationUrl || "");
      setInviteDraft({ fullName: "", email: "", role: "teacher", branchIds: branchId ? [branchId] : [], guardianIds: [], classNames: [] });
      await loadMembersAndAudit();
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const revokeInvitation = async (invitation) => {
    if (!window.confirm("Revoke the pending invitation for " + invitation.email + "? Its link will stop working.")) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/invitations/" + invitation.id + "/revoke", {
        method: "PATCH",
        organizationId,
        branchId: branchId || undefined,
      });
      setSuccessMessage(result.message || "Invitation revoked.");
      await loadMembersAndAudit();
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  const copyInvitationUrl = async () => {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setSuccessMessage("Invitation link copied. Share it only with the invited person.");
    } catch {
      setErrorMessage("Copy was blocked by the browser. Select the invitation link and copy it manually.");
    }
  };

  const transferOwnership = async (event) => {
    event.preventDefault();
    const successor = members.find((member) => member.id === ownerTransferDraft.targetMembershipId);
    if (!successor || successor.role !== "head_office_admin" || successor.status !== "active") {
      setErrorMessage("Choose an active head-office administrator as the new owner.");
      return;
    }
    if (ownerTransferDraft.confirmOrganizationSlug !== organization?.slug) {
      setErrorMessage("Type the exact organization slug shown above to confirm the transfer.");
      return;
    }
    if (!ownerTransferDraft.confirmPassword) {
      setErrorMessage("Enter your current password to confirm this sensitive change.");
      return;
    }
    if (ownerTransferDraft.reason.trim().length < 20) {
      setErrorMessage("Explain the ownership transfer in at least 20 characters.");
      return;
    }
    const confirmed = window.confirm(
      "Transfer ownership of " + organization.name + " to " + successor.user.name + " (" + successor.user.email + ")? " +
      "Your account will become a head-office administrator, and both owners will need to sign in again."
    );
    if (!confirmed) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await saasRequest("/api/saas/ownership/transfer-owner", {
        method: "POST",
        organizationId,
        data: {
          targetMembershipId: ownerTransferDraft.targetMembershipId,
          confirmOrganizationSlug: ownerTransferDraft.confirmOrganizationSlug,
          confirmPassword: ownerTransferDraft.confirmPassword,
          reason: ownerTransferDraft.reason,
        },
      });
      window.alert(result.message || "Ownership transferred. Please sign in again.");
      logout();
      window.location.assign("/login");
    } catch (error) {
      setErrorMessage(displayError(error));
      setSaving(false);
    }
  };

  const canEditMember = (member) => {
    if (!canManagePeople || !member || member.role === "organization_owner" || member.id === activeMembership?.id) return false;
    if (role === "branch_admin") return ["teacher", "admissions", "transport_staff", "parent"].includes(member.role);
    if (role === "head_office_admin") return member.role !== "head_office_admin";
    return role === "organization_owner";
  };

  const beginMemberEdit = (member) => {
    if (!canEditMember(member)) return;
    setEditingMemberId(member.id);
    setMemberEditDraft({
      role: member.role,
      status: member.status,
      branchIds: (member.branches || []).map((item) => String(item.id || item._id)),
      classNames: [...(member.classNames || [])],
      accessAllBranches: Boolean(member.accessAllBranches),
      reason: "",
    });
    setMemberEditClassOptions([]);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const cancelMemberEdit = () => {
    setEditingMemberId("");
    setMemberEditDraft(null);
    setMemberEditClassOptions([]);
  };

  const changeMemberRole = (nextRole) => {
    setMemberEditDraft((draft) => {
      if (!draft) return draft;
      const switchingFromAllBranches = draft.accessAllBranches && nextRole !== "head_office_admin";
      const branchIds = switchingFromAllBranches
        ? branches.map((item) => String(item.id || item._id))
        : draft.branchIds;
      return {
        ...draft,
        role: nextRole,
        branchIds,
        accessAllBranches: switchingFromAllBranches ? false : draft.accessAllBranches,
        classNames: nextRole === "teacher" ? draft.classNames : [],
      };
    });
  };

  const toggleMemberBranch = (branchKey, checked) => {
    setMemberEditDraft((draft) => !draft ? draft : ({
      ...draft,
      branchIds: checked
        ? [...new Set([...draft.branchIds, branchKey])]
        : draft.branchIds.filter((value) => value !== branchKey),
    }));
  };

  const toggleMemberClass = (className, checked) => {
    setMemberEditDraft((draft) => !draft ? draft : ({
      ...draft,
      classNames: checked
        ? [...new Set([...draft.classNames, className])]
        : draft.classNames.filter((value) => value !== className),
    }));
  };

  const saveMemberAccess = async (event) => {
    event.preventDefault();
    if (!editingMemberId || !memberEditDraft) return;
    const member = members.find((item) => item.id === editingMemberId);
    if (!member) {
      setErrorMessage("This team member is no longer in the current list. Refresh and try again.");
      cancelMemberEdit();
      return;
    }
    if (!memberEditDraft.reason.trim()) {
      setErrorMessage("Enter a reason so the access change is recorded in the audit history.");
      return;
    }
    if (member.role !== "parent") {
      if (!memberEditDraft.accessAllBranches && !memberEditDraft.branchIds.length) {
        setErrorMessage("Assign at least one branch before saving staff access.");
        return;
      }
      if (memberEditDraft.role === "teacher" && !memberEditDraft.classNames.length) {
        setErrorMessage("Assign at least one active class to this teacher.");
        return;
      }
    }
    if (memberEditDraft.status === "suspended" && member.status !== "suspended" &&
        !window.confirm("Suspend access for " + member.user.name + "? Their existing sign-in sessions will be revoked immediately.")) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const currentBranchIds = (member.branches || []).map((item) => String(item.id || item._id)).sort();
      const draftBranchIds = [...memberEditDraft.branchIds].map(String).sort();
      const currentClassNames = [...(member.classNames || [])].sort();
      const draftClassNames = [...memberEditDraft.classNames].sort();
      const suspensionOnly =
        memberEditDraft.status === "suspended" &&
        member.status !== "suspended" &&
        memberEditDraft.role === member.role &&
        memberEditDraft.accessAllBranches === Boolean(member.accessAllBranches) &&
        currentBranchIds.join(",") === draftBranchIds.join(",") &&
        currentClassNames.join(",") === draftClassNames.join(",");
      const data = member.role === "parent" || suspensionOnly
        ? { status: memberEditDraft.status, reason: memberEditDraft.reason }
        : {
          role: memberEditDraft.role,
          status: memberEditDraft.status,
          branchIds: memberEditDraft.accessAllBranches ? [] : memberEditDraft.branchIds,
          accessAllBranches: memberEditDraft.accessAllBranches,
          classNames: memberEditDraft.role === "teacher" ? memberEditDraft.classNames : [],
          reason: memberEditDraft.reason,
        };
      const result = await saasRequest("/api/saas/members/" + editingMemberId, {
        method: "PATCH", organizationId, data,
      });
      setSuccessMessage(result.message || "Team access saved.");
      setErrorMessage("");
      cancelMemberEdit();
      await loadMembersAndAudit();
    } catch (error) {
      setErrorMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  };

  if (!memberships.length) {
    return (
      <main className="saas-setup-shell">
        <section className="saas-setup-card">
          <span className="saas-brand-symbol"><MdSchool /></span>
          <h1>Your preschool workspace</h1>
          <p>This account is not connected to a SaaS organization yet. Existing single-school accounts continue to use the current dashboard.</p>
          <button type="button" className="saas-primary-button" onClick={() => window.location.assign("/dashboard/home")}>Open school dashboard</button>
        </section>
      </main>
    );
  }

  const needBranch = ["children", "attendance", "fees", "classes"].includes(activeTab) && !branchId;

  return (
    <div className="saas-workspace">
      <aside className="saas-sidebar">
        <div className="saas-brand">
          <span className="saas-brand-symbol"><MdSchool aria-hidden="true" /></span>
          <span><strong>Preschool</strong><small>Management workspace</small></span>
        </div>
        <div className="saas-sidebar-label">WORKSPACE</div>
        <nav className="saas-sidebar-nav" aria-label="Preschool workspace">
          {visibleTabs.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={"saas-nav-item" + (activeTab === id ? " active" : "")} onClick={() => setActiveTab(id)}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="saas-sidebar-spacer" />
        <div className="saas-secure-note"><MdShield aria-hidden="true" /><span>Organization-scoped workspace</span></div>
        <div className="saas-user-panel">
          <div className="saas-user-avatar">{String(user?.username || user?.email || "U").slice(0, 1).toUpperCase()}</div>
          <div className="saas-user-details"><strong>{user?.username || "School user"}</strong><small>{activeMembership?.role?.replaceAll("_", " ")}</small></div>
          <button type="button" className="saas-logout-button" onClick={logout} aria-label="Sign out" title="Sign out"><MdLogout /></button>
        </div>
      </aside>

      <main className="saas-main">
        <header className="saas-topbar">
          <div className="saas-topbar-title">
            <span className="saas-eyebrow">PRESCHOOL OPERATIONS</span>
            <h1>{TABS.find((item) => item.id === activeTab)?.label || "Workspace"}</h1>
          </div>
          <div className="saas-topbar-selectors">
            {memberships.length > 1 && (
              <label>
                <span>Organization</span>
                <select value={organizationId} onChange={(event) => changeOrganization(event.target.value)}>
                  {memberships.map((item) => <option key={item.organization.id} value={item.organization.id}>{item.organization.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>{canSeeAllBranches ? "Viewing branch" : "Your branch"}</span>
              <select value={branchId} onChange={(event) => changeBranch(event.target.value)} disabled={!branches.length}>
                {canSeeAllBranches && <option value="">All branches (overview)</option>}
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <button type="button" className="saas-icon-button" onClick={() => setRefreshVersion((version) => version + 1)} aria-label="Refresh overview" title="Refresh"><MdRefresh /></button>
          </div>
        </header>

        <div className="saas-page-content">
          {(errorMessage || successMessage) && (
            <div className={"saas-message " + (errorMessage ? "error" : "success")} role={errorMessage ? "alert" : "status"}>
              {errorMessage ? <MdErrorOutline aria-hidden="true" /> : <MdCheckCircle aria-hidden="true" />}
              <span>{errorMessage || successMessage}</span>
              <button type="button" onClick={() => { setErrorMessage(""); setSuccessMessage(""); }} aria-label="Dismiss message"><MdClose /></button>
            </div>
          )}

          {activeTab === "setup" && canManageOrganization && (
            <section className="saas-section">
              <SectionHeading
                title="Get your preschool ready"
                description="Follow these steps in order. Progress is calculated from the records in your workspace, so a step is complete only after the work is actually saved."
                action={<button type="button" className="saas-secondary-button" onClick={() => setRefreshVersion((version) => version + 1)}><MdRefresh /> Refresh progress</button>}
              />
              {loading && !setupChecklist ? (
                <div className="saas-loading" role="status">Checking your setup progress…</div>
              ) : setupChecklist ? (
                <>
                  <div className="saas-setup-progress-card">
                    <div className="saas-setup-progress-top">
                      <div>
                        <span className="saas-eyebrow">ESSENTIAL SETUP</span>
                        <strong>{setupChecklist.progress.completedRequired} of {setupChecklist.progress.totalRequired} required steps complete</strong>
                        <p>{setupChecklist.progress.isReady ? "Your essential setup is complete. You can revisit the optional steps any time." : "Complete the remaining essentials to get your day-to-day school workflow ready."}</p>
                      </div>
                      <span className="saas-setup-progress-percent">{setupChecklist.progress.percent}%</span>
                    </div>
                    <div className="saas-setup-progress-track" role="progressbar" aria-label="Essential setup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={setupChecklist.progress.percent}>
                      <span style={{ width: setupChecklist.progress.percent + "%" }} />
                    </div>
                    <div className="saas-setup-scope">Progress scope: {setupChecklist.branchScope.name}. Counts are based on saved organization and branch records.</div>
                  </div>

                  <div className="saas-setup-step-list">
                    {setupChecklist.steps.map((step, index) => (
                      <article className={"saas-setup-step" + (step.completed ? " complete" : "")} key={step.id}>
                        <span className="saas-setup-step-icon" aria-hidden="true">
                          {step.completed ? <MdCheckCircle /> : <span>{index + 1}</span>}
                        </span>
                        <div className="saas-setup-step-copy">
                          <div className="saas-setup-step-heading">
                            <h3>{step.title}</h3>
                            <span className={"saas-setup-status" + (step.completed ? " complete" : "")}>{step.completed ? "Complete" : step.required ? "Required" : "Optional"}</span>
                          </div>
                          <p>{step.description}</p>
                          {Number.isFinite(step.count) && <small>{step.count} saved record{step.count === 1 ? "" : "s"}</small>}
                        </div>
                        <button type="button" className={step.completed ? "saas-secondary-button" : "saas-primary-button"} onClick={() => setActiveTab(step.tab)}>
                          {step.completed ? "Review" : step.buttonLabel} <MdArrowForward aria-hidden="true" />
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="saas-setup-privacy-note"><MdShield aria-hidden="true" /><div><strong>Keep family records private</strong><p>Invite only verified staff and guardians. Avoid putting children's personal details in notices or public media. Optional tasks do not block essential setup.</p></div></div>
                </>
              ) : (
                <BlankState title="Setup progress is unavailable" detail="Refresh the page. If the problem continues, check that you have owner or head-office access to this organization." action={<button type="button" className="saas-secondary-button" onClick={() => setRefreshVersion((version) => version + 1)}><MdRefresh /> Try again</button>} />
              )}
            </section>
          )}

          {activeTab === "overview" && (
            <section className="saas-section">
              <div className="saas-welcome-card">
                <div>
                  <span className="saas-eyebrow">YOUR SCHOOL AT A GLANCE</span>
                  <h2>Hello{user?.username ? ", " + user.username : ""}.</h2>
                  <p>Here are the numbers that matter today. Choose a task from the left to get started.</p>
                </div>
                <div className="saas-welcome-date"><MdCalendarMonth aria-hidden="true" /> {formatDate(summary?.date || todayLocal())}</div>
              </div>
              {canManageOrganization && setupChecklist?.progress && !setupChecklist.progress.isReady && (
                <div className="saas-overview-setup-card">
                  <div className="saas-overview-setup-icon"><MdCheckCircle aria-hidden="true" /></div>
                  <div>
                    <strong>Finish setting up your preschool</strong>
                    <p>{setupChecklist.progress.completedRequired} of {setupChecklist.progress.totalRequired} essential steps complete. The guide tracks saved classes, child records, attendance and fees.</p>
                  </div>
                  <button type="button" className="saas-secondary-button" onClick={() => setActiveTab("setup")}>Continue setup <MdArrowForward aria-hidden="true" /></button>
                </div>
              )}
              {loading && !summary ? <div className="saas-loading">Loading your school summary…</div> : (
                <div className="saas-metrics-grid">
                  <MetricCard label="Active branches" value={summary?.branchCount ?? "—"} detail="Across this organization" Icon={MdApartment} />
                  <MetricCard label="Children registered" value={summary?.children?.total ?? "—"} detail={(summary?.children?.addedToday ?? 0) + " added today"} Icon={MdPeople} />
                  <MetricCard label="Present today" value={summary?.attendance?.present ?? "—"} detail={(summary?.attendance?.absent ?? 0) + " absent · " + (summary?.attendance?.recorded ?? 0) + " marked"} Icon={MdFactCheck} />
                  <MetricCard label="Money collected today" value={summary?.fees ? formatMoney(summary.fees.collectedToday, currency) : role === "teacher" || role === "hr_manager" || role === "transport_staff" ? "Restricted" : "—"} detail={summary?.fees ? "Net of any refunds" : "Finance access is limited by role"} Icon={MdCurrencyRupee} />
                  <MetricCard label="Fees still due" value={summary?.fees ? formatMoney(summary.fees.outstanding, currency) : role === "teacher" || role === "hr_manager" || role === "transport_staff" ? "Restricted" : "—"} detail={summary?.fees ? "On open invoices" : "Finance access is limited by role"} Icon={MdReceiptLong} />
                </div>
              )}
              {canSeeAllBranches && !branchId && <div className="saas-hint"><MdApartment /> You are viewing the whole organization. Choose a branch above to work on children, attendance and payments.</div>}
              <SectionHeading title="What needs doing?" description="The common tasks are ready when you are." />
              <div className="saas-shortcut-grid">
                {[
                  { title: "Register a child", detail: "Add a child and parent contact", tab: "children", Icon: MdPeople },
                  { title: "Take attendance", detail: "Mark children for today", tab: "attendance", Icon: MdFactCheck },
                  { title: "Record a payment", detail: "Collect a fee and issue a receipt", tab: "fees", Icon: MdCurrencyRupee },
                ].map(({ title, detail, tab, Icon }) => (
                  <button type="button" className="saas-shortcut-card" key={tab} onClick={() => setActiveTab(tab)}>
                    <span><Icon aria-hidden="true" /></span><strong>{title}</strong><small>{detail}</small><MdArrowForward className="saas-shortcut-arrow" />
                  </button>
                ))}
              </div>
              <div className="saas-trust-note"><MdShield aria-hidden="true" /><div><strong>Data stays within your organization.</strong><p>Access is checked on the server for every organization and branch request. Sensitive child documents are not available in this workspace yet.</p></div></div>
            </section>
          )}

          {activeTab === "children" && (
            <section className="saas-section">
              <SectionHeading title="Children and families" description="Find a child, register a new admission, or review family contact details."
                action={<button type="button" className="saas-primary-button" onClick={() => { if (showChildForm) closeChildForm(); else { setEditingChildId(""); setChildDraft(createBlankChildDraft(classes[0]?.name || "")); setChildPhotoFile(null); setChildPhotoParentVisible(false); setShowChildForm(true); } }}><MdAdd /> {showChildForm ? "Close form" : "Register a child"}</button>}
              />
              {needBranch ? <BlankState title="Choose a branch first" detail="Select a branch from the top of the page to open its child records." /> : (
                <>
                  {showChildForm && (
                    <form className="saas-form-card" onSubmit={saveChild}>
                      <div className="saas-form-heading"><div><h3>{editingChildId ? "Edit child and family details" : "New child admission"}</h3><p>{editingChildId ? "Update the child’s details and primary guardian contact. Changes are recorded in the audit history." : "Start with the child and one parent or guardian contact. You can edit this record later."}</p></div></div>
                      <div className="saas-form-grid">
                        <label>First name *<input name="firstName" value={childDraft.firstName} onChange={updateChildDraft} required maxLength={80} /></label>
                        <label>Middle name<input name="middleName" value={childDraft.middleName} onChange={updateChildDraft} maxLength={80} /></label>
                        <label>Last name<input name="lastName" value={childDraft.lastName} onChange={updateChildDraft} maxLength={80} /></label>
                        <label>Date of birth<input type="date" name="dateOfBirth" value={childDraft.dateOfBirth} onChange={updateChildDraft} /></label>
                        <label>Class *<select name="className" value={childDraft.className} onChange={updateChildDraft} required><option value="">Choose a class</option>{classes.map((item) => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}</select></label>
                        <label>Academic year *<input name="academicYear" value={childDraft.academicYear} onChange={updateChildDraft} pattern="\d{4}-\d{4}" required /></label>
                        <label>Gender<select name="gender" value={childDraft.gender} onChange={updateChildDraft}><option value="">Not specified</option><option>Female</option><option>Male</option><option>Other</option></select></label>
                        <label className="saas-full-width">Home address<textarea name="address" value={childDraft.address} onChange={updateChildDraft} rows="2" maxLength={500} /></label>
                      </div>
                      <div className="saas-form-subheading"><h4>{editingChildId ? "Primary parent or guardian" : "Parent or guardian"}</h4><p>{editingChildId ? "Update the existing primary contact. Changing an email linked to an active parent portal requires re-verification." : "This contact starts as the primary contact. You can add more guardians later."}</p></div>
                      <div className="saas-form-grid">
                        <label>Guardian's full name *<input name="guardianName" value={childDraft.guardianName} onChange={updateChildDraft} required maxLength={120} /></label>
                        <label>Mobile number *<input type="tel" name="guardianPhone" value={childDraft.guardianPhone} onChange={updateChildDraft} required maxLength={24} placeholder="+91 98765 43210" /></label>
                        <label>Email address<input type="email" name="guardianEmail" value={childDraft.guardianEmail} onChange={updateChildDraft} maxLength={254} /></label>
                        <label>Relationship<select name="guardianRelationship" value={childDraft.guardianRelationship} onChange={updateChildDraft}><option value="mother">Mother</option><option value="father">Father</option><option value="guardian">Guardian</option><option value="grandparent">Grandparent</option><option value="other">Other</option></select></label>
                      </div>
                      <div className="saas-consent-checks">
                        <label><input type="checkbox" checked={childDraft.guardianPickup} onChange={(event) => setChildDraft((draft) => ({ ...draft, guardianPickup: event.target.checked }))} /> Authorized to pick up child</label>
                        <label><input type="checkbox" checked={childDraft.guardianUpdates} onChange={(event) => setChildDraft((draft) => ({ ...draft, guardianUpdates: event.target.checked }))} /> Receives school updates</label>
                        <label><input type="checkbox" checked={childDraft.guardianBilling} onChange={(event) => setChildDraft((draft) => ({ ...draft, guardianBilling: event.target.checked }))} /> Billing contact</label>
                        <label><input type="checkbox" checked={childDraft.guardianEmergency} onChange={(event) => setChildDraft((draft) => ({ ...draft, guardianEmergency: event.target.checked }))} /> Emergency contact</label>
                      </div>
                      <div className="saas-form-grid">
                        <label>School communication consent<select name="communicationConsent" value={childDraft.communicationConsent} onChange={updateChildDraft}><option value="unknown">Not recorded</option><option value="granted">Granted</option><option value="withdrawn">Withdrawn</option></select></label>
                        <label>Photo-use consent<select name="photoConsent" value={childDraft.photoConsent} onChange={updateChildDraft}><option value="unknown">Not recorded</option><option value="granted">Granted</option><option value="withdrawn">Withdrawn</option></select></label>
                      </div>
                      {canUploadChildPhotos && (
                        <>
                          <div className="saas-form-grid">
                            <label className="saas-full-width">Child photo (JPG, PNG, WEBP or GIF; maximum 5 MB)
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={(event) => setChildPhotoFile(event.target.files?.[0] || null)}
                              />
                            </label>
                          </div>
                          {childPhotoFile && <p className="saas-muted-note">Selected photo: {childPhotoFile.name} · {(childPhotoFile.size / 1024 / 1024).toFixed(2)} MB. The file is stored privately.</p>}
                          <div className="saas-consent-checks">
                            <label>
                              <input
                                type="checkbox"
                                checked={childPhotoParentVisible}
                                disabled={childDraft.photoConsent !== "granted"}
                                onChange={(event) => setChildPhotoParentVisible(event.target.checked)}
                              />
                              Show this photo to linked parents in the family portal (requires photo-use consent recorded as granted)
                            </label>
                          </div>
                          {childDraft.photoConsent !== "granted" && <p className="saas-muted-note">Parent viewing stays off until photo-use consent is recorded as granted. Existing private staff photos are not shown in the parent portal.</p>}
                        </>
                      )}
                      <div className="saas-form-actions"><button type="button" className="saas-secondary-button" onClick={closeChildForm}>Cancel</button><button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Saving record…" : editingChildId ? "Save changes" : "Save child record"}</button></div>
                    </form>
                  )}
                  <div className="saas-search-row">
                    <form className="saas-search-box" onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()); }}>
                      <MdSearch aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find by child's name, GR number or guardian phone" aria-label="Search child records" />
                      <button type="submit" className="saas-secondary-button">Search</button>
                    </form>
                    {appliedQuery && <button type="button" className="saas-text-button" onClick={() => { setQuery(""); setAppliedQuery(""); }}>Clear search</button>}
                  </div>
                  <div className="saas-list-meta">{children.length} child record{children.length === 1 ? "" : "s"} in this view {loading ? "· Updating…" : ""}</div>
                  {children.length ? (
                    <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Child</th><th>Admission number</th><th>Class / year</th><th>Parent or guardian</th><th>Mobile</th><th>Record updated</th><th>Actions</th></tr></thead><tbody>
                      {children.map((child) => (
                        <tr key={child.id}><td><div className="saas-child-identity">{childPhotoUrls[child.id] ? <img src={childPhotoUrls[child.id]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true"><MdPeople /></span>}<div><strong>{child.fullName || "—"}</strong><small>{child.dateOfBirth ? "DOB " + formatDate(child.dateOfBirth) : "Date of birth not set"}</small></div></div></td><td>{child.admissionNumber}</td><td>{child.className}<small>{child.academicYear}</small></td><td>{child.guardians?.find((item) => item.primaryContact)?.name || child.guardians?.[0]?.name || "—"}<small>{child.guardians?.find((item) => item.primaryContact)?.relationship || child.guardians?.[0]?.relationship || ""}</small></td><td>{child.guardians?.find((item) => item.primaryContact)?.phone || child.guardians?.[0]?.phone || "—"}</td><td>{formatDate(child.updatedAt)}</td><td><div className="saas-child-row-actions"><button type="button" className="saas-secondary-button" onClick={() => beginChildEdit(child)}>Edit record</button>{canEditChildHealth && <button type="button" className="saas-secondary-button saas-health-action" onClick={() => openHealthProfile(child)}><MdShield aria-hidden="true" /> Health &amp; safety</button>}</div></td></tr>
                      ))}
                    </tbody></table></div>
                  ) : !loading && <BlankState title={appliedQuery ? "No matching child" : "No children registered yet"} detail={appliedQuery ? "Try another spelling, mobile number or admission number." : "Register the first child using the button above. You can search and update records from this list."} action={appliedQuery ? <button type="button" className="saas-secondary-button" onClick={() => { setQuery(""); setAppliedQuery(""); }}>Show all children</button> : <button type="button" className="saas-primary-button" onClick={() => setShowChildForm(true)}><MdAdd /> Register a child</button>} />}
                </>
              )}
            </section>
          )}

          {activeTab === "attendance" && (
            <section className="saas-section">
              <SectionHeading title="Daily attendance" description="Choose a class and date, mark every child, then save once." />
              {needBranch ? <BlankState title="Choose a branch first" detail="Select a branch at the top to record attendance." /> : (
                <>
                  <div className="saas-filter-card">
                    <label>Date<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
                    <label>Class<select value={attendanceClass} onChange={(event) => loadAttendanceDraftsForClass(event.target.value)}><option value="">Choose class</option>{classes.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
                    <div className="saas-filter-stat"><strong>{attendanceRows.length}</strong><span>children in class</span></div>
                    <button type="button" className="saas-secondary-button" onClick={() => setRefreshVersion((version) => version + 1)}><MdRefresh /> Reload</button>
                  </div>
                  <div className="saas-attendance-instructions"><strong>Before saving:</strong><span>Mark each child Present or Absent. A reason is required for each absence. New rows are intentionally left unmarked to avoid accidental attendance records.</span></div>
                  {attendanceRows.length ? (
                    <>
                      <div className="saas-attendance-progress">
                        <span>{attendanceRows.filter((row) => row.status).length} of {attendanceRows.length} marked</span>
                        <span>{attendanceRows.filter((row) => row.status === "present").length} present</span>
                        <span>{attendanceRows.filter((row) => row.status === "absent").length} absent</span>
                      </div>
                      <div className="saas-attendance-list">
                        {attendanceRows.map((row, index) => (
                          <div className="saas-attendance-row" key={row.childId}>
                            <span className="saas-attendance-number">{index + 1}</span>
                            <div className="saas-attendance-child"><strong>{row.name}</strong><small>{row.admissionNumber}</small></div>
                            {row.classroomHealth?.hasAlerts && (
                              <details className="saas-classroom-health">
                                <summary><MdShield aria-hidden="true" /> Health and safety notes</summary>
                                {row.classroomHealth.allergies?.length > 0 && <div><strong>Allergies</strong><ul>{row.classroomHealth.allergies.map((item, itemIndex) => <li key={item.name + itemIndex}><b>{item.name}</b>{item.severity && item.severity !== "unknown" ? " · " + item.severity : ""}{item.reaction ? " — " + item.reaction : ""}{item.emergencyAction ? ". Action: " + item.emergencyAction : ""}</li>)}</ul></div>}
                                {row.classroomHealth.dietaryRestrictions?.length > 0 && <div><strong>Dietary restrictions</strong><ul>{row.classroomHealth.dietaryRestrictions.map((item, itemIndex) => <li key={item.name + itemIndex}><b>{item.name}</b>{item.details ? " — " + item.details : ""}</li>)}</ul></div>}
                                {row.classroomHealth.specialCareInstructions && <div><strong>Special care</strong><p>{row.classroomHealth.specialCareInstructions}</p></div>}
                                {row.classroomHealth.schoolMedicationRequired && <div className="saas-classroom-medication-note"><strong>Approved school medication plan on file</strong><p>Contact an authorized administrator for the current instructions. Do not administer medicine using this summary alone.</p></div>}
                                {row.classroomHealth.emergencyInstructions && <div><strong>Emergency instructions</strong><p>{row.classroomHealth.emergencyInstructions}</p></div>}
                                <small>Full medical notes and medication details are restricted to authorized administrators.</small>
                              </details>
                            )}
                            <div className="saas-attendance-controls" role="group" aria-label={"Attendance for " + row.name}>
                              <button type="button" className={"saas-status-button present" + (row.status === "present" ? " selected" : "")} onClick={() => markAttendance(row.childId, "present")}>Present</button>
                              <button type="button" className={"saas-status-button absent" + (row.status === "absent" ? " selected" : "")} onClick={() => markAttendance(row.childId, "absent")}>Absent</button>
                            </div>
                            {row.status === "absent" && <label className="saas-absence-reason">Reason for absence<input value={row.reason} onChange={(event) => setAttendanceRows((rows) => rows.map((item) => item.childId === row.childId ? { ...item, reason: event.target.value } : item))} placeholder="e.g. Sick, family reason" maxLength={300} /></label>}
                          </div>
                        ))}
                      </div>
                      <div className="saas-sticky-actions"><span>Check the class and date before saving.</span><button type="button" className="saas-primary-button" onClick={saveAttendance} disabled={saving || attendanceRows.some((row) => !row.status || (row.status === "absent" && !row.reason.trim()))}>{saving ? "Saving attendance…" : "Save attendance"}</button></div>
                    </>
                  ) : <BlankState title={loading ? "Loading class list…" : "No children in this class yet"} detail="Choose a class with registered children to record attendance." />}
                </>
              )}
            </section>
          )}

          {activeTab === "fees" && (
            <section className="saas-section">
              <SectionHeading title="Fees and payments" description="Create a fee invoice, record money received and issue a unique receipt number." />
              {needBranch ? <BlankState title="Choose a branch first" detail="Select a branch from the top to manage its fee records." /> : (
                <>
                  <form className="saas-form-card" onSubmit={createInvoice}>
                    <div className="saas-form-heading"><div><h3>Create a fee invoice</h3><p>Amounts are saved precisely in paise. Payments and refunds are recorded as separate ledger entries.</p></div></div>
                    <div className="saas-form-grid">
                      <label className="saas-full-width">Child *<select name="childId" value={feeDraft.childId} onChange={(event) => { const selected = children.find((child) => child.id === event.target.value); const defaultFee = classes.find((item) => item.name === selected?.className)?.defaultFee; setFeeDraft((draft) => ({ ...draft, childId: event.target.value, amount: Number(defaultFee) > 0 ? String(defaultFee) : draft.amount })); }} required><option value="">Choose a child</option>{children.map((child) => <option key={child.id} value={child.id}>{child.fullName} · {child.className} · {child.admissionNumber}</option>)}</select></label>
                      <label>Academic year *<input name="academicYear" value={feeDraft.academicYear} onChange={updateFeeDraft} pattern="\d{4}-\d{4}" required /></label>
                      <label>Fee item name *<input name="description" value={feeDraft.description} onChange={updateFeeDraft} required maxLength={160} /></label>
                      <label>Amount (₹) *<input name="amount" type="number" min="0.01" step="0.01" value={feeDraft.amount} onChange={updateFeeDraft} required /></label>
                      <label>Discount (₹)<input name="discount" type="number" min="0" step="0.01" value={feeDraft.discount} onChange={updateFeeDraft} /></label>
                      <label>Due date<input name="dueDate" type="date" value={feeDraft.dueDate} onChange={updateFeeDraft} /></label>
                      <label className="saas-full-width">Notes (optional)<textarea name="notes" value={feeDraft.notes} onChange={updateFeeDraft} maxLength={1000} rows="2" /></label>
                    </div>
                    <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving || !children.length}>{saving ? "Creating invoice…" : "Create invoice"}</button></div>
                  </form>
                  <SectionHeading title="Fee invoices" description="The balance is calculated from the invoice and recorded payment/refund history." />
                  {invoices.length ? <div className="saas-invoice-list">{invoices.map((invoice) => (
                    <article className="saas-invoice-card" key={invoice.id}>
                      <div className="saas-invoice-top"><div><span className="saas-invoice-number">{invoice.invoiceNumber}</span><h3>{invoice.child?.name || "Child record unavailable"}</h3><p>{invoice.child?.className || ""} · {invoice.academicYear} · Due {formatDate(invoice.dueDate)}</p></div><span className={"saas-pill " + invoice.status}>{invoice.status === "open" ? "Open" : "Voided"}</span></div>
                      <div className="saas-invoice-money">
                        <div><span>Total</span><strong>{formatMoney(invoice.totalAmount, currency)}</strong></div>
                        <div><span>Paid</span><strong>{formatMoney(invoice.paid, currency)}</strong></div>
                        <div><span>Still due</span><strong className={invoice.outstanding > 0 ? "is-due" : "is-paid"}>{formatMoney(invoice.outstanding, currency)}</strong></div>
                      </div>
                      <div className="saas-invoice-actions">
                        {invoice.status === "open" && invoice.outstanding > 0 && <button type="button" className="saas-primary-button" onClick={() => openPayment(invoice, "payment")}>Record payment</button>}
                        {invoice.transactions?.some((transaction) => transaction.type === "payment") && activeMembership?.role !== "branch_admin" && (
                          <button type="button" className="saas-secondary-button" onClick={() => setPaymentTarget({ invoice, type: "refund-select" })}>Record refund</button>
                        )}
                      </div>
                      {invoice.transactions?.length > 0 && (
                        <details className="saas-ledger-details">
                          <summary><MdHistory /> Payment history ({invoice.transactions.length}) <MdExpandMore /></summary>
                          <div className="saas-ledger-list">{invoice.transactions.map((txn) => (
                            <div className="saas-ledger-row" key={txn.id}>
                              <div>
                                <strong>{txn.type === "payment" ? "Payment received" : "Refund"}</strong>
                                <small>{txn.receiptNumber} · {formatDate(txn.transactionAt)} · {txn.method.replaceAll("_", " ")}</small>
                                {txn.reference && <small>Reference: {txn.reference}</small>}
                                {txn.reason && <small>{txn.reason}</small>}
                              </div>
                              <strong className={txn.type === "refund" ? "is-due" : "is-paid"}>{txn.type === "refund" ? "−" : "+"}{formatMoney(txn.amount, currency)}</strong>
                              <button type="button" className="saas-text-button saas-receipt-button" onClick={() => printTransactionReceipt(invoice, txn)}><MdPrint aria-hidden="true" /> Print receipt</button>
                              {txn.type === "payment" && activeMembership?.role !== "branch_admin" && <button type="button" className="saas-text-button" onClick={() => openPayment(invoice, "refund", txn)}>Refund</button>}
                            </div>
                          ))}</div>
                        </details>
                      )}
                    </article>
                  ))}</div> : !loading && <BlankState title="No fee invoices yet" detail="Choose a child, enter the fee and create the first invoice. A receipt is generated when you record a payment." />}
                </>
              )}
            </section>
          )}

          {activeTab === "branches" && (
            <section className="saas-section">
              <SectionHeading title="Your branches" description="Run each preschool branch independently while keeping one organization-wide view." />
              {canManageOrganization && (
                <form className="saas-form-card" onSubmit={createBranch}>
                  <div className="saas-form-heading"><div><h3>Add a branch</h3><p>Use a short unique code, such as SURAT-01. Branch codes cannot be reused within your organization.</p></div></div>
                  <div className="saas-form-grid">
                    <label>Branch name *<input value={branchDraft.name} onChange={(event) => setBranchDraft((draft) => ({ ...draft, name: event.target.value }))} required maxLength={120} /></label>
                    <label>Branch code *<input value={branchDraft.code} onChange={(event) => setBranchDraft((draft) => ({ ...draft, code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") }))} required minLength={2} maxLength={16} pattern="[A-Z0-9]+(-[A-Z0-9]+)*" /></label>
                    <label>Contact phone<input value={branchDraft.phone} onChange={(event) => setBranchDraft((draft) => ({ ...draft, phone: event.target.value }))} maxLength={30} /></label>
                    <label>Contact email<input type="email" value={branchDraft.email} onChange={(event) => setBranchDraft((draft) => ({ ...draft, email: event.target.value }))} maxLength={254} /></label>
                    <label>City<input value={branchDraft.city} onChange={(event) => setBranchDraft((draft) => ({ ...draft, city: event.target.value }))} maxLength={100} /></label>
                    <label>State<input value={branchDraft.state} onChange={(event) => setBranchDraft((draft) => ({ ...draft, state: event.target.value }))} maxLength={100} /></label>
                    <label>Postal code<input value={branchDraft.postalCode} onChange={(event) => setBranchDraft((draft) => ({ ...draft, postalCode: event.target.value }))} maxLength={20} /></label>
                  </div>
                  <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Creating branch…" : "Create branch"}</button></div>
                </form>
              )}
              <div className="saas-branch-grid">
                {branches.map((branch) => (
                  <article className="saas-branch-card" key={branch.id}>
                    <span className="saas-branch-icon"><MdApartment /></span><span className={"saas-pill " + branch.status}>{branch.status}</span>
                    <h3>{branch.name}</h3><p>{branch.code}</p>
                    <div className="saas-branch-address">{[branch.address?.city, branch.address?.state, branch.address?.postalCode].filter(Boolean).join(", ") || "Address not added"}</div>
                    <button type="button" className="saas-secondary-button" onClick={() => { changeBranch(branch.id); setActiveTab("overview"); }}>Open this branch <MdArrowForward /></button>
                  </article>
                ))}
              </div>
              {!branches.length && !loading && <BlankState title="No branch is available" detail="Ask the organization owner to add a branch or check your branch access." />}
            </section>
          )}

          {activeTab === "classes" && (
            <section className="saas-section">
              <SectionHeading title="Classes and fee defaults" description="Configure the classes offered at this branch. Admissions, attendance, and teacher access use this list." />
              {needBranch ? <BlankState title="Choose a branch first" detail="Class settings belong to a branch. Choose a branch from the top of the page to manage its classes." /> : (
                <>
                  <form className="saas-form-card" onSubmit={saveClass}>
                    <div className="saas-form-heading"><div><h3>{editingClassId ? "Edit class settings" : "Add a class"}</h3><p>Class names and codes are fixed once created so historical student and attendance records remain consistent.</p></div></div>
                    <div className="saas-form-grid">
                      <label>Class name *<input name="name" value={classDraft.name} onChange={updateClassDraft} required minLength={2} maxLength={80} disabled={Boolean(editingClassId)} placeholder="e.g. Nursery" /></label>
                      <label>Class code (optional)<input name="code" value={classDraft.code} onChange={(event) => setClassDraft((draft) => ({ ...draft, code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") }))} minLength={2} maxLength={16} pattern="[A-Z0-9]+(-[A-Z0-9]+)*" disabled={Boolean(editingClassId)} placeholder="Auto-generated from name" /></label>
                      <label>Minimum age (months)<input type="number" name="minAgeMonths" value={classDraft.minAgeMonths} onChange={updateClassDraft} min="0" max="240" step="1" /></label>
                      <label>Maximum age (months)<input type="number" name="maxAgeMonths" value={classDraft.maxAgeMonths} onChange={updateClassDraft} min="0" max="240" step="1" /></label>
                      <label>Default fee (₹) *<input type="number" name="defaultFee" value={classDraft.defaultFee} onChange={updateClassDraft} min="0" step="0.01" required /></label>
                      <label>Fee frequency *<select name="feeFrequency" value={classDraft.feeFrequency} onChange={updateClassDraft} required><option value="annual">Annual</option><option value="term">Per term</option><option value="monthly">Monthly</option><option value="one_time">One-time</option></select></label>
                      <label>Class capacity *<input type="number" name="capacity" value={classDraft.capacity} onChange={updateClassDraft} min="1" max="1000" step="1" required /></label>
                      <label className="saas-full-width">Description (optional)<textarea name="description" value={classDraft.description} onChange={updateClassDraft} maxLength={500} rows="2" placeholder="Age group, schedule, or notes for staff" /></label>
                    </div>
                    <div className="saas-class-setup-note"><MdShield aria-hidden="true" /><span>Fee defaults are specific to this branch. Creating a class does not create invoices or charge families automatically; an authorized staff member must create an invoice.</span></div>
                    <div className="saas-form-actions">
                      {editingClassId && <button type="button" className="saas-secondary-button" onClick={cancelClassEdit}>Cancel edit</button>}
                      <button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Saving class…" : editingClassId ? "Save class settings" : "Create class"}</button>
                    </div>
                  </form>

                  <SectionHeading title="Configured classes" description={classes.length + " active class" + (classes.length === 1 ? "" : "es") + " in " + (activeBranch?.name || "this branch") + "."} />
                  {classes.length ? (
                    <div className="saas-class-grid">
                      {classes.map((classroom) => (
                        <article className="saas-class-card" key={classroom.id}>
                          <div className="saas-class-card-top"><span className="saas-class-symbol"><MdSchool aria-hidden="true" /></span><span className="saas-pill active">Active</span></div>
                          <div className="saas-class-name"><h3>{classroom.name}</h3><span>{classroom.code}</span></div>
                          <div className="saas-class-fee"><span>Default fee</span><strong>{formatMoney(classroom.defaultFee, currency)}</strong><small>{String(classroom.feeFrequency || "annual").replaceAll("_", " ")}</small></div>
                          <div className="saas-class-meta"><span>Age range</span><strong>{classroom.minAgeMonths == null && classroom.maxAgeMonths == null ? "Not specified" : (classroom.minAgeMonths == null ? "Any" : classroom.minAgeMonths + " mo") + " – " + (classroom.maxAgeMonths == null ? "Any" : classroom.maxAgeMonths + " mo")}</strong></div>
                          <div className="saas-class-meta"><span>Capacity</span><strong>{classroom.capacity} children</strong></div>
                          {classroom.description && <p className="saas-class-description">{classroom.description}</p>}
                          <div className="saas-class-actions"><button type="button" className="saas-secondary-button" onClick={() => beginClassEdit(classroom)}>Edit settings</button><button type="button" className="saas-text-button" disabled={saving} onClick={() => archiveClass(classroom)}>Archive</button></div>
                        </article>
                      ))}
                    </div>
                  ) : <BlankState title="Set up your first class" detail="Create a class above before registering children, recording attendance, or assigning teachers to classes." />}
                </>
              )}
            </section>
          )}

          {activeTab === "reports" && (
            <section className="saas-section tenant-reports-section">
              <SectionHeading
                title="Reports and exports"
                description="Download branch-scoped records for school reviews, attendance follow-up, and fee reconciliation. Every export is recorded in the audit history."
              />

              <div className="tenant-report-filter-card">
                <div><h3>Choose your date range</h3><p>Exports include the start and end dates. You can report on up to 366 days at a time.</p></div>
                <div className="tenant-report-date-grid">
                  <label>From date *
                    <input type="date" value={reportFrom} max={reportTo || undefined} onChange={(event) => setReportFrom(event.target.value)} required />
                  </label>
                  <label>To date *
                    <input type="date" value={reportTo} min={reportFrom || undefined} max={todayLocal()} onChange={(event) => setReportTo(event.target.value)} required />
                  </label>
                </div>
                {!branchId && <div className="saas-message error" role="status"><MdErrorOutline aria-hidden="true" /><span>Choose a branch in the selector above before exporting a report.</span></div>}
              </div>

              <div className="tenant-report-card-grid">
                {canViewAttendanceReports && (
                  <article className="tenant-report-card">
                    <span className="tenant-report-icon"><MdFactCheck aria-hidden="true" /></span>
                    <h3>Attendance report</h3>
                    <p>One row per saved child attendance entry, including date, class, admission number, attendance status, and absence reason. Teachers are limited to their assigned classes.</p>
                    <div className="tenant-report-file-note">CSV file · Opens in Excel or Google Sheets</div>
                    <button type="button" className="saas-primary-button" onClick={() => downloadTenantReport("attendance")} disabled={!branchId || !reportFrom || !reportTo || reportFrom > reportTo || Boolean(reportDownloading)}>
                      <MdDownload aria-hidden="true" /> {reportDownloading === "attendance" ? "Preparing attendance…" : "Download attendance CSV"}
                    </button>
                  </article>
                )}
                {canViewFeeReports && (
                  <article className="tenant-report-card">
                    <span className="tenant-report-icon"><MdReceiptLong aria-hidden="true" /></span>
                    <h3>Fee transaction report</h3>
                    <p>Saved payments and refunds with receipt number, invoice, child, date, amount, payment method, reference, and refund reason. Use it to reconcile the ledger.</p>
                    <div className="tenant-report-file-note">CSV file · Includes transaction type for each amount</div>
                    <button type="button" className="saas-primary-button" onClick={() => downloadTenantReport("fees")} disabled={!branchId || !reportFrom || !reportTo || reportFrom > reportTo || Boolean(reportDownloading)}>
                      <MdDownload aria-hidden="true" /> {reportDownloading === "fees" ? "Preparing fee report…" : "Download fee CSV"}
                    </button>
                  </article>
                )}
              </div>
              <div className="parent-privacy-card tenant-report-privacy"><MdShield aria-hidden="true" /><div><strong>Exports are protected and traceable.</strong><p>The server checks your organization, branch, role and (for teachers) assigned classes. Child and invoice references are re-checked against the same branch, and the export action is written to the audit log.</p></div></div>
            </section>
          )}

          {activeTab === "workreports" && (
            <section className="saas-section tenant-work-reports-section">
              <SectionHeading
                title="Teacher daily work reports"
                description={canManagePeople
                  ? "Review teaching activity, time spent and attendance counts. Ask for follow-up when something needs clarification."
                  : "Record the learning activities and classroom work completed for one of your assigned classes."}
                action={<button type="button" className="saas-secondary-button" onClick={() => loadWorkReports()} disabled={loading || saving}><MdRefresh aria-hidden="true" /> Refresh reports</button>}
              />

              {!branchId && <div className="saas-message error" role="status"><MdErrorOutline aria-hidden="true" /><span>Choose a branch above before viewing or submitting work reports.</span></div>}

              {role === "teacher" && branchId && (
                <form className="saas-form-card tenant-work-report-form" onSubmit={saveWorkReport}>
                  <div className="saas-form-heading">
                    <div>
                      <h3>{editingWorkReportId ? "Edit unreviewed daily report" : "Submit today's teaching report"}</h3>
                      <p>Submit one report per assigned class and school day. After an administrator reviews it, the report becomes read-only.</p>
                    </div>
                    {editingWorkReportId && <button type="button" className="saas-secondary-button" onClick={resetWorkReportEditor}>Cancel edit</button>}
                  </div>
                  <div className="saas-form-grid">
                    <label>Report date *
                      <input type="date" value={workReportDraft.reportDate} min={localDateDaysAgo(7)} max={todayLocal()} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, reportDate: event.target.value }))} disabled={Boolean(editingWorkReportId)} required />
                    </label>
                    <label>Assigned class *
                      <select value={workReportDraft.className} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, className: event.target.value }))} disabled={Boolean(editingWorkReportId)} required>
                        <option value="">Choose a class</option>
                        {classes.map((item) => <option key={item.id || item._id || item.name} value={item.name}>{item.name}</option>)}
                      </select>
                    </label>
                    <label>Subject or activity *
                      <input value={workReportDraft.subject} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, subject: event.target.value }))} minLength={2} maxLength={100} required placeholder="e.g. Early literacy" />
                    </label>
                    <label>Start time *
                      <input type="time" value={workReportDraft.startTime} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, startTime: event.target.value }))} required />
                    </label>
                    <label>End time *
                      <input type="time" value={workReportDraft.endTime} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, endTime: event.target.value }))} min={workReportDraft.startTime || undefined} required />
                    </label>
                    <label>Children present *
                      <input type="number" min="0" max="1000" step="1" value={workReportDraft.studentsPresent} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, studentsPresent: event.target.value }))} required />
                    </label>
                    <label className="saas-full-width">What did you teach or complete? *
                      <textarea value={workReportDraft.workSummary} onChange={(event) => setWorkReportDraft((draft) => ({ ...draft, workSummary: event.target.value }))} minLength={10} maxLength={5000} rows="4" required placeholder="Describe lessons, activities, learning materials and any general classroom follow-up. Avoid including sensitive family or medical details." />
                    </label>
                  </div>
                  <div className="tenant-work-report-form-note"><MdShield aria-hidden="true" /><span>Reports are visible to authorized school administrators. A reviewed report cannot be edited; ask an administrator to record a correction if needed.</span></div>
                  <div className="saas-form-actions">
                    <button type="submit" className="saas-primary-button" disabled={saving || !branchId}>{saving ? "Saving report…" : editingWorkReportId ? "Save changes" : "Submit for review"}</button>
                  </div>
                </form>
              )}

              <div className="tenant-work-report-filters">
                <label>From date<input type="date" value={workReportFrom} max={workReportTo || undefined} onChange={(event) => setWorkReportFrom(event.target.value)} /></label>
                <label>To date<input type="date" value={workReportTo} min={workReportFrom || undefined} max={todayLocal()} onChange={(event) => setWorkReportTo(event.target.value)} /></label>
                <label>Class
                  <select value={workReportClassFilter} onChange={(event) => setWorkReportClassFilter(event.target.value)}>
                    <option value="">All classes</option>
                    {classes.map((item) => <option key={item.id || item._id || item.name} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
                <label>Status
                  <select value={workReportStatusFilter} onChange={(event) => setWorkReportStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option><option value="submitted">Needs review</option><option value="needs_follow_up">Follow-up needed</option><option value="reviewed">Reviewed</option>
                  </select>
                </label>
                <button type="button" className="saas-secondary-button" onClick={() => loadWorkReports()} disabled={loading || !branchId}><MdSearch aria-hidden="true" /> Apply filters</button>
                <span>{workReports.length} report{workReports.length === 1 ? "" : "s"} in this view</span>
              </div>

              {workReports.length ? (
                <div className="tenant-work-report-list">
                  {workReports.map((report) => {
                    const isOwnReport = report.submittedBy?.id === user?.id;
                    const mayEdit = role === "teacher" && isOwnReport && ["submitted", "needs_follow_up"].includes(report.status);
                    const mayReview = canManagePeople && report.status === "submitted";
                    return (
                      <article className="tenant-work-report-card" key={report.id}>
                        <div className="tenant-work-report-card-top">
                          <div className="tenant-work-report-date">
                            <span>{formatDate(report.reportDate)}</span>
                            <strong>{report.className}</strong>
                            <small>{report.subject}</small>
                          </div>
                          <span className={"saas-pill " + report.status}>{report.status === "submitted" ? "Needs review" : report.status === "reviewed" ? "Reviewed" : "Follow-up needed"}</span>
                        </div>
                        <div className="tenant-work-report-meta">
                          <span><MdHistory aria-hidden="true" /> {report.startTime}–{report.endTime} · {Math.floor(report.durationMinutes / 60)}h {report.durationMinutes % 60}m</span>
                          <span><MdPeople aria-hidden="true" /> {report.studentsPresent} present of {report.classEnrollmentCount} registered</span>
                          {canManagePeople && <span><MdManageAccounts aria-hidden="true" /> {report.submittedBy?.name || "Teacher"}</span>}
                        </div>
                        <p className="tenant-work-report-summary">{report.workSummary}</p>
                        {report.reviewHistory?.length > 0 && <div className="tenant-work-report-review">
                          <strong>Review history</strong>
                          {report.reviewHistory.map((review, index) => (
                            <div className="tenant-work-report-review-entry" key={report.id + "-review-" + index}>
                              <span>{review.status === "reviewed" ? "Reviewed" : "Follow-up requested"} by {review.reviewedBy?.name || "school administrator"} · {formatDate(review.reviewedAt)}</span>
                              {review.reviewNote && <p>{review.reviewNote}</p>}
                            </div>
                          ))}
                        </div>}
                        <div className="tenant-work-report-card-actions">
                          <span>Revision {report.revision || 1} · Updated {formatDate(report.updatedAt)}</span>
                          {mayEdit && <button type="button" className="saas-secondary-button" onClick={() => editWorkReport(report)} disabled={saving}>Edit report</button>}
                          {mayReview && <>
                            <button type="button" className="saas-secondary-button" onClick={() => reviewWorkReport(report, "needs_follow_up")} disabled={saving}>Request follow-up</button>
                            <button type="button" className="saas-primary-button" onClick={() => reviewWorkReport(report, "reviewed")} disabled={saving}>Mark reviewed</button>
                          </>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : !loading && branchId ? (
                <BlankState title="No work reports in this date range" detail={role === "teacher" ? "Submit a daily report above after you finish classroom activities. You can edit it until an administrator reviews it." : "Teacher submissions for the selected branch will appear here for review."} />
              ) : !branchId ? null : <div className="saas-loading" role="status">Loading daily work reports…</div>}
            </section>
          )}

          {activeTab === "handover" && (
            <section className="saas-section tenant-handover-section">
              <SectionHeading
                title="Child arrival and authorized pickup"
                description="Record when a child arrives and when an approved contact collects them. Pickup releases require a linked authorized guardian and an identity check."
                action={<button type="button" className="saas-secondary-button" onClick={() => loadHandover()} disabled={loading || saving}><MdRefresh /> Refresh status</button>}
              />

              <div className="tenant-handover-safety-note">
                <MdShield aria-hidden="true" />
                <div><strong>Safety rule: a name alone never authorizes release.</strong><p>Only contacts explicitly marked “Authorized pickup” can complete pickup. Confirm identity in person before recording release. Do not enter government-ID numbers, copies or photographs in the notes.</p></div>
              </div>

              {!branchId && <div className="saas-message error" role="status"><MdErrorOutline /><span>Choose a branch at the top to see the arrival roster and record arrivals or pickups. Authorized administrators can still review the history across their allowed branches.</span></div>}

              {branchId && (
                <>
                  <div className="tenant-handover-toolbar">
                    <form className="saas-search-box" onSubmit={(event) => { event.preventDefault(); loadHandover(); }}>
                      <MdSearch aria-hidden="true" /><input value={handoverQuery} onChange={(event) => setHandoverQuery(event.target.value)} placeholder="Find a child by name or admission number" aria-label="Search handover roster" />
                      <button type="submit" className="saas-secondary-button">Search</button>
                    </form>
                    <span>{handoverChildren.length} child{handoverChildren.length === 1 ? "" : "ren"} in the roster</span>
                  </div>

                  {handoverTarget && (
                    <form className="saas-form-card tenant-handover-form" onSubmit={submitHandover}>
                      <div className="saas-form-heading">
                        <div><h3>{handoverTarget.action === "check_in" ? "Record child arrival" : "Record child pickup"}</h3><p>{handoverTarget.child.name} · {handoverTarget.child.className} · {handoverTarget.child.admissionNumber}</p></div>
                        <button type="button" className="saas-secondary-button" onClick={() => setHandoverTarget(null)}>Cancel</button>
                      </div>
                      {handoverTarget.action === "check_in" ? (
                        <>
                          <div className="saas-form-grid">
                            <label>Who brought the child? *
                              <select value={handoverDraft.method} onChange={(event) => setHandoverDraft((draft) => ({ ...draft, method: event.target.value, guardianId: event.target.value === "family" ? draft.guardianId : "" }))} required>
                                <option value="family">Family member</option><option value="school_transport">School transport</option><option value="other">Other / authorized arrangement</option>
                              </select>
                            </label>
                            {handoverDraft.method === "family"
                              ? <label>Linked family member *
                                  <select value={handoverDraft.guardianId} onChange={(event) => setHandoverDraft((draft) => ({ ...draft, guardianId: event.target.value }))} required>
                                    <option value="">Choose a linked contact</option>
                                    {(handoverTarget.child.guardians || []).map((guardian) => <option key={guardian.guardianId} value={guardian.guardianId}>{guardian.name} · {guardian.relationship}</option>)}
                                  </select>
                                </label>
                              : <label>Person bringing child *
                                  <input value={handoverDraft.personName} onChange={(event) => setHandoverDraft((draft) => ({ ...draft, personName: event.target.value }))} minLength={2} maxLength={120} required />
                                </label>}
                          </div>
                          <p className="tenant-handover-help">The arrival log records the linked contact or the transport/arrangement name. It does not verify pickup rights.</p>
                        </>
                      ) : (
                        <>
                          <div className="tenant-handover-child-state"><span>Child is currently</span><strong>On the premises</strong></div>
                          <div className="saas-form-grid">
                            <label>Authorized pickup contact *
                              <select value={handoverDraft.guardianId} onChange={(event) => setHandoverDraft((draft) => ({ ...draft, guardianId: event.target.value }))}>
                                <option value="">Choose an authorized person</option>
                                {(handoverTarget.child.guardians || []).filter((guardian) => guardian.authorizedPickup).map((guardian) => <option key={guardian.guardianId} value={guardian.guardianId}>{guardian.name} · {guardian.relationship}</option>)}
                              </select>
                            </label>
                            <label className="tenant-handover-id-check">
                              <input type="checkbox" checked={handoverDraft.idChecked} onChange={(event) => setHandoverDraft((draft) => ({ ...draft, idChecked: event.target.checked }))} />
                              <span>I checked this person's identity in person.</span>
                            </label>
                          </div>
                          <p className="tenant-handover-help">If no authorized contact is selected or identity is not checked, the release will be refused and the attempt will be logged without changing the child's status.</p>
                        </>
                      )}
                      <label className="tenant-handover-note">Staff note (optional)
                        <textarea value={handoverDraft.staffNote} onChange={(event) => setHandoverDraft((draft) => ({ ...draft, staffNote: event.target.value }))} maxLength={500} rows="2" placeholder="Operational note only. Do not enter ID numbers or sensitive identity details." />
                      </label>
                      <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Recording…" : handoverTarget.action === "check_in" ? "Record arrival" : "Verify and record pickup"}</button></div>
                    </form>
                  )}

                  {handoverChildren.length ? (
                    <div className="tenant-handover-roster">
                      {handoverChildren.map((child) => (
                        <article className="tenant-handover-child-card" key={child.id}>
                          <div className="tenant-handover-child-main">
                            <span className={"tenant-handover-status " + child.state}>{child.state === "on_premises" ? "On premises" : "Outside"}</span>
                            <h3>{child.name}</h3><p>{child.className} · {child.admissionNumber || "No admission number"}</p>
                            <small>{child.lastEventAt ? "Last completed handover: " + formatDate(child.lastEventAt) : "No completed arrival or pickup recorded yet"}</small>
                          </div>
                          <div className="tenant-handover-contacts">
                            <strong>Linked contacts</strong>
                            {(child.guardians || []).length ? child.guardians.map((guardian) => (
                              <div key={guardian.guardianId}><span>{guardian.name}<small>{guardian.relationship}{guardian.isPrimaryContact ? " · Primary" : ""}</small></span><span className={guardian.authorizedPickup ? "tenant-handover-authorized" : "tenant-handover-not-authorized"}>{guardian.authorizedPickup ? "Authorized pickup" : "Not authorized"}</span></div>
                            )) : <small>No guardian link is available. Update the child’s family record before accepting a family handover.</small>}
                          </div>
                          <div className="tenant-handover-card-actions">
                            {child.state === "outside"
                              ? <button type="button" className="saas-primary-button" onClick={() => openHandoverForm(child, "check_in")} disabled={saving}>Record arrival</button>
                              : <button type="button" className="saas-primary-button" onClick={() => openHandoverForm(child, "check_out")} disabled={saving}>Record pickup</button>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : !loading && <BlankState title="No children found" detail={handoverQuery ? "Try a different spelling or admission number." : "Registered children in this branch will appear here."} />}
                </>
              )}

              <div className="tenant-handover-history-heading">
                <div><h3>Arrival and pickup history</h3><p>Completed and refused attempts are kept for school review.</p></div>
                <div className="tenant-handover-date-filters">
                  <label>From<input type="date" value={handoverFrom} max={handoverTo || undefined} onChange={(event) => setHandoverFrom(event.target.value)} /></label>
                  <label>To<input type="date" value={handoverTo} min={handoverFrom || undefined} onChange={(event) => setHandoverTo(event.target.value)} /></label>
                  <button type="button" className="saas-secondary-button" onClick={() => loadHandover()} disabled={loading}>Apply dates</button>
                </div>
              </div>
              {handoverEvents.length ? (
                <div className="tenant-handover-history">
                  {handoverEvents.map((event) => (
                    <article key={event.id} className={"tenant-handover-history-row " + event.outcome}>
                      <span className={"tenant-handover-history-icon " + event.eventType}><MdHistory /></span>
                      <div className="tenant-handover-history-main">
                        <strong>{event.child?.name || "Child record"}</strong>
                        <p>{event.eventType === "check_in" ? "Arrival" : "Pickup"} · {event.outcome === "completed" ? "Completed" : "Refused"} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: activeBranch?.timezone || organization?.timezone || "Asia/Kolkata" }).format(new Date(event.eventAt))}</p>
                        {event.guardianName && <small>{event.eventType === "check_in" ? "Brought by" : "Collected by"} {event.guardianName}{event.relationship ? " · " + event.relationship : ""}</small>}
                        {event.personName && !event.guardianName && <small>Person recorded: {event.personName}</small>}
                        {event.outcome === "refused" && <small className="tenant-handover-refusal">Reason: {event.refusalReason?.replaceAll("_", " ").toLowerCase() || "Not authorized"}</small>}
                        {event.staffNote && <small>Staff note: {event.staffNote}</small>}
                        {event.recordedBy && <small>Recorded by {event.recordedBy}</small>}
                        {event.branch?.name && !branchId && <small>Branch: {event.branch.name}</small>}
                      </div>
                      <span className={"saas-pill " + (event.outcome === "completed" ? "success" : "denied")}>{event.outcome}</span>
                    </article>
                  ))}
                </div>
              ) : !loading && <BlankState title="No handover records in this date range" detail="Completed arrivals, pickups and refused attempts will appear here." />}
            </section>
          )}

          {activeTab === "calendar" && (
            <section className="saas-section tenant-calendar-section">
              <SectionHeading
                title="Calendar and holidays"
                description={canManageNotices
                  ? "Plan school holidays, trips, meetings, birthdays and deadlines for the selected branch."
                  : "See upcoming school events for the branches you can access."}
                action={<button type="button" className="saas-secondary-button" onClick={() => loadCalendar()} disabled={loading || saving}><MdRefresh aria-hidden="true" /> Refresh calendar</button>}
              />

              <div className="tenant-calendar-filters">
                <label>From date<input type="date" value={calendarFrom} max={calendarTo || undefined} onChange={(event) => setCalendarFrom(event.target.value)} required /></label>
                <label>To date<input type="date" value={calendarTo} min={calendarFrom || undefined} onChange={(event) => setCalendarTo(event.target.value)} required /></label>
                <div className="tenant-calendar-range-note">Up to 366 days per view. Events follow the selected school's time zone.</div>
              </div>

              {canManageNotices && (
                <form className="saas-form-card tenant-calendar-form" onSubmit={saveCalendarEvent}>
                  <div className="saas-form-heading">
                    <div>
                      <h3>{editingCalendarId ? "Edit calendar event" : "Add an event or holiday"}</h3>
                      <p>Events are shown only to the selected audience and branches with access. Changes are recorded in the audit history.</p>
                    </div>
                    {editingCalendarId && <button type="button" className="saas-secondary-button" onClick={resetCalendarEditor}>Cancel edit</button>}
                  </div>
                  {!branchId && !editingCalendarId && <div className="saas-message error" role="status"><MdErrorOutline aria-hidden="true" /><span>Choose a branch above before creating a calendar event.</span></div>}
                  <div className="saas-form-grid">
                    <label>Event title *
                      <input value={calendarDraft.title} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, title: event.target.value }))} required minLength={3} maxLength={140} placeholder="e.g. Diwali holiday" />
                    </label>
                    <label>Event type *
                      <select value={calendarDraft.type} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, type: event.target.value }))} required>
                        <option value="holiday">Holiday</option><option value="school_event">School event</option><option value="meeting">Meeting</option><option value="trip">Trip or outing</option><option value="birthday">Birthday</option><option value="deadline">Deadline</option><option value="other">Other</option>
                      </select>
                    </label>
                    <label>Who should see it? *
                      <select value={calendarDraft.audience} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, audience: event.target.value }))} required>
                        <option value="all">Everyone (staff and parents)</option><option value="staff">Staff only</option><option value="parents">Parents and guardians only</option>
                      </select>
                    </label>
                    <label>Starts *
                      <input type="datetime-local" value={calendarDraft.startsAt} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, startsAt: event.target.value }))} required />
                    </label>
                    <label>Ends *
                      <input type="datetime-local" value={calendarDraft.endsAt} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, endsAt: event.target.value }))} min={calendarDraft.startsAt || undefined} required />
                    </label>
                    <label>Location (optional)
                      <input value={calendarDraft.location} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, location: event.target.value }))} maxLength={180} placeholder="e.g. School hall" />
                    </label>
                    <label className="saas-full-width">Description (optional)
                      <textarea value={calendarDraft.description} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, description: event.target.value }))} rows="3" maxLength={3000} placeholder="What should families or staff know?" />
                    </label>
                    <label className="tenant-calendar-all-day">
                      <input type="checkbox" checked={calendarDraft.allDay} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, allDay: event.target.checked }))} />
                      <span>This is an all-day event</span>
                    </label>
                    {editingCalendarId && <label className="saas-full-width">Audit note (optional)
                      <input value={calendarDraft.reason} onChange={(event) => setCalendarDraft((draft) => ({ ...draft, reason: event.target.value }))} maxLength={500} placeholder="Reason for this change" />
                    </label>}
                  </div>
                  <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving || (!branchId && !editingCalendarId)}>{saving ? "Saving event…" : editingCalendarId ? "Save changes" : "Add event"}</button></div>
                </form>
              )}

              <div className="tenant-calendar-list-heading">
                <div><h3>Scheduled events</h3><p>{calendarEvents.length} event{calendarEvents.length === 1 ? "" : "s"} in the selected date range {loading ? "· Updating…" : ""}</p></div>
                <span className="tenant-calendar-timezone">{activeBranch?.timezone || organization?.timezone || "School local time"}</span>
              </div>

              {calendarEvents.length ? (
                <div className="tenant-calendar-list">
                  {calendarEvents.map((event) => (
                    <article className={"tenant-calendar-card" + (event.status === "cancelled" ? " cancelled" : "")} key={event.id}>
                      <div className={"tenant-calendar-date-block " + (event.type || "school_event")}>
                        <span>{new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: activeBranch?.timezone || organization?.timezone || "Asia/Kolkata" }).format(new Date(event.startsAt))}</span>
                        <strong>{new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: activeBranch?.timezone || organization?.timezone || "Asia/Kolkata" }).format(new Date(event.startsAt))}</strong>
                      </div>
                      <div className="tenant-calendar-event-info">
                        <div className="tenant-calendar-event-meta">
                          <span className={"saas-pill " + event.type}>{String(event.type || "school_event").replaceAll("_", " ")}</span>
                          <span className={"saas-pill " + event.audience}>{event.audience === "all" ? "Everyone" : event.audience === "parents" ? "Parents" : "Staff"}</span>
                          {event.status === "cancelled" && <span className="saas-pill cancelled">Cancelled</span>}
                        </div>
                        <h3>{event.title}</h3>
                        <p>{event.allDay ? "All day" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: activeBranch?.timezone || organization?.timezone || "Asia/Kolkata" }).format(new Date(event.startsAt)) + " – " + new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: activeBranch?.timezone || organization?.timezone || "Asia/Kolkata" }).format(new Date(event.endsAt))}</p>
                        {event.location && <small>Location: {event.location}</small>}
                        {event.description && <div className="tenant-calendar-description">{event.description}</div>}
                        {event.branch?.name && !branchId && <small>Branch: {event.branch.name} ({event.branch.code})</small>}
                        {event.status === "cancelled" && event.cancellationReason && <small>Cancellation note: {event.cancellationReason}</small>}
                      </div>
                      {canManageNotices && (
                        <div className="tenant-calendar-actions">
                          {event.status === "active" && <button type="button" className="saas-secondary-button" onClick={() => editCalendarEvent(event)} disabled={saving}>Edit</button>}
                          {event.status === "active"
                            ? <button type="button" className="saas-text-button danger" onClick={() => changeCalendarEventStatus(event, "cancelled")} disabled={saving}>Cancel event</button>
                            : <button type="button" className="saas-text-button" onClick={() => changeCalendarEventStatus(event, "active")} disabled={saving}>Restore</button>}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : !loading && <BlankState title="No events in this date range" detail="Try a wider range or create a holiday, meeting, trip or school event. Cancelled events appear in this list for administrators." />}
            </section>
          )}

          {activeTab === "resources" && (
            <TenantMediaLibrary organizationId={organizationId} branchId={branchId} role={role} />
          )}

          {activeTab === "notices" && (
            <section className="saas-section tenant-notices-section">
              <SectionHeading
                title="School notices"
                description={canManageNotices
                  ? "Publish announcements for the selected branch, schedule them, and archive notices that are no longer relevant."
                  : "Read current school announcements shared with staff. Notices are only visible to the branches you can access."}
                action={<button type="button" className="saas-secondary-button" onClick={() => loadNotices()} disabled={loading || saving}><MdRefresh aria-hidden="true" /> Refresh notices</button>}
              />

              {canManageNotices && (
                <form className="saas-form-card tenant-notice-form" onSubmit={saveNotice}>
                  <div className="saas-form-heading">
                    <div>
                      <h3>{editingNoticeId ? "Edit school notice" : "Publish a notice"}</h3>
                      <p>Notices appear inside this school workspace and the linked parent portal. This does not send SMS, WhatsApp, or email messages.</p>
                    </div>
                    {editingNoticeId && <button type="button" className="saas-secondary-button" onClick={resetNoticeEditor}>Cancel edit</button>}
                  </div>

                  {!branchId && !editingNoticeId && <div className="saas-message error" role="status"><MdErrorOutline aria-hidden="true" /><span>Choose a branch using the selector above before publishing a new notice.</span></div>}

                  <div className="saas-form-grid">
                    <label>Notice title *
                      <input name="title" value={noticeDraft.title} onChange={updateNoticeDraft} minLength={3} maxLength={120} required placeholder="e.g. Diwali holiday schedule" />
                    </label>
                    <label>Who should see it? *
                      <select name="audience" value={noticeDraft.audience} onChange={updateNoticeDraft} required>
                        <option value="all">Everyone (staff and parents)</option>
                        <option value="staff">Staff only</option>
                        <option value="parents">Parents and guardians only</option>
                      </select>
                    </label>
                    <label>Priority *
                      <select name="priority" value={noticeDraft.priority} onChange={updateNoticeDraft} required>
                        <option value="normal">Normal</option>
                        <option value="important">Important</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>
                    <label>Show from *
                      <input type="datetime-local" name="startsAt" value={noticeDraft.startsAt} onChange={updateNoticeDraft} required />
                    </label>
                    <label>Hide after (optional)
                      <input type="datetime-local" name="expiresAt" value={noticeDraft.expiresAt} onChange={updateNoticeDraft} min={noticeDraft.startsAt || undefined} />
                    </label>
                  </div>
                  <label className="tenant-notice-message-field">Message *
                    <textarea name="message" value={noticeDraft.message} onChange={updateNoticeDraft} rows={5} minLength={1} maxLength={3000} required placeholder="Write the message in clear, simple language. Include dates, times, and any action parents need to take." />
                  </label>
                  <label className="tenant-notice-message-field">Audit note (optional)
                    <input name="reason" value={noticeDraft.reason} onChange={updateNoticeDraft} maxLength={500} placeholder="e.g. Confirmed by school coordinator" />
                  </label>
                  <div className="saas-form-actions">
                    <button type="submit" className="saas-primary-button" disabled={saving || (!editingNoticeId && !branchId)}>
                      {saving ? "Saving notice…" : editingNoticeId ? "Save changes" : "Publish notice"}
                    </button>
                    {!editingNoticeId && <button type="button" className="saas-secondary-button" onClick={resetNoticeEditor} disabled={saving}>Clear form</button>}
                  </div>
                </form>
              )}

              <div className="tenant-notice-list-heading">
                <div><h3>{canManageNotices ? "Notice history" : "Current announcements"}</h3><p>{canManageNotices ? "Scheduled, expired, active and archived notices within your access scope." : "Only active notices currently visible to your role are listed."}</p></div>
                <span className="tenant-notice-count">{notices.length} {notices.length === 1 ? "notice" : "notices"}</span>
              </div>

              {notices.length ? (
                <div className="tenant-notice-list">
                  {notices.map((notice) => {
                    const isFuture = new Date(notice.startsAt).getTime() > Date.now();
                    const isExpired = Boolean(notice.expiresAt && new Date(notice.expiresAt).getTime() < Date.now());
                    const noticeStatus = notice.status === "archived" ? "Archived" : isFuture ? "Scheduled" : isExpired ? "Expired" : "Active";
                    return (
                      <article className={"tenant-notice-card priority-" + notice.priority + (notice.status === "archived" ? " archived" : "")} key={notice.id}>
                        <div className="tenant-notice-card-top">
                          <div className="tenant-notice-badges">
                            <span className={"tenant-notice-priority " + notice.priority}>{notice.priority}</span>
                            <span className={"saas-pill " + (notice.status === "archived" ? "archived" : noticeStatus.toLowerCase())}>{noticeStatus}</span>
                            <span className="tenant-notice-audience">{notice.audience === "parents" ? "Parents only" : notice.audience === "staff" ? "Staff only" : "Everyone"}</span>
                          </div>
                          {canManageNotices && notice.branch?.name && <small className="tenant-notice-branch">{notice.branch.name}</small>}
                        </div>
                        <h3>{notice.title}</h3>
                        <p className="tenant-notice-message">{notice.message}</p>
                        <div className="tenant-notice-meta">
                          <span>Starts {formatDate(notice.startsAt)}{notice.startsAt ? " · " + new Date(notice.startsAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          <span>{notice.expiresAt ? "Ends " + formatDate(notice.expiresAt) : "No end date"}</span>
                          {notice.createdBy?.name && <span>Posted by {notice.createdBy.name}</span>}
                        </div>
                        {canManageNotices && (
                          <div className="tenant-notice-actions">
                            <button type="button" className="saas-secondary-button" onClick={() => beginNoticeEdit(notice)} disabled={saving}>Edit</button>
                            {notice.status === "archived"
                              ? <button type="button" className="saas-secondary-button" onClick={() => changeNoticeStatus(notice, "active")} disabled={saving}>Restore</button>
                              : <button type="button" className="saas-text-button tenant-notice-archive" onClick={() => changeNoticeStatus(notice, "archived")} disabled={saving}>Archive</button>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : !loading ? (
                <BlankState
                  title={canManageNotices ? "No notices yet" : "No current notices"}
                  detail={canManageNotices
                    ? "Publish the first school notice. Choose whether it is for staff, parents, or everyone."
                    : "There are no notices visible to your role in the selected branch right now."}
                />
              ) : <div className="saas-loading" role="status">Loading school notices…</div>}
            </section>
          )}

          {activeTab === "settings" && (
            <OrganizationSettingsPanel
              organizationId={organizationId}
              branchId={branchId}
              canManageOrganization={canManageOrganization}
            />
          )}

          {activeTab === "subscription" && canManageOrganization && (
            <section className="saas-section">
              <SectionHeading title="Plan and usage" description="See your current access period and how much organization capacity is in use." action={
                <button type="button" className="saas-secondary-button" onClick={async () => {
                  setLoading(true);
                  setErrorMessage("");
                  try {
                    const data = await saasRequest("/api/saas/subscription", { organizationId });
                    setSubscriptionInfo(data);
                  } catch (error) {
                    setErrorMessage(displayError(error));
                  } finally {
                    setLoading(false);
                  }
                }}><MdRefresh /> Refresh usage</button>
              } />
              {!subscriptionInfo && loading ? <div className="saas-loading">Loading plan and usage…</div> : subscriptionInfo ? (
                <>
                  <div className={"saas-plan-status " + (subscriptionInfo.canWrite ? "writable" : "readonly")}>
                    <span className="saas-plan-status-icon">{subscriptionInfo.canWrite ? <MdCheckCircle aria-hidden="true" /> : <MdShield aria-hidden="true" />}</span>
                    <div>
                      <span className="saas-eyebrow">CURRENT PLAN</span>
                      <h2>{subscriptionInfo.plan.charAt(0).toUpperCase() + subscriptionInfo.plan.slice(1)} plan</h2>
                      <p><strong>Status:</strong> {subscriptionInfo.status.replaceAll("_", " ")}
                        {subscriptionInfo.status === "trial" && subscriptionInfo.trialEndsAt ? " · Trial ends " + formatDate(subscriptionInfo.trialEndsAt) : ""}
                        {subscriptionInfo.status === "trial" ? " · " + subscriptionInfo.trialDaysRemaining + " day(s) remaining" : ""}
                      </p>
                      <p>{subscriptionInfo.canWrite
                        ? "School changes are enabled. Plan capacities are checked by the server when new records are created."
                        : subscriptionInfo.readOnlyReason || "Your workspace is currently read-only."}</p>
                    </div>
                  </div>
                  <div className="saas-plan-usage-grid">
                    {[
                      { key: "branches", label: "Branches", detail: "Open school locations", Icon: MdApartment },
                      { key: "students", label: "Children", detail: "Registered child records", Icon: MdPeople },
                      { key: "staff", label: "Staff seats", detail: "Active staff and pending staff invitations", Icon: MdManageAccounts },
                    ].map(({ key, label, detail, Icon }) => {
                      const used = subscriptionInfo.usage[key] || 0;
                      const limit = subscriptionInfo.limits[key];
                      const percent = subscriptionInfo.usage.percentages[key] || 0;
                      return (
                        <article className="saas-plan-usage-card" key={key}>
                          <div className="saas-plan-usage-heading"><span><Icon aria-hidden="true" /></span><small>{label}</small></div>
                          <div className="saas-plan-usage-total"><strong>{used}</strong><span>of {limit.toLocaleString("en-IN")}</span></div>
                          <div className="saas-plan-usage-track" role="progressbar" aria-label={label + " usage"} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(limit, used)}><span style={{ width: percent + "%" }} /></div>
                          <p>{detail}</p>
                          <small>{subscriptionInfo.usage.remaining[key].toLocaleString("en-IN")} available</small>
                        </article>
                      );
                    })}
                  </div>
                  <div className="saas-plan-guidance">
                    <MdShield aria-hidden="true" />
                    <div>
                      <strong>What happens at a limit or after trial?</strong>
                      <p>The server prevents new branches, admissions or staff invitations from exceeding your plan. After a trial ends or a subscription becomes inactive, existing records stay available in read-only mode. To change a plan or reactivate a workspace, contact your designated platform administrator. Automated online billing is not configured in this build.</p>
                    </div>
                  </div>
                  <p className="saas-plan-disclaimer">Capacity values are the initial product defaults and should be confirmed before selling subscriptions. They are limits, not prices or a promise of service availability.</p>
                </>
              ) : <BlankState title="Plan details could not be loaded" detail="Refresh to load the subscription status and current capacity." action={<button type="button" className="saas-secondary-button" onClick={() => setRefreshVersion((value) => value + 1)}>Try again</button>} />}
            </section>
          )}

          {activeTab === "team" && (
            <section className="saas-section">
              <SectionHeading title="Team and family access" description="Invite staff or parents using a one-time link, set their access, and revoke links that should no longer work." />

              {role === "organization_owner" && (
                <form className="saas-form-card saas-owner-transfer-card" onSubmit={transferOwnership}>
                  <div className="saas-form-heading">
                    <div>
                      <h3>Transfer organization ownership</h3>
                      <p>Use this only when ownership is changing. Choose an active head-office administrator who already has access to this organization.</p>
                    </div>
                    <span className="saas-pill warning">Sensitive change</span>
                  </div>
                  <div className="saas-owner-transfer-warning">
                    <MdShield aria-hidden="true" />
                    <span>The successor becomes the organization owner with access to every branch. Your role becomes head-office administrator. Existing sign-in sessions for both accounts are revoked, and both people must sign in again.</span>
                  </div>
                  <div className="saas-form-grid">
                    <label className="saas-full-width">New owner — active head-office administrator *
                      <select value={ownerTransferDraft.targetMembershipId} onChange={(event) => setOwnerTransferDraft((draft) => ({ ...draft, targetMembershipId: event.target.value }))} required>
                        <option value="">Choose the new owner</option>
                        {members.filter((member) => member.role === "head_office_admin" && member.status === "active").map((member) => (
                          <option key={member.id} value={member.id}>{member.user.name} · {member.user.email}</option>
                        ))}
                      </select>
                    </label>
                    <label>Type organization slug to confirm *
                      <input value={ownerTransferDraft.confirmOrganizationSlug} onChange={(event) => setOwnerTransferDraft((draft) => ({ ...draft, confirmOrganizationSlug: event.target.value }))} required autoComplete="off" placeholder={organization?.slug || "organization-slug"} />
                    </label>
                    <label>Current password *
                      <input type="password" value={ownerTransferDraft.confirmPassword} onChange={(event) => setOwnerTransferDraft((draft) => ({ ...draft, confirmPassword: event.target.value }))} required autoComplete="current-password" maxLength={128} />
                    </label>
                    <label className="saas-full-width">Reason for the transfer *<textarea value={ownerTransferDraft.reason} onChange={(event) => setOwnerTransferDraft((draft) => ({ ...draft, reason: event.target.value }))} required minLength={20} maxLength={500} rows="3" placeholder="Explain who approved the transfer and why it is taking place." /></label>
                  </div>
                  <div className="saas-form-actions">
                    <button type="button" className="saas-secondary-button" onClick={() => setOwnerTransferDraft({ targetMembershipId: "", confirmOrganizationSlug: "", confirmPassword: "", reason: "" })}>Clear form</button>
                    <button type="submit" className="saas-danger-button" disabled={saving || !members.some((member) => member.role === "head_office_admin" && member.status === "active")}>{saving ? "Transferring ownership…" : "Transfer ownership"}</button>
                  </div>
                  {!members.some((member) => member.role === "head_office_admin" && member.status === "active") && <p className="saas-plan-disclaimer">No eligible successor is available. Invite and activate a head-office administrator before transferring ownership.</p>}
                </form>
              )}

              {canManagePeople && (
                <form className="saas-form-card" onSubmit={createInvitation}>
                  <div className="saas-form-heading">
                    <div><h3>Invite someone</h3><p>Each invitation expires after 72 hours and can be accepted only once. The role and branch access are checked by the server.</p></div>
                  </div>

                  <div className="saas-form-grid">
                    <label>Full name *<input value={inviteDraft.fullName} onChange={(event) => updateInvitationDraft("fullName", event.target.value)} required minLength={2} maxLength={120} /></label>
                    <label>Email address *<input type="email" value={inviteDraft.email} onChange={(event) => updateInvitationDraft("email", event.target.value)} required maxLength={254} placeholder="person@example.com" /></label>
                    <label>Access role *
                      <select value={inviteDraft.role} onChange={(event) => changeInvitationRole(event.target.value)} required>
                        {(role === "branch_admin" ? [
                          ["teacher", "Teacher"], ["admissions", "Admissions staff"], ["transport_staff", "Transport staff"], ["parent", "Parent / guardian"],
                        ] : [
                          ["head_office_admin", "Head-office administrator"], ["branch_admin", "Branch administrator"],
                          ["admissions", "Admissions staff"], ["teacher", "Teacher"], ["accountant", "Accountant"],
                          ["hr_manager", "HR manager"], ["transport_staff", "Transport staff"], ["parent", "Parent / guardian"],
                        ]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>

                  {inviteDraft.role === "parent" ? (
                    <div className="saas-invite-selector">
                      <div><h4>Link existing family contact(s) *</h4><p>The invitation email must match every selected guardian record. Parents will only see children connected to these specific contacts.</p></div>
                      {!branchId ? <div className="saas-invite-empty">Choose a branch from the top of the page to load its family contacts.</div> :
                        availableGuardianContacts.filter((guardian) => guardian.email).length ? (
                          <div className="saas-invite-choice-list">
                            {availableGuardianContacts.filter((guardian) => guardian.email).map((guardian) => (
                              <label key={guardian.id} className="saas-invite-choice">
                                <input type="checkbox" checked={inviteDraft.guardianIds.includes(guardian.id)} onChange={(event) => toggleInviteGuardian(guardian, event.target.checked)} />
                                <span><strong>{guardian.name}</strong><small>{guardian.relationship} · {guardian.childName}</small><small>{guardian.email}{guardian.phone ? " · " + guardian.phone : ""}</small></span>
                                {guardian.primaryContact && <span className="saas-pill">Primary contact</span>}
                              </label>
                            ))}
                          </div>
                        ) : <div className="saas-invite-empty">No contacts with email addresses are available for this branch. Add or correct the family email in the child record first.</div>
                      }
                    </div>
                  ) : (
                    <div className="saas-invite-selector">
                      <div><h4>Branch access *</h4><p>Only selected branches will be available after sign-in. Select one or more branches this person actually works in.</p></div>
                      <div className="saas-invite-choice-list">
                        {branches.map((branch) => (
                          <label key={branch.id || branch._id} className="saas-invite-choice">
                            <input type="checkbox" checked={inviteDraft.branchIds.includes(String(branch.id || branch._id))} onChange={(event) => toggleInviteBranch(String(branch.id || branch._id), event.target.checked)} />
                            <span><strong>{branch.name}</strong><small>{branch.code} · {branch.address?.city || "Location not added"}</small></span>
                          </label>
                        ))}
                        {!branches.length && <div className="saas-invite-empty">No accessible branch is available to assign.</div>}
                      </div>
                    </div>
                  )}

                  {inviteDraft.role === "teacher" && (
                    <div className="saas-invite-selector">
                      <div><h4>Assigned classes *</h4><p>Teachers can view and record attendance only for the classes assigned here. Choose at least one class.</p></div>
                      {!branchId ? <div className="saas-invite-empty">Choose a branch from the top of the page to load its class list.</div> : classes.length ? (
                        <div className="saas-invite-class-grid">
                          {classes.map((classItem) => (
                            <label key={classItem.name} className="saas-invite-class-option"><input type="checkbox" checked={inviteDraft.classNames.includes(classItem.name)} onChange={(event) => toggleInviteClass(classItem.name, event.target.checked)} /><span>{classItem.name}</span></label>
                          ))}
                        </div>
                      ) : <div className="saas-invite-empty">No class list available. Choose a branch or check the school's configured classes.</div>}
                    </div>
                  )}

                  <div className="saas-invite-note"><MdShield aria-hidden="true" /><span>Do not invite a person to a role or branch they do not need. Parents require an existing guardian record with a matching email address. Teachers are limited to the classes selected above.</span></div>
                  <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving || !branches.length}>{saving ? "Creating invitation…" : "Create invitation"}</button></div>
                  {invitationUrl && (
                    <div className="saas-invite-link-panel" role="status">
                      <div><strong>Share this one-time invitation link</strong><p>Email is not configured or could not send. Share the link only with the person named in the invitation.</p></div>
                      <textarea readOnly value={invitationUrl} rows={3} aria-label="One-time invitation link" onFocus={(event) => event.target.select()} />
                      <div className="saas-form-actions"><button type="button" className="saas-secondary-button" onClick={copyInvitationUrl}>Copy link</button><a className="saas-secondary-button" href={invitationUrl} target="_blank" rel="noopener noreferrer">Preview invite</a></div>
                    </div>
                  )}
                </form>
              )}

              <SectionHeading title="Invitations" description="Pending invitations can be revoked immediately. Used and expired invitations remain listed for accountability." />
              {invitations.length ? (
                <div className="saas-table-wrap"><table className="saas-table">
                  <thead><tr><th>Person</th><th>Access role</th><th>Branch / classes</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead>
                  <tbody>{invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td><strong>{invitation.fullName}</strong><small>{invitation.email}</small></td>
                      <td>{String(invitation.role).replaceAll("_", " ")}</td>
                      <td>{invitation.role === "teacher" ? (invitation.classNames || []).join(", ") : (invitation.branches || []).map((item) => item.name || String(item)).join(", ") || "Assigned family links"}</td>
                      <td><span className={"saas-pill " + invitation.status}>{invitation.status}</span><small>{invitation.deliveryStatus === "sent" ? "Email sent" : invitation.deliveryStatus === "failed" ? "Manual link required" : invitation.deliveryStatus}</small></td>
                      <td>{formatDate(invitation.expiresAt)}</td>
                      <td>{invitation.status === "pending" ? <button type="button" className="saas-secondary-button" disabled={saving} onClick={() => revokeInvitation(invitation)}>Revoke</button> : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : <BlankState title="No invitations yet" detail="Create the first invitation above. Each link is one-time and expires after 72 hours." />}

              {role === "branch_admin" ? (
                <div className="saas-security-panel"><MdShield aria-hidden="true" /><div><strong>Branch-limited administration</strong><p>You can invite or revoke access only for branches assigned to your account. Organization-wide member and audit details are reserved for the owner and head office.</p></div></div>
              ) : (
                <>
                  <SectionHeading title="Organization members" description="Review who can use this workspace, and update access when responsibilities change." />
              {editingMemberId && memberEditDraft && (() => {
                const member = members.find((item) => item.id === editingMemberId);
                if (!member) return null;
                const roleOptions = role === "organization_owner"
                  ? [
                    ["head_office_admin", "Head-office administrator"],
                    ["branch_admin", "Branch administrator"],
                    ["admissions", "Admissions staff"],
                    ["teacher", "Teacher"],
                    ["accountant", "Accountant"],
                    ["hr_manager", "HR manager"],
                    ["transport_staff", "Transport staff"],
                  ]
                  : role === "head_office_admin"
                    ? [
                      ["branch_admin", "Branch administrator"],
                      ["admissions", "Admissions staff"],
                      ["teacher", "Teacher"],
                      ["accountant", "Accountant"],
                      ["hr_manager", "HR manager"],
                      ["transport_staff", "Transport staff"],
                    ]
                    : [
                      ["teacher", "Teacher"],
                      ["admissions", "Admissions staff"],
                      ["transport_staff", "Transport staff"],
                    ];
                const editingParent = member.role === "parent";
                return (
                  <form className="saas-form-card" onSubmit={saveMemberAccess}>
                    <div className="saas-form-heading">
                      <div><h3>Update access for {member.user.name}</h3><p>Changes are saved on the server and added to the organization audit history.</p></div>
                      <span className={"saas-pill " + member.status}>{member.status}</span>
                    </div>
                    {editingParent ? (
                      <>
                        <div className="saas-security-panel"><MdShield aria-hidden="true" /><div><strong>Verified family link</strong><p>Parent access stays linked to the guardian records used for the invitation. This screen can suspend or restore access but cannot change family links or turn a parent into a staff account.</p></div></div>
                        <div className="saas-form-grid">
                          <label>Account status *
                            <select value={memberEditDraft.status} onChange={(event) => setMemberEditDraft((draft) => ({ ...draft, status: event.target.value }))} required>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                            </select>
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="saas-form-grid">
                          <label>Access role *
                            <select value={memberEditDraft.role} onChange={(event) => changeMemberRole(event.target.value)} required>
                              {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>Account status *
                            <select value={memberEditDraft.status} onChange={(event) => setMemberEditDraft((draft) => ({ ...draft, status: event.target.value }))} required>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                            </select>
                          </label>
                        </div>
                        {role === "organization_owner" && memberEditDraft.role === "head_office_admin" && (
                          <div className="saas-consent-checks">
                            <label><input type="checkbox" checked={memberEditDraft.accessAllBranches} onChange={(event) => setMemberEditDraft((draft) => ({
                              ...draft,
                              accessAllBranches: event.target.checked,
                              branchIds: event.target.checked ? [] : branches.map((item) => String(item.id || item._id)),
                            }))} /> Can access every branch in this organization</label>
                          </div>
                        )}
                        {!memberEditDraft.accessAllBranches && (
                          <div className="saas-invite-selector">
                            <div><h4>Assigned branches *</h4><p>Only these branches are available to this person after sign-in.</p></div>
                            <div className="saas-invite-choice-list">
                              {branches.map((branch) => {
                                const id = String(branch.id || branch._id);
                                return (
                                  <label key={id} className="saas-invite-choice">
                                    <input type="checkbox" checked={memberEditDraft.branchIds.includes(id)} onChange={(event) => toggleMemberBranch(id, event.target.checked)} />
                                    <span><strong>{branch.name}</strong><small>{branch.code} · {branch.address?.city || "Location not added"}</small></span>
                                  </label>
                                );
                              })}
                              {!branches.length && <div className="saas-invite-empty">No branch is available within your own access scope.</div>}
                            </div>
                          </div>
                        )}
                        {memberEditDraft.role === "teacher" && (
                          <div className="saas-invite-selector">
                            <div><h4>Assigned classes *</h4><p>Class choices are limited to names that exist and are active in every branch selected above.</p></div>
                            {memberEditClassOptions.length ? (
                              <div className="saas-invite-class-grid">
                                {memberEditClassOptions.map((className) => (
                                  <label key={className} className="saas-invite-class-option">
                                    <input type="checkbox" checked={memberEditDraft.classNames.includes(className)} onChange={(event) => toggleMemberClass(className, event.target.checked)} />
                                    <span>{className}</span>
                                  </label>
                                ))}
                              </div>
                            ) : <div className="saas-invite-empty">Choose one or more branches with configured active classes. The class list must be compatible across all selected branches.</div>}
                          </div>
                        )}
                      </>
                    )}
                    <label className="saas-member-reason">Reason for this access change *
                      <textarea value={memberEditDraft.reason} onChange={(event) => setMemberEditDraft((draft) => ({ ...draft, reason: event.target.value }))} rows="2" minLength={3} maxLength={500} required placeholder="e.g. Teacher moved to the junior classes from this term" />
                    </label>
                    <div className="saas-form-actions">
                      <button type="button" className="saas-secondary-button" onClick={cancelMemberEdit}>Cancel</button>
                      <button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Saving access…" : "Save access"}</button>
                    </div>
                  </form>
                );
              })()}
              {members.length ? <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branches / classes</th><th>Status</th><th>Access</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.user.name}</strong></td><td>{member.user.email}</td><td>{member.role.replaceAll("_", " ")}</td><td>{member.accessAllBranches ? "All branches" : member.branches.map((item) => item.name).join(", ") || "No branch assigned"}{member.role === "teacher" && member.classNames?.length ? <small>Classes: {member.classNames.join(", ")}</small> : null}</td><td><span className={"saas-pill " + member.status}>{member.status}</span></td><td>{canEditMember(member) ? <button type="button" className="saas-secondary-button saas-member-edit-button" onClick={() => beginMemberEdit(member)}>Edit access</button> : <span className="saas-muted-note">{member.role === "organization_owner" ? "Owner" : member.id === activeMembership?.id ? "Your account" : "Managed by owner"}</span>}</td></tr>)}</tbody></table></div> : <p className="saas-muted-note">No member list is available yet.</p>}
              <SectionHeading title="Recent activity" description="Recent organization actions are recorded here for accountability." />
                  {auditEvents.length ? <div className="saas-audit-list">{auditEvents.map((event) => <article className="saas-audit-row" key={event._id}><span className="saas-audit-icon"><MdHistory /></span><div><strong>{event.summary || event.action}</strong><p>{event.action} · {event.resourceType}{event.branchId?.name ? " · " + event.branchId.name : ""}</p><small>{event.actorUserId?.username || "System"} · {formatDate(event.createdAt)}</small>{event.reason && <p>Reason: {event.reason}</p>}</div><span className={"saas-pill " + (event.outcome || "success")}>{event.outcome || "success"}</span></article>)}</div> : <BlankState title="No audit events yet" detail="Organization creation, invitations, branch creation and attendance/finance actions will appear here." />}
                </>
              )}
            </section>
          )}
        </div>
        <footer className="saas-footer"><span>{organization?.name || "Preschool"}{activeBranch ? " · " + activeBranch.name : " · All branches"}</span><span>Keep child information private. Share access only with authorized staff.</span></footer>
      </main>

      {healthTarget && canEditChildHealth && (
        <div className="saas-modal-backdrop saas-health-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHealthProfile(); }}>
          <section className="saas-modal saas-health-modal" role="dialog" aria-modal="true" aria-labelledby="saas-health-modal-title">
            <div className="saas-modal-header">
              <div>
                <span className="saas-eyebrow">RESTRICTED CHILD RECORD</span>
                <h2 id="saas-health-modal-title">Health &amp; emergency profile</h2>
                <p>{healthTarget.fullName} · {healthTarget.className} · {healthTarget.admissionNumber}</p>
              </div>
              <button type="button" className="saas-icon-button" onClick={closeHealthProfile} aria-label="Close health profile"><MdClose /></button>
            </div>

            <div className="saas-health-modal-body">
              {(healthError || healthSuccess) && (
                <div className={"saas-message " + (healthError ? "error" : "success")} role={healthError ? "alert" : "status"}>
                  {healthError ? <MdErrorOutline aria-hidden="true" /> : <MdCheckCircle aria-hidden="true" />}
                  <span>{healthError || healthSuccess}</span>
                  <button type="button" onClick={() => { setHealthError(""); setHealthSuccess(""); }} aria-label="Dismiss message"><MdClose /></button>
                </div>
              )}

              <div className="saas-health-privacy-note">
                <MdShield aria-hidden="true" />
                <div>
                  <strong>Keep this information private and current.</strong>
                  <p>The full profile is visible only to authorized school administrators and admissions staff. Assigned teachers can see allergy, dietary and emergency-care notes only; they do not receive doctor contacts, general medical notes or medication details in the attendance roster.</p>
                </div>
              </div>

              {healthLoading ? <div className="saas-loading" role="status">Loading private health details…</div> : (
                <form className="saas-health-form" onSubmit={saveHealthProfile}>
                  <section className="saas-health-section">
                    <div className="saas-health-section-heading">
                      <div><h3>Allergies</h3><p>Record the reaction, severity and action staff should follow.</p></div>
                      <button type="button" className="saas-secondary-button" disabled={healthDraft.allergies.length >= 20} onClick={() => addHealthArrayItem("allergies")}><MdAdd /> Add allergy</button>
                    </div>
                    {healthDraft.allergies.map((item, index) => (
                      <div className="saas-health-entry" key={"allergy-" + index}>
                        <div className="saas-health-entry-top"><strong>Allergy {index + 1}</strong><button type="button" className="saas-text-button" onClick={() => removeHealthArrayItem("allergies", index)} aria-label={"Remove allergy " + (index + 1)}>Remove</button></div>
                        <div className="saas-health-grid">
                          <label>Allergen<input value={item.name} onChange={(event) => updateHealthArray("allergies", index, "name", event.target.value)} maxLength={120} placeholder="e.g. Peanuts" /></label>
                          <label>Severity<select value={item.severity || "unknown"} onChange={(event) => updateHealthArray("allergies", index, "severity", event.target.value)}><option value="unknown">Not assessed</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></label>
                          <label className="saas-health-full">Reaction<input value={item.reaction} onChange={(event) => updateHealthArray("allergies", index, "reaction", event.target.value)} maxLength={500} placeholder="What happens if the child is exposed?" /></label>
                          <label className="saas-health-full">Emergency action<textarea value={item.emergencyAction} onChange={(event) => updateHealthArray("allergies", index, "emergencyAction", event.target.value)} rows="2" maxLength={500} placeholder="Approved action and who to contact" /></label>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="saas-health-section">
                    <div className="saas-health-section-heading">
                      <div><h3>Medication information</h3><p>Keeping a medicine on file does not authorize school staff to administer it.</p></div>
                      <button type="button" className="saas-secondary-button" disabled={healthDraft.medications.length >= 20} onClick={() => addHealthArrayItem("medications")}><MdAdd /> Add medicine</button>
                    </div>
                    <div className="saas-health-caution"><strong>Safety rule:</strong> To mark that a medicine may be given at school, you must confirm parent/guardian authorization, dosage and written instructions. Follow your school’s medication policy and applicable emergency guidance.</div>
                    {healthDraft.medications.map((item, index) => (
                      <div className="saas-health-entry" key={"medication-" + index}>
                        <div className="saas-health-entry-top"><strong>Medicine {index + 1}</strong><button type="button" className="saas-text-button" onClick={() => removeHealthArrayItem("medications", index)} aria-label={"Remove medication " + (index + 1)}>Remove</button></div>
                        <div className="saas-health-grid">
                          <label>Medicine name<input value={item.name} onChange={(event) => updateHealthArray("medications", index, "name", event.target.value)} maxLength={120} placeholder="Medicine name" /></label>
                          <label>Dosage (as documented)<input value={item.dosage} onChange={(event) => updateHealthArray("medications", index, "dosage", event.target.value)} maxLength={100} placeholder="Record the approved dosage" /></label>
                          <label>Start date<input type="date" value={item.startDate || ""} onChange={(event) => updateHealthArray("medications", index, "startDate", event.target.value)} /></label>
                          <label>End date<input type="date" value={item.endDate || ""} onChange={(event) => updateHealthArray("medications", index, "endDate", event.target.value)} /></label>
                          <label className="saas-health-full">Instructions<input value={item.instructions} onChange={(event) => updateHealthArray("medications", index, "instructions", event.target.value)} maxLength={500} placeholder="Exact written instructions" /></label>
                        </div>
                        <div className="saas-health-checks">
                          <label><input type="checkbox" checked={Boolean(item.administerAtSchool)} onChange={(event) => updateHealthArray("medications", index, "administerAtSchool", event.target.checked)} /> School staff may administer this medicine</label>
                          <label><input type="checkbox" checked={Boolean(item.parentAuthorizationRecorded)} onChange={(event) => updateHealthArray("medications", index, "parentAuthorizationRecorded", event.target.checked)} /> Parent/guardian authorization is on file</label>
                        </div>
                        <label className="saas-health-field">Authorization note (optional)<input value={item.authorizationNotes} onChange={(event) => updateHealthArray("medications", index, "authorizationNotes", event.target.value)} maxLength={500} placeholder="Where the written authorization is recorded" /></label>
                      </div>
                    ))}
                  </section>

                  <section className="saas-health-section">
                    <div className="saas-health-section-heading">
                      <div><h3>Dietary restrictions</h3><p>Include food restrictions and any safe handling details.</p></div>
                      <button type="button" className="saas-secondary-button" disabled={healthDraft.dietaryRestrictions.length >= 20} onClick={() => addHealthArrayItem("dietaryRestrictions")}><MdAdd /> Add restriction</button>
                    </div>
                    {healthDraft.dietaryRestrictions.map((item, index) => (
                      <div className="saas-health-entry" key={"diet-" + index}>
                        <div className="saas-health-entry-top"><strong>Restriction {index + 1}</strong><button type="button" className="saas-text-button" onClick={() => removeHealthArrayItem("dietaryRestrictions", index)} aria-label={"Remove dietary restriction " + (index + 1)}>Remove</button></div>
                        <div className="saas-health-grid">
                          <label>Restriction<input value={item.name} onChange={(event) => updateHealthArray("dietaryRestrictions", index, "name", event.target.value)} maxLength={120} placeholder="e.g. Dairy-free" /></label>
                          <label>Details<input value={item.details} onChange={(event) => updateHealthArray("dietaryRestrictions", index, "details", event.target.value)} maxLength={500} placeholder="Food to avoid or safe alternative" /></label>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="saas-health-section">
                    <div className="saas-health-section-heading"><div><h3>Care and emergency instructions</h3><p>Keep instructions short, clear and useful during an urgent situation.</p></div></div>
                    <div className="saas-health-grid">
                      <label className="saas-health-full">Special care instructions<textarea value={healthDraft.specialCareInstructions} onChange={(event) => setHealthDraft((draft) => ({ ...draft, specialCareInstructions: event.target.value }))} rows="3" maxLength={1500} placeholder="Care needs relevant to the school day" /></label>
                      <label className="saas-health-full">Emergency instructions<textarea value={healthDraft.emergencyInstructions} onChange={(event) => setHealthDraft((draft) => ({ ...draft, emergencyInstructions: event.target.value }))} rows="3" maxLength={1500} placeholder="Actions to take and who to contact" /></label>
                      <label>Doctor / clinic name<input value={healthDraft.physicianName} onChange={(event) => setHealthDraft((draft) => ({ ...draft, physicianName: event.target.value }))} maxLength={120} /></label>
                      <label>Doctor / clinic phone<input type="tel" value={healthDraft.physicianPhone} onChange={(event) => setHealthDraft((draft) => ({ ...draft, physicianPhone: event.target.value }))} maxLength={30} placeholder="+91 ..." /></label>
                      <label className="saas-health-full">Additional medical notes (restricted)<textarea value={healthDraft.medicalNotes} onChange={(event) => setHealthDraft((draft) => ({ ...draft, medicalNotes: event.target.value }))} rows="3" maxLength={2000} placeholder="Only include information needed for safe school care." /></label>
                    </div>
                  </section>

                  <div className="saas-health-form-actions">
                    <span>Changes are saved to the audit history without copying the medical details into the audit log.</span>
                    <div><button type="button" className="saas-secondary-button" onClick={closeHealthProfile}>Close</button><button type="submit" className="saas-primary-button" disabled={healthSaving}>{healthSaving ? "Saving secure profile…" : "Save health profile"}</button></div>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {paymentTarget && (
        <div className="saas-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentTarget(null); }}>
          <section className="saas-modal" role="dialog" aria-modal="true" aria-labelledby="saas-payment-modal-title">
            <div className="saas-modal-header"><div><h2 id="saas-payment-modal-title">{paymentTarget.type === "refund-select" ? "Select a payment to refund" : paymentTarget.type === "refund" ? "Record a refund" : "Record a payment"}</h2><p>{paymentTarget.invoice.invoiceNumber} · {paymentTarget.invoice.child?.name}</p></div><button type="button" className="saas-icon-button" onClick={() => setPaymentTarget(null)} aria-label="Close"><MdClose /></button></div>
            {paymentTarget.type === "refund-select" ? (
              <div className="saas-refund-choices">{paymentTarget.invoice.transactions.filter((txn) => txn.type === "payment").map((txn) => {
                const alreadyRefunded = paymentTarget.invoice.transactions.filter((other) => other.type === "refund" && other.relatedTransactionId === txn.id).reduce((sum, other) => sum + other.amount, 0);
                const refundable = Math.max(0, txn.amount - alreadyRefunded);
                return <button type="button" className="saas-refund-choice" key={txn.id} disabled={refundable <= 0} onClick={() => openPayment(paymentTarget.invoice, "refund", { ...txn, amount: refundable })}><span><strong>{txn.receiptNumber}</strong><small>{formatDate(txn.transactionAt)} · {txn.method.replaceAll("_", " ")}</small></span><strong>{formatMoney(refundable, currency)} available to refund</strong></button>;
              })}</div>
            ) : (
              <form onSubmit={recordTransaction} className="saas-modal-form">
                <div className="saas-payment-balance"><span>{paymentTarget.type === "refund" ? "Original receipt amount" : "Outstanding balance"}</span><strong>{formatMoney(paymentTarget.type === "refund" ? paymentTarget.originalTransaction?.amount : paymentTarget.invoice.outstanding, currency)}</strong></div>
                <label>Amount (₹) *<input type="number" min="0.01" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))} required /></label>
                <label>Payment method *<select value={paymentDraft.method} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, method: event.target.value }))} required><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="online">Online</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
                <label>Payment reference (optional)<input value={paymentDraft.reference} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, reference: event.target.value }))} maxLength={160} placeholder="UPI / bank reference number" /></label>
                {paymentTarget.type === "refund" && <label>Reason for refund *<textarea value={paymentDraft.reason} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, reason: event.target.value }))} required minLength={3} maxLength={500} rows="3" /></label>}
                <p className="saas-modal-safety">This creates a numbered, permanent ledger entry. If something was entered incorrectly, use a correction/refund workflow rather than deleting the transaction.</p>
                <div className="saas-form-actions"><button type="button" className="saas-secondary-button" onClick={() => setPaymentTarget(null)}>Cancel</button><button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Saving…" : paymentTarget.type === "refund" ? "Record refund" : "Record payment"}</button></div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
