import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createAuthenticatedApi } from "../api.js";
import StudentsReport from "./StudentsReport.jsx";
import "../teacher-report-cards.css";

const api = createAuthenticatedApi();

export default function TeacherReportCards() {
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/teacher-report-cards");
      setReports(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setReports([]);
      setError(requestError.response?.data?.message || "Your class report cards could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) =>
      String(report.reportName || "").toLowerCase().includes(query)
      || String(report.standard || "").toLowerCase().includes(query)
    );
  }, [reports, search]);

  if (selectedReport) {
    return (
      <StudentsReport
        teacherMode
        reportId={selectedReport._id}
        standard={selectedReport.standard}
        onBack={() => setSelectedReport(null)}
      />
    );
  }

  return (
    <div className="teacher-report-cards">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <section className="teacher-report-intro">
        <div>
          <span className="teacher-report-eyebrow">YOUR ASSIGNED CLASS</span>
          <h2>Report cards</h2>
          <p>Enter each child’s marks, reuse assessment dates and prepare print-ready progress reports.</p>
        </div>
        <button type="button" className="btn btn-outline-primary" onClick={loadReports} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      <div className="teacher-report-list-toolbar">
        <div>
          <strong>{filteredReports.length} report {filteredReports.length === 1 ? "template" : "templates"}</strong>
          <small>Only templates for your assigned class are shown.</small>
        </div>
        <input
          type="search"
          className="form-control"
          aria-label="Search class report cards"
          placeholder="Search report cards…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="teacher-report-empty" role="status">Loading your class report cards…</div>
      ) : filteredReports.length ? (
        <div className="teacher-report-grid">
          {filteredReports.map((report) => (
            <article className="teacher-report-template" key={report._id}>
              <div className="teacher-report-template-icon" aria-hidden="true">✎</div>
              <div className="teacher-report-template-copy">
                <span>{report.standard || "Assigned class"}</span>
                <h3>{report.reportName || "Student progress report"}</h3>
                <p>Maximum {report.description || "—"} marks per subject</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setSelectedReport(report)}>
                Enter marks
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="teacher-report-empty">
          <strong>{reports.length ? "No matching report cards" : "No report cards are ready yet"}</strong>
          <p>{reports.length
            ? "Try another search."
            : "Ask your school administrator to create a report-card template and configure your class subjects. It will appear here automatically."}</p>
        </div>
      )}
    </div>
  );
}
