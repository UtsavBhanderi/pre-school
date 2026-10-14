import React, { useEffect, useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MdSchool, MdCheckCircle, MdErrorOutline, MdLock, MdArrowBack } from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../parent-portal.css";

function readToken() {
  if (typeof window === "undefined") return "";
  const fragment = window.location.hash.slice(1);
  return new URLSearchParams(fragment).get("token") || "";
}

export default function VerifyOrganizationSignup() {
  const token = React.useMemo(readToken, []);
  const navigate = useNavigate();
  const { setSession } = useContext(AuthContext);
  const [signup, setSignup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setErrorMessage("This page needs the full verification link sent to your email.");
      setLoading(false);
      return () => { active = false; };
    }

    // Remove the secret from the address bar; keep it only in component memory.
    window.history.replaceState({}, document.title, window.location.pathname);
    fetch(API_BASE_URL + "/api/organizations/signup/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.message || "This verification link cannot be used.");
        if (active) setSignup(data.signup);
      })
      .catch((error) => {
        if (active) setErrorMessage(error.message || "The verification link could not be checked.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  const submit = async (event) => {
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
      const response = await fetch(API_BASE_URL + "/api/organizations/signup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Your preschool workspace could not be created.");
      if (!data.token) throw new Error("The server did not return a valid sign-in session.");
      setCompleted(true);
      const activeUser = await setSession(data.token);
      if (activeUser) navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(error.message || "Your preschool workspace could not be created safely.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="parent-entry-shell">
      <section className="parent-entry-card organization-signup-card" aria-labelledby="verify-organization-heading">
        <span className="parent-entry-logo"><MdSchool aria-hidden="true" /></span>
        <span className="saas-eyebrow">EMAIL VERIFICATION</span>
        <h1 id="verify-organization-heading">Finish setting up your preschool</h1>
        {loading ? <div className="saas-loading" role="status">Checking your verification link…</div> : signup ? (
          <>
            <div className="parent-invitation-details">
              <MdCheckCircle aria-hidden="true" />
              <div><strong>{signup.organizationName}</strong><p>First branch: {signup.branchName}</p><small>{signup.email} · {signup.ownerName}</small></div>
            </div>
            <p className="parent-entry-intro">Your email link is valid until {new Date(signup.expiresAt).toLocaleString("en-IN")}. Create a strong password to finish setup. Your first branch and 14-day trial will be created after confirmation.</p>
            <form className="saas-modal-form parent-entry-form" onSubmit={submit}>
              <label><span><MdLock aria-hidden="true" /> Create password *</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
              <label><span><MdLock aria-hidden="true" /> Confirm password *</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
              <small>Use 12–128 characters. You can add staff and parent accounts after signing in.</small>
              {errorMessage && <div className="saas-message error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{errorMessage}</span></div>}
              <button className="saas-primary-button" type="submit" disabled={submitting}>{submitting ? "Creating secure workspace…" : "Verify and create workspace"}</button>
            </form>
          </>
        ) : (
          <>
            <div className="saas-message error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{errorMessage || "This verification link is no longer available."}</span></div>
            <p className="parent-entry-intro">Return to signup and request a fresh verification link.</p>
            <Link to="/signup" className="saas-primary-button parent-recovery-back">Start again</Link>
          </>
        )}
        <Link to="/login" className="saas-secondary-button parent-recovery-back"><MdArrowBack aria-hidden="true" /> Back to sign in</Link>
        <footer>We do not create your workspace until the email has been verified.</footer>
      </section>
    </main>
  );
}
