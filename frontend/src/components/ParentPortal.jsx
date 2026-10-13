import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { MdSchool, MdLogout, MdDashboard, MdPeople, MdFactCheck, MdCurrencyRupee, MdRefresh, MdShield, MdCalendarMonth, MdArrowForward, MdErrorOutline, MdCheckCircle, MdCampaign, MdHistory } from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../parent-portal.css";
import "../tenant-notices.css";
import "../tenant-calendar.css";
import "../tenant-handover.css";

const PARENT_TABS = [
  { id: "overview", label: "Family overview", Icon: MdDashboard },
  { id: "calendar", label: "School calendar", Icon: MdCalendarMonth },
  { id: "handover", label: "Arrival & pickup", Icon: MdShield },
  { id: "notices", label: "School notices", Icon: MdCampaign },
  { id: "children", label: "My children", Icon: MdPeople },
  { id: "attendance", label: "Attendance", Icon: MdFactCheck },
  { id: "fees", label: "Fee status", Icon: MdCurrencyRupee },
];

const headersFor = (organizationId, branchId) => ({
  "x-auth-token": localStorage.getItem("token") || "",
  ...(organizationId ? { "x-organization-id": organizationId } : {}),
  ...(branchId ? { "x-branch-id": branchId } : {}),
});

async function parentRequest(path, organizationId, branchId, params) {
  const response = await axios.get(API_BASE_URL + path, {
    headers: headersFor(organizationId, branchId),
    params,
  });
  return response.data;
}

const money = (value, currency) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: currency || "INR", maximumFractionDigits: 2,
}).format(Number(value) || 0);

