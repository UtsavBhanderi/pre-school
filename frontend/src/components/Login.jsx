import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { MdSchool, MdVisibility, MdVisibilityOff, MdLockOutline, MdAlternateEmail } from "react-icons/md";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage("");
    setSubmitting(true);

    try {
      const loggedInUser = await login({ email: email.trim(), password });
      if ((!Array.isArray(loggedInUser?.memberships) || loggedInUser.memberships.length === 0) &&
          loggedInUser?.hasInactiveWorkspaceMemberships) {
        logout();
        setErrorMessage("Your school workspace access is inactive. Contact your preschool administrator to restore access.");
        return;
      }
      if (Array.isArray(loggedInUser?.memberships) && loggedInUser.memberships.length > 0 &&
          loggedInUser.memberships.every((membership) => membership.role === "parent")) {
        navigate("/parent-portal", { replace: true });
      } else if (Array.isArray(loggedInUser?.memberships) && loggedInUser.memberships.some((membership) => membership.role !== "parent")) {
        navigate("/dashboard", { replace: true });
      } else if (loggedInUser?.role === "admin") {
        navigate("/dashboard", { replace: true });
      } else if (loggedInUser?.role === "teacher") {
        navigate("/teacher-dashboard", { replace: true });
      } else {
        setErrorMessage("This account does not have access to a dashboard. Contact your administrator.");
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "We couldn't sign you in. Check your email and password, then try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container-fluid d-flex align-items-center justify-content-center py-3 py-md-5">
      <section className="login-shell" aria-label="Sign in to the school management system">
        <div className="login-brand-panel">
          <div>
            <div className="login-brand-mark"><MdSchool size={28} aria-hidden="true" /></div>
            <div className="login-brand-label">School administration</div>
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1>A smoother school day starts here.</h1>
            <p>One simple workspace for student records, attendance, fees, reports, and the people who make your school special.</p>
          </div>
          <div className="small" style={{ color: "#d4dfff", position: "relative", zIndex: 1 }}>
            Organized records. More time for children.
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="d-inline-flex align-items-center rounded-pill px-3 py-2 mb-3" style={{ background: "#edf2ff", color: "#3659c9", fontSize: "0.78rem", fontWeight: 700 }}>
              SECURE SCHOOL ACCESS
            </div>
            <h2>Welcome back</h2>
            <p className="muted mb-4">Sign in with the account provided by your school administrator.</p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <label htmlFor="login-email" className="form-label">Email address</label>
                <div className="input-group">
                  <span className="input-group-text bg-white" style={{ borderColor: "#d9e0eb", borderRadius: "10px 0 0 10px", color: "#667085" }}>
                    <MdAlternateEmail size={19} aria-hidden="true" />
                  </span>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    style={{ borderRadius: "0 10px 10px 0" }}
                    id="login-email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    placeholder="you@school.com"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-describedby={errorMessage ? "login-error" : undefined}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="login-password" className="form-label">Password</label>
                <div className="input-group">
                  <span className="input-group-text bg-white" style={{ borderColor: "#d9e0eb", borderRadius: "10px 0 0 10px", color: "#667085" }}>
                    <MdLockOutline size={19} aria-hidden="true" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className="form-control"
                    style={{ borderRadius: 0, borderRight: 0 }}
                    id="login-password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="input-group-text bg-white"
                    style={{ borderColor: "#d9e0eb", borderRadius: "0 10px 10px 0", color: "#667085", cursor: "pointer" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <MdVisibilityOff size={19} /> : <MdVisibility size={19} />}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div id="login-error" className="alert alert-danger py-3 mt-3" role="alert">
                  {errorMessage}
                </div>
              )}

              <button type="submit" className="btn btn-primary w-100 mt-3" disabled={submitting}>
                {submitting ? (
                  <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Signing you in…</>
                ) : "Sign in securely"}
              </button>
            </form>

            <div className="login-footer-note">
              <div className="login-help-links">
                <Link to="/forgot-password" className="login-recovery-link">Forgot your password?</Link>
                <Link to="/signup" className="login-recovery-link">Create a preschool account</Link>
              </div>
              <p>Having trouble signing in? Please contact your school administrator.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;
