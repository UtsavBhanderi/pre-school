import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const linkone = `http://localhost:5000`;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const fetchData = async () => {
        try {
          const { data } = await axios.get(
            `${linkone}/api/auth/me`,
            {
              headers: { "x-auth-token": token },
            }
          );
          setUser(data.user);
        } catch (err) {
          console.error("Error fetching user data:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else {
      setLoading(false);
    }
  }, []);

  const register = async (userData) => {
    try {
      const { data } = await axios.post(
        `${linkone}/api/auth/register`,
        userData
      );
      localStorage.setItem("token", data.token);
      await fetchUserData(data.token); // Fetch user data after registration
    } catch (err) {
      console.error("Registration error:", err);
    }
  };

  const login = async (userData) => {
    try {
      const { data } = await axios.post(
        `${linkone}/api/auth/login`,
        userData
      );

      localStorage.setItem("token", data.token);
      await fetchUserData(data.token); // Fetch user data after login
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const fetchUserData = async (token) => {
    try {
      const { data } = await axios.get(`${linkone}/api/auth/me`, {
        headers: { "x-auth-token": token },
      });
      setUser(data.user);
    } catch (err) {
      console.error("Error fetching user data:", err);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, register, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext, AuthProvider };
