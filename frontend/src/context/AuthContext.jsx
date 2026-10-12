import React, { createContext, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";

const AuthContext = createContext(null);


const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (token) => {
    const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { "x-auth-token": token },
    });
    setUser(response.data.user);
    return response.data.user;
  }, []);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return () => { active = false; };
    }

    axios.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { "x-auth-token": token },
    }).then(({ data }) => {
      if (active) setUser(data.user);
    }).catch(() => {
      localStorage.removeItem("token");
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const register = async (userData) => {
    // Admins may create staff accounts; do not replace the admin's session with
    // the newly-created user's token. Public registration creates teacher users.
    const existingToken = localStorage.getItem("token");
    const { data } = await axios.post(`${API_BASE_URL}/api/auth/register`, userData, {
      headers: existingToken ? { "x-auth-token": existingToken } : {},
    });

    if (existingToken) {
      return fetchUserData(existingToken);
    }

    if (!data.token) throw new Error("Registration did not return an authentication token.");
    localStorage.setItem("token", data.token);
    return fetchUserData(data.token);
  };

  const login = async (credentials) => {
    const { data } = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials);
    if (!data.token) throw new Error("Login did not return an authentication token.");

    localStorage.setItem("token", data.token);
    return fetchUserData(data.token);
  };

  const setSession = async (token) => {
    if (!token) throw new Error("An authentication token is required.");
    localStorage.setItem("token", token);
    return fetchUserData(token);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, register, login, logout, setSession, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext, AuthProvider };
