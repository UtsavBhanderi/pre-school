import React, { useEffect, useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MdSchool, MdCheckCircle, MdErrorOutline, MdLock, MdArrowBack } from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../parent-portal.css";

export default function AcceptInvitation() {
  const navigate = useNavigate();
  const { setSession } = useContext(AuthContext);
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [token] = useState(() => {
    const fragment = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const fragmentParams = new URLSearchParams(fragment);
    return fragmentParams.get("token") || (fragment && !fragment.includes("=") ? fragment : "") ||
      (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : "") || "";
  });

  useEffect(() => {
    let active = true;
    const inspect = async () => {
      if (!token) {
        if (active) {
          setErrorMessage("This page needs the full invitation link sent by your preschool.");
          setLoading(false);
        }
        return;
      }
      try {
        // Remove the token from browser history immediately; the React state retains it for this one-time flow.
        window.history.replaceState({}, document.title, window.location.pathname);
        const response = await fetch(API_BASE_URL + "/api/invitations/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "This invitation cannot be used.");
        if (active) {
          setInvitation(data.invitation);
        }
      } catch (error) {
        if (active) setErrorMessage(error.message || "The invitation could not be checked.");
      } finally {
        if (active) setLoading(false);
      }
    };
    inspect();
    return () => { active = false; };
  }, [token]);

  const accept = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setErrorMessage("Use a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(API_BASE_URL + "/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The invitation could not be accepted.");
      if (!data.token) throw new Error("The server did not return a valid sign-in session.");
      setSuccessMessage(data.message || "Invitation accepted.");
      const activeUser = await setSession(data.token);
      const isParentOnly = Array.isArray(activeUser?.memberships) &&
        activeUser.memberships.length > 0 &&
        activeUser.memberships.every((membership) => membership.role === "parent");
      navigate(isParentOnly ? "/parent-portal" : "/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(error.message || "The invitation could not be accepted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="parent-entry-shell">
      <section className="parent-entry-card">
        <span className="parent-entry-logo"><MdSchool aria-hidden="true" /></span>
        <span className="saas-eyebrow">SECURE SCHOOL ACCESS</span>
        <h1>Join your preschool workspace</h1>
        {loading ? <div className="saas-loading" role="status">Checking your invitation…</div> : invitation ? (
          <>
            <div className="parent-invitation-details">
              <MdCheckCircle aria-hidden="true" />
              <div><strong>{invitation.organizationName}</strong><p>Invited as {String(invitation.role).replaceAll("_", " ")} · {invitation.fullName}</p><small>{invitation.email}</small></div>
            </div>
            <p className="parent-entry-intro">Activate access for {invitation.organizationName}. If you already have an account with this email, enter its current password; otherwise, create a new strong password. This single-use invitation expires on {new Date(invitation.expiresAt).toLocaleString("en-IN")}.</p>
            <form className="saas-modal-form parent-entry-form" onSubmit={accept}>
              <label><span><MdLock aria-hidden="true" /> New password or existing account password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required aria-describedby="invite-password-note" /></label>
              <label><span><MdLock aria-hidden="true" /> Confirm password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
              <small id="invite-password-note">Use 12 or more characters. For an existing account, enter its current password; for a new account, create one now.</small>
              <div className="parent-entry-privacy">Your access is limited to the organization and branch permissions selected by the school administrator.</div>
              {errorMessage && <div className="saas-message error" role="alert"><MdErrorOutline /><span>{errorMessage}</span></div>}
              {successMessage && <div className="saas-message success" role="status"><MdCheckCircle /><span>{successMessage}</span></div>}
              <button className="saas-primary-button" type="submit" disabled={saving}>{saving ? "Activating account…" : "Accept invitation and continue"}</button>
            </form>
          </>
        ) : (
          <>
            <div className="saas-message error" role="alert"><MdErrorOutline /><span>{errorMessage || "This invitation is no longer available."}</span></div>
            <p className="parent-entry-intro">Ask your preschool administrator to issue a new link.</p>
            <Link to="/login" className="saas-secondary-button"><MdArrowBack /> Back to sign in</Link>
          </>
        )}
        <footer>Never share your invitation link or password with anyone.</footer>
      </section>
    </main>
  );
}
