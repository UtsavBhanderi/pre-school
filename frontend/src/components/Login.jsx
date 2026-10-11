import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      // Use the user returned by login instead of stale React state.
      const loggedInUser = await login({ email: email.trim(), password });
      if (loggedInUser?.role === "admin") {
        navigate("/dashboard", { replace: true });
      } else if (loggedInUser?.role === "teacher") {
        navigate("/teacher-dashboard", { replace: true });
      } else {
        setErrorMessage("This account does not have access to a dashboard.");
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Login failed. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container w-100 d-flex align-items-center justify-content-center" style={{ minHeight: "calc(100vh - 100px)" }}>
      <div className="wrapper d-flex align-items-center justify-content-center h-100">
        <div className="card login-form" style={{ width: "300px", padding: "1rem" }}>
          <div className="card-body">
            <h5 className="card-title text-center">Login Form</h5>
            <form className="p-3 text-start" onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="login-email" className="form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  id="login-email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="mb-3">
                <label htmlFor="login-password" className="form-label">Password</label>
                <input
                  type="password"
                  name="password"
                  className="form-control"
                  id="login-password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {errorMessage && <div className="alert alert-danger py-2" role="alert">{errorMessage}</div>}
              <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
