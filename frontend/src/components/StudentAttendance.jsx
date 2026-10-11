// src/components/StudentAttendance.jsx

// this page is not include in the project , don't use this page.

import React, { useState, useEffect } from "react";
import axios from "axios";

const StudentAttendance = () => {
  //   const [date, setDate] = useState('');
  const linkone = `https://api.kidzeranursery.com`;

  const [date, setDate] = useState(() => {
    // Initialize with today's date in YYYY-MM-DD format
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0"); // Months start at 0
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const [attendanceData, setAttendanceData] = useState(null);
  const [editStatus, setEditStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch attendance data when date changes
  useEffect(() => {
    if (!date) return; // Do not fetch if no date is selected

    const fetchAttendance = async () => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = date
          ? `${linkone}/api/attendance/attendance/${date}`
          : `${linkone}/api/attendance/attendance`;
        const response = await axios.get(endpoint);

        // const response = await axios.get(`/api/attendance/attendance/${date}`);
        setAttendanceData(response.data);
      } catch (err) {
        console.error("Error fetching attendance:", err);
        setError(
          err.response?.data?.message || "Error fetching attendance data"
        );
        setAttendanceData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [date]);

  // Handle change in attendance status
  const handleStatusChange = (studentId, newStatus) => {
    setEditStatus((prev) => ({
      ...prev,
      [studentId]: newStatus,
    }));
  };

  // Handle save attendance
  const handleSave = async (studentId) => {
    if (!attendanceData) return;

    const updatedStudentDetails = attendanceData.studentDetails.map(
      (detail) => {
        if (detail.studentId._id === studentId) {
          return {
            ...detail,
            status: editStatus[studentId] || detail.status,
          };
        }
        return detail;
      }
    );

    try {
      const response = await axios.put(
        `${linkone}/api/attendance/${attendanceData._id}`,
        {
          studentDetails: updatedStudentDetails,
        }
      );
      setAttendanceData(response.data);
      setEditStatus((prev) => ({ ...prev, [studentId]: undefined }));
      alert("Attendance updated successfully");
    } catch (err) {
      console.error("Error updating attendance:", err);
      alert(err.response?.data?.message || "Error updating attendance");
    }
  };

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Student Attendance</h2>

      {/* Date Picker */}
      <div className="mb-4">
        <label htmlFor="attendanceDate" className="form-label">
          Select Date:
        </label>
        <input
          type="date"
          id="attendanceDate"
          className="form-control"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Loading Indicator */}
      {loading && <p>Loading attendance data...</p>}

      {/* Error Message */}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Attendance Table */}
      {attendanceData && !loading && (
        <div>
          <h4>
            Attendance for {new Date(attendanceData.date).toLocaleDateString()}
          </h4>
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>#</th>
                <th>Student Name</th>
                <th>Standard</th>
                <th>Roll No</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData.studentDetails.map((detail, index) => (
                <tr key={detail.studentId._id}>
                  <td>{index + 1}</td>
                  <td>{detail.studentId.middleName}</td>
                  <td>{detail.studentId.standard}</td>
                  <td>{detail.studentId.stuNo}</td>
                  <td>
                    {editStatus[detail.studentId._id] !== undefined ? (
                      <select
                        className="form-select"
                        value={editStatus[detail.studentId._id]}
                        onChange={(e) =>
                          handleStatusChange(
                            detail.studentId._id,
                            e.target.value
                          )
                        }
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    ) : (
                      detail.status.charAt(0).toUpperCase() +
                      detail.status.slice(1)
                    )}
                  </td>
                  <td>
                    {editStatus[detail.studentId._id] !== undefined ? (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleSave(detail.studentId._id)}
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          handleStatusChange(
                            detail.studentId._id,
                            detail.status
                          )
                        }
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StudentAttendance;