const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export default function ParentPortal() {
  const { user, logout } = useContext(AuthContext);
  const memberships = useMemo(() => (Array.isArray(user?.memberships) ? user.memberships.filter((item) => item.role === "parent" && item.organization?.id) : []), [user?.memberships]);
  const [organizationId, setOrganizationId] = useState(() => memberships[0]?.organization?.id || "");
  const membership = memberships.find((item) => item.organization.id === organizationId) || memberships[0];
  const organization = membership?.organization;
  const branches = membership?.branchIds || [];
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [children, setChildren] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [notices, setNotices] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [handoverEvents, setHandoverEvents] = useState([]);
  const [handoverFrom, setHandoverFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });
  const [handoverTo, setHandoverTo] = useState(() => {
    const date = new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });
  const [calendarFrom, setCalendarFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });
  const [calendarTo, setCalendarTo] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 90);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshed, setRefreshed] = useState(0);
  const [attendanceFrom, setAttendanceFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });
  const [attendanceTo, setAttendanceTo] = useState(() => {
    const date = new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });

  useEffect(() => {
    if (!memberships.length) return;
    if (!memberships.some((entry) => entry.organization.id === organizationId)) setOrganizationId(memberships[0].organization.id);
  }, [memberships, organizationId]);

  useEffect(() => {
    const usable = branches.map((item) => String(item.id || item._id));
    setBranchId((current) => current && usable.includes(current) ? current : "");
  }, [organizationId, branches.map((item) => String(item.id || item._id)).join("|")]);

  const loadAll = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [summaryResult, childrenResult] = await Promise.all([
        parentRequest("/api/saas/parent/summary", organizationId, branchId),
        parentRequest("/api/saas/parent/children", organizationId, branchId),
      ]);
      setSummary(summaryResult);
      setChildren(childrenResult.children || []);

      if (tab === "attendance") {
        const history = await parentRequest("/api/saas/parent/attendance", organizationId, branchId, { from: attendanceFrom, to: attendanceTo });
        setAttendance(history.children || []);
      } else if (tab === "fees") {
        const feeResult = await parentRequest("/api/saas/parent/fees", organizationId, branchId);
        setInvoices(feeResult.invoices || []);
        if (feeResult.message) setError(feeResult.message);
      } else if (tab === "notices") {
        const noticeResult = await parentRequest("/api/saas/notices", organizationId, branchId);
        setNotices(Array.isArray(noticeResult) ? noticeResult : []);
      } else if (tab === "calendar") {
        const calendarResult = await parentRequest("/api/saas/calendar", organizationId, branchId, { from: calendarFrom, to: calendarTo });
        setCalendarEvents(Array.isArray(calendarResult?.events) ? calendarResult.events : []);
      } else if (tab === "handover") {
        const handoverResult = await parentRequest("/api/saas/handover", organizationId, branchId, { from: handoverFrom, to: handoverTo });
        setHandoverEvents(Array.isArray(handoverResult?.events) ? handoverResult.events : []);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Your family information could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, branchId, tab, attendanceFrom, attendanceTo, calendarFrom, calendarTo, handoverFrom, handoverTo]);

  useEffect(() => { loadAll(); }, [loadAll, refreshed]);

  const activeBranch = branches.find((item) => String(item.id || item._id) === branchId);

  if (!memberships.length) {
    const inactiveWorkspace = Boolean(user?.hasInactiveWorkspaceMemberships);
    const hasOtherActiveWorkspace = Array.isArray(user?.memberships) && user.memberships.length > 0;
    return (
      <main className="parent-entry-shell">
        <section className="parent-entry-card">
          <span className="parent-entry-logo"><MdSchool aria-hidden="true" /></span>
          <span className="saas-eyebrow">FAMILY PORTAL ACCESS</span>
          <h1>{inactiveWorkspace ? "Family portal access is inactive" : "Family portal"}</h1>
          <p>
            {inactiveWorkspace
              ? "Your preschool access is inactive or the organization is unavailable. Your family records have not been deleted. Contact the preschool administrator to review your account."
              : hasOtherActiveWorkspace
                ? "This account has an active school workspace, but it is not a parent account. Open the staff workspace or contact your administrator if you need family access."
                : "This account does not have an active parent invitation. Contact the preschool office if you believe this is an error."}
          </p>
          <button type="button" className="saas-primary-button" onClick={logout}>Sign out</button>
        </section>
      </main>
    );
  }

  return (
    <div className="parent-portal-shell">
      <header className="parent-portal-header">
        <div className="parent-portal-brand"><span><MdSchool aria-hidden="true" /></span><div><strong>Family portal</strong><small>{organization?.name || "Your preschool"}</small></div></div>
        <div className="parent-portal-header-actions">
          {memberships.length > 1 && <label><span>Preschool</span><select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setSummary(null); setChildren([]); setInvoices([]); setAttendance([]); setNotices([]); setCalendarEvents([]); setHandoverEvents([]); }} aria-label="Choose preschool">{memberships.map((item) => <option key={item.organization.id} value={item.organization.id}>{item.organization.name}</option>)}</select></label>}
          {branches.length > 1 && <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Choose branch"><option value="">All my linked branches</option>{branches.map((branch) => <option key={branch.id || branch._id} value={branch.id || branch._id}>{branch.name}</option>)}</select></label>}
          <button type="button" className="saas-icon-button" onClick={() => setRefreshed((value) => value + 1)} aria-label="Refresh family information"><MdRefresh /></button>
          <button type="button" className="parent-signout-button" onClick={logout}><MdLogout /> Sign out</button>
        </div>
      </header>

      <main className="parent-portal-main">
        <section className="parent-welcome-card">
          <div><span className="saas-eyebrow">YOUR FAMILY SPACE</span><h1>Welcome, {user?.username || "Parent"}.</h1><p>View information for children connected to your parent account. Only linked family records are shown here.</p></div>
          <div className="parent-welcome-date"><MdCalendarMonth /> {dateLabel(summary?.date)}</div>
        </section>

        <nav className="parent-tabs" aria-label="Family information">
          {PARENT_TABS.map(({ id, label, Icon }) => <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon aria-hidden="true" /> {label}</button>)}
        </nav>

        {error && <div className="saas-message error" role="alert"><MdErrorOutline /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss message">×</button></div>}
        {loading && !summary && <div className="saas-loading" role="status">Loading your family information…</div>}

        {tab === "overview" && (
          <section className="parent-portal-section">
            <div className="parent-metrics-grid">
              <article><span>My children</span><strong>{summary?.children ?? "—"}</strong><small>Linked to your parent account</small></article>
              <article><span>Present today</span><strong>{summary?.attendanceToday?.present ?? "—"}</strong><small>{summary?.attendanceToday?.absent ?? 0} absent today</small></article>
              <article><span>Fee balance</span><strong>{summary ? money(summary.fees?.outstanding, organization?.currency) : "—"}</strong><small>Invoices where you are a billing contact</small></article>
            </div>
            <div className="parent-portal-section-heading"><div><h2>My children</h2><p>Children whose family contact has been linked to this account.</p></div><button type="button" className="saas-secondary-button" onClick={() => setTab("children")}>View details <MdArrowForward /></button></div>
            {children.length ? <div className="parent-child-grid">{children.map((child) => <article className="parent-child-card" key={child.id}><span className="parent-child-avatar"><MdSchool /></span><div><h3>{child.name}</h3><p>{child.className || "Class not set"} · {child.branch?.name || "Preschool"}</p><small>Admission no. {child.admissionNumber || "—"}</small></div><div className="parent-child-meta"><span>Date of birth</span><strong>{dateLabel(child.dateOfBirth)}</strong></div></article>)}</div> : !loading && <div className="saas-empty-state"><strong>No child linked yet</strong><p>Contact the preschool office and ask them to verify the parent invitation is connected to the correct family record.</p></div>}
            <div className="parent-privacy-card"><MdShield /><div><strong>Your family information is private.</strong><p>This portal does not provide school-wide student lists, other families’ contact details, or public photo URLs. Contact the office to correct a family link.</p></div></div>
          </section>
        )}

        {tab === "children" && (
          <section className="parent-portal-section">
            <div className="parent-portal-section-heading"><div><h2>My children</h2><p>Review your linked child records and contact relationship.</p></div></div>
            {children.length ? <div className="parent-child-grid">{children.map((child) => <article className="parent-child-detail-card" key={child.id}><div className="parent-child-detail-header"><span className="parent-child-avatar"><MdSchool /></span><div><h3>{child.name}</h3><p>{child.className || "Class not set"} · {child.branch?.name || "Preschool"}</p></div></div><dl><div><dt>Admission number</dt><dd>{child.admissionNumber || "—"}</dd></div><div><dt>Date of birth</dt><dd>{dateLabel(child.dateOfBirth)}</dd></div><div><dt>Academic year</dt><dd>{child.academicYear || "—"}</dd></div><div><dt>Home address</dt><dd>{child.address || "Not provided"}</dd></div></dl><div className="parent-relationship-tags">{(child.relationships || []).map((relationship, index) => <span key={index}>{String(relationship.relationship).replaceAll("_", " ")}{relationship.isPrimaryContact ? " · Primary contact" : ""}{relationship.authorizedPickup ? " · Pickup authorized" : ""}</span>)}</div></article>)}</div> : <div className="saas-empty-state"><strong>No child linked yet</strong><p>Ask the preschool to connect your parent account to the correct child record.</p></div>}
          </section>
        )}

        {tab === "attendance" && (
          <section className="parent-portal-section">
            <div className="parent-portal-section-heading"><div><h2>Attendance history</h2><p>Review attendance recorded by your preschool for your linked children.</p></div></div>
            <div className="parent-date-filters"><label>From<input type="date" value={attendanceFrom} onChange={(event) => setAttendanceFrom(event.target.value)} /></label><label>To<input type="date" value={attendanceTo} onChange={(event) => setAttendanceTo(event.target.value)} /></label><button type="button" className="saas-secondary-button" onClick={() => setRefreshed((value) => value + 1)}>Apply dates</button></div>
            {attendance.length ? <div className="parent-attendance-list">{attendance.map(({ child, records }) => <article key={child.id}><div className="parent-portal-section-heading"><div><h3>{child.name}</h3><p>{child.className} · {child.branch?.name || ""}</p></div><span>{records.length} entries</span></div>{records.length ? <div className="parent-attendance-table">{records.map((record, index) => <div key={record.date + index}><time>{dateLabel(record.date)}</time><span className={"parent-attendance-status " + record.status}>{record.status === "present" ? "Present" : "Absent"}</span><small>{record.status === "absent" ? record.reason : "—"}</small></div>)}</div> : <p className="parent-muted">No attendance entry in this date range.</p>}</article>)}</div> : !loading && <div className="saas-empty-state"><strong>No attendance history</strong><p>There are no saved attendance entries for your linked children in this date range.</p></div>}
          </section>
        )}

        {tab === "notices" && (
          <section className="parent-portal-section">
            <div className="parent-portal-section-heading">
              <div><h2>School notices</h2><p>Updates shared by your preschool for your linked branch or branches.</p></div>
              <span className="tenant-notice-count">{notices.length} {notices.length === 1 ? "notice" : "notices"}</span>
            </div>
            {notices.length ? (
              <div className="tenant-notice-list parent-tenant-notice-list">
                {notices.map((notice) => (
                  <article className={"tenant-notice-card priority-" + notice.priority} key={notice.id}>
                    <div className="tenant-notice-card-top">
                      <div className="tenant-notice-badges">
                        <span className={"tenant-notice-priority " + notice.priority}>{notice.priority}</span>
                        {notice.audience !== "all" && <span className="tenant-notice-audience">Parents and guardians</span>}
                      </div>
                      {notice.branch?.name && <small className="tenant-notice-branch">{notice.branch.name}</small>}
                    </div>
                    <h3>{notice.title}</h3>
                    <p className="tenant-notice-message">{notice.message}</p>
                    <div className="tenant-notice-meta">
                      <span>Posted {dateLabel(notice.createdAt)}</span>
                      <span>{notice.expiresAt ? "Valid until " + dateLabel(notice.expiresAt) : "No end date provided"}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : !loading ? (
              <div className="saas-empty-state"><strong>No current school notices</strong><p>When your preschool posts an update for parents, it will appear here. You do not need to check other branches or contact lists.</p></div>
            ) : <div className="saas-loading" role="status">Loading school notices…</div>}
            <div className="parent-privacy-card"><MdShield aria-hidden="true" /><div><strong>Branch-aware updates</strong><p>These notices are limited to branches connected to the family records linked to your account.</p></div></div>
          </section>
        )}

        {tab === "calendar" && (
          <section className="parent-portal-section parent-calendar-section">
            <div className="parent-portal-section-heading">
              <div><h2>School calendar</h2><p>Upcoming holidays and events for your linked branch or branches.</p></div>
              <button type="button" className="saas-secondary-button" onClick={() => setRefreshed((value) => value + 1)} disabled={loading}><MdRefresh aria-hidden="true" /> Refresh</button>
            </div>
            <div className="parent-calendar-filters">
              <label>From<input type="date" value={calendarFrom} max={calendarTo || undefined} onChange={(event) => setCalendarFrom(event.target.value)} /></label>
              <label>To<input type="date" value={calendarTo} min={calendarFrom || undefined} onChange={(event) => setCalendarTo(event.target.value)} /></label>
              <button type="button" className="saas-secondary-button" onClick={() => setRefreshed((value) => value + 1)} disabled={loading}>Apply dates</button>
            </div>
            {calendarEvents.length ? (
              <div className="parent-calendar-list">
                {calendarEvents.map((event) => {
                  const timezone = activeBranch?.timezone || organization?.timezone || "Asia/Kolkata";
                  const start = new Date(event.startsAt);
                  const end = new Date(event.endsAt);
                  const day = new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: timezone }).format(start);
                  const month = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: timezone }).format(start);
                  const dateTime = event.allDay
                    ? "All day"
                    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(start) +
                      " – " + new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(end);
                  return (
                    <article className="parent-calendar-card" key={event.id}>
                      <div className="parent-calendar-date"><span>{month}</span><strong>{day}</strong></div>
                      <div>
                        <div className="tenant-calendar-event-meta">
                          <span className={"saas-pill " + event.type}>{String(event.type || "school_event").replaceAll("_", " ")}</span>
                          {event.audience !== "all" && <span className="saas-pill parents">Parents</span>}
                        </div>
                        <h3>{event.title}</h3>
                        <p>{dateTime}</p>
                        {event.location && <small>Location: {event.location}</small>}
                        {event.description && <p>{event.description}</p>}
                        {event.branch?.name && !branchId && <small>Branch: {event.branch.name}</small>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : !loading ? (
              <div className="saas-empty-state"><strong>No school events in this range</strong><p>When your preschool publishes a holiday, trip or event for parents, it will appear here.</p></div>
            ) : <div className="saas-loading" role="status">Loading school calendar…</div>}
            <div className="parent-privacy-card"><MdShield aria-hidden="true" /><div><strong>Family-specific access</strong><p>Events are limited to branches connected to children linked to your parent account. Staff-only events stay private.</p></div></div>
          </section>
        )}

        {tab === "handover" && (
          <section className="parent-portal-section parent-handover-section">
            <div className="parent-portal-section-heading">
              <div><h2>Arrival and pickup history</h2><p>Review completed arrival and pickup entries for children linked to your family account.</p></div>
              <button type="button" className="saas-secondary-button" onClick={() => setRefreshed((value) => value + 1)} disabled={loading}><MdRefresh aria-hidden="true" /> Refresh</button>
            </div>
            <div className="parent-handover-filters">
              <label>From<input type="date" value={handoverFrom} max={handoverTo || undefined} onChange={(event) => setHandoverFrom(event.target.value)} /></label>
              <label>To<input type="date" value={handoverTo} min={handoverFrom || undefined} onChange={(event) => setHandoverTo(event.target.value)} /></label>
              <button type="button" className="saas-secondary-button" onClick={() => setRefreshed((value) => value + 1)} disabled={loading}>Apply dates</button>
            </div>
            {handoverEvents.length ? (
              <div className="parent-handover-list">
                {handoverEvents.map((event) => {
                  const refused = event.outcome === "refused";
                  const timezone = activeBranch?.timezone || organization?.timezone || "Asia/Kolkata";
                  const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(event.eventAt));
                  return (
                    <article className={"parent-handover-card" + (refused ? " refused" : "")} key={event.id}>
                      <span className={"tenant-handover-history-icon " + (refused ? "refused" : event.eventType)}><MdHistory aria-hidden="true" /></span>
                      <div>
                        <h3>{event.childName || "Your child"} · {event.eventType === "check_in" ? "Arrival" : "Pickup"}</h3>
                        <p>{when} · {event.summary}</p>
                        {event.guardianName && <small>{event.eventType === "check_in" ? "Arrival contact: " : "Collected by: "}{event.guardianName}</small>}
                        {event.branch?.name && !branchId && <small>Branch: {event.branch.name}</small>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : !loading ? (
              <div className="saas-empty-state"><strong>No handover history yet</strong><p>Completed arrivals and pickups recorded by your preschool will appear here. For a correction or a refused pickup entry, please contact the school office.</p></div>
            ) : <div className="saas-loading" role="status">Loading arrival and pickup history…</div>}
            <div className="parent-privacy-card"><MdShield aria-hidden="true" /><div><strong>Private family history</strong><p>This view only includes children connected to your parent account. Internal staff notes and names from refused pickup attempts are not shown.</p></div></div>
          </section>
        )}

        {tab === "fees" && (
          <section className="parent-portal-section">
            <div className="parent-portal-section-heading"><div><h2>Fee status</h2><p>View invoices and saved payment receipts for children where your contact is assigned as a billing contact.</p></div></div>
            {invoices.length ? <div className="parent-fee-list">{invoices.map((invoice) => <article key={invoice.id}><div className="parent-fee-header"><div><span>{invoice.invoiceNumber}</span><h3>{invoice.childName}</h3><p>{invoice.className} · {invoice.academicYear} · Due {dateLabel(invoice.dueDate)}</p></div><span className={"saas-pill " + invoice.status}>{invoice.status}</span></div><div className="parent-fee-totals"><div><span>Total</span><strong>{money(invoice.total, invoice.currency)}</strong></div><div><span>Paid</span><strong>{money(invoice.paid, invoice.currency)}</strong></div><div><span>Outstanding</span><strong className={invoice.outstanding > 0 ? "is-due" : "is-paid"}>{money(invoice.outstanding, invoice.currency)}</strong></div></div>{invoice.transactions?.length > 0 && <details className="parent-receipts"><summary>View payment receipts ({invoice.transactions.filter((transaction) => transaction.type === "payment").length})</summary>{invoice.transactions.map((transaction, index) => <div key={transaction.receiptNumber + index}><div><strong>{transaction.receiptNumber}</strong><small>{dateLabel(transaction.transactionAt)} · {transaction.method.replaceAll("_", " ")}</small></div><strong className={transaction.type === "refund" ? "is-due" : "is-paid"}>{transaction.type === "refund" ? "−" : "+"}{money(transaction.amount, invoice.currency)}</strong></div>)}</details>}</article>)}</div> : !loading && <div className="saas-empty-state"><strong>No fee invoices available</strong><p>Either your contact is not designated as a billing contact, or no fee invoices have been created yet. Contact the preschool office if you expected to see a balance.</p></div>}
          </section>
        )}
      </main>

      <footer className="parent-portal-footer"><span>{organization?.name || "Your preschool"}{activeBranch ? " · " + activeBranch.name : ""}</span><span>For corrections or help, contact the preschool office.</span></footer>
    </div>
  );
}
