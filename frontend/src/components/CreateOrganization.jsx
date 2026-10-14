import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MdSchool, MdCheckCircle, MdErrorOutline, MdApartment, MdPerson, MdAlternateEmail, MdArrowBack } from "react-icons/md";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../parent-portal.css";

const defaultValues = {
  organizationName: "",
  branchName: "Main Branch",
  branchCode: "MAIN",
  username: "",
  email: "",
  timezone: "Asia/Kolkata",
};

export default function CreateOrganization() {
  const [values, setValues] = useState(defaultValues);
  const [statusLoading, setStatusLoading] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(API_BASE_URL + "/api/organizations/registration-status")
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok) throw new Error(data.message || "Signup status could not be checked.");
        setRegistrationEnabled(data.enabled === true);
        setPageMessage(data.message || "");
      })
      .catch(() => {
        if (active) setPageMessage("Online registration is temporarily unavailable. Please try again later.");
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => { active = false; };
  }, []);

  const update = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({
      ...current,
      [name]: name === "branchCode" ? value.toUpperCase().replace(/[^A-Z0-9-]/g, "") : value,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch(API_BASE_URL + "/api/organizations/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, email: values.email.trim().toLowerCase() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Signup could not be started.");
      setSubmitted(true);
    } catch (error) {
      setErrorMessage(error.message || "Signup could not be started. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="parent-entry-shell">
      <section className="parent-entry-card organization-signup-card" aria-labelledby="organization-signup-heading">
        <span className="parent-entry-logo"><MdSchool aria-hidden="true" /></span>
        <span className="saas-eyebrow">PRESCHOOL MANAGEMENT SAAS</span>
        <h1 id="organization-signup-heading">Create your preschool workspace</h1>
        {statusLoading ? <div className="saas-loading" role="status">Checking signup availability…</div> : !registrationEnabled ? (
          <>
            <div className="saas-message error" role="status"><MdErrorOutline aria-hidden="true" /><span>{pageMessage || "Online signup is not open yet."}</span></div>
            <p className="parent-entry-intro">Your school records are important. Online signup will open when secure onboarding and email verification are configured.</p>
          </>
        ) : submitted ? (
          <>
            <div className="saas-message success" role="status"><MdCheckCircle aria-hidden="true" /><span>If the email address can be used, we will send a verification link shortly. Check your inbox and spam folder. No account or school records are created before email verification.</span></div>
            <p className="parent-entry-intro">The verification link expires after 24 hours. You will choose your password after opening it.</p>
          </>
        ) : (
          <>
            <p className="parent-entry-intro">Tell us about your preschool and first branch. We will email a one-time verification link before creating your account.</p>
            <form className="saas-modal-form parent-entry-form" onSubmit={submit}>
              <label><span><MdApartment aria-hidden="true" /> Preschool / organization name *</span><input name="organizationName" value={values.organizationName} onChange={update} minLength={2} maxLength={120} required /></label>
              <div className="organization-signup-grid">
                <label>First branch name *<input name="branchName" value={values.branchName} onChange={update} minLength={2} maxLength={120} required /></label>
                <label>Branch code *<input name="branchCode" value={values.branchCode} onChange={update} pattern="[A-Z0-9]+(-[A-Z0-9]+)*" minLength={2} maxLength={16} required /></label>
              </div>
              <label><span><MdPerson aria-hidden="true" /> Owner / administrator full name *</span><input name="username" value={values.username} onChange={update} minLength={2} maxLength={80} required autoComplete="name" /></label>
              <label><span><MdAlternateEmail aria-hidden="true" /> Owner email address *</span><input name="email" type="email" value={values.email} onChange={update} maxLength={254} required autoComplete="email" /></label>
              <label>School time zone *
                <select name="timezone" value={values.timezone} onChange={update} required>
                  <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
                  <option value="Asia/Dubai">UAE (Asia/Dubai)</option>
                  <option value="Europe/London">United Kingdom (Europe/London)</option>
                  <option value="America/New_York">Eastern US (America/New_York)</option>
                  <option value="Australia/Sydney">Australia (Australia/Sydney)</option>
                </select>
              </label>
              <div className="organization-signup-privacy">By continuing, you confirm you are authorized to create this school workspace. Do not enter children's personal data during signup.</div>
              {errorMessage && <div className="saas-message error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{errorMessage}</span></div>}
              <button className="saas-primary-button" type="submit" disabled={submitting}>{submitting ? "Sending verification email…" : "Verify email to continue"}</button>
            </form>
          </>
        )}
        <Link to="/login" className="saas-secondary-button parent-recovery-back"><MdArrowBack aria-hidden="true" /> Back to sign in</Link>
        <footer>After verification, your first branch and owner account are created together in one transaction.</footer>
      </section>
    </main>
  );
}
