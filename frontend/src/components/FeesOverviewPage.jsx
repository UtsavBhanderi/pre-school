import React, { useState, useEffect } from "react";
import axios from "axios";

const FeesOverviewPage = () => {
 const linkone = `http://localhost:5000`;

  const [feesData, setFeesData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [studentDetails, setStudentDetails] = useState(null); // To hold individual student details
  const [selectedDateData, setSelectedDateData] = useState([]);

  useEffect(() => {
    // Fetch fees data from the backend
    axios
      .get(`${linkone}` + "/api/fees/fees-collection-data")
      .then((response) => {
        setFeesData(response.data);
      })
      .catch((error) => {
        console.error("Error fetching fees data:", error);
      });
  }, []);

  // Handle modal open for student details
  const handleShowModal = (details) => {
    // Add total fees remaining to each student
    const updatedDetails = {
      ...details,
      students: details.students.map(student => (
        {
          Discount: student.totalStandardFees - student.totalPaid - (student.discount || 0),
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
  const handleDateFilter = (e) => {
    const selectedDate = e.target.value;

    const [year, month, day] = selectedDate.split("-");
    const formattedDate = `${parseInt(month)}/${day}/${year}`;

    axios
      .get(`${linkone}` + `/api/fees/fees-by-date?date=${formattedDate}`)
      .then((response) => {
        setSelectedDateData(response.data);
      })
      .catch((error) => {
        console.error("Error fetching date-specific data:", error);
      });
  };

  // define a reusable function
  function calculateSum(arr) {
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
      style: "currency",
      currency: "INR",
    });
  }
  const totalStandardFeesTable =
    feesData.standardWise?.map((standard) => standard.totalStandardFees) || "0";

  const totalPaidTable =
    feesData.standardWise?.map((standard) => standard.totalPaid) || "0";

  const totalDiscountTable =
    feesData.standardWise?.map((standard) => standard.totalDiscount) || "0";

  const totalRemainingTable =
    feesData.standardWise?.map((standard) => standard.totalStandardFees - standard.totalPaid - (standard.totalDiscount || 0)
    ) || "0";

  return (
    <div className="">
      <h2>Fees Overview</h2>

      {/* Cards Section */}
      <div className="w-100 d-flex flex-wrap mb-3">
        {Object.keys(feesData).map(
          (key, index) =>
            key !== "standardWise" &&
            key !== "monthsData" && (
              <div className="col-md-4" key={key}>
                <div className="card w-75 m-3">
                  <div className="card-body">
                    {/* <div> */}
                    <h5 className="card-title">{key}</h5>
                    {/* <p className="card-text">₹{feesData[key].totalPaid || 0}</p> */}
                    <p className="card-text">₹{new Intl.NumberFormat('en-IN').format(feesData[key].totalPaid || 0)}</p>
                    {/* </div> */}
                    <button
                      onClick={() => handleShowModal(feesData[key])}
                      className="btn btn-info"
                    >
                      Info
                    </button>
                  </div>
                </div>
              </div>
            )
        )}
        {/* // {{(index===2) ? <br/>}} */}
        {/* <div className="col-md-3">
          <div className="card w-100 text-center">
            <div className="card-body">
              <h5 className="card-title">Today's Collection</h5>
              <p className="card-text">₹{feesData.today}</p>
              <button onClick={() => handleShowModal(feesData[0])} className="btn btn-info">Info</button>
            </div>
          </div>
        </div> */}
      </div>

      {/* Standard-wise Collection Table */}
      <h2>Standard-wise Fees Collection</h2>
      <table className="table table-striped table-bordered mb-3">
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
          {feesData.standardWise?.map((standard) => (
            <tr key={standard._id}>
              <td>{standard._id}</td>
              <td>{standard.totalStandardFees}</td>
              <td>{standard.totalPaid}</td>
              <td>{standard.totalStandardFees - standard.totalPaid - standard.totalDiscount}</td>
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
      </table>

      {/* Table for Custom Date Payments */}
      {/* <h4>Payments for Selected Date</h4> */}
      <div className="d-flex mt-5">
        <h2 className="me-3">Filter by Date</h2>
        <input
          type="date"
          className="form-control w-25"
          onChange={handleDateFilter}
        />
      </div>
      <table className="table table-striped">
        <thead>
          <tr>
            <th>#</th>
            <th>Student Name</th>
            <th>Standard</th>
            <th>Roll No</th>
            <th>Amount</th>
            {/* <th>Actions</th> */}
          </tr>
        </thead>
        <tbody>
          {selectedDateData.map((student, index) => {
            if (student) {
              return (
                <tr key={student.rollNo}>
                  <td>{index + 1}</td>
                  <td>{student.studentName}</td>
                  <td>{student.standard}</td>
                  <td>{student.rollNo}</td>
                  <td>{student.totalPaid}</td>
                  {/* <td>
                  <button onClick={() => handleShowModal(student)} className="btn btn-info">Info</button>
                </td> */}
                </tr>
              );
            }

            return (
              <tr>
                <td colSpan={4}>no data</td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
