import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MdSchool, MdCheckCircle, MdErrorOutline, MdLock, MdArrowBack } from "react-icons/md";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../parent-portal.css";

function readResetToken() {
  if (typeof window === "undefined") return "";
  const fragment = window.location.hash.slice(1);
  const params = new URLSearchParams(fragment);
  return params.get("token") || (fragment && !fragment.includes("=") ? fragment : "");
}

export default function ResetPassword() {
  const [token] = useState(readResetToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (token) {
      // Keep the one-time secret in component memory, not browser history.
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage("");
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setErrorMessage("Choose a password between 12 and 128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The password could not be updated.");
      setCompleted(true);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(error.message || "The reset link could not be used. Request a new one.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="parent-entry-shell">
      <section className="parent-entry-card" aria-labelledby="reset-password-heading">
        <span className="parent-entry-logo"><MdSchool aria-hidden="true" /></span>
        <span className="saas-eyebrow">SECURE ACCOUNT RECOVERY</span>
        <h1 id="reset-password-heading">Choose a new password</h1>
        {completed ? (
          <>
            <div className="saas-message success" role="status"><MdCheckCircle aria-hidden="true" /><span>Your password has been updated. For security, sign in again with your new password.</span></div>
            <Link to="/login" className="saas-primary-button parent-recovery-back">Go to sign in</Link>
          </>
        ) : !token ? (
          <>
            <div className="saas-message error" role="alert"><MdErrorOutline aria-hidden="true" /><span>This reset link is missing or incomplete. Request a new password reset email.</span></div>
            <Link to="/forgot-password" className="saas-primary-button parent-recovery-back">Request a new link</Link>
          </>
        ) : (
          <>
            <p className="parent-entry-intro">Create a password of at least 12 characters. After the reset, your other sign-in sessions will be invalidated.</p>
            <form className="saas-modal-form parent-entry-form" onSubmit={handleSubmit}>
              <label><span><MdLock aria-hidden="true" /> New password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
              <label><span><MdLock aria-hidden="true" /> Confirm new password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
              <small>Use 12–128 characters and avoid sharing this password with anyone.</small>
              {errorMessage && <div className="saas-message error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{errorMessage}</span></div>}
              <button className="saas-primary-button" type="submit" disabled={submitting}>{submitting ? "Updating password…" : "Update password"}</button>
            </form>
          </>
        )}
        <Link to="/login" className="saas-secondary-button parent-recovery-back"><MdArrowBack aria-hidden="true" /> Back to sign in</Link>
        <footer>Reset links expire after 30 minutes and can be used only once.</footer>
      </section>
    </main>
  );
}
