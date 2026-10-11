import React, { useState, useContext } from "react";
import axios from "axios";
import { useNavigate, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // ---------------- redirect to only admin
      await login({ email, password });
      if (user.role === "admin") {
        navigate("/dashboard"); // Redirect to dashboard after successful login
      } else if (user.role === "teacher") {
        navigate("/teacher-dashboard"); // Redirect to dashboard after successful login
      } else {
        alert("role is not define");
        navigate("/login"); // Redirect to dashboard after successful login
      }
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

 
  return (
    <>
     

      <div
        className="container w-100 d-flex align-items-center justify-content-center"
        style={{ minHeight: "calc(100vh - 100px)" }}
      >
        <div className="wrapper d-flex align-items-center justify-content-center h-100">
          <div
            className="card login-form"
            style={{ width: "300px", padding: "1rem 1rem 1rem" }}
          >
            <div className="card-body">
              <h5 className="card-title text-center">Login Form</h5>
              <form
                className="p-3 text-start"
                // onSubmit={onSubmit}
                onSubmit={handleSubmit}
              >
                <div className="mb-3">
                  <label htmlFor="exampleInputEmail1" className="form-label">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    id="exampleInputEmail1"
                    aria-describedby="emailHelp"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    // onChange={onChange}
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="exampleInputPassword1" className="form-label">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    className="form-control"
                    id="exampleInputPassword1"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    // onChange={onChange}
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100">
                  Submit
                </button>
                {/* <div className="sign-up mt-4">
            Don't have an account? <a href="#">Create One</a>
          </div> */}
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
