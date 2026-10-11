import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";

const AttendanceEntryPage = () => {
  const [students, setStudents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), today.getDate()); });
  const [standard, setStandard] = useState("");
  const [attendanceData, setAttendanceData] = useState([]);
  const [errors, setErrors] = useState({});
  const [statistics, setStatistics] = useState({ present: 0, absent: 0 });
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const linkone = API_BASE_URL;

  // Fetch students based on selected standard
  useEffect(() => {
    if (standard) {
      fetchStudentsByStandard(standard, selectedDate);
    } else {
      setStudents([]);
      setAttendanceData([]);
      setStatistics({ present: 0, absent: 0 });
    }
  }, [standard, selectedDate]);

  const fetchStudentsByStandard = async (standard, date) => {
    setLoadingStudents(true);
    setPageError("");
    setPageSuccess("");
    try {
      const response = await axios.get(
        `${linkone}` + "/api/attendance/students",
        { params: { standard, date: date ? formatDate(date) : undefined } }
      );
      setStudents(response.data);

      // Initialize attendanceData with default "present" status for each student
      const initialAttendance = response.data.map((student) => ({
        studentId: student._id,
        status: student.attendanceStatus || "present",
        reason: student.attendanceReason || "",
        attendanceRecordId: student.attendanceRecordId || "",
      }));
      setAttendanceData(initialAttendance);
      calculateStatistics(initialAttendance);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Error fetching students:", error);
      setPageError(error.response?.data?.message || "Unable to load students for this class.");
      setStudents([]);
      setAttendanceData([]);
      setStatistics({ present: 0, absent: 0 });
      setHasUnsavedChanges(false);
    } finally {
      setLoadingStudents(false);
    }
  };

  const calculateStatistics = (data) => {
    const present = data.filter((item) => item.status === "present").length;
    const absent = data.filter((item) => item.status === "absent").length;
    setStatistics({ present, absent });
  };

  // const handleStatusChange = (studentId, newStatus) => {
  //   setAttendanceData((prevState) =>
  //     prevState.map((attendance) =>
  //       attendance.studentId === studentId
  //         ? { ...attendance, status: newStatus }
  //         : attendance
  //     )
  //   );
  // };

  const confirmDiscardAttendanceChanges = () => {
    if (!hasUnsavedChanges) return true;
    return window.confirm("You have attendance changes that are not saved yet. Discard those changes and load another class or date?");
  };

  const handleStandardChange = (value) => {
    if (!confirmDiscardAttendanceChanges()) return;
    setHasUnsavedChanges(false);
    setStandard(value);
  };

  const handleDateChange = (value) => {
    if (!confirmDiscardAttendanceChanges()) return;
    setHasUnsavedChanges(false);
    setSelectedDate(value ? new Date(value) : null);
  };

  const handleStatusChange = (studentId, status) => {
    setAttendanceData((prevData) => {
      const updatedData = prevData.map((item) =>
        item.studentId === studentId
          ? { ...item, status, reason: status === "present" ? "" : item.reason }
          : item
      );
      calculateStatistics(updatedData);
      return updatedData;
    });
    setErrors((prevErrors) => ({ ...prevErrors, [studentId]: undefined }));
    setHasUnsavedChanges(true);
  };
  const formatDate = (value) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleSubmitAttendance = async () => {
    if (!standard) {
      setPageError("Choose a class before submitting attendance.");
      return;
    }
    if (!selectedDate) {
      setPageError("Choose the date before submitting attendance.");
      return;
    }
    if (!validateForm()) {
      setPageError("Please add a reason for each student marked absent.");
      return;
    }

    setSubmittingAttendance(true);
    setPageError("");
    setPageSuccess("");
    try {
      const response = await axios.post(linkone + "/api/attendance/attendance", {
        date: formatDate(selectedDate),
        studentDetails: attendanceData,
      });
      setPageSuccess(response.data?.message || "Attendance has been saved successfully.");
      setHasUnsavedChanges(false);
      setStandard("");
      setStudents([]);
      setAttendanceData([]);
      setStatistics({ present: 0, absent: 0 });
      setErrors({});
    } catch (error) {
      console.error("Error submitting attendance:", error);
      setPageError(error.response?.data?.message || "Attendance could not be saved. Please try again.");
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const handleMarkAllPresent = () => {
    if (!students.length || loadingStudents || submittingAttendance) return;
    setAttendanceData((previous) => previous.map((item) => ({
      ...item,
      status: "present",
      reason: "",
    })));
    setErrors({});
    setStatistics({ present: students.length, absent: 0 });
    setHasUnsavedChanges(true);
    setPageError("");
    setPageSuccess("");
  };

  const handleReasonChange = (studentId, reason) => {
    setAttendanceData((prevData) =>
      prevData.map((item) =>
        item.studentId === studentId ? { ...item, reason } : item
      )
    );
    setHasUnsavedChanges(true);
  };

  const validateForm = () => {
    const validationErrors = {};

    attendanceData.forEach((item) => {
      if (item.status === "absent" && !String(item.reason || "").trim()) {
        validationErrors[item.studentId] =
          "Reason is required for absent students.";
      }
    });

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}
      <div className="page-header"><div><h2 className="mb-0">Mark attendance</h2><p className="page-subtitle">Choose a class and date, then mark each student present or absent.</p></div></div>
      {/* Attendance Summary */}
      <div className="page-card mb-4">
        <div className="section-heading mt-0"><h3>Class summary</h3><span className="muted small">Updates as you mark attendance</span></div>

        <div className="progress mb-3">
          <div
            className="progress-bar bg-success"
            style={{
              width: `${students.length ? (statistics.present / students.length) * 100 : 0}%`,
            }}
          >
            {statistics.present} Present
          </div>
          <div
            className="progress-bar bg-danger"
            style={{ width: `${students.length ? (statistics.absent / students.length) * 100 : 0}%` }}
          >
            {statistics.absent} Absent
          </div>
        </div>
        <p>
          Total Students: {students.length} | Present: {statistics.present} |
          Absent: {statistics.absent}
        </p>
      </div>
      {/* Standard Dropdown */}
      <div className="page-card mb-4"><div className="row g-3">
        <div className="form-group col-12 col-md-6 col-lg-3">
          <label>Select Standard</label>
          <select
            value={standard}
            onChange={(e) => handleStandardChange(e.target.value)}
            className="form-select"
            aria-label="Select class for attendance"
          >
            <option value="">Select Standard</option>
            <option value="ENG Play Group">ENG Play Group</option>
            <option value="ENG NR.">ENG NR.</option>
            <option value="ENG JR.">ENG JR.</option>
            <option value="ENG SR.">ENG SR.</option>
            <option value="GUJ Play Group">GUJ Play Group</option>
            <option value="GUJ NR.">GUJ NR.</option>
            <option value="GUJ JR.">GUJ JR.</option>
            <option value="GUJ SR.">GUJ SR.</option>
          </select>
        </div>

        {/* Date Picker */}
        <div className="form-group col-12 col-md-6 col-lg-3 d-flex flex-column">
          <label>Select Date</label>
          {/* <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            className="form-control"
            required={true}
          /> */}

            <input
              type="date"
              value={selectedDate ? formatDate(selectedDate) : ""}
              onChange={(e) => handleDateChange(e.target.value)}
              className="form-control"
              aria-label="Select attendance date"
              required={true}
            />


          {/* <input type="date" selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            className="form-control" required={true}
          /> */}

        </div>
      </div></div>

      {standard && selectedDate && attendanceData.some((item) => item.attendanceRecordId) && (
        <div className="alert alert-info d-flex align-items-start gap-2" role="status">
          <span className="fw-bold" aria-hidden="true">i</span>
          <div>
            <strong>Saved attendance found for this date.</strong>
            <div>
              {attendanceData.filter((item) => item.attendanceRecordId).length} of {attendanceData.length} children already have a saved entry.
              Their current statuses have been loaded. You can correct a status or reason and save again without creating duplicate entries.
            </div>
          </div>
        </div>
      )}

      {students.length > 0 && (
        <div className="ops-attendance-toolbar">
          <div>
            <strong>Quick action</strong>
            <span>Use this only when every child in the selected class is present. You can still mark individual children absent afterward.</span>
          </div>
          <button type="button" className="btn btn-outline-success" onClick={handleMarkAllPresent} disabled={loadingStudents || submittingAttendance}>
            Mark everyone present
          </button>
        </div>
      )}
      {hasUnsavedChanges && students.length > 0 && (
        <div className="alert alert-warning d-flex align-items-start gap-2" role="status">
          <strong aria-hidden="true">!</strong>
          <div><strong>Changes not saved yet.</strong> Review the class and date, add a reason for each absence, then select “Save attendance”.</div>
        </div>
      )}

      {/* Student Attendance Form */}
      {loadingStudents ? (
        <div className="page-card text-center py-5"><span className="spinner-border spinner-border-sm text-primary" role="status" /><p className="muted mt-3 mb-0">Loading students for this class…</p></div>
      ) : standard && students.length === 0 ? (
        <div className="page-card"><div className="empty-state"><strong>No students found for this class</strong>Choose another class or contact the administrator if this seems incorrect.</div></div>
      ) : students.length > 0 && (
        <div className="table-responsive"><table className="table mt-0 table-hover align-middle">
          <thead>
            <tr>
              <th>#</th>
              <th>Student Name</th>
              <th>Standard</th>
              <th>Roll No</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => (
              <tr key={student._id}>
                <td>{index + 1}</td>
                <td>{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td>{student.standard}</td>
                <td>{student.stuNo}</td>
                <td>
                  <input
                    type="radio"
                    name={`attendance-${student._id}`}
                    value="present"
                    aria-label={`Mark ${[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")} present`}
                    checked={
                      attendanceData.find(
                        (att) => att.studentId === student._id
                      )?.status === "present"
                    }
                    onChange={() => handleStatusChange(student._id, "present")}
                  />
                </td>
                <td>
                  <input
                    type="radio"
                    name={`attendance-${student._id}`}
                    value="absent"
                    aria-label={`Mark ${[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")} absent`}
                    checked={
                      attendanceData.find(
                        (att) => att.studentId === student._id
                      )?.status === "absent"
                    }
                    onChange={() => handleStatusChange(student._id, "absent")}
                  />
                </td>

                <td>
                  {/* {student._id?.status == "absent" && ( */}
                  {/* <input
                    type="text"
                    className="form-control"
                    placeholder="Required when absent"
                    value={attendanceData.find((item) => item.studentId === student._id)?.reason || ""}
                    onChange={(e) =>
                      handleReasonChange(student._id, e.target.value)
                    }
                  /> */}
                  {/* )} */}

                  {/* {student?.status === "absent" && ( */}
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Required when absent"
                    aria-label={"Absence reason for " + [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")}
                    disabled={attendanceData.find((item) => item.studentId === student._id)?.status !== "absent"}
                    value={attendanceData.find((item) => item.studentId === student._id)?.reason || ""}
                    onChange={(e) => handleReasonChange(student._id, e.target.value)}
                  />
                  {/* )} */}

                  {errors[student._id] && (
                    <small className="text-danger">{errors[student._id]}</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {/* Submit Button */}
      {students.length > 0 && (
        <button
          type="button"
          className="btn btn-primary mt-3"
          disabled={submittingAttendance || loadingStudents || !selectedDate || !standard}
          onClick={handleSubmitAttendance}
        >
          {submittingAttendance ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving attendance…</> : "Save attendance"}
        </button>
      )}
    </div>
  );
};

export default AttendanceEntryPage;
