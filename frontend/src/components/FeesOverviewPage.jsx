import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { Link } from "react-router-dom";

const SUMMARY_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  prevWeek: "Last week",
  thisMonth: "This month",
  prevMonth: "Last month",
};

const formatCurrency = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value) || 0);

const FeesOverviewPage = () => {
  const linkone = API_BASE_URL;

  const [feesData, setFeesData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [studentDetails, setStudentDetails] = useState(null); // To hold individual student details
  const [selectedDateData, setSelectedDateData] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [schoolStats, setSchoolStats] = useState({ students: 0, teachers: 0, outstandingFees: 0 });

  useEffect(() => {
    let active = true;

    axios.get(linkone + "/api/fees/fees-collection-data")
      .then((response) => {
        if (active) {
          setFeesData(response.data || {});
          setPageError("");
        }
      })
      .catch((error) => {
        console.error("Error fetching fees data:", error);
        if (active) setPageError(error.response?.data?.message || "Unable to load fee collection data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);


  useEffect(() => {
    let active = true;
    Promise.all([
      axios.get(linkone + "/api/students"),
      axios.get(linkone + "/api/teachers"),
      axios.get(linkone + "/api/fees/all"),
    ]).then(([studentsResponse, teachersResponse, feesResponse]) => {
      const students = Array.isArray(studentsResponse.data) ? studentsResponse.data : [];
      const teachers = Array.isArray(teachersResponse.data) ? teachersResponse.data : [];
      const fees = Array.isArray(feesResponse.data) ? feesResponse.data : [];
      const outstandingFees = fees.reduce((sum, fee) => sum + Math.max(0, Number(fee.totalStandardFees || 0) - Number(fee.totalFeesPaid || 0) - Number(fee.discount || 0)), 0);
      if (active) setSchoolStats({ students: students.length, teachers: teachers.length, outstandingFees });
    }).catch((error) => {
      console.error("Unable to load school dashboard counts:", error);
    }).finally(() => {
      if (active) setStatsLoading(false);
    });
    return () => { active = false; };
  }, []);

  // Handle modal open for student details
  const handleShowModal = (details) => {
    // Add total fees remaining to each student
    const updatedDetails = {
      ...details,
      students: (details.students || []).map(student => (
        {
          remainingFees: Math.max(0, Number(student.totalStandardFees || 0) - Number(student.totalPaid || 0) - Number(student.discount || 0)),
          ...student
        }))
    };

    setStudentDetails(updatedDetails); // Set the updated student details
    // setFeesData(updatedDetails);
    setShowModal(true);
  };

  // Handle modal close
  const handleCloseModal = () => {
    setShowModal(false);
    setStudentDetails(null); // Clear the student details
  };

  // Handle custom date filtering
  const handleDateFilter = async (event) => {
    const value = event.target.value;
    setSelectedDate(value);
    setPageError("");
    if (!value) {
      setSelectedDateData([]);
      return;
    }

    const date = new Date(value + "T00:00:00");
    if (Number.isNaN(date.getTime())) {
      setPageError("Choose a valid date.");
      return;
    }
    const formattedDate = String(date.getMonth() + 1).padStart(2, "0") + "/" +
      String(date.getDate()).padStart(2, "0") + "/" + date.getFullYear();

    setDateLoading(true);
    try {
      const response = await axios.get(linkone + "/api/fees/fees-by-date", {
        params: { date: formattedDate },
      });
      setSelectedDateData(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching date-specific data:", error);
      setPageError(error.response?.data?.message || "Unable to load payments for that date.");
      setSelectedDateData([]);
    } finally {
      setDateLoading(false);
    }
  };


  // define a reusable function
  function calculateSum(arr) {
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      sum += Number(arr[i]) || 0;
    }
    return sum.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
      style: "currency",
      currency: "INR",
    });
  }
  const totalStandardFeesTable =
    feesData.standardWise?.map((standard) => Number(standard.totalStandardFees) || 0) || [];

  const totalPaidTable =
    feesData.standardWise?.map((standard) => Number(standard.totalPaid) || 0) || [];

  const totalRemainingTable =
    feesData.standardWise?.map((standard) => Math.max(0, Number(standard.totalStandardFees || 0) - Number(standard.totalPaid || 0) - Number(standard.totalDiscount || 0))) || [];

  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}

      <div className="page-header">
        <div>
          <h2 className="mb-0">Fee collection overview</h2>
          <p className="page-subtitle">Compare collection across daily, weekly, and monthly periods.</p>
        </div>
      </div>

      <div className="overview-stat-grid" aria-label="School summary">
        <section className="overview-stat-card">
          <div className="overview-stat-label">Registered students</div>
          <div className="overview-stat-value">{statsLoading ? "—" : schoolStats.students.toLocaleString("en-IN")}</div>
          <Link className="btn btn-outline-primary btn-sm" to="/dashboard/studentRegister">Manage students</Link>
        </section>
        <section className="overview-stat-card">
          <div className="overview-stat-label">Teaching staff</div>
          <div className="overview-stat-value">{statsLoading ? "—" : schoolStats.teachers.toLocaleString("en-IN")}</div>
          <Link className="btn btn-outline-primary btn-sm" to="/dashboard/teacherRegister">Manage teachers</Link>
        </section>
        <section className="overview-stat-card">
          <div className="overview-stat-label">Outstanding fees</div>
          <div className="overview-stat-value">{statsLoading ? "—" : formatCurrency(schoolStats.outstandingFees)}</div>
          <Link className="btn btn-outline-primary btn-sm" to="/dashboard/fees">View fee records</Link>
        </section>
      </div>

      <section className="page-card mb-4">
        <div className="section-heading mt-0"><h3>Quick actions</h3><span className="muted small">Common tasks, one click away</span></div>
        <div className="page-actions">
          <Link className="btn btn-primary" to="/dashboard/attendanceEntryPage">Take attendance</Link>
          <Link className="btn btn-outline-primary" to="/dashboard/studentRegister">Add student</Link>
          <Link className="btn btn-outline-primary" to="/dashboard/fees">Record a payment</Link>
          <Link className="btn btn-outline-primary" to="/dashboard/calendar">Add school event</Link>
        </div>
      </section>

      <div className="section-heading"><h3>Fee collection trends</h3><span className="muted small">Based on recorded payments</span></div>
      <div className="overview-stat-grid">
        {loading ? (
          <div className="page-card"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading collection summary…</div>
        ) : Object.entries(feesData).filter(([key]) => Boolean(SUMMARY_LABELS[key])).map(([key, summary]) => (
          <section className="overview-stat-card" key={key}>
            <div className="overview-stat-label">{SUMMARY_LABELS[key]}</div>
            <div className="overview-stat-value">{formatCurrency(summary?.totalPaid || 0)}</div>
            <div className="muted small mb-3">{summary?.students?.length || 0} payment entries</div>
            <button type="button" onClick={() => handleShowModal(summary || {})} className="btn btn-outline-primary btn-sm">View details</button>
          </section>
        ))}
      </div>

      {/* Standard-wise Collection Table */}
      <div className="section-heading"><h3>Collection by class</h3><span className="muted small">Totals reflect recorded fee accounts</span></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Standard</th>
            <th>Total Standard Fees</th>
            <th>Total Paid</th>
            <th>Total Remaining Fees</th>
            {/* <th>Total Discount Fees</th> */}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="text-center py-4">Loading class totals…</td></tr>
          ) : !feesData.standardWise?.length ? (
            <tr><td colSpan={5}><div className="empty-state"><strong>No fee summary is available</strong>Fee totals will appear once student fee records are available.</div></td></tr>
          ) : feesData.standardWise.map((standard) => (
            <tr key={standard._id}>
              <td>{standard._id}</td>
              <td>{formatCurrency(standard.totalStandardFees)}</td>
              <td>{formatCurrency(standard.totalPaid)}</td>
              <td>{formatCurrency(Math.max(0, Number(standard.totalStandardFees || 0) - Number(standard.totalPaid || 0) - Number(standard.totalDiscount || 0)))}</td>
              {/* <td>{standard.totalDiscount}</td> */}
              <td>
                <button
                  onClick={() => handleShowModal(standard)}
                  className="btn btn-info"
                >
                  Info
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td>
              <strong>{calculateSum(totalStandardFeesTable)}</strong>
            </td>
            <td>
              <strong>{calculateSum(totalPaidTable)}</strong>
            </td>
            <td>
              <strong>{calculateSum(totalRemainingTable)}</strong>
            </td>
            {/* <td>
              <strong>{calculateSum(totalDiscountTable)}</strong>
            </td> */}
            <td></td>
          </tr>
          {/* <td><strong>{totals.totalDiscountFees}</strong></td> */}
        </tbody>
      </table></div>

      <section className="page-card mt-4">
        <div className="section-heading mt-0">
          <div>
            <h3>Payments by date</h3>
            <p className="page-subtitle">Select a day to review payments recorded for that date.</p>
          </div>
          <div>
            <label htmlFor="fee-collection-date" className="form-label">Payment date</label>
            <input id="fee-collection-date" type="date" className="form-control" value={selectedDate} onChange={handleDateFilter} />
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr><th>#</th><th>Student name</th><th>Standard</th><th>GR No.</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {dateLoading ? (
                <tr><td colSpan={5} className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading payments…</td></tr>
              ) : selectedDateData.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state"><strong>{selectedDate ? "No payments found for this date" : "Choose a payment date"}</strong>{selectedDate ? "Try another day to see the payments recorded." : "Payment entries for the selected day will appear here."}</div></td></tr>
              ) : selectedDateData.map((student, index) => (
                <tr key={student._id || student.rollNo + "-" + index}>
                  <td>{index + 1}</td>
                  <td className="fw-semibold">{student.studentName || "—"}</td>
                  <td>{student.standard || "—"}</td>
                  <td>{student.rollNo || "—"}</td>
                  <td>{formatCurrency(student.totalPaid || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal for showing student details */}
      {/* {showModal && studentDetails && (
        <div className="modal" style={{ display: 'block' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Student Payment Details</h5>
                <button type="button" className="close" onClick={handleCloseModal}>&times;</button>
              </div>
              <div className="modal-body">
                {studentDetails && (
                  <table className="table table-bordered">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Standard</th>
                        <th>Roll No</th>
                        <th>Amount Paid</th>
                        <th>Payment Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{studentDetails.studentName}</td>
                        <td>{studentDetails.standard}</td>
                        <td>{studentDetails.rollNo}</td>
                        <td>{studentDetails.amount || studentDetails.totalPaid}</td>
                        <td>{studentDetails.paymentDate || 'N/A'}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )} */}
      {/* {studentDetails && ( */}
      {showModal && (
        <div className="modal" style={{ display: "block" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header justify-content-between">
                <h5 className="modal-title">Student Payment Details</h5>
                <button
                  type="button"
                  className="close"
                  onClick={handleCloseModal}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <table className="table table-bordered table-striped">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student Name</th>
                      <th>Standard</th>
                      <th>Roll No</th>
                      <th>Paid</th>
                      {/* <th>Due</th> */}
                    </tr>
                  </thead>
                  <tbody>
                    {/* {feesData.standardWise?.map((standard) => ( */}

                    {studentDetails.students?.map((fees, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{fees.studentName}</td>

                        {/* <td>{studentDetails._id}</td> */}
                        <td>{studentDetails._id || fees.standard}</td>
                        <td>{fees.rollNo || fees.stuNo}</td>
                        <td>{fees.amount || fees.totalPaid}</td>
                        {/* student.totalStandardFees - student.totalPaid - (student.discount || 0), */}
                        {/* <td>{fees.totalStandardFees - fees.totalPaid - (fees.Discount || fees.totalDiscount)}</td> */}
                        {/* <td>{fees.totalStandardFees - fees.totalPaid - (fees.totalDiscount)}</td> */}
                      </tr>
                    ))}
                    {/* <tr>
                <td>{studentDetails.studentName}</td>
                <td>{studentDetails._id}</td>
                <td>{studentDetails.rollNo}</td>
                <td>{studentDetails.amount || studentDetails.totalPaid}</td>
                <td>{studentDetails.paymentDate || 'N/A'}</td>
              </tr> */}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeesOverviewPage;
