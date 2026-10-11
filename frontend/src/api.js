// One configuration source for every feature and authentication request.
// Local development keeps the familiar Express API port. In production, an
// empty base URL means that the frontend and API are served from the same origin.
const configuredBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const developmentFallback = import.meta.env.DEV ? "http://localhost:5000" : "";

export const API_BASE_URL = (configuredBase || developmentFallback).replace(/\/+$/, "");
