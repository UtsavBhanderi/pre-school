import React, { useState, useEffect } from "react";
import axios from "axios";

const AdminBirthday = () => {
  const linkone = `https://api.kidzeranursery.com`;

  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [filters, setFilters] = useState({
    date: "", // 'today', 'thisWeek', 'thisMonth', or a specific date
    middleName: "",
    standard: "",
    stuNo: "",
    dob: "", // New state for the custom date picker
  });

  useEffect(() => {
    // Fetch all students initially
    const fetchStudents = async () => {
      try {
        const response = await axios.get(`${linkone}/api/students/birthdays`);
        setStudents(response.data);
        setFilteredStudents(response.data); // Initially, show all students
      } catch (err) {
        console.error(err);
      }
    };
    fetchStudents();
  }, []);

  useEffect(() => {
    // Apply filters whenever the filter state changes
    let filtered = [...students];

    // if (filters.date || filters.dob) {
    //     const { start, end } = getStartAndEndDates(filters.date || filters.dob);
    //     filtered = filtered.filter(student => {
    //         const customDate = new Date(student.dob);
    //         return customDate >= start && customDate <= end;
    //     });
    // }

    if (filters.date || filters.dob) {
      const { start, end } = getStartAndEndDates(filters.date || filters.dob);
      filtered = filtered.filter((student) => {
        const customDate = new Date(student.dob);
        // Compare only month and date, ignore the year
        return (
          (customDate.getMonth() > start.getMonth() ||
            (customDate.getMonth() === start.getMonth() &&
              customDate.getDate() >= start.getDate())) &&
          (customDate.getMonth() < end.getMonth() ||
            (customDate.getMonth() === end.getMonth() &&
              customDate.getDate() <= end.getDate()))
        );
      });
    }

    if (filters.middleName) {
      filtered = filtered.filter((student) =>
        student.middleName
          .toLowerCase()
          .includes(filters.middleName.toLowerCase())
      );
    }

    if (filters.standard) {
      filtered = filtered.filter((student) =>
        student.standard.toLowerCase().includes(filters.standard.toLowerCase())
      );
    }

    if (filters.stuNo) {
      filtered = filtered.filter((student) =>
        student.stuNo.toLowerCase().includes(filters.stuNo.toLowerCase())
      );
    }

    setFilteredStudents(filtered);
  }, [filters, students]);

  const getStartAndEndDates = (dateFilter) => {
    const now = new Date();
    let start, end;

    switch (dateFilter) {
      case "today":
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(start);
        break;
      case "thisWeek":
        start = new Date(now.setDate(now.getDate() - now.getDay())); // Start of this week (Sunday)
        end = new Date(start);
        end.setDate(start.getDate() + 6); // End of this week (Saturday)
        break;
      case "nextWeek":
        start = new Date(now.setDate(now.getDate() - now.getDay() + 7)); // Start of next week (Sunday)
        end = new Date(start);
        end.setDate(start.getDate() + 6); // End of next week (Saturday)
        break;
      case "previousWeek":
        start = new Date(now.setDate(now.getDate() - now.getDay() - 7)); // Start of previous week (Sunday)
        end = new Date(start);
        end.setDate(start.getDate() + 6); // End of previous week (Saturday)
        break;
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "nextMonth":
        start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        break;
      case "previousMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default:
        start = new Date(dateFilter);
        end = new Date(dateFilter);
        break;
    }
    return { start, end };
  };

  return (
    <div>
      <h2>Student Birthdays</h2>
      <div className="column-gap-3 d-flex flex-wrap align-content-center align-items-end">
        <div className="col">
          <select
            value={filters.date}
            className="form-select"
            onChange={(e) =>
              setFilters({ ...filters, date: e.target.value, dob: "" })
            }
          >
            <option value="">Select Date Range</option>
            <option value="today">Today</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="nextWeek">Next Week</option>
            <option value="nextMonth">Next Month</option>
            <option value="previousWeek">Previous Week</option>
            <option value="previousMonth">Previous Month</option>
          </select>
        </div>
        <div className="col">
          <label>Date:</label>
          <input
            type="date"
            value={filters.dob}
            className="form-control"
            onChange={(e) =>
              setFilters({ ...filters, dob: e.target.value, date: "" })
            }
          />
        </div>
        <div className="col">
          <label>Middle Name:</label>
          <input
            type="text"
            value={filters.middleName}
            className="form-control"
            onChange={(e) =>
              setFilters({ ...filters, middleName: e.target.value })
            }
          />
        </div>
        <div className="col">
          <label>standard:</label>
          <input
            type="text"
            value={filters.standard}
            className="form-control"
            onChange={(e) =>
              setFilters({ ...filters, standard: e.target.value })
            }
          />
        </div>
        <div className="col">
          <label>Student No:</label>
          <input
            type="text"
            value={filters.stuNo}
            className="form-control"
            onChange={(e) => setFilters({ ...filters, stuNo: e.target.value })}
          />
        </div>
        {/* <button
          className="btn btn-primary btn-lg mb-1"
          onClick={() => setFilters({ ...filters })}
        >
          Filter
        </button> */}
      </div>

      {/* 
      <ul>
        {filteredStudents.map((student) => (
          <li key={student._id}>
            {student.firstName} {student.middleName} {student.lastName} -{" "}
            {student.dateOfBirth} - Class: {student.class} - StuNo:{" "}
            {student.stuNo}
          </li>
        ))}
      </ul> 
      */}
      <div className="overflow-auto">

        <table className="table table-bordered table-striped my-3">
          <thead>
            <tr>
              <th>#</th>
              <th>GR. No.</th>
              <th style={{ width: "55px", height: "auto" }}>Photo</th>
              <th>Name</th>
              <th>D.O.B.</th>
              <th>Standard</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student, index) => (
              <tr key={student._id}>
                <td>{index + 1}</td>
                <td>{student.stuNo}</td>
                <td style={{ width: "55px", height: "auto" }}>
                  <img
                    src={`${linkone}/` + student.studentPhoto}
                    // src={`https://kidzera.vedantclasses.org.in/` + student.studentPhoto}
                    alt=""
                    style={{ width: "50px", height: "50px" }}
                  />{" "}
                </td>
                <td>
                  {student.firstName} {student.middleName} {student.lastName}
                </td>
                {/* <td>{student.dob}</td> */}
                <td>
                  {new Date(student.dob).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </td>
                <td>{student.standard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminBirthday;
