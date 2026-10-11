import React, { useState, useContext } from "react";
import axios from "axios";
import { useNavigate, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const Login = () => {
  {
    /**---------- for redirect to admin only
     */
  }
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

  //  const [formData, setFormData] = useState({ email: '', password: '' });
  //  const { login } = useContext(AuthContext);
  //  const navigate = useNavigate();

  //  const { email, password } = formData;

  //  // onChange function should update the state
  //  const onChange = (e) => {
  //    const { name, value } = e.target;
  //    setFormData({ ...formData, [name]: value });
  //  };

  //  const handleSubmit = async (e) => {
  //    e.preventDefault();
  //    console.log('Form submitted');
  //    try {
  //     console.log('Sending login request', formData); // Debugging line
  //      const res = await axios.post('/api/auth/login', formData);
  //     //  const res = await axios.post('/api/auth/me', formData);
  //      console.log('Response received', res.data);
  //      const userData = res.data;

  //      console.log(userData ,"userData login.jsx before");
  //      console.log(formData ,"formData login.jsx before");
  //      // Set user data in context
  //       login(formData.email , formData.password);
  //       // login(userData);
  //       console.log(userData ,"userData login.jsx after");

  //       // Redirect based on role
  //       if (userData.user.role === 'teacher') {
  //        console.log("teacher role userData login.jsx");
  //        navigate('/teacher-dashboard');
  //       } else if (userData.user.role === 'admin') {
  //        console.log("admin role userData login.jsx");
  //        navigate('/dashboard');
  //      } else {
  //        navigate('/dashboard'); // Default fallback
  //      }
  //    } catch (err) {
  //     //  console.error('Login error:', err.response.data);
  //      console.error('Login error:', err.response ? err.response.data : err.message);
  //    }
  //  };

  return (
    <>
      {/* <div className="d-flex align-items-center justify-content-center w-100 h-auto p-5 border border-1 border-black">
        <div className="card w-75 h-100 p-5">
          <h2>Login</h2>
          <form onSubmit={handleSubmit}>
            <div className="d-flex flex-column text-start m-3">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="d-flex flex-column text-start m-3">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary border-info">Login</button>
          </form>
        </div>
      </div> */}

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
