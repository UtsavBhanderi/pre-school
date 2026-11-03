import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  MdSchool, MdDashboard, MdPeople, MdFactCheck, MdCurrencyRupee,
  MdCampaign, MdCalendarMonth, MdAssessment, MdRefresh, MdLogout,
  MdLock, MdShield, MdCheckCircle, MdErrorOutline, MdHistory,
  MdReceiptLong, MdArrowForward, MdEventAvailable, MdMenuBook,
  MdOutlineAccountCircle,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../legacy-parent-portal.css";

const PARENT_NAV = [
  { id: "overview", label: "Home", title: "Family overview", Icon: MdDashboard },
  { id: "children", label: "Children", title: "My children", Icon: MdPeople },
  { id: "attendance", label: "Attendance", title: "Attendance history", Icon: MdFactCheck },
  { id: "fees", label: "Fees", title: "Fee details", Icon: MdCurrencyRupee },
  { id: "notices", label: "Notices", title: "School notices", Icon: MdCampaign },
  { id: "calendar", label: "Calendar", title: "School calendar", Icon: MdCalendarMonth },
  { id: "reports", label: "Reports", title: "Learning reports", Icon: MdAssessment },
  { id: "security", label: "Security", title: "Account security", Icon: MdLock },
];

const localDate = (date) => {
  const value = new Date(date);
  return value.getFullYear() + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
};
const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(date);
};
const dateTimeLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
};
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value) || 0);
const getInitials = (name) => String(name || "Child").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

async function request(path, { method = "GET", data, params } = {}) {
  const response = await axios({
    url: API_BASE_URL + path,
    method,
    data,
    params,
    headers: {
      ...(localStorage.getItem("token") ? { "x-auth-token": localStorage.getItem("token") } : {}),
    },
  });
  return response.data;
}

