import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createAuthenticatedApi } from "../api.js";
import * as XLSX from "xlsx";
import "../report-cards.css";

/* ===============================
   API CONFIG
================================ */


const api = createAuthenticatedApi({
  headers: { "Content-Type": "application/json" },
});

/* ===============================
   COMPONENT
================================ */
const Reports = () => {
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [reportName, setReportName] = useState("");
  const [standard, setStandard] = useState("");
  const [outOfMarks, setOutOfMarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [exportingReportId, setExportingReportId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [deletingReportId, setDeletingReportId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");

  const filteredReports = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) => (
      String(report.reportName || "").toLowerCase().includes(query)
      || String(report.standard || "").toLowerCase().includes(query)
    ));
  }, [reports, templateSearch]);

  const coveredStandards = useMemo(
    () => new Set(reports.map((report) => report.standard).filter(Boolean)).size,
    [reports],
  );

  /* ===============================
     FETCH REPORTS
  ================================ */
  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const { data } = await api.get("/api/reportCard");
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching reports:", err);
      setPageError(err.response?.data?.message || "Unable to load report cards.");
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  /* ===============================
     CREATE REPORT
  ================================ */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post("/api/reportCard/create", {
        reportName,
        standard,
        description: outOfMarks,
      });

      setPageSuccess("Report template created successfully.");
      setPageError("");
      setReportName("");
      setStandard("");
      setOutOfMarks("");
      await fetchReports();
    } catch (err) {
      console.error("Error creating report:", err);
      setPageError(err.response?.data?.message || "Unable to create the report template.");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     DELETE REPORT
  ================================ */
  const handleDelete = async (id) => {
    if (deletingReportId) return;
    setDeletingReportId(id); setPageError(''); setPageSuccess('');
    try {
      await api.delete(`/api/reportCard/${id}`);
      setReports((previous) => previous.filter((report) => report._id !== id));
      setConfirmDeleteId('');
      setPageSuccess('Report template deleted.');
    } catch (error) {
      console.error('Unable to delete report template:', error);
      setConfirmDeleteId('');
      setPageError(error.response?.data?.message || 'Unable to delete the report template.');
    } finally { setDeletingReportId(''); }
  };

  /* ===============================
     NAVIGATION
  ================================ */
  const handleNext = (report) => {
    if (!report?.standard || !report?._id) return;
    navigate(`/dashboard/students/${report.standard}/${report._id}`);
  };

  /* ===============================
     EXCEL EXPORT
  ================================ */
  const exportToExcel = (data, name = "Report") => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

    XLSX.writeFile(
      workbook,
      `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const handleExcel = async (reportId) => {
    if (exportingReportId) return;
    setExportingReportId(reportId); setPageError(""); setPageSuccess("");
    try {
      const { data } = await api.get("/api/reportCard/" + reportId + "/students");
      const formattedData = data.map((student) => ({
        Name: student.name, GR_Number: student.stuNo, Standard: student.standard,
        ...(Array.isArray(student.marks) ? student.marks.reduce((acc, mark) => ({ ...acc, [mark.subject]: mark.mark }), {}) : {}),
        Total: student.total ?? "", Percentage: student.percentage ?? "", Grade: student.grade || "",
      }));
      exportToExcel(formattedData, "Student_Report"); setPageSuccess("Student report exported successfully.");
    } catch (err) {
      console.error("Error exporting Excel:", err);
      setPageError(err.response?.data?.message || "Student report could not be exported.");
    } finally { setExportingReportId(""); }
  };

  /* ===============================
     UI
  ================================ */
  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}
      {/* CREATE REPORT */}
      <div className="mt-3">
        <div className="page-header"><div><h2 className="mb-0">Report cards</h2><p className="page-subtitle">Prepare class assessments, track completion and print polished student report cards.</p></div></div>

        <div className="report-overview-grid" aria-label="Report card overview">
          <div><span>REPORT TEMPLATES</span><strong>{reports.length}</strong><small>Assessment sets available</small></div>
          <div><span>CLASSES COVERED</span><strong>{coveredStandards}</strong><small>Different standards</small></div>
          <div><span>WORKFLOW</span><strong>Enter · Review · Print</strong><small>Individual or whole-class copies</small></div>
        </div>

        <div className="report-workflow-guide" aria-label="Report card preparation steps">
          <div><span>01</span><strong>Set up subjects</strong><small>Choose the learning areas for this class first.</small></div>
          <div><span>02</span><strong>Create a report</strong><small>Name the term or assessment and set marks per subject.</small></div>
          <div><span>03</span><strong>Enter and print</strong><small>Reuse class dates, save each child and print their report card.</small></div>
        </div>
        <form onSubmit={handleSubmit} className="page-card report-create-form">
          <div className="report-field">
            <label htmlFor="report-template-name">Assessment / term name</label>
            <input
              id="report-template-name"
              type="text"
              className="form-control"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Term 1 Assessment"
              autoComplete="off"
              required
            />
          </div>

          <div className="report-field">
            <label htmlFor="report-template-standard">Class / standard</label>
            <select
              id="report-template-standard"
              className="form-control"
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
              required
            >
              <option value="">Select Standard</option>
              {[
                "ENG Play Group",
                "ENG NR.",
                "ENG JR.",
                "ENG SR.",
                "GUJ Play Group",
                "GUJ NR.",
                "GUJ JR.",
                "GUJ SR.",
              ].map((std) => (
                <option key={std} value={std}>
                  {std}
                </option>
              ))}
            </select>
          </div>

          <div className="col">
            <label htmlFor="report-template-maximum">Maximum marks per subject</label>
            <input
              id="report-template-maximum"
              type="number"
              min="1"
              max="10000"
              step="0.01"
              inputMode="decimal"
              className="form-control"
              value={outOfMarks}
              onChange={(e) => setOutOfMarks(e.target.value)}
              placeholder="e.g. 100"
              required
            />
            <small className="form-text">Each subject will be marked out of this value.</small>
          </div>

          <button
            type="submit"
            className="btn btn-primary align-self-end"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Report"}
          </button>
        </form>
      </div>

      {/* REPORT LIST */}
      <div className="mt-4">
        <div className="report-template-toolbar">
          <div className="section-heading"><div><h3>Report templates</h3><span className="muted small">{filteredReports.length} of {reports.length} templates</span></div></div>
          <input
            type="search"
            className="form-control"
            aria-label="Search report templates"
            placeholder="Search by report name or class…"
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
          />
        </div>

        <div className="table-responsive report-template-table-wrap"><table className="table table-hover align-middle">
          <thead>
            <tr>
              <th>#</th>
              <th>Report Name</th>
              <th>Standard</th>
              <th>Maximum marks</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loadingReports ? (
              <tr><td colSpan={5} className="text-center py-5">Loading report templates…</td></tr>
            ) : filteredReports.length === 0 ? (
              <tr><td colSpan={5}><div className="empty-state"><strong>{reports.length ? "No matching templates" : "No report templates yet"}</strong>{reports.length ? "Try another report name or class." : "Create a template above to start preparing student progress reports."}</div></td></tr>
            ) : filteredReports.map((report, index) => (
              <tr key={report._id}>
                <td>{index + 1}</td>
                <td>{report.reportName}</td>
                <td>{report.standard}</td>
                <td>{report.description}</td>
                <td>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleNext(report)}
                  >
                    Enter marks
                  </button>


                  {confirmDeleteId === report._id ? (
                    <>
                      <span className="d-block small text-muted mb-1">Templates with saved student marks are protected from deletion.</span>
                      <button type="button" className="btn btn-danger btn-sm me-1" onClick={() => handleDelete(report._id)} disabled={deletingReportId === report._id}>
                        {deletingReportId === report._id ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button type="button" className="btn btn-outline-secondary btn-sm me-2" onClick={() => setConfirmDeleteId("")} disabled={deletingReportId === report._id}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-outline-danger btn-sm me-2" onClick={() => setConfirmDeleteId(report._id)} disabled={Boolean(deletingReportId)}>Delete</button>
                  )}

                  <button
                    type="button"
                    className="btn btn-info btn-sm"
                    onClick={() => handleExcel(report._id)}
                    disabled={Boolean(exportingReportId)}
                  >
                    {exportingReportId === report._id ? "Preparing…" : "Export"}
                  </button>
                </td>
              </tr>
            ))}

          </tbody>
        </table></div>
        <div className="report-template-mobile-list" aria-label="Report templates">
          {loadingReports ? <div className="report-mobile-empty">Loading report templates…</div> : filteredReports.map((report, index) => (
            <article className="report-template-mobile-card" key={report._id}>
              <div className="report-template-mobile-heading">
                <span className="report-template-index">REPORT {index + 1}</span>
                <strong>{report.reportName}</strong>
                <small>{report.standard} · Out of {report.description}</small>
              </div>
              <div className="report-template-mobile-actions">
                <button type="button" className="btn btn-primary" onClick={() => handleNext(report)}>Enter marks</button>
                <button type="button" className="btn btn-outline-primary" onClick={() => handleExcel(report._id)} disabled={Boolean(exportingReportId)}>
                  {exportingReportId === report._id ? "Preparing…" : "Export"}
                </button>
                {confirmDeleteId === report._id ? (
                  <>
                    <button type="button" className="btn btn-outline-danger" onClick={() => handleDelete(report._id)} disabled={deletingReportId === report._id}>{deletingReportId === report._id ? "Deleting…" : "Confirm delete"}</button>
                    <button type="button" className="btn btn-light" onClick={() => setConfirmDeleteId("")} disabled={deletingReportId === report._id}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-light text-danger" onClick={() => setConfirmDeleteId(report._id)} disabled={Boolean(deletingReportId)}>Delete</button>
                )}
              </div>
              {confirmDeleteId === report._id && <small className="text-muted d-block mt-2">Templates with saved results cannot be deleted.</small>}
            </article>
          ))}
          {!loadingReports && filteredReports.length === 0 && <div className="report-mobile-empty">{reports.length ? "No matching templates. Try another search." : "No report templates yet. Create your first report above."}</div>}
        </div>
      </div>
    </div>
  );
};

export default Reports;
