import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";



const STANDARDS = [
  "ENG Play Group", "ENG NR.", "ENG JR.", "ENG SR.",
  "GUJ Play Group", "GUJ NR.", "GUJ JR.", "GUJ SR.",
];

const EMPTY_FILTERS = { date: "", subject: "", branch: "", userName: "", standard: "" };

export default function TeachersEntry() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const response = await axios.get(API_BASE_URL + "/api/dailyWorkReport/all");
      setReports(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching teacher work reports:", error);
      setPageError(error.response?.data?.message || "Unable to load teacher work reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilter((previous) => ({ ...previous, [name]: value }));
  };

  const filteredReports = useMemo(() => reports.filter((report) =>
    Object.entries(filter).every(([key, value]) =>
      !value || String(report[key] ?? "").toLowerCase().includes(value.toLowerCase())
    )
  ), [reports, filter]);

  const totalHours = filteredReports.reduce((sum, report) =>
    sum + (Number(report.todaysWorkingHours) || 0), 0
  );

  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      <div className="page-header">
        <div>
          <h2 className="mb-0">Teacher work reports</h2>
          <p className="page-subtitle">Review classroom activity, working hours, and student counts across the school.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline-primary" onClick={fetchReports} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh reports"}
          </button>
        </div>
      </div>

      <div className="overview-stat-grid">
        <section className="overview-stat-card">
          <div className="overview-stat-label">Reports shown</div>
          <div className="overview-stat-value">{filteredReports.length.toLocaleString("en-IN")}</div>
          <div className="muted small">After applying filters</div>
        </section>
        <section className="overview-stat-card">
          <div className="overview-stat-label">Total working hours</div>
          <div className="overview-stat-value">{totalHours.toFixed(2)}</div>
          <div className="muted small">Across the matching reports</div>
        </section>
      </div>

      <section className="page-card mb-4">
        <div className="section-heading mt-0">
          <h3>Find a work report</h3>
          <button type="button" className="btn btn-link btn-sm text-decoration-none" onClick={() => setFilter(EMPTY_FILTERS)}>Clear filters</button>
        </div>
        <div className="filter-panel mb-0" aria-label="Filter teacher work reports">
          <div>
            <label className="form-label" htmlFor="work-report-date">Date</label>
            <input id="work-report-date" type="date" name="date" className="form-control" value={filter.date} onChange={handleFilterChange} />
          </div>
          <div>
            <label className="form-label" htmlFor="work-report-teacher">Teacher name</label>
            <input id="work-report-teacher" type="search" name="userName" placeholder="Search teacher" className="form-control" value={filter.userName} onChange={handleFilterChange} />
          </div>
          <div>
            <label className="form-label" htmlFor="work-report-subject">Subject / activity</label>
            <input id="work-report-subject" type="search" name="subject" placeholder="Search subject" className="form-control" value={filter.subject} onChange={handleFilterChange} />
          </div>
          <div>
            <label className="form-label" htmlFor="work-report-branch">Branch</label>
            <input id="work-report-branch" type="search" name="branch" placeholder="Search branch" className="form-control" value={filter.branch} onChange={handleFilterChange} />
          </div>
          <div>
            <label className="form-label" htmlFor="work-report-standard">Standard</label>
            <select id="work-report-standard" name="standard" className="form-select" value={filter.standard} onChange={handleFilterChange}>
              <option value="">All standards</option>
              {STANDARDS.map((standard) => <option key={standard} value={standard}>{standard}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="page-card p-0">
        <div className="section-heading px-3 px-md-4 pt-3">
          <h3>Submitted reports</h3>
          <span className="muted small">{filteredReports.length} matching records</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Date</th>
                <th scope="col">Teacher</th>
                <th scope="col">Time in</th>
                <th scope="col">Time out</th>
                <th scope="col">Subject</th>
                <th scope="col">Standard</th>
                <th scope="col">Daily work</th>
                <th scope="col">Students</th>
                <th scope="col">Hours</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading reports…</td></tr>
              ) : filteredReports.length === 0 ? (
                <tr><td colSpan={10}><div className="empty-state"><strong>No matching work reports</strong>Try clearing or changing the filters. New submissions will appear here.</div></td></tr>
              ) : filteredReports.map((report, index) => (
                <tr key={report._id || index}>
                  <td>{index + 1}</td>
                  <td>{report.date || "—"}</td>
                  <td className="fw-semibold">{report.userName || "—"}</td>
                  <td>{report.TimeIn || "—"}</td>
                  <td>{report.TimeOut || "—"}</td>
                  <td>{report.subject || "—"}</td>
                  <td>{report.standard || "—"}</td>
                  <td style={{ minWidth: 220, whiteSpace: "normal" }}>{report.dailyWorkReport || "—"}</td>
                  <td>{Number(report.totalStudents) || 0}</td>
                  <td>{(Number(report.todaysWorkingHours) || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            {!loading && filteredReports.length > 0 && (
              <tfoot>
                <tr>
                  <th colSpan={9} className="text-end">Total working hours</th>
                  <th>{totalHours.toFixed(2)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
