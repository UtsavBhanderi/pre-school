import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { createAuthenticatedApi } from "../api.js";
import { Link, useParams } from "react-router-dom";
import "../report-cards.css";

/* ===============================
   API CONFIG
================================ */


const api = createAuthenticatedApi();
const formatAssessmentDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
};
const getGrade = (percentage) => {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "E";
};

/* ===============================
   COMPONENT
================================ */
const StudentsReport = ({
  teacherMode = false,
  reportId: providedReportId,
  standard: providedStandard,
  onBack,
}) => {
  const routeParams = useParams();
  const standard = providedStandard || routeParams.standard;
  const reportId = providedReportId || routeParams.reportId;
  const reportApiPrefix = teacherMode ? "/api/teacher-report-cards" : "/api/reportCard";
  const studentMarksPath = (studentId) => teacherMode
    ? reportApiPrefix + "/" + reportId + "/students/" + studentId
    : "/api/students/" + studentId + "/" + reportId;

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [outOfMarks, setOutOfMarks] = useState(0);
  const [reportName, setReportName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [loadingStudentId, setLoadingStudentId] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [marks, setMarks] = useState({});
  const [dates, setDates] = useState({});
  const [studentSearch, setStudentSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");

  const [total, setTotal] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [grade, setGrade] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const [printBatch, setPrintBatch] = useState([]);
  const [selectedPrintStudentIds, setSelectedPrintStudentIds] = useState([]);

  /* ===============================
     FETCH DATA
  ================================ */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const { data } = await api.get(`${reportApiPrefix}/${reportId}/roster`);
      if (data?.report?.standard !== standard) {
        throw new Error('This report template does not belong to the selected class.');
      }
      setStudents(Array.isArray(data.students) ? data.students : []);
      setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
      setOutOfMarks(Number(data.report.outOfMarks) || 0);
      setReportName(data.report.reportName || 'Student report');
    } catch (error) {
      console.error('Unable to load report class data:', error);
      setPageError(error.response?.data?.message || error.message || 'Unable to load the selected report template.');
      setStudents([]); setSubjects([]); setOutOfMarks(0); setReportName('');
    } finally { setLoading(false); }
  }, [standard, reportId, reportApiPrefix]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let active = true;
    api.get("/api/parent-access/config")
      .then(({ data }) => {
        if (active) setSchoolName(String(data?.school?.name || "").trim());
      })
      .catch(() => { /* Keep the generic school heading when no name is configured. */ });
    return () => { active = false; };
  }, []);

  // Keep modal interactions predictable on desktop and mobile, including Escape
  // handling and preventing the page behind an open dialog from scrolling.
  useEffect(() => {
    const modalOpen = Boolean(selectedStudent || printBatch.length);
    if (!modalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || saving) return;
      if (selectedStudent) setSelectedStudent(null);
      if (printBatch.length) setPrintBatch([]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedStudent, printBatch.length, saving]);

  const getSavedReport = useCallback((student) => (
    student?.marks?.find((item) => String(item.reportId?._id || item.reportId || "") === String(reportId)) || null
  ), [reportId]);

  // Assessment dates are usually shared by the class. Reuse the most common
  // saved date for each subject so staff do not re-enter it for every child.
  const getReusableDates = useCallback((excludedStudentId = "") => {
    const dateCounts = {};
    students.forEach((student) => {
      if (String(student._id) === String(excludedStudentId)) return;
      const saved = getSavedReport(student);
      (saved?.subjectData || []).forEach((entry) => {
        if (!entry?.subject || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ""))) return;
        dateCounts[entry.subject] ||= {};
        dateCounts[entry.subject][entry.date] = (dateCounts[entry.subject][entry.date] || 0) + 1;
      });
    });
    return Object.fromEntries(Object.entries(dateCounts).map(([subject, counts]) => {
      const preferred = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
      return [subject, preferred?.[0] || ""];
    }));
  }, [students, getSavedReport]);

  const completedCount = useMemo(() => students.filter((student) => getSavedReport(student)).length, [students, getSavedReport]);
  const pendingCount = Math.max(0, students.length - completedCount);
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return students.filter((student) => {
      const name = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ").toLowerCase();
      const matchesQuery = !query || name.includes(query) || String(student.stuNo || "").toLowerCase().includes(query);
      const completed = Boolean(getSavedReport(student));
      const matchesStatus = resultFilter === "all" || (resultFilter === "completed" ? completed : !completed);
      return matchesQuery && matchesStatus;
    });
  }, [students, studentSearch, resultFilter, getSavedReport]);

  const visibleCompletedStudentIds = useMemo(
    () => filteredStudents.filter((student) => getSavedReport(student)).map((student) => String(student._id)),
    [filteredStudents, getSavedReport],
  );
  const allVisibleCompletedSelected = visibleCompletedStudentIds.length > 0
    && visibleCompletedStudentIds.every((id) => selectedPrintStudentIds.includes(id));
  const selectedPrintCount = useMemo(
    () => students.filter((student) => selectedPrintStudentIds.includes(String(student._id)) && getSavedReport(student)).length,
    [students, selectedPrintStudentIds, getSavedReport],
  );

  const commonAssessmentDate = subjects.length && subjects.every((subject) => dates[subject] && dates[subject] === dates[subjects[0]])
    ? dates[subjects[0]]
    : "";
  const hasNextPendingStudent = Boolean(selectedStudent && students.some((student) => (
    String(student._id) !== String(selectedStudent._id) && student.standard === standard && !getSavedReport(student)
  )));

  /* ===============================
     LIVE TOTAL CALCULATION
  ================================ */
  useEffect(() => {
    const totalPaise = Object.values(marks).reduce((sum, value) => {
      const numeric = Number(value || 0);
      return sum + (Number.isFinite(numeric) ? Math.round(numeric * 100) : 0);
    }, 0);
    const nextTotal = totalPaise / 100;
    const maximumTotal = subjects.length * Number(outOfMarks);
    const nextPercentage = maximumTotal > 0
      ? Number(((nextTotal / maximumTotal) * 100).toFixed(2))
      : 0;
    setTotal(nextTotal);
    setPercentage(nextPercentage);
    setGrade(Object.keys(marks).length ? getGrade(nextPercentage) : "");
  }, [marks, subjects, outOfMarks]);

  /* ===============================
     EDIT STUDENT
  ================================ */
  const handleEdit = async (student) => {
    if (loadingStudentId || saving) return;
    setSelectedStudent(student);
    setLoadingStudentId(student._id);
    const reusableDates = getReusableDates(student._id);
    setMarks({}); setDates(reusableDates); setTotal(0); setPercentage(0); setGrade('');
    setPageError(''); setPageSuccess('');
    try {
      const { data } = await api.get(studentMarksPath(student._id));
      const nextMarks = {}; const nextDates = {};
      (data.subjectData || []).forEach((item) => {
        nextMarks[item.subject] = item.mark;
        nextDates[item.subject] = item.date || reusableDates[item.subject] || '';
      });
      setMarks(nextMarks); setDates(nextDates);
      setTotal(data.total ?? 0); setPercentage(data.percentage ?? 0); setGrade(data.grade || 'E');
      if (Object.values(reusableDates).some(Boolean) && (data.subjectData || []).some((item) => !item.date)) {
        setPageSuccess('Saved class assessment dates have been filled in. Change any subject date that differs.');
      }
    } catch (error) {
      if (error.response?.status === 404) {
        setMarks({}); setDates(reusableDates); setTotal(0); setPercentage(0); setGrade('');
        if (Object.values(reusableDates).some(Boolean)) setPageSuccess('Assessment dates have been reused from saved class entries. Enter only this child’s marks.');
      } else {
        console.error('Unable to load saved marks:', error);
        setPageError(error.response?.data?.message || 'Saved marks could not be loaded. Please try again.');
        setSelectedStudent(null);
      }
    } finally { setLoadingStudentId(''); }
  };

  /* ===============================
     SAVE MARKS
  ================================ */
  const handleSave = async (saveAndNext = false) => {
    if (!selectedStudent || saving) return;
    if (!subjects.length || !outOfMarks) {
      setPageError('This report has no valid subjects or maximum mark configured. Contact the administrator.');
      return;
    }
    const invalidSubject = subjects.find((subject) => {
      const value = marks[subject];
      if (value === '' || value === undefined || value === null) return true;
      const mark = Number(value);
      return !Number.isFinite(mark) || mark < 0 || mark > outOfMarks || Math.abs(mark * 100 - Math.round(mark * 100)) > 1e-7;
    });
    if (invalidSubject) {
      setPageError('Enter a valid mark for every subject. Marks must be between 0 and ' + outOfMarks + ', with at most two decimal places.');
      return;
    }
    setSaving(true); setPageError(''); setPageSuccess('');
    const subjectData = subjects.map((subject) => ({
      subject,
      mark: Math.round(Number(marks[subject]) * 100) / 100,
      date: dates[subject] || '',
    }));
    try {
      const response = await api.post(studentMarksPath(selectedStudent._id), { subjectData });
      const savedResult = { reportId, subjectData, total: response.data.total, percentage: response.data.percentage, grade: response.data.grade };
      setTotal(response.data.total); setPercentage(response.data.percentage); setGrade(response.data.grade);
      setStudents((previous) => previous.map((student) => {
        if (String(student._id) !== String(selectedStudent._id)) return student;
        const otherReports = (student.marks || []).filter((item) => String(item.reportId?._id || item.reportId || "") !== String(reportId));
        return { ...student, marks: [...otherReports, savedResult] };
      }));

      const currentIndex = students.findIndex((student) => String(student._id) === String(selectedStudent._id));
      const orderedAfterCurrent = [...students.slice(Math.max(0, currentIndex + 1)), ...students.slice(0, Math.max(0, currentIndex))];
      const nextStudent = saveAndNext ? orderedAfterCurrent.find((student) => student.standard === standard && !getSavedReport(student)) : null;
      if (nextStudent) {
        const nextDates = getReusableDates(nextStudent._id);
        subjectData.forEach((entry) => { if (entry.date) nextDates[entry.subject] = entry.date; });
        setSelectedStudent(nextStudent); setMarks({}); setDates(nextDates); setTotal(0); setPercentage(0); setGrade("");
        setLoadingStudentId(nextStudent._id);
        try {
          const { data: nextData } = await api.get(studentMarksPath(nextStudent._id));
          const nextMarks = {}; const savedDates = { ...nextDates };
          (nextData.subjectData || []).forEach((item) => { nextMarks[item.subject] = item.mark; savedDates[item.subject] = item.date || savedDates[item.subject] || ""; });
          setMarks(nextMarks); setDates(savedDates); setTotal(nextData.total ?? 0); setPercentage(nextData.percentage ?? 0); setGrade(nextData.grade || "E");
        } catch (nextError) {
          if (nextError.response?.status !== 404) setPageError(nextError.response?.data?.message || "The next student could not be opened.");
        } finally { setLoadingStudentId(""); }
        setPageSuccess("Marks saved. Ready for " + [nextStudent.firstName, nextStudent.middleName, nextStudent.lastName].filter(Boolean).join(" ") + ".");
      } else {
        setSelectedStudent(null);
        setPageSuccess(saveAndNext ? "Marks saved. All students in this class have a report entry." : "Marks saved successfully.");
      }
    } catch (error) {
      console.error('Unable to save student marks:', error);
      setPageError(error.response?.data?.message || 'Unable to save these marks. Please try again.');
    } finally { setSaving(false); }
  };

  /* ===============================
     PRINT PREVIEW
  ================================ */
  const togglePrintStudent = (studentId, checked) => {
    const id = String(studentId);
    setSelectedPrintStudentIds((previous) => (
      checked
        ? Array.from(new Set([...previous, id]))
        : previous.filter((value) => value !== id)
    ));
  };

  const toggleVisiblePrintSelection = (checked) => {
    setSelectedPrintStudentIds((previous) => {
      if (checked) return Array.from(new Set([...previous, ...visibleCompletedStudentIds]));
      const visibleIds = new Set(visibleCompletedStudentIds);
      return previous.filter((id) => !visibleIds.has(id));
    });
  };

  const handlePrintSelected = () => {
    const batch = students
      .filter((student) => selectedPrintStudentIds.includes(String(student._id)))
      .map((student) => ({ student, report: getSavedReport(student) }))
      .filter((item) => item.report);
    if (!batch.length) {
      setPageError("Select at least one completed report card to print.");
      return;
    }
    setPageError("");
    setPageSuccess("");
    setPrintBatch(batch);
  };

  const handlePrintPreview = (student) => {
    const report = getSavedReport(student);
    if (!report) {
      setPageError("No saved marks are available to print for this student yet.");
      return;
    }
    setPageError("");
    setPageSuccess("");
    setPrintBatch([{ student, report }]);
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
          <p className="page-subtitle">Class: {standard} · {reportName || "Student report"} · Out of {outOfMarks || "—"} per subject.</p>
        </div>
        <div className="page-actions report-page-actions">
          {onBack ? (
            <button type="button" className="btn btn-outline-secondary" onClick={onBack}>Back to report cards</button>
          ) : (
            <Link to="/dashboard/createReport" className="btn btn-outline-secondary">Back to templates</Link>
          )}
          <button type="button" className="btn btn-outline-primary" onClick={fetchData} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh class"}
          </button>
        </div>
      </div>
      {!loading && !subjects.length && (
        <div className="report-setup-notice" role="status">
          <div><strong>Class subjects are not configured yet</strong><p>Set up the subjects for {standard} before entering student marks.</p></div>
          <Link className="btn btn-primary" to="/dashboard/subjects">Set up class subjects</Link>
        </div>
      )}
      <section className="report-class-progress">
        <div className="report-class-progress-heading"><div><span>CLASS REPORT PROGRESS</span><strong>{completedCount} of {students.length} reports completed</strong></div><span className="report-progress-percent">{students.length ? Math.round((completedCount / students.length) * 100) : 0}%</span></div>
        <div className="report-progress-track"><span style={{ width: `${students.length ? (completedCount / students.length) * 100 : 0}%` }} /></div>
        <div className="report-progress-legend"><span><i className="done" />{completedCount} completed</span><span><i className="todo" />{pendingCount} pending</span></div>
      </section>
      <div className="report-student-toolbar">
        <div className="section-heading"><div><h3>Students in this class</h3><span className="muted small">{filteredStudents.length} of {students.length} shown</span></div></div>
        <div className="report-student-filters">
          <input type="search" className="form-control" aria-label="Search students by name or GR number" placeholder="Search name or GR number…" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
          <select className="form-select" aria-label="Filter report completion" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}><option value="all">All students</option><option value="pending">Pending reports</option><option value="completed">Completed reports</option></select>
        </div>
      </div>
      <div className="report-bulk-toolbar">
        <label className="report-bulk-select">
          <input
            type="checkbox"
            className="form-check-input"
            aria-label="Select all completed reports shown"
            checked={allVisibleCompletedSelected}
            onChange={(event) => toggleVisiblePrintSelection(event.target.checked)}
            disabled={!visibleCompletedStudentIds.length}
          />
          <span>Select all completed shown</span>
        </label>
        <div className="report-bulk-actions">
          <span>{selectedPrintCount} selected</span>
          <button type="button" className="btn btn-primary" onClick={handlePrintSelected} disabled={!selectedPrintCount}>
            Print selected{selectedPrintCount ? " (" + selectedPrintCount + ")" : ""}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedPrintStudentIds([])} disabled={!selectedPrintStudentIds.length}>
            Clear selection
          </button>
        </div>
      </div>
      <div className="table-responsive report-student-table-wrap"><table className="table table-hover align-middle">
        <thead>
          <tr>
            <th scope="col">Print</th>
            <th scope="col">#</th>
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
            <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading students and subjects…</td></tr>
          ) : filteredStudents.length === 0 ? (
            <tr><td colSpan={8}><div className="empty-state"><strong>{students.length ? "No students match these filters" : "No students found for this class"}</strong>{students.length ? "Try another name, GR number or report status." : "Check the selected class or register a student before preparing report cards."}</div></td></tr>
          ) : filteredStudents.map((s, i) => {
            const report = getSavedReport(s);
            const isPrintSelected = selectedPrintStudentIds.includes(String(s._id));
            const isInSelectedClass = s.standard === standard;

            return (
              <tr key={s._id}>
                <td className="report-select-cell">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    aria-label={"Select report for " + [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}
                    checked={isPrintSelected}
                    disabled={!report}
                    onChange={(event) => togglePrintStudent(s._id, event.target.checked)}
                  />
                </td>
                <td>{i + 1}</td>
                <td className="fw-semibold">
                  {[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ") || "—"}
                  {!isInSelectedClass && <small className="d-block text-muted">Now in {s.standard}</small>}
                </td>
                <td>{s.stuNo}</td>
                <td>{report?.total ?? "-"}</td>
                <td>{report?.percentage ?? "-"}</td>
                <td>{report?.grade ?? "-"}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-warning btn-sm me-2"
                    onClick={() => handleEdit(s)}
                    disabled={Boolean(loadingStudentId) || saving || !subjects.length || !outOfMarks || !isInSelectedClass}
                    title={!isInSelectedClass ? "This child has moved to another class. Historical marks remain available for printing." : "Enter or update this student's marks"}
                  >
                    {loadingStudentId === s._id ? "Loading…" : isInSelectedClass ? (report ? "Edit marks" : "Enter marks") : "Read only"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handlePrintPreview(s)}
                    disabled={!report}
                    title={report ? "Open printable report card" : "Save marks before printing"}
                  >
                    Print
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <div className="report-student-mobile-list">
        {loading ? <div className="report-mobile-empty">Loading students…</div> : filteredStudents.map((student) => {
          const saved = getSavedReport(student);
          const isPrintSelected = selectedPrintStudentIds.includes(String(student._id));
          const isInSelectedClass = student.standard === standard;
          const name = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ") || "Student";
          const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
          return (
            <article className="report-student-mobile-card" key={student._id}>
              <div className="report-student-mobile-heading">
                <span className="report-student-avatar">{initials}</span>
                <div><strong>{name}</strong><small>GR No. {student.stuNo || "—"}{!isInSelectedClass ? " · Now in " + student.standard : ""}</small></div>
              </div>
              <label className="report-mobile-select">
                <input
                  type="checkbox"
                  className="form-check-input"
                  aria-label={"Select report for " + name}
                  checked={isPrintSelected}
                  disabled={!saved}
                  onChange={(event) => togglePrintStudent(student._id, event.target.checked)}
                />
                <span>Select for class printing</span>
              </label>
              <div className="report-student-mobile-result">
                <div><span>Total</span><strong>{saved?.total ?? "—"}</strong></div>
                <div><span>Percentage</span><strong>{saved ? saved.percentage + "%" : "—"}</strong></div>
                <div><span>Grade</span><strong>{saved?.grade || "—"}</strong></div>
              </div>
              <div className="report-student-mobile-actions">
                <button type="button" className="btn btn-primary" onClick={() => handleEdit(student)} disabled={Boolean(loadingStudentId) || saving || !subjects.length || !outOfMarks || !isInSelectedClass} title={!isInSelectedClass ? "Historical result is read-only after a class transfer" : undefined}>
                  {loadingStudentId === student._id ? "Loading…" : !isInSelectedClass ? "Read only" : saved ? "Edit marks" : "Enter marks"}
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => handlePrintPreview(student)} disabled={!saved}>Print</button>
              </div>
            </article>
          );
        })}
        {!loading && filteredStudents.length === 0 && <div className="report-mobile-empty">{students.length ? "No students match your search or filter." : "No students in this class yet. New admissions will appear here automatically."}</div>}
      </div>

      {/* ===============================
         EDIT MODAL
      =============================== */}
      {selectedStudent && (
        <div className="modal show d-block report-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="marks-modal-title">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="marks-modal-title">Enter marks · {[selectedStudent.firstName, selectedStudent.middleName, selectedStudent.lastName].filter(Boolean).join(" ")}</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedStudent(null)} />
              </div>

              <div className="modal-body">
                <div className="report-entry-intro"><p>Enter this child’s marks below. Each subject is out of <strong>{outOfMarks}</strong>.</p><span>Dates are filled from saved class entries wherever possible.</span></div>
                <div className="report-shared-date">
                  <div><label htmlFor="report-common-assessment-date">One date for all subjects</label><small>Choose once to fill all subject dates. You can still change an individual subject below.</small></div>
                  <input id="report-common-assessment-date" type="date" className="form-control" value={commonAssessmentDate} onChange={(event) => setDates(Object.fromEntries(subjects.map((subject) => [subject, event.target.value])))} />
                  <button type="button" className="btn btn-outline-primary" onClick={() => setDates((previous) => ({ ...previous, ...getReusableDates(selectedStudent._id) }))} disabled={!Object.values(getReusableDates(selectedStudent._id)).some(Boolean)}>Use class dates</button>
                </div>
                <div className="table-responsive report-entry-table-wrap"><table className="table table-hover align-middle report-entry-table">
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
                            max={outOfMarks || undefined}
                            step="0.01"
                            aria-label={"Marks for " + sub}
                            value={marks[sub] ?? ""}
                            onChange={(e) => setMarks((previous) => ({ ...previous, [sub]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <div className="report-entry-mobile-list">
                  {subjects.map((subject, index) => (
                    <article className="report-entry-subject-card" key={subject}>
                      <div className="report-entry-subject-heading">
                        <strong>{subject}</strong>
                        <span>Maximum {outOfMarks}</span>
                      </div>
                      <div className="report-entry-mobile-fields">
                        <div>
                          <label htmlFor={"report-mobile-date-" + index}>Assessment date</label>
                          <input
                            id={"report-mobile-date-" + index}
                            type="date"
                            className="form-control"
                            value={dates[subject] || ""}
                            onChange={(event) => setDates((previous) => ({ ...previous, [subject]: event.target.value }))}
                          />
                        </div>
                        <div>
                          <label htmlFor={"report-mobile-mark-" + index}>Marks obtained</label>
                          <input
                            id={"report-mobile-mark-" + index}
                            type="number"
                            inputMode="decimal"
                            className="form-control"
                            min="0"
                            max={outOfMarks || undefined}
                            step="0.01"
                            placeholder={"0–" + outOfMarks}
                            value={marks[subject] ?? ""}
                            onChange={(event) => setMarks((previous) => ({ ...previous, [subject]: event.target.value }))}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="report-calculation-summary" aria-live="polite">
                  <div><span>Maximum total</span><strong>{outOfMarks * subjects.length}</strong></div>
                  <div><span>Marks obtained</span><strong>{total}</strong></div>
                  <div><span>Percentage</span><strong>{percentage}%</strong></div>
                  <div><span>Grade</span><strong>{grade || "—"}</strong></div>
                </div>
              </div>

              <div className="modal-footer report-entry-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedStudent(null)} disabled={saving}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => handleSave(false)} disabled={saving || Boolean(loadingStudentId) || !subjects.length}>{saving ? "Saving…" : "Save marks"}</button>
                <button type="button" className="btn btn-primary report-save-next" onClick={() => handleSave(true)} disabled={saving || Boolean(loadingStudentId) || !subjects.length || !hasNextPendingStudent}>{saving ? "Saving…" : "Save & next student"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===============================
         PRINT PREVIEW MODAL
      =============================== */}
      {printBatch.length > 0 && createPortal(
        <div className="modal show d-block report-modal-backdrop report-print-backdrop" role="dialog" aria-modal="true" aria-labelledby="print-preview-dialog-title">
          <div className="modal-dialog modal-xl modal-dialog-centered report-print-dialog">
            <div className="modal-content report-print-modal-content">
              <div className="modal-header report-print-toolbar">
                <div>
                  <h5 className="modal-title" id="print-preview-dialog-title">
                    Report card preview · {printBatch.length} {printBatch.length === 1 ? "student" : "students"}
                  </h5>
                  <p>Each student’s report is arranged as a separate A4 page. Choose Print or Save as PDF.</p>
                </div>
                <button type="button" className="btn-close" aria-label="Close preview" onClick={() => setPrintBatch([])} />
              </div>
              <div className="modal-body report-print-modal-body">
                <div id="print-area" className="report-print-area">
                  {printBatch.map(({ student: printStudent, report: printReport }) => (
                    <article
                      className="report-card report-card-print-page"
                      key={String(printStudent._id)}
                    >
                      <div className="report-card-topline" aria-hidden="true" />
                      <header className="report-card-header">
                        <div className="report-card-brand">
                          <span className="report-card-brand-mark" aria-hidden="true">
                            {(schoolName || "P").slice(0, 1).toUpperCase()}
                          </span>
                          <span className="report-card-brand-copy">
                            <strong>{schoolName || "PRE-SCHOOL"}</strong>
                            <small>EARLY YEARS · LEARNING · GROWTH</small>
                          </span>
                        </div>
                        <div className="report-card-heading">
                          <span>ACADEMIC RECORD</span>
                          <h1>{reportName || "Student Progress Report"}</h1>
                          <p>STUDENT PROGRESS CARD</p>
                        </div>
                      </header>

                      <section className="report-student-overview" aria-label="Student information">
                        <div className="report-student-name">
                          <span>STUDENT NAME</span>
                          <strong>{[printStudent.firstName, printStudent.middleName, printStudent.lastName].filter(Boolean).join(" ") || "—"}</strong>
                        </div>
                        <div className="report-student-details">
                          <div><span>GR / ROLL NUMBER</span><strong>{printStudent.stuNo || "—"}</strong></div>
                          <div><span>CLASS / STANDARD</span><strong>{printStudent.standard || standard}</strong></div>
                          <div><span>ACADEMIC YEAR</span><strong>{printStudent.batchYear || "—"}</strong></div>
                        </div>
                      </section>

                      <section className="report-assessment-section" aria-label="Assessment results">
                        <div className="report-section-heading">
                          <div><strong>Assessment results</strong><small>Subject-wise performance and assessment dates</small></div>
                          <span className="report-assessment-scale">Maximum {outOfMarks} per subject</span>
                        </div>
                        <table className="report-marks-table">
                          <thead>
                            <tr><th>#</th><th>Subject / Learning Area</th><th>Assessment Date</th><th>Marks Obtained</th><th>Maximum</th></tr>
                          </thead>
                          <tbody>
                            {(printReport.subjectData || []).map((item, itemIndex) => (
                              <tr key={item.subject || itemIndex}>
                                <td>{String(itemIndex + 1).padStart(2, "0")}</td>
                                <td>{item.subject || "—"}</td>
                                <td>{formatAssessmentDate(item.date)}</td>
                                <td className="report-earned-mark">{item.mark ?? "—"}</td>
                                <td>{outOfMarks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>

                      <section className="report-result-summary" aria-label="Overall result">
                        <div className="report-result-total">
                          <span>TOTAL SCORE</span>
                          <strong>{printReport.total ?? "—"} <small>/ {outOfMarks * (printReport.subjectData?.length || 0)}</small></strong>
                        </div>
                        <div>
                          <span>OVERALL PERCENTAGE</span>
                          <strong>{Number(printReport.percentage || 0).toFixed(2)}%</strong>
                        </div>
                        <div className="report-grade-result">
                          <span>GRADE</span>
                          <strong>{printReport.grade || "—"}</strong>
                        </div>
                      </section>

                      <section className="report-teacher-remarks">
                        <div className="report-section-heading">
                          <div><strong>Teacher’s remarks</strong><small>Progress, strengths and areas to encourage</small></div>
                        </div>
                        <div className="report-remarks-lines" aria-hidden="true"><span /><span /></div>
                      </section>

                      <footer className="report-card-signatures">
                        <div><span /><strong>CLASS TEACHER</strong></div>
                        <div><span /><strong>HEAD TEACHER</strong></div>
                        <div><span /><strong>PARENT / GUARDIAN</strong></div>
                      </footer>
                      <div className="report-card-footer">
                        <span>A record of progress, effort and achievement.</span>
                        <span>{schoolName || "School copy"} · {reportName || "Progress report"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div className="modal-footer report-print-toolbar">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setPrintBatch([])}>Close</button>
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default StudentsReport;
