import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";


function TeacherBirthday() {
  const linkone = API_BASE_URL;
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

    const [teachers, setTeachers] = useState([]);
    const [filteredTeachers, setFilteredTeachers] = useState([]);
    const [filters, setFilters] = useState({
      date: "", // 'today', 'thisWeek', 'thisMonth', or a specific date
      middleName: "",
      standard: "",
      GR_No: "",
      dob: "", // New state for the custom date picker
    });
  
    useEffect(() => {
      // Fetch all teachers initially
      const fetchTeachers = async () => {
        try {
          const response = await axios.get(`${linkone}` + "/api/teachers/birthdays");
          const rows = Array.isArray(response.data) ? response.data : [];
          setTeachers(rows);
          setFilteredTeachers(rows);
        } catch (err) {
          console.error(err);
          setPageError(err.response?.data?.message || "Unable to load teacher birthdays.");
        } finally {
          setLoading(false);
        }
      };
      fetchTeachers();
    }, []);
  
    useEffect(() => {
      // Apply filters whenever the filter state changes
      let filtered = [...teachers];
  
      // if (filters.date || filters.dob) {
      //     const { start, end } = getStartAndEndDates(filters.date || filters.dob);
      //     filtered = filtered.filter(teacher => {
      //         const customDate = new Date(teacher.dob);
      //         return customDate >= start && customDate <= end;
      //     });
      // }
  
      if (filters.date || filters.dob) {
        const { start, end } = getStartAndEndDates(filters.date || filters.dob);
        filtered = filtered.filter((teacher) => {
            const birthday = new Date(teacher.dob);
            if (!teacher.dob || Number.isNaN(birthday.getTime())) return false;

            // Compare recurring birthdays by month/day, including ranges crossing
            // December to January.
            const birthdayKey = (birthday.getMonth() + 1) * 100 + birthday.getDate();
            const startKey = (start.getMonth() + 1) * 100 + start.getDate();
            const endKey = (end.getMonth() + 1) * 100 + end.getDate();

            return startKey <= endKey
                ? birthdayKey >= startKey && birthdayKey <= endKey
                : birthdayKey >= startKey || birthdayKey <= endKey;
        });
    }
  
      if (filters.middleName) {
          filtered = filtered.filter(teacher =>
              String(teacher.middleName || '').toLowerCase().includes(filters.middleName.toLowerCase())
          );
      }
  
      if (filters.standard) {
          filtered = filtered.filter(teacher => String(teacher.standard || '') === filters.standard);
      }
  
      if (filters.GR_No) {
          filtered = filtered.filter(teacher => String(teacher.GR_No || '') === filters.GR_No);
      }
  
      setFilteredTeachers(filtered);
  }, [filters, teachers]);
  
  const getStartAndEndDates = (dateFilter) => {
      const now = new Date();
      let start, end;
  
      switch (dateFilter) {
        case 'today':
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(start);
            break;
        case 'thisWeek':
            start = new Date(now.setDate(now.getDate() - now.getDay())); // Start of this week (Sunday)
            end = new Date(start);
            end.setDate(start.getDate() + 6); // End of this week (Saturday)
            break;
        case 'nextWeek':
            start = new Date(now.setDate(now.getDate() - now.getDay() + 7)); // Start of next week (Sunday)
            end = new Date(start);
            end.setDate(start.getDate() + 6); // End of next week (Saturday)
            break;
        case 'previousWeek':
            start = new Date(now.setDate(now.getDate() - now.getDay() - 7)); // Start of previous week (Sunday)
            end = new Date(start);
            end.setDate(start.getDate() + 6); // End of previous week (Saturday)
            break;
        case 'thisMonth':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'nextMonth':
            start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
            break;
        case 'previousMonth':
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
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      <div className="page-header"><div><h2 className="mb-0">Teacher birthdays</h2><p className="page-subtitle">Find staff birthdays by date range, name, class, or teacher number.</p></div><span className="badge text-bg-light border px-3 py-2">{filteredTeachers.length} results</span></div>
      <div className="filter-panel mb-3" aria-label="Filter teacher birthdays">
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
          <label>Teacher No:</label>
          <input
            type="text"
            value={filters.GR_No}
            className="form-control"
            onChange={(e) => setFilters({ ...filters, GR_No: e.target.value })}
          />
        </div>
        {/* <button
          className="btn btn-primary btn-lg mb-1"
          onClick={() => setFilters({ ...filters })}
        >
          Filter
        </button> */}
      </div>

      {/* <ul>
        {filteredTeachers.map((teacher) => (
          <li key={teacher._id}>
            {teacher.firstName} {teacher.middleName} {teacher.lastName} -{" "}
            {teacher.dateOfBirth} - Class: {teacher.class} - StuNo:{" "}
            {teacher.GR_No}
          </li>
        ))}
      </ul> */}
      <div className="table-responsive"><table className="table table-hover align-middle my-0">
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
          {loading ? (
            <tr><td colSpan={6} className="text-center py-5">Loading teacher birthdays…</td></tr>
          ) : filteredTeachers.length === 0 ? (
            <tr><td colSpan={6}><div className="empty-state"><strong>No matching birthdays</strong>Try changing the date or clearing a filter.</div></td></tr>
          ) : filteredTeachers.map((teacher,index) => (
            <tr key={teacher._id}>
              <td>{index+1}</td>
              <td>{teacher.GR_No}</td>
              <td style={{ width: "55px", height: "auto" }}>
                <img
                  src={teacher.selfPhoto ? (String(teacher.selfPhoto).startsWith("http") ? teacher.selfPhoto : linkone + "/" + String(teacher.selfPhoto).replace(/^\/+/, "")) : "https://ui-avatars.com/api/?name=" + encodeURIComponent(teacher.middleName || "Teacher")}
                  alt={[teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(" ") || "Teacher"}
                  style={{ width: "50px", height: "50px" }}
                />
              </td>
              <td>
                {teacher.firstName} {teacher.middleName} {teacher.lastName}
              </td>
              <td>{teacher.dob}</td>
              <td>{teacher.standard}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}

export default TeacherBirthday
