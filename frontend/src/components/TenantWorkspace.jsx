import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  MdSchool, MdLogout, MdDashboard, MdPeople, MdFactCheck, MdCurrencyRupee,
  MdApartment, MdManageAccounts, MdSearch, MdRefresh, MdAdd, MdArrowForward,
  MdCheckCircle, MdErrorOutline, MdCalendarMonth, MdReceiptLong, MdHistory,
  MdShield, MdClose, MdExpandMore,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../invitations.css";
import "../class-config.css";

const TABS = [
  { id: "overview", label: "Overview", Icon: MdDashboard },
  { id: "children", label: "Children", Icon: MdPeople },
  { id: "attendance", label: "Attendance", Icon: MdFactCheck },
  { id: "fees", label: "Fees & payments", Icon: MdCurrencyRupee },
  { id: "classes", label: "Classes & fees", Icon: MdSchool },
  { id: "branches", label: "Branches", Icon: MdApartment },
  { id: "team", label: "Team & activity", Icon: MdManageAccounts },
];

const todayLocal = () => {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
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

const displayError = (error) => error?.response?.data?.message || "Something went wrong. Please try again.";
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
  const visibleTabs = TABS.filter((item) => {
    if (item.id === 'overview') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'accountant', 'teacher', 'hr_manager', 'transport_staff'].includes(role);
    if (item.id === 'children') return ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'].includes(role);
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
  const [classes, setClasses] = useState([]);
  const [children, setChildren] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [members, setMembers] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
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
  const [childDraft, setChildDraft] = useState({
    firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "",
    className: "", academicYear: academicYearNow(), address: "",
    guardianName: "", guardianPhone: "", guardianEmail: "", guardianRelationship: "mother",
    guardianPickup: true, communicationConsent: false, photoConsent: false,
  });
  const [branchDraft, setBranchDraft] = useState({ name: "", code: "", phone: "", email: "", city: "", state: "", postalCode: "" });
  const [classDraft, setClassDraft] = useState({ name: "", code: "", minAgeMonths: "", maxAgeMonths: "", defaultFee: "0", feeFrequency: "annual", capacity: "30", description: "", status: "active" });
  const [editingClassId, setEditingClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayLocal);
  const [attendanceClass, setAttendanceClass] = useState("");
  const [attendanceRows, setAttendanceRows] = useState([]);
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
          await Promise.all([loadClasses(), loadChildren(appliedQuery)]);
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
                status: saved?.status || "",
                reason: saved?.reason || "",
              };
            }));
          }
        } else if (activeTab === "fees") {
          if (!branchId) return;
          await Promise.all([loadClasses(), loadChildren(""), loadInvoices()]);
        } else if (activeTab === "team") {
          await Promise.all([loadBranches(), loadMembersAndAudit(), branchId ? loadChildren("") : Promise.resolve([]), branchId ? loadClasses() : Promise.resolve([])]);
        } else if (activeTab === "overview") {
          const data = await saasRequest("/api/saas/operations/summary", { organizationId, branchId });
          if (active) setSummary(data);
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
    refreshVersion, loadBranches, loadClasses, loadChildren, loadInvoices, loadMembersAndAudit,
  ]);

  useEffect(() => {
    if (!paymentTarget) return;
    setPaymentDraft({ amount: "", method: "cash", reference: "", type: "payment", relatedTransactionId: "", reason: "" });
  }, [paymentTarget]);

  const changeOrganization = (nextId) => {
    setOrganizationId(nextId);
    const membership = memberships.find((item) => item.organization.id === nextId);
    setBranchId(membership?.accessAllBranches ? "" : membership?.branchIds?.[0]?.id || "");
    setBranches([]);
    setSummary(null);
    setChildren([]);
    setInvoices([]);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const changeBranch = (nextId) => {
    setBranchId(nextId);
    setSummary(null);
    setChildren([]);
    setInvoices([]);
    setAttendanceRows([]);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setErrorMessage("");
    setRefreshVersion((version) => version + 1);
  };

  const updateChildDraft = (event) => setChildDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
  const saveChild = async (event) => {
    event.preventDefault();
    if (!organizationId || !branchId) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const payload = {
      firstName: childDraft.firstName,
      middleName: childDraft.middleName,
      lastName: childDraft.lastName,
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
        isBillingContact: true,
        isEmergencyContact: true,
        authorizedPickup: childDraft.guardianPickup,
        receivesSchoolUpdates: true,
        preferredLanguage: "en",
        consent: {
          schoolCommunication: childDraft.communicationConsent ? "granted" : "unknown",
          photoUse: childDraft.photoConsent ? "granted" : "unknown",
        },
      }],
    };
    try {
      const result = await saasRequest("/api/saas/operations/children", {
        method: "POST", data: payload, organizationId, branchId,
      });
      setChildDraft({
        firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "",
        className: classes[0]?.name || "", academicYear: academicYearNow(), address: "",
        guardianName: "", guardianPhone: "", guardianEmail: "", guardianRelationship: "mother",
        guardianPickup: true, communicationConsent: false, photoConsent: false,
      });
      setShowChildForm(false);
      setSuccessMessage(result.message || "Child registered.");
      setErrorMessage("");
      setRefreshVersion((version) => version + 1);
      await loadChildren(appliedQuery);
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
        return { childId: child.id, name: child.fullName, admissionNumber: child.admissionNumber, status: saved?.status || "", reason: saved?.reason || "" };
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
                action={<button type="button" className="saas-primary-button" onClick={() => { setShowChildForm((show) => !show); setChildDraft((draft) => ({ ...draft, className: draft.className || classes[0]?.name || "" })); }}><MdAdd /> {showChildForm ? "Close form" : "Register a child"}</button>}
              />
              {needBranch ? <BlankState title="Choose a branch first" detail="Select a branch from the top of the page to open its child records." /> : (
                <>
                  {showChildForm && (
                    <form className="saas-form-card" onSubmit={saveChild}>
                      <div className="saas-form-heading"><div><h3>New child admission</h3><p>Start with the child and one parent or guardian contact. More details can be added later.</p></div></div>
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
                      <div className="saas-form-subheading"><h4>Parent or guardian</h4><p>This contact is the primary contact and billing contact. You can add more guardians later.</p></div>
                      <div className="saas-form-grid">
                        <label>Guardian's full name *<input name="guardianName" value={childDraft.guardianName} onChange={updateChildDraft} required maxLength={120} /></label>
                        <label>Mobile number *<input type="tel" name="guardianPhone" value={childDraft.guardianPhone} onChange={updateChildDraft} required maxLength={24} placeholder="+91 98765 43210" /></label>
                        <label>Email address<input type="email" name="guardianEmail" value={childDraft.guardianEmail} onChange={updateChildDraft} maxLength={254} /></label>
                        <label>Relationship<select name="guardianRelationship" value={childDraft.guardianRelationship} onChange={updateChildDraft}><option value="mother">Mother</option><option value="father">Father</option><option value="guardian">Guardian</option><option value="grandparent">Grandparent</option><option value="other">Other</option></select></label>
                      </div>
                      <div className="saas-consent-checks">
                        <label><input type="checkbox" checked={childDraft.guardianPickup} onChange={(event) => setChildDraft((draft) => ({ ...draft, guardianPickup: event.target.checked }))} /> Authorized to pick up child</label>
                        <label><input type="checkbox" checked={childDraft.communicationConsent} onChange={(event) => setChildDraft((draft) => ({ ...draft, communicationConsent: event.target.checked }))} /> Consent for school communications recorded</label>
                        <label><input type="checkbox" checked={childDraft.photoConsent} onChange={(event) => setChildDraft((draft) => ({ ...draft, photoConsent: event.target.checked }))} /> Consent for school photo use recorded</label>
                      </div>
                      <div className="saas-form-actions"><button type="button" className="saas-secondary-button" onClick={() => setShowChildForm(false)}>Cancel</button><button type="submit" className="saas-primary-button" disabled={saving}>{saving ? "Saving child…" : "Save child record"}</button></div>
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
                    <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Child</th><th>Admission number</th><th>Class / year</th><th>Parent or guardian</th><th>Mobile</th><th>Record updated</th></tr></thead><tbody>
                      {children.map((child) => (
                        <tr key={child.id}><td><strong>{child.fullName || "—"}</strong><small>{child.dateOfBirth ? "DOB " + formatDate(child.dateOfBirth) : "Date of birth not set"}</small></td><td>{child.admissionNumber}</td><td>{child.className}<small>{child.academicYear}</small></td><td>{child.guardians?.find((item) => item.primaryContact)?.name || child.guardians?.[0]?.name || "—"}<small>{child.guardians?.[0]?.relationship || ""}</small></td><td>{child.guardians?.find((item) => item.primaryContact)?.phone || child.guardians?.[0]?.phone || "—"}</td><td>{formatDate(child.updatedAt)}</td></tr>
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
                            <div className="saas-ledger-row" key={txn.id}><div><strong>{txn.type === "payment" ? "Payment received" : "Refund"}</strong><small>{txn.receiptNumber} · {formatDate(txn.transactionAt)} · {txn.method.replaceAll("_", " ")}</small>{txn.reason && <small>{txn.reason}</small>}</div><strong className={txn.type === "refund" ? "is-due" : "is-paid"}>{txn.type === "refund" ? "−" : "+"}{formatMoney(txn.amount, currency)}</strong>
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

          {activeTab === "team" && (
            <section className="saas-section">
              <SectionHeading title="Team and family access" description="Invite staff or parents using a one-time link, set their access, and revoke links that should no longer work." />

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
                  <SectionHeading title="Organization members" description="Current active and invited members of this organization." />
                  {members.length ? <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branches / classes</th><th>Status</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.user.name}</strong></td><td>{member.user.email}</td><td>{member.role.replaceAll("_", " ")}</td><td>{member.accessAllBranches ? "All branches" : member.branches.map((item) => item.name).join(", ") || "No branch assigned"}{member.role === "teacher" && member.classNames?.length ? <small>Classes: {member.classNames.join(", ")}</small> : null}</td><td><span className={"saas-pill " + member.status}>{member.status}</span></td></tr>)}</tbody></table></div> : <p className="saas-muted-note">No member list is available yet.</p>}
                  <SectionHeading title="Recent activity" description="Recent organization actions are recorded here for accountability." />
                  {auditEvents.length ? <div className="saas-audit-list">{auditEvents.map((event) => <article className="saas-audit-row" key={event._id}><span className="saas-audit-icon"><MdHistory /></span><div><strong>{event.summary || event.action}</strong><p>{event.action} · {event.resourceType}{event.branchId?.name ? " · " + event.branchId.name : ""}</p><small>{event.actorUserId?.username || "System"} · {formatDate(event.createdAt)}</small>{event.reason && <p>Reason: {event.reason}</p>}</div><span className={"saas-pill " + (event.outcome || "success")}>{event.outcome || "success"}</span></article>)}</div> : <BlankState title="No audit events yet" detail="Organization creation, invitations, branch creation and attendance/finance actions will appear here." />}
                </>
              )}
            </section>
          )}
        </div>
        <footer className="saas-footer"><span>{organization?.name || "Preschool"}{activeBranch ? " · " + activeBranch.name : " · All branches"}</span><span>Keep child information private. Share access only with authorized staff.</span></footer>
      </main>

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
