import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  MdSchool, MdShield, MdPhoneIphone, MdOutlineBadge,
  MdCheckCircle, MdErrorOutline, MdArrowForward, MdFamilyRestroom,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../parent-access.css";

export default function ParentAccess() {
  const { schoolSlug = "" } = useParams();
  const navigate = useNavigate();
  const { setSession } = useContext(AuthContext);
  const [school, setSchool] = useState(null);
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadSchool = async () => {
      try {
        const response = await axios.get(API_BASE_URL + "/api/parent-access/config");
        if (!active) return;
        const data = response.data || {};
        if (schoolSlug && data.school?.slug !== schoolSlug) {
          setErrorMessage("This parent portal link does not match the active preschool. Please use the latest link shared by your school.");
          return;
        }
        setSchool(data.school || null);
      } catch (error) {
        if (active) setErrorMessage(error.response?.data?.message || "The parent portal is not configured yet. Please contact your preschool office.");
      } finally {
        if (active) setLoadingSchool(false);
      }
    };
    loadSchool();
    return () => { active = false; };
  }, [schoolSlug]);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage("");

    if (!identifier.trim() || !phone.trim()) {
      setErrorMessage("Enter your child's GR number or the registered parent email, and the registered mobile number.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(API_BASE_URL + "/api/parent-access/login", {
        schoolSlug: school?.slug || schoolSlug,
        identifier: identifier.trim(),
        phone: phone.trim(),
      });
      if (!response.data?.token) throw new Error("The school could not create a secure parent session.");
      await setSession(response.data.token);
      navigate("/parent-portal", { replace: true });
    } catch (error) {
      setErrorMessage(error.response?.data?.message || error.message || "We could not sign you in. Check the GR number/email and registered mobile number.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="parent-access-page">
      <div className="parent-access-shell">
        <section className="parent-access-intro">
          <div className="parent-access-brand">
            <span className="parent-access-brand-mark"><MdSchool aria-hidden="true" /></span>
            <span><strong>{school?.name || "Preschool"}</strong><small>Family portal</small></span>
          </div>
          <div className="parent-access-intro-copy">
            <span className="parent-access-eyebrow">YOUR CHILD'S SCHOOL, WITH YOU</span>
            <h1>Your preschool, closer to home.</h1>
            <p>Check your child's attendance, fee details, school notices and learning updates from one simple family portal.</p>
          </div>
          <div className="parent-access-benefits">
            <div><span><MdFamilyRestroom /></span><div><strong>Only your linked children</strong><small>Your family records are matched to the details saved by your preschool.</small></div></div>
            <div><span><MdShield /></span><div><strong>Private family access</strong><small>Your account can only view children connected to the matching school record.</small></div></div>
            <div><span><MdCheckCircle /></span><div><strong>No separate registration</strong><small>Use your existing student GR number or parent email and registered mobile number.</small></div></div>
          </div>
          <div className="parent-access-help">
            <span>Need help?</span>
            Contact your preschool office to correct your GR number, registered email or mobile number.
            {school?.contactPhone && <strong>{school.contactPhone}</strong>}
            {school?.contactEmail && <strong>{school.contactEmail}</strong>}
          </div>
        </section>

        <section className="parent-access-form-panel">
          <div className="parent-access-form-heading">
            <span className="parent-access-secure-label"><MdShield aria-hidden="true" /> PARENT / GUARDIAN SIGN IN</span>
            <h2>Welcome to your family portal</h2>
            <p>Enter the student or parent details already registered with your preschool.</p>
          </div>

          {loadingSchool ? (
            <div className="parent-access-status" role="status">Loading your preschool details…</div>
          ) : errorMessage && !school ? (
            <div className="parent-access-alert error" role="alert"><MdErrorOutline />{errorMessage}</div>
          ) : (
            <form className="parent-access-form" onSubmit={submit}>
              <label>
                <span><MdOutlineBadge aria-hidden="true" /> Student GR number or parent email *</span>
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="e.g. GR-2026-0042 or parent@email.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                  minLength={2}
                  maxLength={254}
                />
                <small>Use the GR number on your school record, or the parent email saved at admission.</small>
              </label>

              <label>
                <span><MdPhoneIphone aria-hidden="true" /> Registered parent mobile number *</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="10-digit mobile number"
                  autoComplete="tel"
                  maxLength={24}
                  required
                />
                <small>Enter the mobile number saved in your child's admission record or family contact.</small>
              </label>

              {errorMessage && <div className="parent-access-alert error" role="alert"><MdErrorOutline />{errorMessage}</div>}

              <div className="parent-access-consent">
                No separate registration or code is required. Access is granted only when both details match the school's saved record.
              </div>

              <button type="submit" className="parent-access-submit" disabled={submitting || loadingSchool || !school}>
                {submitting ? "Signing you in…" : "Sign in to parent dashboard"}
                {!submitting && <MdArrowForward aria-hidden="true" />}
              </button>
            </form>
          )}

          <div className="parent-access-login-link">
            School staff? <Link to="/login">Go to staff sign in <MdArrowForward aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </main>
  );
}
