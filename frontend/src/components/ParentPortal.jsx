import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import LegacyParentPortal from "./LegacyParentPortal.jsx";

export default function ParentPortal() {
  const { user } = useContext(AuthContext);
  const hasSingleSchoolParentAccess =
    user?.role === "parent" &&
    user?.parentAccount?.mode === "legacy_single_school";

  if (!hasSingleSchoolParentAccess) {
    return <Navigate to="/login" replace />;
  }

  return <LegacyParentPortal />;
}
