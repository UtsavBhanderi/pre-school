import React, { useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import { MdPersonAddAlt1, MdManageAccounts } from "react-icons/md";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

const EMPTY_FORM = { username: "", email: "", password: "", role: "teacher" };

export default function AdminUsers() {
  const { register } = useContext(AuthContext);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setErrorMessage("");
    try {
      const response = await axios.get(API_BASE_URL + "/api/userDetailsself");
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to load user accounts.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
      await register({
        ...formData,
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
      });
      setFormData(EMPTY_FORM);
      setSuccessMessage("The account was created successfully.");
      await fetchUsers();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || error.message || "Unable to create this account.");
    } finally {
      setSavingUser(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return [user.username, user.email, user.role]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="mb-0">User access</h2>
          <p className="page-subtitle">Create staff accounts and keep access to school records under control.</p>
        </div>
        <div className="page-actions">
          <span className="badge rounded-pill text-bg-light border px-3 py-2">
            <MdManageAccounts className="me-1" aria-hidden="true" />
            {users.length} account{users.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <section className="page-card mb-4" aria-labelledby="create-user-heading">
        <div className="section-heading mt-0">
          <h3 id="create-user-heading"><MdPersonAddAlt1 className="me-2" aria-hidden="true" />Create an account</h3>
          <span className="muted small">Temporary passwords should be shared privately.</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-username">Full name</label>
              <input
                id="user-username"
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="form-control"
                placeholder="e.g. Priya Patel"
                autoComplete="name"
                maxLength={80}
                required
              />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-email">Email address</label>
              <input
                id="user-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="form-control"
                placeholder="name@school.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-password">Initial password</label>
              <input
                id="user-password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="form-control"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label" htmlFor="user-role">Access role</label>
              <select id="user-role" name="role" value={formData.role} onChange={handleChange} className="form-select" required>
                <option value="teacher">Teacher — daily work</option>
                <option value="admin">Administrator — full access</option>
              </select>
            </div>
          </div>
          {errorMessage && <div className="alert alert-danger mt-3 mb-0" role="alert">{errorMessage}</div>}
          {successMessage && <div className="alert alert-success mt-3 mb-0" role="status">{successMessage}</div>}
          <div className="d-flex justify-content-end mt-3">
            <button type="submit" className="btn btn-primary" disabled={savingUser}>
              {savingUser ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Creating account…</> : "Create account"}
            </button>
          </div>
        </form>
      </section>

      <section className="page-card" aria-labelledby="user-list-heading">
        <div className="section-heading mt-0">
          <div>
            <h3 id="user-list-heading">Existing accounts</h3>
            <p className="page-subtitle">Search by name, email, or role.</p>
          </div>
          <div className="page-actions">
            <input
              type="search"
              className="form-control"
              aria-label="Search user accounts"
              placeholder="Search accounts…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              style={{ minWidth: "220px" }}
            />
            <button type="button" className="btn btn-outline-primary" onClick={fetchUsers} disabled={loadingUsers}>
              Refresh
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Access role</th></tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr><td colSpan={4} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" aria-hidden="true" />Loading accounts…</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={4}><div className="empty-state"><strong>{searchTerm ? "No matching accounts" : "No accounts found"}</strong>{searchTerm ? "Try another search term." : "Create an account using the form above."}</div></td></tr>
              ) : filteredUsers.map((user, index) => (
                <tr key={user._id}>
                  <td>{index + 1}</td>
                  <td className="fw-semibold">{user.username || "—"}</td>
                  <td>{user.email || "—"}</td>
                  <td><span className={"badge rounded-pill " + (user.role === "admin" ? "text-bg-primary" : "text-bg-light border text-dark")}>{user.role || "teacher"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
