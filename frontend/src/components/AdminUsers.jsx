import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { AuthContext } from "../context/AuthContext";
import {
  MdPersonAddAlt1, MdManageAccounts, MdEdit, MdSave, MdClose,
  MdRefresh, MdHistory, MdShield, MdCheckCircle, MdBlock,
} from "react-icons/md";

const EMPTY_FORM = { username: "", email: "", password: "", role: "teacher" };
const EMPTY_EDIT = { role: "teacher", status: "active", reason: "" };

const roleLabel = (role) => ({
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student (legacy)",
}[role] || role || "Unknown");
const statusLabel = (status) => status === "suspended" ? "Suspended" : "Active";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
};

export default function AdminUsers() {
  const { user: currentUser } = useContext(AuthContext);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [users, setUsers] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [editDraft, setEditDraft] = useState(EMPTY_EDIT);
  const [errorMessage, setErrorMessage] = useState("");
  const [auditError, setAuditError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await axios.get(API_BASE_URL + "/api/userDetailsself");
      setUsers(Array.isArray(response.data) ? response.data : []);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to load user accounts.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const response = await axios.get(API_BASE_URL + "/api/userDetailsself/audit");
      setAuditEvents(Array.isArray(response.data) ? response.data : []);
      setAuditError("");
    } catch (error) {
      setAuditEvents([]);
      setAuditError(error.response?.data?.message || "Access history is currently unavailable.");
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.all([fetchUsers(), fetchAudit()]);
  }, [fetchUsers, fetchAudit]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingUser) return;
    setSavingUser(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await axios.post(API_BASE_URL + "/api/auth/register", {
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
      });
      setFormData(EMPTY_FORM);
      setSuccessMessage(response.data?.auditWarning
        ? "Account created, but the access audit could not be saved. Please contact support."
        : (response.data?.message || "The account was created successfully."));
      await refreshData();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || error.message || "Unable to create this account.");
    } finally {
      setSavingUser(false);
    }
  };

  const beginEdit = (account) => {
    setEditingUserId(account._id);
    setEditDraft({
      role: account.role === "admin" ? "admin" : "teacher",
      status: account.status === "suspended" ? "suspended" : "active",
      reason: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const cancelEdit = () => {
    setEditingUserId("");
    setEditDraft(EMPTY_EDIT);
    setSavingAccess(false);
  };

  const saveAccess = async (event, account) => {
    event.preventDefault();
    if (savingAccess) return;
    if (editDraft.reason.trim().length < 3) {
      setErrorMessage("Enter a clear reason of at least 3 characters for this access change.");
      return;
    }
    if (editDraft.status === "suspended" && account.status !== "suspended" &&
        !window.confirm("Suspend access for " + account.username + "? All existing sessions for this account will be revoked.")) {
      return;
    }
    if (editDraft.role !== account.role &&
        !window.confirm("Change " + account.username + "'s access role to " + roleLabel(editDraft.role) + "? Their existing sessions will be revoked.")) {
      return;
    }

    setSavingAccess(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await axios.patch(
        API_BASE_URL + "/api/userDetailsself/" + encodeURIComponent(account._id),
        editDraft,
      );
      setSuccessMessage(response.data?.message || "Access updated successfully.");
      cancelEdit();
      await refreshData();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to update this account's access.");
    } finally {
      setSavingAccess(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return users.filter((account) => {
      const matchesQuery = !query || [
        account.username, account.email, roleLabel(account.role), statusLabel(account.status),
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesRole = roleFilter === "all" || account.role === roleFilter;
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" ? account.status !== "suspended" : account.status === "suspended");
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const activeCount = users.filter((account) => account.status !== "suspended").length;
  const suspendedCount = users.length - activeCount;

  return (
    <div className="user-access-page">
      <div className="page-header">
        <div>
          <h2 className="mb-0">User access</h2>
          <p className="page-subtitle">Control who can sign in, what role they have, and when access must be stopped.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline-primary" onClick={refreshData} disabled={loadingUsers || loadingAudit}>
            <MdRefresh className="me-1" aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4" aria-label="Account summary">
        <div className="col-12 col-sm-4">
          <div className="page-card h-100 d-flex align-items-center gap-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-light text-primary p-3"><MdManageAccounts size={23} aria-hidden="true" /></span>
            <div><div className="muted small">All accounts</div><div className="h3 mb-0">{users.length}</div></div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="page-card h-100 d-flex align-items-center gap-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success p-3"><MdCheckCircle size={23} aria-hidden="true" /></span>
            <div><div className="muted small">Active accounts</div><div className="h3 mb-0">{activeCount}</div></div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="page-card h-100 d-flex align-items-center gap-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-danger-subtle text-danger p-3"><MdBlock size={23} aria-hidden="true" /></span>
            <div><div className="muted small">Suspended accounts</div><div className="h3 mb-0">{suspendedCount}</div></div>
          </div>
        </div>
      </div>

      {errorMessage && <div className="alert alert-danger" role="alert">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success" role="status">{successMessage}</div>}

      <section className="page-card mb-4" aria-labelledby="create-user-heading">
        <div className="section-heading mt-0">
          <div>
            <h3 id="create-user-heading"><MdPersonAddAlt1 className="me-2" aria-hidden="true" />Create an account</h3>
            <p className="page-subtitle">Give each person their own sign-in. Share the initial password privately.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-username">Full name</label>
              <input id="user-username" type="text" name="username" value={formData.username} onChange={handleChange}
                className="form-control" placeholder="e.g. Priya Patel" autoComplete="name" minLength={2} maxLength={80} required />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-email">Email address</label>
              <input id="user-email" type="email" name="email" value={formData.email} onChange={handleChange}
                className="form-control" placeholder="name@school.com" autoComplete="email" maxLength={254} required />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-password">Initial password</label>
              <input id="user-password" type="password" name="password" value={formData.password} onChange={handleChange}
                className="form-control" placeholder="At least 12 characters" autoComplete="new-password"
                minLength={12} maxLength={128} required />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-role">Access role</label>
              <select id="user-role" name="role" value={formData.role} onChange={handleChange} className="form-select" required>
                <option value="teacher">Teacher — classroom tasks</option>
                <option value="admin">Administrator — full school access</option>
              </select>
            </div>
          </div>
          <div className="small muted mt-3 d-flex align-items-start gap-2">
            <MdShield size={18} className="flex-shrink-0 mt-1" aria-hidden="true" />
            <span>Use Teacher as the default least-privilege role. Only give Administrator access to people who need to manage school records and accounts.</span>
          </div>
          <div className="d-flex justify-content-end mt-3">
            <button type="submit" className="btn btn-primary" disabled={savingUser}>
              {savingUser ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Creating account…</> : "Create account"}
            </button>
          </div>
        </form>
      </section>

      <section className="page-card mb-4" aria-labelledby="user-list-heading">
        <div className="section-heading mt-0">
          <div>
            <h3 id="user-list-heading">Existing accounts</h3>
            <p className="page-subtitle">Role or status changes require a reason and revoke existing sign-in sessions.</p>
          </div>
          <div className="page-actions flex-wrap">
            <input type="search" className="form-control" aria-label="Search user accounts" placeholder="Search accounts…"
              value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} style={{ minWidth: "200px" }} />
            <select className="form-select" aria-label="Filter by access role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              <option value="admin">Administrators</option>
              <option value="teacher">Teachers</option>
              <option value="student">Legacy student accounts</option>
            </select>
            <select className="form-select" aria-label="Filter by account status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th scope="col">#</th><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col" className="text-end">Action</th></tr></thead>
            <tbody>
              {loadingUsers ? (
                <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" aria-hidden="true" />Loading accounts…</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state"><strong>{searchTerm || roleFilter !== "all" || statusFilter !== "all" ? "No matching accounts" : "No accounts found"}</strong>Try changing the filters or create an account using the form above.</div></td></tr>
              ) : filteredUsers.map((account, index) => {
                const isCurrentUser = String(account._id) === String(currentUser?.id || "");
                const isEditing = editingUserId === account._id;
                return (
                  <React.Fragment key={account._id}>
                    <tr>
                      <td>{index + 1}</td>
                      <td><div className="fw-semibold">{account.username || "—"}</div><div className="small muted">{account.email || "—"}</div></td>
                      <td><span className={"badge rounded-pill " + (account.role === "admin" ? "text-bg-primary" : "text-bg-light border text-dark")}>{roleLabel(account.role)}</span></td>
                      <td><span className={"badge rounded-pill " + (account.status === "suspended" ? "text-bg-danger" : "text-bg-success")}>{statusLabel(account.status)}</span></td>
                      <td>{formatDate(account.createdAt)}</td>
                      <td className="text-end">
                        {isCurrentUser ? <span className="small muted">Current account</span>
                          : account.role === "student" ? <span className="small muted">Legacy role</span>
                            : <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => isEditing ? cancelEdit() : beginEdit(account)} aria-expanded={isEditing}>
                              {isEditing ? <><MdClose className="me-1" aria-hidden="true" />Cancel</> : <><MdEdit className="me-1" aria-hidden="true" />Edit access</>}
                            </button>}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="table-primary">
                        <td colSpan={6}>
                          <form className="p-2 p-md-3" onSubmit={(event) => saveAccess(event, account)}>
                            <div className="row g-3 align-items-end">
                              <div className="col-12 col-md-3">
                                <label className="form-label" htmlFor={"edit-role-" + account._id}>Role</label>
                                <select id={"edit-role-" + account._id} className="form-select" value={editDraft.role}
                                  onChange={(event) => setEditDraft((draft) => ({ ...draft, role: event.target.value }))} required>
                                  <option value="teacher">Teacher</option><option value="admin">Administrator</option>
                                </select>
                              </div>
                              <div className="col-12 col-md-3">
                                <label className="form-label" htmlFor={"edit-status-" + account._id}>Account status</label>
                                <select id={"edit-status-" + account._id} className="form-select" value={editDraft.status}
                                  onChange={(event) => setEditDraft((draft) => ({ ...draft, status: event.target.value }))} required>
                                  <option value="active">Active — can sign in</option><option value="suspended">Suspended — sign-in blocked</option>
                                </select>
                              </div>
                              <div className="col-12 col-md-6">
                                <label className="form-label" htmlFor={"edit-reason-" + account._id}>Reason for change *</label>
                                <input id={"edit-reason-" + account._id} className="form-control" value={editDraft.reason}
                                  onChange={(event) => setEditDraft((draft) => ({ ...draft, reason: event.target.value }))}
                                  minLength={3} maxLength={500} placeholder="e.g. Role updated for the new term" required />
                              </div>
                              <div className="col-12 d-flex justify-content-between align-items-center gap-3 flex-wrap">
                                <span className="small muted">You cannot edit your own access or remove the last active administrator.</span>
                                <div className="d-flex gap-2">
                                  <button type="button" className="btn btn-outline-secondary" onClick={cancelEdit} disabled={savingAccess}>Cancel</button>
                                  <button type="submit" className="btn btn-primary" disabled={savingAccess}>
                                    {savingAccess ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving…</> : <><MdSave className="me-1" aria-hidden="true" />Save access</>}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="small muted mt-3">Showing {filteredUsers.length} of {users.length} accounts.</div>
      </section>

      <section className="page-card" aria-labelledby="user-access-history-heading">
        <div className="section-heading mt-0">
          <div>
            <h3 id="user-access-history-heading"><MdHistory className="me-2" aria-hidden="true" />Access history</h3>
            <p className="page-subtitle">Recent account creation and role/status changes. Reasons help explain why access changed.</p>
          </div>
        </div>
        {auditError && <div className="alert alert-warning py-2" role="status">{auditError}</div>}
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead><tr><th scope="col">When</th><th scope="col">Account</th><th scope="col">Change</th><th scope="col">Reason</th><th scope="col">Changed by</th></tr></thead>
            <tbody>
              {loadingAudit ? (
                <tr><td colSpan={5} className="text-center py-4">Loading access history…</td></tr>
              ) : auditEvents.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-4 muted">No access changes recorded yet.</td></tr>
              ) : auditEvents.map((event) => (
                <tr key={event.id}>
                  <td className="text-nowrap">{formatDateTime(event.createdAt)}</td>
                  <td><div className="fw-semibold">{event.targetName}</div><div className="small muted">{event.targetEmail}</div></td>
                  <td>
                    <div>{event.action === "user.created" ? "Account created" : "Access updated"}</div>
                    <div className="small muted">{event.action === "user.created"
                      ? roleLabel(event.role) + " · " + statusLabel(event.status)
                      : roleLabel(event.previousRole) + " → " + roleLabel(event.role) + " · " + statusLabel(event.previousStatus) + " → " + statusLabel(event.status)}</div>
                  </td>
                  <td>{event.reason || "—"}</td>
                  <td><div>{event.actor?.name || "Administrator"}</div><div className="small muted">{event.actor?.email || ""}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
