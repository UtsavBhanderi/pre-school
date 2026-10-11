// import React, { useState, useEffect, useRef } from "react";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";


const standardFees = {
  "ENG Play Group": 19900,
  "ENG NR.": 19900,
  "ENG JR.": 20900,
  "ENG SR.": 20900,
  "GUJ Play Group": 14500,
  "GUJ NR.": 14500,
  "GUJ JR.": 15000,
  "GUJ SR.": 15000,
};

const Fees = () => {
  const linkone = `http://localhost:5000`;

  const [feesData, setFeesData] = useState([]);
  const [formData, setFormData] = useState({
    studentName: "",
    studentPhoneNumber: "",
    batchYear: "",
    standard: "",
    totalStandardFees: 0,
    totalFeesPaid: 0,
    paymentDetails: [],
    discount: 0,
  });
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    fetchFeesData();
  }, []);

  const fetchFeesData = async () => {
    try {
      // const response = await axios.get(`https://kidzera.vedantclasses.org.in/api/fees/all`);
      const response = await axios.get(`${linkone}/api/fees/all`);
      setFeesData(response.data);
    } catch (error) {
      console.error("Error fetching fees data:", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "standard") {
      const fees = standardFees[value] || 0;
      setFormData((prevFormData) => ({
        ...prevFormData,
        [name]: value,
        totalStandardFees: fees,
      }));
    } else {
      setFormData((prevFormData) => ({
        ...prevFormData,
        [name]: value,
      }));
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editMode) {
        await axios.put(
          // `https://kidzera.vedantclasses.org.in/api/fees/update/${editId}`,
          `${linkone}/api/fees/update/${editId}`,
          formData
        );
      } else {
        // await axios.post(`https://kidzera.vedantclasses.org.in/api/fees/create`, formData);
        await axios.post(`${linkone}/api/fees/create`, formData);
      }
      fetchFeesData();
      resetForm();
    } catch (error) {
      console.error("Error saving fees data:", error);
      alert("Failed : " + error);
    }
  };

  const resetForm = () => {
    setFormData({
      studentName: "",
      studentPhoneNumber: "",
      batchYear: "",
      standard: "",
      totalStandardFees: 0,
      totalFeesPaid: 0,
      paymentDetails: [],
      discount: 0,
    });
    setEditMode(false);
    setEditId(null);
  };

  const handleEdit = (fees) => {
    setFormData(fees);
    setEditMode(true);
    setEditId(fees._id);
  };

  const handleDelete = (id) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    const password = prompt("Enter password to delete:");
    if (password === "123") {
      try {
        // await axios.delete(`https://kidzera.vedantclasses.org.in/api/fees/delete/${deleteId}`);
        await axios.delete(`${linkone}/api/fees/delete/${deleteId}`);
        fetchFeesData();
        setDeleteId(null);
      } catch (error) {
        console.error("Error deleting fees record:", error);
      }
    } else {
      alert("Incorrect password");
    }
  };

  const handlePaymentDetailChange = (index, e) => {
    const { name, value } = e.target;
    const updatedPaymentDetails = [...formData.paymentDetails];
    updatedPaymentDetails[index][name] = value;
    setFormData((prevFormData) => ({
      ...prevFormData,
      paymentDetails: updatedPaymentDetails,
      totalFeesPaid: updatedPaymentDetails.reduce(
        (acc, detail) => acc + parseFloat(detail.amount || 0),
        0
      ),
    }));
  };

  const addPaymentDetail = () => {
    const newPaymentDetail = {
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      amount: 0,
    };
    setFormData((prevFormData) => ({
      ...prevFormData,
      paymentDetails: [...prevFormData.paymentDetails, newPaymentDetail],
    }));
  };

  const removePaymentDetail = (index) => {
    const updatedPaymentDetails = formData.paymentDetails.filter(
      (_, i) => i !== index
    );
    setFormData((prevFormData) => ({
      ...prevFormData,
      paymentDetails: updatedPaymentDetails,
      totalFeesPaid: updatedPaymentDetails.reduce(
        (acc, detail) => acc + parseFloat(detail.amount || 0),
        0
      ),
    }));
  };

  const [filter, setFilter] = useState({
    stuNo: "",
    studentName: "",
    standard: "",
  });
  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };
  
  // const filteredfeesData = feesData;
  const filteredfeesData = feesData.filter(
    (pdf) =>
      pdf.stuNo.includes(filter.stuNo) &&
      pdf.studentName.includes(filter.studentName) &&
      pdf.standard.includes(filter.standard)
  );

  const [selectedStudents, setSelectedStudents] = useState([]);
  const [allChecked, setAllChecked] = useState(false);

  const exportToExcel = () => {
    // const worksheet = XLSX.utils.json_to_sheet(students);//for get all data in excel
    // --------------
    //// for get custom data in excel
    // const worksheet = XLSX.utils.json_to_sheet(students.map(student => ({
    //   name: student.name,
    //   age: student.age,
    //   class: student.class,
    //   feesPaid: student.feesPaid,
    //   feesRemaining: student.feesRemaining
    // })));
    // -------------------
    //// for get filter data in excel
    // const filteredStudentsExcel = filteredstudents.filter(
    //   (student) => student.feesPaid < 5000
    // );

    const worksheet = XLSX.utils.json_to_sheet(
      feesData.map((student) => ({
        // const worksheet = XLSX.utils.json_to_sheet(
        //   filteredStudentsExcel.map((student) => ({
        // studentPhoto: "/" + student.studentPhoto,
        GR_NO: student.stuNo,
        name: student.studentName,
        RegisterPhoneNo: student.studentPhoneNumber,
        FatherPhoneNo: student.ParentsMobileNumber,
        MotherPhoneNo: student.ParentsPhoneNumber,
        // parentEmail: student.parentEmail,
        BatchYear: student.batchYear,
        Standard: student.standard,
        totalStandardFees: student.totalStandardFees,
        totalFeesPaid: student.totalFeesPaid,
        TotalRemainingFees:
          student.totalStandardFees - student.discount - student.totalFeesPaid,
        // discount: student.discount,
      }))
    );

    // gender: studennt.address,
    // RegisterPhoneNt.gender,
    // address: studeumber: student.phoneNumber,
    // FatherPhoneNumber: student.FatherPhoneNumber,
    // MotherPhoneNumber: student.FatherMobileNumber,
    // DOB: student.dob,
    // const worksheet = XLSX.utils.json_to_sheet(students);//for get all data in excel

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "selectedStudents");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const data = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(data, "students.xlsx");
  };
  function exportToExcelConfirm() {
    confirm("confirm download") && exportToExcel();
  }
  function exportCheckedToExcelConfirm() {
    confirm("confirm download") && exportCheckedToExcel();
  }

  {
    /**const exportCheckedToExcel = () => {
    //for all fields
    const filteredStudentExcel = filteredfeesData.filter((student) =>
      selectedStudents.includes(student._id)
    );
    const worksheets = XLSX.utils.json_to_sheet(filteredStudentExcel);
    // const worksheets = XLSX.utils.json_to_sheet(students);
    const workbooks = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbooks, worksheets, "Selected Students");
    const excelBuffers = XLSX.write(workbooks, {
      bookType: "xlsx",
      type: "array",
    });
    const datas = new Blob([excelBuffers], {
      type: "application/octet-stream",
    });
    saveAs(datas, "selected_students.xlsx");
  };
 */
  }
  const exportCheckedToExcel = () => {
    //for custom fields
    const filteredStudents = filteredfeesData
      .filter((student) => selectedStudents.includes(student._id))
      .map((student) => ({
        // const worksheet = XLSX.utils.json_to_sheet(
        //   filteredStudentsExcel.map((student) => ({
        // studentPhoto: "https://kidzera.vedantclasses.org.in/" + student.studentPhoto,
        GR_NO: student.stuNo,
        name: student.studentName,
        RegisterPhoneNo: student.studentPhoneNumber,
        FatherPhoneNo: student.ParentsMobileNumber,
        MotherPhoneNo: student.ParentsPhoneNumber,
        // parentEmail: student.parentEmail,
        BatchYear: student.batchYear,
        Standard: student.standard,
        totalStandardFees: student.totalStandardFees,
        totalFeesPaid: student.totalFeesPaid,
        TotalRemainingFees:
          student.totalStandardFees - student.discount - student.totalFeesPaid,
        // discount: student.discount,
      }));
    const worksheet = XLSX.utils.json_to_sheet(filteredStudents);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Students");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const data = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(data, "selected_students.xlsx");
  };

  const handleCheckboxChange = (student) => {
    setSelectedStudents((prevSelectedStudents) => {
      if (prevSelectedStudents.includes(student._id)) {
        return prevSelectedStudents.filter((id) => id !== student._id);
      } else {
        return [...prevSelectedStudents, student._id];
      }
    });
  };

  const handleAllCheckboxChange = () => {
    if (allChecked) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredfeesData.map((student) => student._id));
    }
    setAllChecked(!allChecked);
  };

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

  return (
    <>
      <div className="mt-1">
        <div className="d-flex flex-row">
          <h2>Fees Management</h2>
        </div>
        {/* ref={formRef} */}
        <form onSubmit={handleFormSubmit}>
          <div className="row g-3">
            <div className="form-group col-3">
              <label>Student Name</label>
              <input
                type="text"
                name="studentName"
                value={formData.studentName}
                onChange={handleInputChange}
                className="form-control"
                required
              />
            </div>
            <div className="form-group col-3">
              <label>Phone Number</label>
              <input
                type="text"
                name="studentPhoneNumber"
                value={formData.studentPhoneNumber}
                onChange={handleInputChange}
                className="form-control"
                required
              />
            </div>

            <div className="form-group col-3">
              <label>Batch Year</label>
              <select
                name="batchYear"
                className="form-select"
                value={formData.batchYear}
                onChange={handleInputChange}
                required={!editMode}
              >
                <option value="">Select Batch Year</option>
                <option value="2022-23">2022-2023</option>
                <option value="2023-24">2023-2024</option>
                <option value="2024-25">2024-2025</option>
              </select>
            </div>

            <div className="form-group col-3">
              <label>Standard</label>
              <select
                name="standard"
                value={formData.standard}
                onChange={handleInputChange}
                className="form-control"
                required
              >
                <option value="">Select Standard</option>
                {Object.keys(standardFees).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group col-3">
              <label>Total Standard Fees</label>
              <input
                type="number"
                name="totalStandardFees"
                value={formData.totalStandardFees}
                onChange={handleInputChange}
                className="form-control"
                readOnly
              />
            </div>
            <div className="form-group col-3">
              <label>Total Fees Paid</label>
              <input
                type="number"
                name="totalFeesPaid"
                value={formData.totalFeesPaid}
                onChange={handleInputChange}
                className="form-control"
                readOnly
              />
            </div>
            <div className="form-group col-3">
              <label>Total Remaining Fees</label>
              <input
                type="number"
                value={formData.totalStandardFees - formData.totalFeesPaid}
                className="form-control"
                readOnly
              />
            </div>
            <div className="form-group col-3">
              <label>Discount Fees</label>
              <input
                type="number"
                className="form-control"
                name="discount"
                value={formData.discount}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label className="fw-semibold">Payment Details</label>
              <button
                type="button"
                onClick={addPaymentDetail}
                className="btn btn-primary btn-sm ms-2 fw-semibold"
              >
                Add Payment
              </button>
              {formData.paymentDetails.map((detail, index) => (
                <div key={index} className="form-row row g-3">
                  <div className="col">
                    <input
                      type="text"
                      name="date"
                      value={detail.date}
                      onChange={(e) => handlePaymentDetailChange(index, e)}
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="col">
                    <input
                      type="text"
                      name="time"
                      value={detail.time}
                      onChange={(e) => handlePaymentDetailChange(index, e)}
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="col">
                    <input
                      type="number"
                      name="amount"
                      value={detail.amount}
                      onChange={(e) => handlePaymentDetailChange(index, e)}
                      className="form-control"
                    />
                  </div>
                  {/* <div className="col">
                    <button
                      type="button"
                      onClick={() => removePaymentDetail(index)}
                      className="btn btn-danger btn-sm"
                    >
                      Remove
                    </button>
                  </div> */}
                </div>
              ))}
            </div>
            <div className="row m-1 mt-2 gap-3">
              <button type="submit" className="btn btn-success col-4">
                {/*onClick={handleButtonClick} */}
                {editMode ? "Update" : "Add"}
              </button>
              {/* <div className="btn btn-primary col-2" onClick={exportToExcel}> */}
              <div
                className="btn btn-primary col-2"
                onClick={exportToExcelConfirm}
              >
                All List
              </div>
              <div
                className="btn btn-primary col-2"
                // onClick={exportCheckedToExcel}
                onClick={exportCheckedToExcelConfirm}
              >
                Select List
              </div>
            </div>
          </div>
        </form>
        <div className=""></div>

        <hr />
        <div className="row mb-3 mt-2">
          <div className="col">
            <input
              type="text"
              name="stuNo"
              placeholder="Student No"
              className="form-control"
              value={filter.stuNo}
              onChange={handleFilterChange}
            />
          </div>
          <div className="col">
            <input
              type="text"
              name="studentName"
              placeholder="Student Name"
              className="form-control"
              value={filter.studentName}
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
        <h3>Fees Records</h3>
        <div className="overflow-auto">
          <table className="table table-bordered table-striped">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={handleAllCheckboxChange}
                  />
                </th>
                <th>#</th>
                <th>GR No.</th>
                <th>Standard</th>
                <th>Student Name</th>
                <th>Register Number</th>
                <th>Parent's Email ID.</th>
                {/* <td>Father Number</td> */}
                {/* <td>Mother Number</td> */}
                <td>batchYear</td>
                <th>Total Standard Fees</th>
                <th>Total Fees Paid</th>
                <th>Total Remaining Fees</th>
                <th>Discount Fees</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* {feesData.map((fees) => ( */}
              {filteredfeesData.map((fees, index) => (
                <tr key={fees._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(fees._id)}
                      onChange={() => handleCheckboxChange(fees)}
                    />
                  </td>
                  <td>{index + 1}</td>
                  <td>{fees.stuNo}</td>
                  <td>{fees.standard}</td>
                  <td>{fees.studentName}</td>
                  <td>{fees.studentPhoneNumber}</td>
                  <td>{fees.parentEmail}</td>
                  {/* <td>{fees.ParentsMobileNumber}</td> */}
                  {/* <td>{fees.ParentsPhoneNumber}</td> */}
                  <td>{fees.batchYear}</td>
                  <td>{fees.totalStandardFees}</td>
                  <td>{fees.totalFeesPaid}</td>
                  <td>
                    {fees.totalStandardFees - fees.discount - fees.totalFeesPaid}
                  </td>
                  <td>{fees.discount}</td>
                  <td>
                    <div className="d-flex column-gap-2">
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => handleEdit(fees)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="25"
                          height="25"
                          fill="currentColor"
                          className="bi bi-pencil-square"
                          viewBox="0 0 16 16"
                        >
                          <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z" />
                          <path
                            fillRule="evenodd"
                            d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5z"
                          />
                        </svg>
                        {/* Edit */}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(fees._id)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="25"
                          height="25"
                          fill="currentColor"
                          className="bi bi-trash"
                          viewBox="0 0 16 16"
                        >
                          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
                          <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
                        </svg>
                        {/* Delete */}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan="1"></td>
                <td colSpan="7" className="fw-bold text-start">Total</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.totalStandardFees), 0)}</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.totalFeesPaid), 0)}</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.totalStandardFees - fees.discount - fees.totalFeesPaid), 0)}</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.discount), 0)}</td>
                {/* <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.totalStandardFees), 0))}</td>
              <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.totalFeesPaid), 0))}</td>
              <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.totalStandardFees - fees.discount - fees.totalFeesPaid), 0))}</td>
              <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + parseFloat(fees.discount), 0))}</td> */}
                <td colSpan="1"></td>
              </tr>

            </tbody>
          </table>
        </div>
        {deleteId && (
          <div className="modal show" style={{ display: "block" }}>
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Confirm Delete</h5>
                  <button
                    type="button"
                    className="close"
                    onClick={() => setDeleteId(null)}
                  >
                    <span>&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p>Are you sure you want to delete this record?</p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDeleteId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={confirmDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Fees;
