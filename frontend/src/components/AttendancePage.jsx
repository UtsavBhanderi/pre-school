import React, { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";

const AttendancePage = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [standard, setStandard] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [stuNo, setStuNo] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [statistics, setStatistics] = useState({ present: 0, absent: 0 });
  const [editingStatus, setEditingStatus] = useState({});
  const linkone = `https://api.kidzeranursery.com`;

  // Fetch attendance data on mount and when date or standard changes
  useEffect(() => {
    fetchAttendance();
  }, [date, standard, middleName, stuNo, status, reason]);

  // Fetch attendance records with optional date and standard filters
  const fetchAttendance = async () => {
    try {
      const params = {};
      if (date) params.date = date;
      if (standard) params.standard = standard;
      if (middleName) params.middleName = middleName;
      if (stuNo) params.stuNo = stuNo;
      if (status) params.status = status;
      if (reason) params.reason = reason;

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
    }
  };

  const calculateStatistics = (data) => {
    data = data.flatMap((item) => item.studentDetails);
    const present = data.filter((item) => item.status === "present").length;
    const absent = data.filter((item) => item.status === "absent").length;
    setStatistics({ present, absent });
  };

  // Handle edit status
  const handleEditStatus = (attendanceId, studentId) => {
    setEditingStatus({ attendanceId, studentId });
  };

  // Save the new status after editing
  const handleSaveStatus = async (
    attendanceId,
    studentId,
    newStatus,
    newReason
  ) => {
    try {
      await axios.put(
        `${linkone}` +
          `/api/attendance/attendances/${attendanceId}/student/${studentId}`,
        { status: newStatus, reason: newReason }
      );
      fetchAttendance(); // Refresh attendance data after updating status
      setEditingStatus({});
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };
  const handleReasonChange = (studentId, reason) => {
    setAttendanceData((prevData) =>
      prevData.map((item) =>
        item.studentId === studentId ? { ...item, reason } : item
      )
    );
  };

  function dateToIndianFormat(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  }

  return (
    <div className="">
      {/* Attendance Summary */}
      <div className="mt-4">
        <h4>Attendance Summary</h4>

        <div className="progress mb-3">
          <div
            className="progress-bar bg-success"
            style={{
              width: `${
                // (statistics.present / calculateStatistics.length) * 100
                // (statistics.present / (statistics.present + statistics.absent)) * 100
                (statistics.present / 1) * 100
              }%`,
            }}
          >
            {statistics.present} Present
          </div>
          <div
            className="progress-bar bg-danger"
            style={{
              width: `${
                // (statistics.absent / calculateStatistics.length) * 100
                // (statistics.absent / (statistics.present + statistics.absent)) * 100
                (statistics.absent / 1) * 100
              }%`,
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
      <h2>Attendance Records</h2>

      {/* Date and Standard Filters */}
      <div className="filters mb-3 d-flex align-items-end gap-3">
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
      <table className="table table-bordered table-striped">
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
          {attendanceData.length > 0 ? (
            attendanceData.map((record) => {
              // Ensure record.studentDetails is an array and populated correctly
              if (
                Array.isArray(record.studentDetails) &&
                record.studentDetails.length > 0
              ) {
                return record.studentDetails.map((studentDetail, index) => (
                  <tr key={studentDetail.studentId._id}>
                    <td>{index + 1}</td>
                    <td>{dateToIndianFormat(record.date)}</td>
                    <td>{studentDetail.studentId.stuNo}</td>
                    <td>{studentDetail.studentId.middleName}</td>
                    <td>{studentDetail.studentId.standard}</td>
                    <td>
                      {/* If editing, show dropdown, else show text */}
                      {editingStatus.attendanceId === record._id &&
                      editingStatus.studentId ===
                        studentDetail.studentId._id ? (
                        <select
                          className="form-select"
                          value={studentDetail.status}
                          onChange={(e) =>
                            handleSaveStatus(
                              record._id,
                              studentDetail.studentId._id,
                              e.target.value,
                              studentDetail.reason
                            )
                          }
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                        </select>
                      ) : (
                        studentDetail.status
                      )}
                    </td>
                    <td>
                      {/* If editing, show dropdown, else show text */}
                      {editingStatus.attendanceId === record._id &&
                      editingStatus.studentId ===
                        studentDetail.studentId._id ? (
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Enter reason"
                          value={studentDetail.reason}
                          // onChange={(e) =>
                          //   handleReasonChange(student._id, e.target.value)
                          // }
                          onChange={(e) =>
                            handleSaveStatus(
                              record._id,
                              studentDetail.studentId._id,
                              studentDetail.status,
                              e.target.value
                            )
                          }
                        />
                      ) : (
                        studentDetail.reason
                      )}
                    </td>
                    <td>
                      {/* Toggle edit mode */}
                      {editingStatus.attendanceId === record._id &&
                      editingStatus.studentId ===
                        studentDetail.studentId._id ? (
                        <button
                          className="btn btn-success"
                          onClick={() => setEditingStatus({})}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            handleEditStatus(
                              record._id,
                              studentDetail.studentId._id
                            )
                          }
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
              <td colSpan="6">No attendance records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AttendancePage;
