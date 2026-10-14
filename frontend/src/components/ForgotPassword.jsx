import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MdSchool, MdCheckCircle, MdErrorOutline, MdAlternateEmail, MdArrowBack } from "react-icons/md";
import { API_BASE_URL } from "../api.js";
import "../saas-workspace.css";
import "../parent-portal.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "We could not process your request right now.");
      setSubmitted(true);
    } catch (error) {
      setErrorMessage(error.message || "We could not process your request right now. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="parent-entry-shell">
      <section className="parent-entry-card" aria-labelledby="forgot-password-heading">
        <span className="parent-entry-logo"><MdSchool aria-hidden="true" /></span>
        <span className="saas-eyebrow">SECURE ACCOUNT RECOVERY</span>
        <h1 id="forgot-password-heading">Forgot your password?</h1>
        {!submitted ? (
          <>
            <p className="parent-entry-intro">Enter the email address connected to your preschool account. If an account exists, we’ll send a one-time reset link.</p>
            <form className="saas-modal-form parent-entry-form" onSubmit={handleSubmit}>
              <label>
                <span><MdAlternateEmail aria-hidden="true" /> Email address</span>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required placeholder="you@example.com" />
              </label>
              {errorMessage && <div className="saas-message error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{errorMessage}</span></div>}
              <button className="saas-primary-button" type="submit" disabled={submitting}>{submitting ? "Sending request…" : "Send reset instructions"}</button>
            </form>
          </>
        ) : (
          <div className="saas-message success" role="status">
            <MdCheckCircle aria-hidden="true" />
            <span>If an account exists for that email address, password reset instructions will be sent shortly. Check your inbox and spam folder.</span>
          </div>
        )}
        <Link to="/login" className="saas-secondary-button parent-recovery-back"><MdArrowBack aria-hidden="true" /> Back to sign in</Link>
        <footer>For your protection, this page never reveals whether an email is registered.</footer>
      </section>
    </main>
  );
}
