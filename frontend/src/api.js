import axios from "axios";

// One configuration source for every feature and authentication request.
// Local development keeps the familiar Express API port. In production, an
// empty base URL means that the frontend and API are served from the same origin.
const configuredBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const developmentFallback = import.meta.env.DEV ? "http://localhost:5000" : "";

export const API_BASE_URL = (configuredBase || developmentFallback).replace(/\/+$/, "");

// Dedicated clients created with axios.create() do not inherit the global
// interceptor registered in main.jsx. Attach the current login token to every
// request made through a feature-scoped API client.
export const createAuthenticatedApi = (config = {}) => {
  const client = axios.create({ baseURL: API_BASE_URL, ...config });
  client.interceptors.request.use((request) => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    if (token) {
      request.headers = request.headers || {};
      request.headers["x-auth-token"] = token;
    }
    return request;
  });
  return client;
};