function ParentStat({ label, value, hint, tone = "default" }) {
  return (
    <article className={"legacy-parent-stat " + tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function EmptyState({ title, detail }) {
  return <div className="legacy-parent-empty"><strong>{title}</strong><p className="mb-0 mt-1">{detail}</p></div>;
}

export default function LegacyParentPortal() {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [children, setChildren] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fees, setFees] = useState([]);
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [attendanceFrom, setAttendanceFrom] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() - 29); return localDate(date);
  });
  const [attendanceTo, setAttendanceTo] = useState(() => localDate(new Date()));
  const [calendarFrom, setCalendarFrom] = useState(() => localDate(new Date()));
  const [calendarTo, setCalendarTo] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() + 90); return localDate(date);
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  const loadPortal = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setErrorMessage("");
    try {
      const [summaryResult, childResult] = await Promise.all([
        request("/api/parent-portal/summary"),
        request("/api/parent-portal/children"),
      ]);
      setSummary(summaryResult);
      setChildren(Array.isArray(childResult.children) ? childResult.children : []);

      if (activeTab === "attendance") {
        const result = await request("/api/parent-portal/attendance", {
          params: { from: attendanceFrom, to: attendanceTo },
        });
        setAttendance(result.children || []);
      } else if (activeTab === "fees") {
        const result = await request("/api/parent-portal/fees");
        setFees(result.fees || []);
      } else if (activeTab === "notices") {
        const result = await request("/api/parent-portal/notices");
        setNotices(result.notices || []);
      } else if (activeTab === "calendar") {
        const result = await request("/api/parent-portal/calendar", {
          params: { from: calendarFrom, to: calendarTo },
        });
        setEvents(result.events || []);
      } else if (activeTab === "reports") {
        const result = await request("/api/parent-portal/reports");
        setReports(result.reports || []);
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Your family information could not be loaded. Refresh the page or contact the school office.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, attendanceFrom, attendanceTo, calendarFrom, calendarTo]);

  useEffect(() => { loadPortal(); }, [loadPortal]);

  const activeNav = PARENT_NAV.find((item) => item.id === activeTab) || PARENT_NAV[0];
  const accountName = user?.username || "Parent";
  const presentCount = summary?.attendanceToday?.present || 0;
  const absentCount = summary?.attendanceToday?.absent || 0;

  const childNameList = useMemo(() => new Map(children.map((child) => [child.id, child.name])), [children]);

  const logoutAndNavigate = () => {
    logout();
    window.location.assign("/login");
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage("");
    if (newPassword.length < 12 || newPassword.length > 128 || !newPassword.trim()) {
      setPasswordMessage("Choose a password between 12 and 128 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("The new passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const result = await request("/api/parent-portal/change-password", {
        method: "POST",
        data: { currentPassword, newPassword },
      });
      setPasswordMessage(result.message || "Password changed. Please sign in again.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => logoutAndNavigate(), 800);
    } catch (error) {
      setPasswordMessage(error.response?.data?.message || "Your password could not be changed.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="legacy-parent-portal">
      <aside className="legacy-parent-sidebar" aria-label="Family portal navigation">
        <div className="legacy-parent-brand">
          <span className="legacy-parent-brand-mark"><MdSchool aria-hidden="true" /></span>
          <span><strong>{summary?.schoolName || "Your preschool"}</strong><small>Family portal</small></span>
        </div>
        <div className="legacy-parent-sidebar-label">Your family</div>
        <nav className="legacy-parent-nav">
          {PARENT_NAV.map(({ id, label, Icon }) => (
            <button type="button" key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="legacy-parent-sidebar-spacer" />
        <div className="legacy-parent-user">
          <strong>{accountName}</strong>
          <small>{user?.email || "Parent account"}</small>
          <button type="button" className="legacy-parent-signout" onClick={logoutAndNavigate}><MdLogout /> Sign out</button>
        </div>
      </aside>

      <main className="legacy-parent-main">
        <header className="legacy-parent-topbar">
          <div>
            <h1>{activeNav.title}</h1>
            <p>Welcome back, {accountName}. Your family information is here.</p>
          </div>
          <div className="legacy-parent-top-actions">
            <button type="button" className="legacy-parent-refresh" onClick={() => loadPortal({ quiet: true })} disabled={refreshing || loading}>
              <MdRefresh aria-hidden="true" /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        {errorMessage && <div className="legacy-parent-alert error" role="alert">{errorMessage}</div>}
        {loading && !summary ? <div className="legacy-parent-empty" role="status">Loading your family portal…</div> : (
          <>
            {activeTab === "overview" && (
              <>
                <section className="legacy-parent-welcome">
                  <div>
                    <span>YOUR FAMILY SPACE</span>
                    <h2>Good day, {accountName}.</h2>
                    <p>Here is a quick view of your children’s school day. Select a section to see more details.</p>
                  </div>
                  <div className="legacy-parent-welcome-date">{dateLabel(summary?.date || new Date())}</div>
                </section>
                <section className="legacy-parent-stats">
                  <ParentStat label="My children" value={summary?.children ?? children.length} hint="Linked to your family login" />
                  <ParentStat label="Present today" value={presentCount} hint="Attendance recorded" tone="present" />
                  <ParentStat label="Absent today" value={absentCount} hint="Please contact the school if needed" tone="absent" />
                  <ParentStat label="Fee balance" value={money(summary?.fees?.outstanding)} hint="Total outstanding for your family" />
                </section>
                <section className="legacy-parent-panel">
                  <div className="legacy-parent-panel-heading">
                    <div><h2>Your children</h2><p>Only children matched to your registered family contact are shown.</p></div>
                    <button type="button" className="legacy-parent-secondary-btn" onClick={() => setActiveTab("children")}>View all <MdArrowForward /></button>
                  </div>
                  {children.length ? (
                    <div className="legacy-parent-child-grid">{children.map((child) => (
                      <article className="legacy-parent-child-card" key={child.id}>
                        <span className="legacy-parent-child-avatar">{getInitials(child.name)}</span>
                        <div>
                          <h3>{child.name}</h3><p>{child.className || "Class not assigned"} · GR No. {child.admissionNumber || "—"}</p>
                          <small>{child.academicYear || "Current academic year"}</small>
                        </div>
                      </article>
                    ))}</div>
                  ) : <EmptyState title="No child records linked" detail="Contact your preschool office to verify that your GR number and registered phone are correct." />}
                </section>
              </>
            )}

            {activeTab === "children" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>My children</h2><p>Basic details from your preschool admission records.</p></div></div>
                {children.length ? <div className="legacy-parent-child-grid">{children.map((child) => (
                  <article className="legacy-parent-child-card" key={child.id}>
                    <span className="legacy-parent-child-avatar">{getInitials(child.name)}</span>
                    <div><h3>{child.name}</h3><p>{child.className || "Class not assigned"} · GR No. {child.admissionNumber || "—"}</p><small>Academic year: {child.academicYear || "—"} · Date of birth: {dateLabel(child.dateOfBirth)}</small>{child.address && <small>{child.address}</small>}</div>
                  </article>
                ))}</div> : <EmptyState title="No children available" detail="Please ask the school office to check your family link." />}
              </section>
            )}

            {activeTab === "attendance" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>Attendance history</h2><p>Review present and absent days for each linked child.</p></div></div>
                <div className="legacy-parent-filters">
                  <label>From<input type="date" value={attendanceFrom} max={attendanceTo} onChange={(event) => setAttendanceFrom(event.target.value)} /></label>
                  <label>To<input type="date" value={attendanceTo} min={attendanceFrom} onChange={(event) => setAttendanceTo(event.target.value)} /></label>
                  <button type="button" className="legacy-parent-primary-btn" onClick={() => loadPortal({ quiet: false })}>Apply dates</button>
                </div>
                {attendance.length ? attendance.map(({ child, records }) => (
                  <article className="legacy-parent-card" key={child.id}>
                    <h3>{child.name} <small>· {child.className}</small></h3>
                    {records.length ? <div className="legacy-parent-table-wrap"><table className="legacy-parent-table"><thead><tr><th>Date</th><th>Status</th><th>Reason</th></tr></thead><tbody>{records.map((record, index) => <tr key={record.date + index}><td>{dateLabel(record.date)}</td><td><span className={"legacy-parent-status " + record.status}>{record.status}</span></td><td>{record.reason || "—"}</td></tr>)}</tbody></table></div> : <small>No attendance saved in this date range.</small>}
                  </article>
                )) : !loading && <EmptyState title="No attendance history" detail="Attendance saved by your preschool will appear here." />}
              </section>
            )}

            {activeTab === "fees" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>Fee details</h2><p>See total fees, payments received, discount and balance due.</p></div></div>
                {fees.length ? <div className="legacy-parent-card-list">{fees.map((fee) => (
                  <article className="legacy-parent-card" key={fee.id}>
                    <div className="legacy-parent-panel-heading"><div><h3>{fee.child?.name || childNameList.get(fee.child?.id) || "Student"}</h3><small>GR No. {fee.child?.admissionNumber || "—"}</small></div><span className={"legacy-parent-status " + (fee.outstanding > 0 ? "due" : "paid")}>{fee.outstanding > 0 ? "Balance due" : "Paid"}</span></div>
                    <div className="legacy-parent-table-wrap mt-3"><table className="legacy-parent-table"><tbody>
                      <tr><th>Total fees</th><td>{money(fee.total)}</td></tr>
                      <tr><th>Paid</th><td>{money(fee.paid)}</td></tr>
                      <tr><th>Discount</th><td>{money(fee.discount)}</td></tr>
                      <tr><th>Outstanding</th><td><strong>{money(fee.outstanding)}</strong></td></tr>
                    </tbody></table></div>
                    {fee.payments?.length > 0 && <div className="mt-3"><strong className="small">Payment history</strong><div className="legacy-parent-table-wrap mt-2"><table className="legacy-parent-table"><thead><tr><th>Date</th><th>Time</th><th>Amount</th></tr></thead><tbody>{fee.payments.map((payment, index) => <tr key={index}><td>{payment.date || "—"}</td><td>{payment.time || "—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody></table></div></div>}
                  </article>
                ))}</div> : <EmptyState title="No fee record available" detail="Fee information will appear here once the school office creates the student's fee record." />}
              </section>
            )}

            {activeTab === "notices" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>School notices</h2><p>Important messages shared with parents and families.</p></div><span>{notices.length} updates</span></div>
                {notices.length ? <div className="legacy-parent-card-list">{notices.map((notice) => (
                  <article className="legacy-parent-card" key={notice._id}>
                    <div className="legacy-parent-panel-heading"><h3>{notice.title}</h3><span className={"legacy-parent-status " + (notice.priority === "urgent" ? "absent" : "present")}>{notice.priority || "normal"}</span></div>
                    <p>{notice.message}</p><small className="d-block mt-2">Posted {dateLabel(notice.createdAt)}{notice.expiresAt ? " · Valid until " + dateLabel(notice.expiresAt) : ""}</small>
                  </article>
                ))}</div> : <EmptyState title="No current school notices" detail="New notices for parents will appear here." />}
              </section>
            )}

            {activeTab === "calendar" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>School calendar</h2><p>Upcoming events, holidays and school activities.</p></div></div>
                <div className="legacy-parent-filters">
                  <label>From<input type="date" value={calendarFrom} max={calendarTo} onChange={(event) => setCalendarFrom(event.target.value)} /></label>
                  <label>To<input type="date" value={calendarTo} min={calendarFrom} onChange={(event) => setCalendarTo(event.target.value)} /></label>
                  <button type="button" className="legacy-parent-primary-btn" onClick={() => loadPortal({ quiet: false })}>Apply dates</button>
                </div>
                {events.length ? <div className="legacy-parent-card-list">{events.map((item) => (
                  <article className="legacy-parent-card" key={item.id}>
                    <div className="legacy-parent-panel-heading"><div><h3>{item.title}</h3><small>{dateLabel(item.startsAt)}{item.endsAt && item.endsAt !== item.startsAt ? " – " + dateLabel(item.endsAt) : ""}</small></div><MdEventAvailable size={22} /></div>
                  </article>
                ))}</div> : <EmptyState title="No events in this date range" detail="School calendar events and holidays will appear here." />}
              </section>
            )}

            {activeTab === "reports" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>Learning reports</h2><p>Report cards shared by your preschool for your linked children.</p></div></div>
                {reports.length ? <div className="legacy-parent-card-list">{reports.map((report) => (
                  <article className="legacy-parent-card" key={report.id}>
                    <h3>{report.title}</h3><p>{report.description}</p><small className="d-block mt-2">{report.className} · Published {dateLabel(report.createdAt)}</small>
                    {report.children?.length > 0 && <small className="d-block mt-1">For: {report.children.map((child) => child.name).join(", ")}</small>}
                  </article>
                ))}</div> : <EmptyState title="No learning reports yet" detail="Report cards released by the preschool will appear here." />}
              </section>
            )}

            {activeTab === "security" && (
              <section className="legacy-parent-panel">
                <div className="legacy-parent-panel-heading"><div><h2>Account security</h2><p>Change your parent portal password. You will sign in again after the change.</p></div><MdShield size={25} /></div>
                <form className="legacy-parent-form" onSubmit={changePassword}>
                  <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required maxLength={128} /></label>
                  <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} /></label>
                  <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} /></label>
                  {passwordMessage && <div className={"legacy-parent-alert " + (passwordMessage.toLowerCase().includes("incorrect") || passwordMessage.toLowerCase().includes("not match") ? "error" : "success")} role="status">{passwordMessage}</div>}
                  <button type="submit" className="legacy-parent-primary-btn" disabled={savingPassword}>{savingPassword ? "Updating password…" : "Update password"}</button>
                </form>
                <div className="legacy-parent-card"><h3>Keep your account safe</h3><p>Do not share your password with anyone. The preschool office will never ask for your password.</p></div>
              </section>
            )}
          </>
        )}

        <footer className="legacy-parent-footer">
          <span>{summary?.schoolName || "Your preschool"} · Family portal</span>
          <span>For incorrect family or fee details, contact the school office.</span>
        </footer>
      </main>
    </div>
  );
}
