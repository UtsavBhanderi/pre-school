import React, { useState, useEffect } from "react";
import axios from "axios";
// import DatePicker from "react-datepicker";
// import "react-datepicker/dist/react-datepicker.css";

const AttendanceEntryPage = () => {
  const [students, setStudents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [standard, setStandard] = useState("");
  const [attendanceData, setAttendanceData] = useState([]);
  const [errors, setErrors] = useState({});
  const [statistics, setStatistics] = useState({ present: 0, absent: 0 });
  const linkone = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

  // Fetch students based on selected standard
  useEffect(() => {
    if (standard) {
      fetchStudentsByStandard(standard);
    }
  }, [standard]);

  const fetchStudentsByStandard = async (standard) => {
    try {
      const response = await axios.get(
        `${linkone}` + "/api/attendance/students",
        { params: { standard } }
      );
      setStudents(response.data);

      // Initialize attendanceData with default "present" status for each student
      const initialAttendance = response.data.map((student) => ({
        studentId: student._id,
        status: "present",
        reason: "",
      }));
      setAttendanceData(initialAttendance);
      calculateStatistics(initialAttendance);
    } catch (error) {
      console.error("Error fetching students:", error);
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
    if (!selectedDate) {
      alert("select date");
      return;
    }

    if (!validateForm()) {
      alert("Please fix the errors before submitting.");
      return;
    }
    try {
      
      await axios.post(`${linkone}` + "/api/attendance/attendance", {
        date: selectedDate,
        studentDetails: attendanceData,
      });

      alert("Attendance submitted successfully");
      setSelectedDate(null);
      setStandard("");
      setStudents([]);
      setStatistics({ present: 0, absent: 0 });
    } catch (error) {
      console.error("Error submitting attendance:", error);
      alert("Failed to submit attendance");
    }
  };

  const handleReasonChange = (studentId, reason) => {
    setAttendanceData((prevData) =>
      prevData.map((item) =>
        item.studentId === studentId ? { ...item, reason } : item
      )
    );
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
    <div className="mt-4">
      {/* Attendance Summary */}
      <div className="mt-4">
        <h4>Attendance Summary</h4>

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
      <h2>Mark Attendance</h2>

      {/* Standard Dropdown */}
      <div className="d-flex gap-3">
        <div className="form-group col-3">
          <label>Select Standard</label>
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

        {/* Date Picker */}
        <div className="form-group col-3 d-flex flex-column">
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
              onChange={(e) => setSelectedDate(e.target.value ? new Date(e.target.value) : null)}
              className="form-control"
              required={true}
            />


          {/* <input type="date" selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            className="form-control" required={true}
          /> */}

        </div>
      </div>

      {/* Student Attendance Form */}
      {students.length > 0 && (
        <table className="table mt-4 table-striped">
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
                <td>{student.middleName}</td>
                <td>{student.standard}</td>
                <td>{student.stuNo}</td>
                <td>
                  <input
                    type="radio"
                    name={`attendance-${student._id}`}
                    value="present"
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
                    placeholder="Enter reason"
                    value={student.reason}
                    onChange={(e) =>
                      handleReasonChange(student._id, e.target.value)
                    }
                  /> */}
                  {/* )} */}

                  {/* {student?.status === "absent" && ( */}
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter reason"
                    value={student.reason}
                    onChange={(e) =>
                      handleReasonChange(student._id, e.target.value)
                    }
                  />
                  {/* )} */}

                  {errors[student._id] && (
                    <small className="text-danger">{errors[student._id]}</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Submit Button */}
      {students.length > 0 && (
        <button
          className="btn btn-primary mt-3"
          onClick={handleSubmitAttendance}
        >
          Submit Attendance
        </button>
      )}
    </div>
  );
};

export default AttendanceEntryPage;
