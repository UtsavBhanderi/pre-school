import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import axios from "axios";

function AdminUsers() {
 const linkone = `http://localhost:5000`;

  
  const [UsersData, setUsersData] = useState([]);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "teacher",
  });

  const { register } = useContext(AuthContext);

  const { username, email, password, role } = formData;

  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    register(formData);
  };

  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(`${linkone}` + "/api/userDetailsself");
        // const res = await axios.get('/api/auth/userDetails');
        setUsers(res.data);
      } catch (err) {
        console.error(
          "Error fetching users:",
          err.response ? err.response.data : err.message
        );
      }
    };

    fetchUsers();
  }, []);
  return (
    <>
      <div className="d-flex flex-column">
        <h1>User</h1>
        <form onSubmit={onSubmit}>
          <div className="d-flex col-12 column-gap-3 g-3 m-2">
            <input
              type="text"
              name="username"
              value={username}
              onChange={onChange}
              placeholder="Username"
              className="form-control"
              required
            />
            <input
              type="email"
              name="email"
              value={email}
              onChange={onChange}
              placeholder="Email"
              className="form-control"
              required
            />
            <input
              type="password"
              name="password"
              value={password}
              onChange={onChange}
              placeholder="Password"
              className="form-control"
              required
            />
            <select
              name="role"
              value={role}
              onChange={onChange}
              className="form-select"
            >
              <option value="teacher">teacher</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn btn-success col-1">
              Register
            </button>
          </div>
        </form>
        <br />
        <h3>Users Records</h3>
        <table className="table table-striped">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {/* {filteredfeesData.map((fees) => ( */}
            {/* {UsersData.map((user) => (
              <tr key={user._id}>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
              </tr>
            ))} */}
            {users.map((user, index) => (
              <tr key={user._id}>
                <td>{index + 1}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default AdminUsers;
