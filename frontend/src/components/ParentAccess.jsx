import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  MdSchool, MdShield, MdLockOutline, MdPhoneIphone, MdOutlineBadge,
  MdAlternateEmail, MdPersonOutline, MdVisibility, MdVisibilityOff,
  MdCheckCircle, MdErrorOutline, MdArrowForward, MdFamilyRestroom,
} from "react-icons/md";
import { AuthContext } from "../context/AuthContext.jsx";
import { API_BASE_URL } from "../api.js";
import "../parent-access.css";

const EMPTY_FORM = {
  identifier: "",
  phone: "",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function ParentAccess() {
  const { schoolSlug = "" } = useParams();
  const navigate = useNavigate();
  const { setSession } = useContext(AuthContext);
  const [school, setSchool] = useState(null);
  const [parentAccessUrl, setParentAccessUrl] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadSchool = async () => {
      try {
        const response = await axios.get(API_BASE_URL + "/api/parent-access/config");
        if (!active) return;
        const data = response.data || {};
        if (schoolSlug && data.school?.slug !== schoolSlug) {
          setErrorMessage("This parent access link does not match the active preschool. Please use the latest link shared by your school.");
          return;
        }
        setSchool(data.school || null);
        setParentAccessUrl(data.parentAccessUrl || "");
      } catch (error) {
        if (active) setErrorMessage(error.response?.data?.message || "The parent portal is not configured yet. Please contact your preschool office.");
      } finally {
        if (active) setLoadingSchool(false);
      }
    };
    loadSchool();
    return () => { active = false; };
  }, [schoolSlug]);

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "identifier" && value.includes("@") && !current.email) {
        next.email = value.trim().toLowerCase();
      }
      return next;
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage("");
    setSuccessMessage("");

    if (form.password.length < 8 || form.password.length > 128 || !form.password.trim()) {
      setErrorMessage("Enter your current password, or create a new password with at least 12 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }
    if (!form.identifier.trim() || !form.phone.trim() || !form.fullName.trim() || !form.email.trim()) {
      setErrorMessage("Complete all required fields to activate parent access.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(API_BASE_URL + "/api/parent-access/activate", {
        schoolSlug: school?.slug || schoolSlug,
        identifier: form.identifier.trim(),
        phone: form.phone.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (!response.data?.token) throw new Error("The school could not create a secure parent session.");
      setSuccessMessage(response.data.message || "Parent access activated.");
      await setSession(response.data.token);
      navigate("/parent-portal", { replace: true });
    } catch (error) {
      setErrorMessage(error.response?.data?.message || error.message || "Parent access could not be activated.");
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
            <span className="parent-access-eyebrow">A SECURE SPACE FOR YOUR FAMILY</span>
            <h1>Your preschool, closer to home.</h1>
            <p>See your child’s school day, attendance, fee details, notices and learning updates from one simple family portal.</p>
          </div>
          <div className="parent-access-benefits">
            <div><span><MdFamilyRestroom /></span><div><strong>Only your linked children</strong><small>Family records are matched to the details saved by your preschool.</small></div></div>
            <div><span><MdShield /></span><div><strong>Private parent access</strong><small>Your login cannot browse other children or families.</small></div></div>
            <div><span><MdCheckCircle /></span><div><strong>One-time activation</strong><small>Activate your family login once, then sign in whenever you need.</small></div></div>
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
            <span className="parent-access-secure-label"><MdShield aria-hidden="true" /> SECURE PARENT ACCESS</span>
            <h2>Set up your family login</h2>
            <p>Enter the same details that your preschool has on your child’s record.</p>
          </div>

          {loadingSchool ? (
            <div className="parent-access-status" role="status">Loading your preschool details…</div>
          ) : errorMessage && !school ? (
            <div className="parent-access-alert error" role="alert"><MdErrorOutline />{errorMessage}</div>
          ) : (
            <form className="parent-access-form" onSubmit={submit}>
              <label>
                <span><MdOutlineBadge aria-hidden="true" /> Student GR number or registered parent email *</span>
                <input
                  value={form.identifier}
                  onChange={(event) => updateField("identifier", event.target.value)}
                  placeholder="e.g. 26ABC001 or parent@email.com"
                  autoComplete="off"
                  required
                  minLength={2}
                  maxLength={254}
                />
                <small>Use the GR number shown on the school receipt, or the parent email saved at admission.</small>
              </label>

              <label>
                <span><MdPhoneIphone aria-hidden="true" /> Registered parent mobile number *</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="10-digit mobile number"
                  autoComplete="tel"
                  maxLength={24}
                  required
                />
                <small>This must match the phone number already registered with the preschool.</small>
              </label>

              <div className="parent-access-form-divider"><span>Your login details</span></div>

              <label>
                <span><MdPersonOutline aria-hidden="true" /> Parent / guardian full name *</span>
                <input
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>

              <label>
                <span><MdAlternateEmail aria-hidden="true" /> Email address for sign-in *</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
                <small>Use this email and your password each time you sign in.</small>
              </label>

              <label>
                <span><MdLockOutline aria-hidden="true" /> Password *</span>
                <div className="parent-access-password">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    aria-describedby="parent-password-help"
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                  </button>
                </div>
                <small id="parent-password-help">New account: use at least 12 characters. Existing account: enter your current password.</small>
              </label>

              <label>
                <span><MdLockOutline aria-hidden="true" /> Confirm password *</span>
                <div className="parent-access-password">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) => updateField("confirmPassword", event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                    {showConfirmPassword ? <MdVisibilityOff /> : <MdVisibility />}
                  </button>
                </div>
              </label>

              {errorMessage && <div className="parent-access-alert error" role="alert"><MdErrorOutline />{errorMessage}</div>}
              {successMessage && <div className="parent-access-alert success" role="status"><MdCheckCircle />{successMessage}</div>}

              <div className="parent-access-consent">
                The school matches your child identifier and registered mobile number. Only the family records linked to the matching school contact are added to your account.
              </div>

              <button type="submit" className="parent-access-submit" disabled={submitting}>
                {submitting ? "Verifying family details…" : "Activate parent access"}
                {!submitting && <MdArrowForward aria-hidden="true" />}
              </button>
            </form>
          )}

          <div className="parent-access-login-link">
            Already activated your account? <Link to="/login">Sign in <MdArrowForward aria-hidden="true" /></Link>
          </div>
          {parentAccessUrl && <div className="parent-access-url-note">Official family portal link: {parentAccessUrl}</div>}
        </section>
      </div>
    </main>
  );
}
