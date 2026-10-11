import React, { useState, useEffect } from "react";
import axios from "axios";

function TeachersEntry() {
  const linkone = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

  const [TeachersData, setTeachersData] = useState([]);
  useEffect(() => {
    fetchTeachersData();
  }, []);

  const fetchTeachersData = async () => {
    try {
      const response = await axios.get(
        `${linkone}` + "/api/dailyWorkReport/all"
      );
      setTeachersData(response.data);
    } catch (error) {
      console.error("Error fetching fees data:", error);
    }
  };

  const [filter, setFilter] = useState({
    date: "",
    subject: "",
    branch: "",
    userName: "",
    standard: "",
  });
  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const filteredReportsData = TeachersData.filter(
    (pdf) =>
      pdf.date.includes(filter.date) &&
      pdf.subject.includes(filter.subject) &&
      pdf.branch.includes(filter.branch) &&
      pdf.userName.includes(filter.userName) &&
      pdf.standard.includes(filter.standard)
  );

  var sumValue = 0;
  for (var i = 0; i < filteredReportsData.length; i++) {
    sumValue += parseFloat(filteredReportsData[i].todaysWorkingHours);
  }
  return (
    <>
      <div className="d-flex flex-column">
        <h2>TeachersEntry</h2>
        <div className="row mb-3 mt-2">
          <div className="col">
            <input
              type="date"
              name="date"
              placeholder="Date"
              className="form-control"
              value={filter.date}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col">
            <input
              type="text"
              name="subject"
              placeholder="Subject"
              className="form-control"
              value={filter.subject}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col">
            <input
              type="number"
              name="branch"
              placeholder="branch"
              className="form-control"
              value={filter.branch}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col">
            <input
              type="text"
              name="userName"
              placeholder="Teacher Name"
              className="form-control"
              value={filter.userName}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col">
            <select
              name="standard"
              placeholder="Standard"
              value={filter.standard}
              onChange={handleFilterChange}
              className="form-control"
              id="standard"
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
        </div>
        {TeachersData.length === 0 ? (
          <p>No reports found</p>
        ) : (
          <div className="overflow-auto">

            <table className="table table-bordered table-striped">
              <thead>
                <tr>
                  <th>#</th>
                  <th>date</th>
                  <th>userName</th>
                  <th>TimeIn</th>
                  <th>TimeOut</th>
                  <th>subject</th>
                  <th>standard</th>
                  {/* <th>branch</th> */}
                  <th>daily Work Report</th>
                  <th>total Students</th>
                  <th>todays Working Hours</th>
                </tr>
              </thead>
              <tbody>
                {/* {TeachersData.map((report) => ( */}
                {filteredReportsData.map((report, index) => (
                  <tr key={report._id}>
                    <td>{index + 1}</td>
                    <td>{report.date}</td>
                    <td>{report.userName}</td>
                    <td>{report.TimeIn}</td>
                    <td>{report.TimeOut}</td>
                    <td>{report.subject}</td>
                    <td>{report.standard}</td>
                    {/* <td>{report.branch}</td> */}
                    <td>{report.dailyWorkReport}</td>
                    <td>{report.totalStudents}</td>
                    <td>{report.todaysWorkingHours.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Total</td>
                  <td colSpan={8}></td>
                  {/* <td>{sumValue}</td> */}
                  <td>{sumValue.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default TeachersEntry;
