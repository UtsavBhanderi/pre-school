import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { format } from "date-fns";

const AttendancePage = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [standard, setStandard] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [stuNo, setStuNo] = useState("");
  const [status, setStatus] = useState("");
  const [statistics, setStatistics] = useState({ present: 0, absent: 0 });
  const [editingStatus, setEditingStatus] = useState({});
  const [editDraft, setEditDraft] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [pageError, setPageError] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(true);
  const linkone = API_BASE_URL;

  // Fetch attendance data on mount and when date or standard changes
  useEffect(() => {
    fetchAttendance();
  }, [date, standard, middleName, stuNo, status]);

  // Fetch attendance records with optional date and standard filters
  const fetchAttendance = async () => {
    setLoadingRecords(true);
    setPageError("");
    try {
      const params = {};
      if (date) params.date = date;
      if (standard) params.standard = standard;
      if (middleName) params.middleName = middleName;
      if (stuNo) params.stuNo = stuNo;
      if (status) params.status = status;

      const response = await axios.get(
        `${linkone}` + "/api/attendance/attendances",
        {
          params,
        }
      );
      setAttendanceData(response.data);

      const initialAttendance = response.data.map((student) => ({
        // ...student,
        studentDetails: student.studentDetails.map((item) => ({
          // ...item,
          status: item.status || "absent",
          // reason: item.reason || "",
        })),
      }));
      calculateStatistics(initialAttendance);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
      setPageError(error.response?.data?.message || "Unable to load attendance records.");
      setAttendanceData([]);
      setStatistics({ present: 0, absent: 0 });
    } finally {
      setLoadingRecords(false);
    }
  };

  const calculateStatistics = (data) => {
    data = data.flatMap((item) => item.studentDetails);
    const present = data.filter((item) => item.status === "present").length;
    const absent = data.filter((item) => item.status === "absent").length;
    setStatistics({ present, absent });
  };

  // Handle edit status
  const handleEditStatus = (attendanceId, studentDetail) => {
    setEditingStatus({ attendanceId, studentId: studentDetail.studentId?._id });
    setEditDraft({
      status: studentDetail.status || "present",
      reason: studentDetail.reason || "",
    });
    setPageError("");
  };

  // Save the new status after editing
  const handleSaveStatus = async (attendanceId, studentId) => {
    if (!editDraft) return;
    if (editDraft.status === "absent" && !String(editDraft.reason || "").trim()) {
      setPageError("Add a reason before saving an absence.");
      return;
    }

    setSavingStatus(true);
    setPageError("");
    try {
      await axios.put(
        `${linkone}/api/attendance/attendances/${attendanceId}/student/${studentId}`,
        { status: editDraft.status, reason: editDraft.status === "absent" ? editDraft.reason.trim() : "" }
      );
      setEditingStatus({});
      setEditDraft(null);
      await fetchAttendance();
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to save this attendance change.");
    } finally {
      setSavingStatus(false);
    }
  };

  function dateToIndianFormat(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  }

  const totalAttendance = statistics.present + statistics.absent;
  const presentPercentage = totalAttendance ? (statistics.present / totalAttendance) * 100 : 0;
  const absentPercentage = totalAttendance ? (statistics.absent / totalAttendance) * 100 : 0;

  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {/* Attendance Summary */}
      <div className="page-card mb-4">
        <div className="section-heading mt-0"><h3>Attendance summary</h3><span className="muted small">Based on the current filters</span></div>

        <div className="progress mb-3">
          <div
            className="progress-bar bg-success"
            style={{
              width: `${presentPercentage}%`,
            }}
          >
            {statistics.present} Present
          </div>
          <div
            className="progress-bar bg-danger"
            style={{
              width: `${absentPercentage}%`,
            }}
          >
            {statistics.absent} Absent
          </div>
        </div>
        <p>
          Total Students: {statistics.present + statistics.absent} | Present:{" "}
          {statistics.present} | Absent: {statistics.absent}
        </p>
      </div>
      <div className="page-header"><div><h2 className="mb-0">Attendance records</h2><p className="page-subtitle">Filter records by date, class, student, or attendance status.</p></div></div>

      {/* Date and Standard Filters */}
      <div className="filter-panel mb-3" aria-label="Filter attendance records">
        <div className="form-group col">
          <label>Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="form-group col">
          <input
            type="text"
            name="stuNo"
            placeholder="Student No"
            className="form-control"
            value={stuNo}
            onChange={(e) => setStuNo(e.target.value)}
          />
        </div>
        <div className="form-group col">
          <input
            type="text"
            name="middleName"
            placeholder="Student Name"
            className="form-control"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
          />
        </div>
        {/* <div className="form-group">
          <label>Standard:</label>
          <input
            type="text"
            value={standard}
            onChange={(e) => setStandard(e.target.value)}
            className="form-control"
            placeholder="Enter standard (optional)"
          />
        </div> */}
        <div className="form-group col">
          {/* <label>Select Standard</label> */}
          <select
            value={standard}
            onChange={(e) => setStandard(e.target.value)}
            className="form-select"
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
        <div className="form-group col">
          {/* <label>Select Standard</label> */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="form-select"
          >
            <option value="">Select status</option>
            <option value="present">present</option>
            <option value="absent">absent</option>
          </select>
        </div>
      </div>

      {/* Table for Attendance Data */}
      <div className="table-responsive"><table className="table table-hover align-middle">
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Roll No</th>
            <th>Name</th>
            <th>Standard</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {/* filteredAttendenceData.map((record) => { */}
          {loadingRecords ? (
            <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading attendance…</td></tr>
          ) : attendanceData.length > 0 ? (
            attendanceData.map((record) => {
              // Ensure record.studentDetails is an array and populated correctly
              if (
                Array.isArray(record.studentDetails) &&
                record.studentDetails.length > 0
              ) {
                return record.studentDetails.map((studentDetail, index) => (
                  <tr key={studentDetail.studentId?._id || record._id + "-" + index}>
                    <td>{index + 1}</td>
                    <td>{dateToIndianFormat(record.date)}</td>
                    <td>{studentDetail.studentId?.stuNo || "—"}</td>
                    <td>{studentDetail.studentId?.middleName || "—"}</td>
                    <td>{studentDetail.studentId?.standard || "—"}</td>
                    <td>
                      {/* If editing, show dropdown, else show text */}
                      {editingStatus.attendanceId === record._id &&
                      editingStatus.studentId ===
                        studentDetail.studentId?._id ? (
                        <select
                          className="form-select"
                          value={editDraft?.status || studentDetail.status || "present"}
                          onChange={(e) => setEditDraft((previous) => ({ ...previous, status: e.target.value }))}
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                        </select>
                      ) : (
                        <span className={"badge rounded-pill " + (studentDetail.status === "present" ? "text-bg-success" : "text-bg-danger")}>
                          {studentDetail.status || "Not marked"}
                        </span>
                      )}
                    </td>
                    <td>
                      {/* If editing, show dropdown, else show text */}
                      {editingStatus.attendanceId === record._id &&
                      editingStatus.studentId ===
                        studentDetail.studentId?._id ? (
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Enter reason"
                          value={editDraft?.reason || ""}
                          onChange={(e) => setEditDraft((previous) => ({ ...previous, reason: e.target.value }))}
                        />
                      ) : (
                        studentDetail.reason || <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {/* Toggle edit mode */}
                      {editingStatus.attendanceId === record._id &&
                      editingStatus.studentId ===
                        studentDetail.studentId?._id ? (
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={savingStatus}
                            onClick={() => handleSaveStatus(record._id, studentDetail.studentId?._id)}
                          >
                            {savingStatus ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            disabled={savingStatus}
                            onClick={() => { setEditingStatus({}); setEditDraft(null); setPageError(""); }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => handleEditStatus(record._id, studentDetail)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ));
              }
              return null;
            })
          ) : (
            <tr>
              <td colSpan="8"><div className="empty-state"><strong>No attendance records found</strong>Try choosing another date or clearing some filters.</div></td>
            </tr>
          )}
        </tbody>
      </table></div>
    </div>
  );
};

export default AttendancePage;
