import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../api.js";
import { AuthContext } from "../../context/AuthContext";



const STANDARDS = [
  "ENG Play Group", "ENG NR.", "ENG JR.", "ENG SR.",
  "GUJ Play Group", "GUJ NR.", "GUJ JR.", "GUJ SR.",
];
const INITIAL_FORM = {
  TimeIn: "",
  TimeOut: "",
  subject: "",
  standard: "",
  branch: "",
  dailyWorkReport: "",
  totalStudents: "",
};
const INITIAL_FILTER = { date: "", subject: "", branch: "", standard: "" };

const TeacherDashboard = () => {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const [loadingReports, setLoadingReports] = useState(true);
  const [savingReport, setSavingReport] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const response = await axios.get(API_BASE_URL + "/api/dailyWorkReport");
      setReports(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Unable to load your work reports:", error);
      setPageError(error.response?.data?.message || "Unable to load your work reports.");
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchReports();
  }, [user, fetchReports]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
    setPageError("");
    setPageSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingReport) return;
    if (formData.TimeOut <= formData.TimeIn) {
      setPageError("Time out must be later than time in.");
      return;
    }
    const totalStudents = Number(formData.totalStudents);
    if (!Number.isInteger(totalStudents) || totalStudents < 0) {
      setPageError("Enter a valid student count.");
      return;
    }

    setSavingReport(true);
    setPageError("");
    setPageSuccess("");
    try {
      await axios.post(API_BASE_URL + "/api/dailyWorkReport", {
        ...formData,
        subject: formData.subject.trim(),
        dailyWorkReport: formData.dailyWorkReport.trim(),
        totalStudents,
      });
      setFormData(INITIAL_FORM);
      setPageSuccess("Your daily work report was submitted successfully.");
      await fetchReports();
    } catch (error) {
      console.error("Unable to submit daily work report:", error);
      setPageError(error.response?.data?.message || "Unable to submit the report. Check the fields and try again.");
    } finally {
      setSavingReport(false);
    }
  };

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
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}

      <section className="page-card mb-4">
        <div className="section-heading mt-0">
          <h3>Submit daily work report</h3>
          <span className="muted small">Signed in as {user?.username || "teacher"}</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-12 col-sm-6 col-lg-3">
              <label htmlFor="report-time-in" className="form-label">Time in</label>
              <input id="report-time-in" type="time" name="TimeIn" className="form-control" value={formData.TimeIn} onChange={handleChange} required />
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <label htmlFor="report-time-out" className="form-label">Time out</label>
              <input id="report-time-out" type="time" name="TimeOut" className="form-control" value={formData.TimeOut} onChange={handleChange} required />
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <label htmlFor="report-subject" className="form-label">Subject / activity</label>
              <input id="report-subject" type="text" name="subject" className="form-control" value={formData.subject} onChange={handleChange} placeholder="e.g. Phonics, art, outdoor play" maxLength={100} required />
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <label htmlFor="report-standard" className="form-label">Class / standard</label>
              <select id="report-standard" name="standard" className="form-select" value={formData.standard} onChange={handleChange} required>
                <option value="">Select class</option>
                {STANDARDS.map((standard) => <option key={standard} value={standard}>{standard}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-3">
              <label htmlFor="report-students" className="form-label">Number of students</label>
              <input id="report-students" type="number" name="totalStudents" className="form-control" value={formData.totalStudents} min="0" step="1" onChange={handleChange} required />
            </div>
            <div className="col-12 col-md-9">
              <label htmlFor="report-activity" className="form-label">What did you work on today?</label>
              <textarea id="report-activity" name="dailyWorkReport" className="form-control" value={formData.dailyWorkReport} onChange={handleChange} placeholder="Summarize lessons, activities, and anything the school should follow up on." maxLength={2000} required rows={3} />
            </div>
          </div>
          <div className="d-flex justify-content-end mt-3">
            <button type="submit" className="btn btn-primary" disabled={savingReport}>
              {savingReport ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Submitting…</> : "Submit work report"}
            </button>
          </div>
        </form>
      </section>

      <section className="page-card mb-4">
        <div className="section-heading mt-0">
          <div>
            <h3>Your submitted reports</h3>
            <p className="page-subtitle">Filter your submissions and review the total time recorded.</p>
          </div>
          <button type="button" className="btn btn-outline-primary" onClick={fetchReports} disabled={loadingReports}>
            {loadingReports ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="filter-panel">
          <div>
            <label htmlFor="my-report-date" className="form-label">Date</label>
            <input id="my-report-date" type="date" name="date" className="form-control" value={filter.date} onChange={handleFilterChange} />
          </div>
          <div>
            <label htmlFor="my-report-subject" className="form-label">Subject / activity</label>
            <input id="my-report-subject" type="search" name="subject" className="form-control" placeholder="Search reports" value={filter.subject} onChange={handleFilterChange} />
          </div>
          <div>
            <label htmlFor="my-report-standard" className="form-label">Class / standard</label>
            <select id="my-report-standard" name="standard" className="form-select" value={filter.standard} onChange={handleFilterChange}>
              <option value="">All classes</option>
              {STANDARDS.map((standard) => <option key={standard} value={standard}>{standard}</option>)}
            </select>
          </div>
          <div className="d-flex align-items-end">
            <button type="button" className="btn btn-link text-decoration-none px-0" onClick={() => setFilter(INITIAL_FILTER)}>Clear filters</button>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-3 mb-3">
          <div className="badge text-bg-light border px-3 py-2">{filteredReports.length} report{filteredReports.length === 1 ? "" : "s"}</div>
          <div className="badge text-bg-light border px-3 py-2">Total time: {totalHours.toFixed(2)} hours</div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">#</th><th scope="col">Date</th><th scope="col">Time in</th><th scope="col">Time out</th><th scope="col">Subject / activity</th><th scope="col">Class</th><th scope="col">Work summary</th><th scope="col">Students</th><th scope="col">Hours</th>
              </tr>
            </thead>
            <tbody>
              {loadingReports ? (
                <tr><td colSpan={9} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading your reports…</td></tr>
              ) : filteredReports.length === 0 ? (
                <tr><td colSpan={9}><div className="empty-state"><strong>No matching reports</strong>Submit a report above or change the filters to view previous submissions.</div></td></tr>
              ) : filteredReports.map((report, index) => (
                <tr key={report._id || index}>
                  <td>{index + 1}</td><td>{report.date || "—"}</td><td>{report.TimeIn || "—"}</td><td>{report.TimeOut || "—"}</td><td>{report.subject || "—"}</td><td>{report.standard || "—"}</td>
                  <td style={{ minWidth: 220, whiteSpace: "normal" }}>{report.dailyWorkReport || "—"}</td><td>{Number(report.totalStudents) || 0}</td><td>{(Number(report.todaysWorkingHours) || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            {!loadingReports && filteredReports.length > 0 && (
              <tfoot><tr><th colSpan={8} className="text-end">Total hours</th><th>{totalHours.toFixed(2)}</th></tr></tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
};

export default TeacherDashboard;
