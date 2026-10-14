import React, { createContext, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const requestUserData = useCallback(async (token) => {
    const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { "x-auth-token": token },
    });
    if (!response.data?.user) {
      throw new Error("The server did not return a valid account session.");
    }
    return response.data.user;
  }, []);

  const fetchUserData = useCallback(async (token) => {
    const nextUser = await requestUserData(token);
    setUser(nextUser);
    return nextUser;
  }, [requestUserData]);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return () => { active = false; };
    }

    requestUserData(token).then((nextUser) => {
      if (active) setUser(nextUser);
    }).catch(() => {
      // Do not remove a newer session if it replaced the token while this
      // initial request was in flight.
      if (localStorage.getItem("token") === token) {
        localStorage.removeItem("token");
      }
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [requestUserData]);

  const register = async (userData) => {
    const existingToken = localStorage.getItem("token");
    const { data } = await axios.post(`${API_BASE_URL}/api/auth/register`, userData, {
      headers: existingToken ? { "x-auth-token": existingToken } : {},
    });

    if (existingToken) return fetchUserData(existingToken);
    if (!data.token) throw new Error("Registration did not return an authentication token.");

    const nextUser = await requestUserData(data.token);
    localStorage.setItem("token", data.token);
    setUser(nextUser);
    return nextUser;
  };

  const login = async (credentials) => {
    const { data } = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials);
    if (!data.token) throw new Error("Sign-in did not return an authentication token.");

    try {
      // Validate the complete session before persisting its token. This avoids
      // leaving a stale token behind when credentials are valid but /auth/me
      // fails or returns an incomplete response.
      const nextUser = await requestUserData(data.token);
      localStorage.setItem("token", data.token);
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      localStorage.removeItem("token");
      setUser(null);
      throw error;
    }
  };

  const setSession = async (token) => {
    if (!token) throw new Error("An authentication token is required.");

    // Invitation acceptance must not create a half-authenticated browser state.
    // Commit the new token only after the backend confirms the session context.
    const nextUser = await requestUserData(token);
    localStorage.setItem("token", token);
    setUser(nextUser);
    return nextUser;
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
