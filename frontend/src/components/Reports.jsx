import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import * as XLSX from "xlsx";

/* ===============================
   API CONFIG
================================ */


const api = axios.create({
  baseURL: API_BASE_URL,
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
      fetchReports();
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
    if (!window.confirm("Are you sure you want to delete this report?")) return;

    try {
      await api.delete(`/api/reportCard/${id}`);
      setReports((prev) => prev.filter((r) => r._id !== id));
      setPageSuccess("Report template deleted.");
      setPageError("");
    } catch (err) {
      console.error("Error deleting report:", err);
      setPageError(err.response?.data?.message || "Unable to delete the report template.");
    }
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
    try {
      const { data } = await api.get(
        `/api/reportCard/${reportId}/students`
      );

      const formattedData = data.map((student) => ({
        Name: student.name,
        RollNo: student.stuNo,
        Standard: student.standard,
        ...(Array.isArray(student.marks)
          ? student.marks.reduce(
              (acc, m) => ({ ...acc, [m.subject]: m.mark }),
              {}
            )
          : {}),
      }));

      exportToExcel(formattedData, "Student_Report");
    } catch (err) {
      console.error("Error exporting Excel:", err);
    }
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
        <div className="page-header"><div><h2 className="mb-0">Report cards</h2><p className="page-subtitle">Create report templates for a class, then enter marks and export student results.</p></div></div>

        <form onSubmit={handleSubmit} className="page-card report-create-form">
          <div className="report-field">
            <label>Report Name</label>
            <input
              type="text"
              className="form-control"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              required
            />
          </div>

          <div className="report-field">
            <label>Standard</label>
            <select
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
            <label>Out Of Marks</label>
            <input
              type="text"
              className="form-control"
              value={outOfMarks}
              onChange={(e) => setOutOfMarks(e.target.value)}
              required
            />
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
        <div className="section-heading"><h3>Report templates</h3><span className="muted small">{reports.length} templates</span></div>

        <div className="table-responsive"><table className="table table-hover align-middle">
          <thead>
            <tr>
              <th>#</th>
              <th>Report Name</th>
              <th>Standard</th>
              <th>Out Of Marks</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loadingReports ? (
              <tr><td colSpan={5} className="text-center py-5">Loading report templates…</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={5}><div className="empty-state"><strong>No report templates yet</strong>Create a template above to start preparing student progress reports.</div></td></tr>
            ) : reports.map((report, index) => (
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
                    Next
                  </button>


                  <button
                    className="btn btn-danger btn-sm me-2"
                    onClick={() => handleDelete(report._id)}
                  >
                    Delete
                  </button>

                  <button
                    className="btn btn-info btn-sm"
                    onClick={() => handleExcel(report._id)}
                  >
                    Excel
                  </button>
                </td>
              </tr>
            ))}

          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default Reports;
