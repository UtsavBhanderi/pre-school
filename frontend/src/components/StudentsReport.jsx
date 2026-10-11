import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { useParams } from "react-router-dom";

/* ===============================
   API CONFIG
================================ */


const api = axios.create({ baseURL: API_BASE_URL });

/* ===============================
   COMPONENT
================================ */
const StudentsReport = () => {
  const { standard, reportId } = useParams();

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [marks, setMarks] = useState({});
  const [dates, setDates] = useState({});

  const [total, setTotal] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [grade, setGrade] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const [printStudent, setPrintStudent] = useState(null);
  const [printReport, setPrintReport] = useState(null);

  /* ===============================
     FETCH DATA
  ================================ */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [studentsRes, subjectsRes] = await Promise.all([
        api.get(`/api/students/${standard}`),
        api.get(`/api/subjects/${standard}`),
      ]);
      setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
      setSubjects(Array.isArray(subjectsRes.data?.subjects) ? subjectsRes.data.subjects : []);
    } catch (error) {
      console.error("Unable to load class report data:", error);
      setPageError(error.response?.data?.message || "Unable to load students and subjects for this report.");
    } finally {
      setLoading(false);
    }
  }, [standard]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ===============================
     LIVE TOTAL CALCULATION
  ================================ */
  useEffect(() => {
    const sum = Object.values(marks).reduce(
      (s, v) => s + Number(v || 0),
      0
    );
    setTotal(sum);
  }, [marks]);

  /* ===============================
     EDIT STUDENT
  ================================ */
  const handleEdit = async (student) => {
    setSelectedStudent(student);
    setMarks({});
    setDates({});
    setTotal(0);
    setPercentage(0);
    setGrade("");

    try {
      const { data } = await api.get(
        `/api/students/${student._id}/${reportId}`
      );

      const m = {};
      const d = {};

      data.subjectData.forEach((s) => {
        m[s.subject] = s.mark;
        d[s.subject] = s.date;
      });

      setMarks(m);
      setDates(d);
      setTotal(data.total);
      setPercentage(data.percentage);
      setGrade(data.grade);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error(err);
      }
    }
  };

  /* ===============================
     SAVE MARKS
  ================================ */
  const handleSave = async () => {
    if (!selectedStudent || saving) return;
    const invalidMark = subjects.find((subject) => {
      const value = marks[subject];
      return value !== "" && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0);
    });
    if (invalidMark) {
      setPageError("Marks must be zero or a positive number.");
      return;
    }

    setSaving(true);
    setPageError("");
    setPageSuccess("");
    const subjectData = subjects.map((subject) => ({
      subject,
      mark: Number(marks[subject]) || 0,
      date: dates[subject] || "",
    }));

    try {
      const response = await api.post(`/api/students/${selectedStudent._id}/${reportId}`, { subjectData });
      setTotal(response.data.total);
      setPercentage(response.data.percentage);
      setGrade(response.data.grade);
      setSelectedStudent(null);
      setPageSuccess("Marks saved successfully.");
      await fetchData();
    } catch (error) {
      console.error("Unable to save student marks:", error);
      setPageError(error.response?.data?.message || "Unable to save these marks. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ===============================
     PRINT PREVIEW
  ================================ */
  const handlePrintPreview = (student) => {
    const report = student.marks?.find(
      (m) => m.reportId?.toString() === reportId
    );

    if (!report) {
      setPageError("No saved marks are available to print for this student yet.");
      return;
    }
    setPageError("");
    setPageSuccess("");

    setPrintStudent(student);
    setPrintReport(report);
  };

  /* ===============================
     UI
  ================================ */
  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}
      <div className="page-header">
        <div>
          <h2 className="mb-0">Student report cards</h2>
          <p className="page-subtitle">Class: {standard}. Enter subject marks, save progress, or print a report card.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline-primary" onClick={fetchData} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh class"}
          </button>
        </div>
      </div>
      <div className="section-heading"><h3>Students in this class</h3><span className="muted small">{students.length} students</span></div>
      <div className="table-responsive"><table className="table table-hover align-middle">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Roll</th>
            <th>Total</th>
            <th>%</th>
            <th>Grade</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading students and subjects…</td></tr>
          ) : students.length === 0 ? (
            <tr><td colSpan={7}><div className="empty-state"><strong>No students found for this class</strong>Check the selected class or register a student before preparing report cards.</div></td></tr>
          ) : students.map((s, i) => {
            const report = s.marks?.find(
              (m) => m.reportId.toString() === reportId
            );

            return (
              <tr key={s._id}>
                <td>{i + 1}</td>
                <td className="fw-semibold">{[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td>{s.stuNo}</td>
                <td>{report?.total ?? "-"}</td>
                <td>{report?.percentage ?? "-"}</td>
                <td>{report?.grade ?? "-"}</td>
                <td>
                  <button
                    className="btn btn-warning btn-sm me-2"
                    onClick={() => handleEdit(s)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handlePrintPreview(s)}
                  >
                    Print
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>

      {/* ===============================
         EDIT MODAL
      ================================ */}
      {selectedStudent && (
        <div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby="marks-modal-title" style={{ background: "rgba(16,24,40,.45)", overflowY: "auto" }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="marks-modal-title">Enter marks · {[selectedStudent.firstName, selectedStudent.middleName, selectedStudent.lastName].filter(Boolean).join(" ")}</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedStudent(null)} />
              </div>

              <div className="modal-body">
                <div className="table-responsive"><table className="table table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((sub) => (
                      <tr key={sub}>
                        <td>{sub}</td>
                        <td>
                          <input
                            type="date"
                            className="form-control"
                            aria-label={"Assessment date for " + sub}
                            value={dates[sub] || ""}
                            onChange={(e) => setDates((previous) => ({ ...previous, [sub]: e.target.value }))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control"
                            min="0"
                            step="1"
                            aria-label={"Marks for " + sub}
                            value={marks[sub] ?? ""}
                            onChange={(e) => setMarks((previous) => ({ ...previous, [sub]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>

                <div className="d-flex flex-wrap gap-3 mt-3">
                  <span className="badge text-bg-light border px-3 py-2">Total: {total}</span>
                  <span className="badge text-bg-light border px-3 py-2">Percentage: {percentage}%</span>
                  <span className="badge text-bg-light border px-3 py-2">Grade: {grade || "—"}</span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving marks…" : "Save marks"}
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedStudent(null)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===============================
         PRINT PREVIEW MODAL
      ================================ */}
      {printStudent && printReport && (
        <div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby="print-report-title" style={{ background: "rgba(16,24,40,.45)", overflowY: "auto" }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content">

              <div className="modal-body" id="print-area">

                <div className="report-card">
                  <div className="header">
                    <div className="school-name">
                      Kidz Era Pre-School
                    </div>
                    <div className="report-title" id="print-report-title">
                      Student Report Card
                    </div>
                  </div>

                  <div className="info">
                    <div><span>Student Name:</span> {[printStudent.firstName, printStudent.middleName, printStudent.lastName].filter(Boolean).join(" ")}</div>
                    <div><span>Class:</span> {printStudent.standard}</div>
                    <div><span>Roll No:</span> {printStudent.stuNo}</div>
                    <div><span>Academic Year:</span> {printReport.batchYear || "—"}</div>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Subject / Skill</th>
                        <th>Marks Obtained</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReport.subjectData.map((s, i) => (
                        <tr key={i}>
                          <td>{s.subject}</td>
                          <td>{s.mark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="summary">
                    <div>Total Marks: {printReport.total}</div>
                    <div>Grade: {printReport.grade}</div>
                  </div>

                  <div className="remarks">
                    <div className="remarks-title">Teacher’s Remarks</div>
                    <div className="remarks-box"></div>
                  </div>

                  <div className="signatures">
                    <div className="sign-box">
                      <div className="line"></div>Class Teacher
                    </div>
                    <div className="sign-box">
                      <div className="line"></div>Head Teacher
                    </div>
                    <div className="sign-box">
                      <div className="line"></div>Parent / Guardian
                    </div>
                  </div>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                  Print / Save PDF
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setPrintStudent(null);
                    setPrintReport(null);
                  }}
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* PRINT CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
      <style>{`
/* ================= REPORT CARD STYLES ================= */

.report-card {
  max-width: 850px;
  margin: auto;
  background: #fff;
  border: 1px solid #cfd6e4;
  font-family: "Segoe UI", Arial, sans-serif;
  color: #222;
}

.header {
  text-align: center;
  padding: 20px;
  border-bottom: 2px solid #2f5bea;
}

.school-name {
  font-size: 24px;
  font-weight: 600;
  color: #2f5bea;
}

.report-title {
  font-size: 18px;
  margin-top: 5px;
  font-weight: 500;
}

.info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 20px;
  font-size: 14px;
}

.info span {
  font-weight: 600;
}

.report-card table {
  width: 100%;
  border-collapse: collapse;
}

.report-card th,
.report-card td {
  border: 1px solid #cfd6e4;
  padding: 10px;
  font-size: 14px;
  text-align: center;
}

.report-card th {
  background: #eef2ff;
  font-weight: 600;
}

.report-card td:first-child {
  text-align: left;
}

.summary {
  display: flex;
  justify-content: space-between;
  padding: 15px 20px;
  background: #f8f9fd;
  border-top: 2px solid #2f5bea;
  font-size: 15px;
  font-weight: 600;
}

.remarks {
  padding: 20px;
}

.remarks-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.remarks-box {
  border: 1px solid #cfd6e4;
  min-height: 70px;
  padding: 10px;
}

.signatures {
  display: flex;
  justify-content: space-between;
  padding: 25px 20px;
  font-size: 14px;
}

.sign-box {
  width: 30%;
  text-align: center;
}

.line {
  margin-top: 40px;
  border-top: 1px solid #444;
}

/* ================= PRINT ONLY ================= */

@media print {
  body * {
    visibility: hidden;
  }

  #print-area,
  #print-area * {
    visibility: visible;
  }

  #print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
`}</style>


    </div>
  );
};

export default StudentsReport;
