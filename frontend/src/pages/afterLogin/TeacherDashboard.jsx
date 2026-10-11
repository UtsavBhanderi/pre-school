import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import { AuthContext } from "../../context/AuthContext";

const TeacherDashboard = () => {
  const [reports, setReports] = useState([]);
  const [formData, setFormData] = useState({
    TimeIn: "",
    TimeOut: "",
    subject: "",
    standard: "",
    branch: "",
    dailyWorkReport: "",
    totalStudents:"",
  });
  const { user, logout } = useContext(AuthContext);
  
  const linkone = `https://api.kidzeranursery.com`;

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { data } = await axios.get(`${linkone}` + "/api/dailyWorkReport", {
          headers: { "x-auth-token": localStorage.getItem("token") },
        });
        setReports(data);
      } catch (err) {
        console.error("Error fetching daily work reports:", err);
      }
    };

    if (user) {
      fetchReports();
    }
  }, [user]);

  const { TimeIn, TimeOut, subject, standard, branch, dailyWorkReport, totalStudents } =
    formData;

  const onChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${linkone}` + "/api/dailyWorkReport", formData, {
        headers: { "x-auth-token": localStorage.getItem("token") },
      });
      alert("Daily work report submitted");
      // Fetch reports again to update the list
      const { data } = await axios.get(`${linkone}` + "/api/dailyWorkReport", {
        headers: { "x-auth-token": localStorage.getItem("token") },
      });
      setReports(data);
      setFormData({
        TimeIn: "",
        TimeOut: "",
        subject: "",
        standard: "",
        branch: "",
        dailyWorkReport: "",
        totalStudents: "",
      });
    } catch (err) {
      console.error("Error submitting daily work report:", err);
    }
  };

  const [filter, setFilter] = useState({
    date: "",
    subject: "",
    branch: "",
    standard: "",
  });
  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const filteredReportsData = reports.filter(
    (pdf) =>
      pdf.date.includes(filter.date) &&
      pdf.subject.includes(filter.subject) &&
      pdf.branch.includes(filter.branch) &&
      pdf.standard.includes(filter.standard)
  );

  var sumValue = 0;
  for (var i = 0; i < filteredReportsData.length; i++) {
    sumValue += parseFloat(filteredReportsData[i].todaysWorkingHours);
  }

  return (
    <div>
      <h2 className="p-2">
        Teacher's Dashboard
        <button onClick={logout} className="btn btn-danger btn-sm">
          Logout
        </button>
      </h2>
      <form onSubmit={onSubmit}>
        <div className="p-3 d-flex flex-wrap justify-content-around gap-4">
          <div className="form-group col-3">
            <label>Time In</label>
            <input
              type="time"
              name="TimeIn"
              value={TimeIn}
              onChange={onChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group col-3">
            <label>Time Out</label>
            <input
              type="time"
              name="TimeOut"
              value={TimeOut}
              onChange={onChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group col-3">
            <label>Subject</label>
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={onChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group col-3">
            <label>Standard</label>
            {/* <input
              type="text"
              name="standard"
              value={standard}
              onChange={onChange}
              className="form-control"
              required
            /> */}
             <select
            name="standard"
            placeholder="Standard"
            value={standard}
            onChange={onChange}
            className="form-control"
            id="standard"
            required
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
          {/* </div>
        <div className="row"> */}
          {/* <div className="form-group col-3">
            <label>Branch</label>
            <input
              type="text"
              name="branch"
              value={branch}
              onChange={onChange}
              className="form-control"
              required
            />
          </div> */}
          <div className="form-group col-3">
            <label>Daily Work Report</label>
            <input
              type="text"
              name="dailyWorkReport"
              value={dailyWorkReport}
              onChange={onChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group col-3">
            <label>Total Students</label>
            <input
              type="number"
              name="totalStudents"
              value={totalStudents}
              onChange={onChange}
              className="form-control"
              required
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary mx-3">
          Submit
        </button>
      </form>
      <h3 className="p-2">Your Daily Work Reports</h3>
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
        {/* <div className="col">
          <input
            type="number"
            name="branch"
            placeholder="branch"
            className="form-control"
            value={filter.branch}
            onChange={handleFilterChange}
          />
        </div> */}

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
      {reports.length === 0 ? (
        <p>No reports found</p>
      ) : (
        <div className="w-100 p-2">
          <table className="table table-bordered table-striped">
            <thead>
              <tr>
                <th>#</th>
                <th>date</th>
                <th>TimeIn</th>
                <th>TimeOut</th>
                <th>subject</th>
                <th>standard</th>
                {/* <th>branch</th> */}
                <th>dailyWorkReport</th>
                <th>total Students</th>
                <th>todaysWorkingHours</th>
              </tr>
            </thead>
            <tbody>
              {/* {reports.map((report) => ( */}
              {filteredReportsData.map((report,index) => (
                <tr key={report._id}>
                  <td>{index + 1}</td>
                  <td>{report.date}</td>
                  <td>{report.TimeIn}</td>
                  <td>{report.TimeOut}</td>
                  <td>{report.subject}</td>
                  <td>{report.standard}</td>
                  {/* <td>{report.branch}</td> */}
                  <td>{report.dailyWorkReport}</td>
                  <td>{report.totalStudents}</td>
                  <td>{report.todaysWorkingHours}</td>
                </tr>
              ))}
              <tr>
                <td>Total</td>
                <td colSpan={7}></td>
                <td>{sumValue} Hrs</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
