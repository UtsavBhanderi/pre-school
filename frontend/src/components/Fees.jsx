// import React, { useState, useEffect, useRef } from "react";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";


const Fees = () => {
  const linkone = API_BASE_URL;

  const [feesData, setFeesData] = useState([]);
  const [loadingFees, setLoadingFees] = useState(true);
  const [savingFees, setSavingFees] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [standardFees, setStandardFees] = useState({});
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
  const [receiptRecord, setReceiptRecord] = useState(null);
  const [receiptPaymentIndex, setReceiptPaymentIndex] = useState(0);

  useEffect(() => {
    fetchFeesData();
    fetchStandardFees();
  }, []);

  const fetchStandardFees = async () => {
    try {
      const response = await axios.get(`${linkone}/api/fees/standard-fees`);
      setStandardFees(response.data || {});
    } catch (error) {
      console.error("Unable to load standard fees:", error);
    }
  };

  const fetchFeesData = async () => {
    setLoadingFees(true);
    try {
      const response = await axios.get(`${linkone}/api/fees/all`);
      setFeesData(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching fees data:", error);
      setPageError(error.response?.data?.message || "Unable to load fee records.");
    } finally {
      setLoadingFees(false);
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
    if (savingFees) return;
    setSavingFees(true);
    setPageError("");
    setPageSuccess("");
    try {
      if (editMode) {
        await axios.put(`${linkone}/api/fees/update/${editId}`, formData);
      } else {
        await axios.post(`${linkone}/api/fees/create`, formData);
      }
      await fetchFeesData();
      setPageSuccess(editMode ? "Fee record updated successfully." : "Fee record created successfully.");
      resetForm();
    } catch (error) {
      console.error("Error saving fees data:", error);
      setPageError(error.response?.data?.message || "Unable to save this fee record.");
    } finally {
      setSavingFees(false);
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

  const openReceipt = (fees, paymentIndex = 0) => {
    setReceiptRecord(fees);
    setReceiptPaymentIndex(paymentIndex);
  };

  const closeReceipt = () => setReceiptRecord(null);

  const formatReceiptAmount = (value) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

  const handlePrintReceipt = () => {
    if (!receiptRecord || !receiptRecord.paymentDetails?.[receiptPaymentIndex]) return;
    window.print();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`${linkone}/api/fees/delete/${deleteId}`);
      await fetchFeesData();
      setDeleteId(null);
    } catch (error) {
      console.error("Unable to delete fee record:", error);
      alert(error.response?.data?.message || "Unable to delete fee record.");
    }
  };

  const handlePaymentDetailChange = (index, e) => {
    const { name, value } = e.target;
    const updatedPaymentDetails = formData.paymentDetails.map((detail, detailIndex) => detailIndex === index ? { ...detail, [name]: value } : detail);
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
      date: (() => { const now = new Date(); return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`; })(),
      time: new Date().toLocaleTimeString(),
      amount: "",
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
      String(pdf.stuNo ?? "").includes(filter.stuNo) &&
      String(pdf.studentName ?? "").toLowerCase().includes(filter.studentName.toLowerCase()) &&
      String(pdf.standard ?? "").includes(filter.standard)
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
        {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
        {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}
        <div className="page-header">
          <div>
            <h2 className="mb-0">Fees and payments</h2>
            <p className="page-subtitle">Enter a child’s fee details, record money received, and print a receipt.</p>
          </div>
        </div>
        <form className="page-card fees-entry-card" onSubmit={handleFormSubmit}>
          <div className="row g-3">
            <div className="col-12 fees-step-heading">
              <h3>{editMode ? "Update a fee record" : "1. Child details"}</h3>
              <p>Enter the child’s name, parent contact number, class and school year.</p>
            </div>
            <div className="form-group col-12 col-md-6 col-xl-3">
              <label>Child’s full name</label>
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
              <label>Parent / guardian mobile number</label>
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
              <label>School year</label>
              <select
                name="batchYear"
                className="form-select"
                value={formData.batchYear}
                onChange={handleInputChange}
                required={!editMode}
              >
                <option value="">Choose school year</option>
                <option value="2022-23">2022-2023</option>
                <option value="2023-24">2023-2024</option>
                <option value="2024-25">2024-2025 (legacy)</option>
                {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 3 + index).map((year) => (
                  <option key={year} value={`${year}-${year + 1}`}>{year}-{year + 1}</option>
                ))}
              </select>
            </div>

            <div className="form-group col-3">
              <label>Class</label>
              <select
                name="standard"
                value={formData.standard}
                onChange={handleInputChange}
                className="form-control"
                required
              >
                <option value="">Choose class</option>
                {Object.keys(standardFees).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 fees-step-heading">
              <h3>2. Fee summary</h3>
              <p>Check the class fee, amount already paid and remaining balance. These totals update automatically.</p>
            </div>
            <div className="form-group col-3">
              <label>Total class fees (₹)</label>
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
              <label>Total paid so far (₹)</label>
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
              <label>Balance still due (₹)</label>
              <input
                type="number"
                value={Math.max(0, Number(formData.totalStandardFees || 0) - Number(formData.totalFeesPaid || 0) - Number(formData.discount || 0))}
                className="form-control"
                readOnly
              />
            </div>
            <div className="form-group col-3">
              <label>Discount (₹)</label>
              <input
                type="number"
                className="form-control"
                name="discount"
                value={formData.discount}
                min="0"
                step="1"
                onChange={handleInputChange}
              />
            </div>
            <div className="col-12 fees-step-heading">
              <h3>3. Money received</h3>
              <p>Click “Add a payment” for each payment you have collected. Enter the amount received; the totals update automatically.</p>
            </div>
            <div className="form-group col-12">
              <label className="fw-semibold">Payments received</label>
              <button
                type="button"
                onClick={addPaymentDetail}
                className="btn btn-primary btn-sm ms-2 fw-semibold"
              >
                Add a payment
              </button>
              {formData.paymentDetails.map((detail, index) => (
                <div key={index} className="form-row row g-3">
                  <div className="col-12 col-md-3">
                    <label className="form-label small mb-1" htmlFor={"fee-payment-date-" + index}>Date received</label>
                    <input
                      id={"fee-payment-date-" + index}
                      aria-label={"Date received for payment " + (index + 1)}
                      type="text"
                      name="date"
                      value={detail.date}
                      onChange={(e) => handlePaymentDetailChange(index, e)}
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small mb-1" htmlFor={"fee-payment-time-" + index}>Time received</label>
                    <input
                      id={"fee-payment-time-" + index}
                      aria-label={"Time received for payment " + (index + 1)}
                      type="text"
                      name="time"
                      value={detail.time}
                      onChange={(e) => handlePaymentDetailChange(index, e)}
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small mb-1" htmlFor={"fee-payment-amount-" + index}>Amount received (₹)</label>
                    <input
                      id={"fee-payment-amount-" + index}
                      type="number"
                      name="amount"
                      value={detail.amount}
                      min="1"
                      step="1"
                      required
                      aria-label={`Payment amount ${index + 1}`}
                      onChange={(e) => handlePaymentDetailChange(index, e)}
                      className="form-control"
                    />
                  </div>
                  <div className="col-auto align-self-end"><button type="button" onClick={() => removePaymentDetail(index)} className="btn btn-outline-danger" aria-label={`Remove payment ${index + 1}`}>Remove</button></div>
                </div>
              ))}
            </div>
            <div className="row m-1 mt-2 gap-3">
              <button type="submit" className="btn btn-primary col-12 col-md-4" disabled={savingFees}>
                {savingFees ? "Saving…" : editMode ? "Save changes" : "Save fee record"}
              </button>
              {/* <div className="btn btn-primary col-2" onClick={exportToExcel}> */}
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={exportToExcelConfirm}
              >
                Export all
              </button>
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={selectedStudents.length === 0}
                onClick={exportCheckedToExcelConfirm}
              >
                Export selected
              </button>
            </div>
          </div>
        </form>
        <div className=""></div>

        <hr />
        <div className="filter-panel mb-3 mt-2" aria-label="Filter fee records">
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
        <div className="section-heading"><h3>Fee records</h3><span className="muted small">{filteredfeesData.length} records</span></div>
        <div className="table-responsive">
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
              {loadingFees ? (
            <tr><td colSpan={13} className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading fee records…</td></tr>
          ) : filteredfeesData.length === 0 ? (
            <tr><td colSpan={13}><div className="empty-state"><strong>No matching fee records</strong>Add a fee record or adjust your filters.</div></td></tr>
          ) : filteredfeesData.map((fees, index) => (
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
                      {Array.isArray(fees.paymentDetails) && fees.paymentDetails.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          title="Print a receipt for a saved payment"
                          aria-label={`Print payment receipt for ${fees.studentName}`}
                          onClick={() => openReceipt(fees, fees.paymentDetails.length - 1)}
                        >
                          Receipt
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-warning btn-sm"
                        aria-label={`Edit fee record for ${fees.studentName}`}
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
        {receiptRecord && (
          <div
            className="modal show fee-receipt-modal"
            style={{ display: "block" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-receipt-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeReceipt();
            }}
          >
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content">
                <div className="modal-header no-print">
                  <div>
                    <h5 className="modal-title" id="fee-receipt-title">Payment receipt</h5>
                    <p className="small muted mb-0">Print a copy of a payment already saved in the school records.</p>
                  </div>
                  <button type="button" className="btn-close" onClick={closeReceipt} aria-label="Close receipt preview" />
                </div>
                <div className="modal-body">
                  {Array.isArray(receiptRecord.paymentDetails) && receiptRecord.paymentDetails.length > 1 && (
                    <div className="mb-3 no-print">
                      <label className="form-label" htmlFor="receipt-payment-select">Choose a saved payment</label>
                      <select
                        id="receipt-payment-select"
                        className="form-select"
                        value={receiptPaymentIndex}
                        onChange={(event) => setReceiptPaymentIndex(Number(event.target.value))}
                      >
                        {receiptRecord.paymentDetails.map((payment, index) => (
                          <option key={`${payment.date || "payment"}-${index}`} value={index}>
                            Payment {index + 1} · {payment.date || "Date not recorded"} · {formatReceiptAmount(payment.amount)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {receiptRecord.paymentDetails?.[receiptPaymentIndex] ? (
                    <article className="fee-receipt-print-area" id="fee-payment-receipt">
                      <div className="fee-receipt-brand">
                        <div className="fee-receipt-brand-mark" aria-hidden="true">S</div>
                        <div>
                          <div className="fee-receipt-school-name">Pre-School</div>
                          <div className="fee-receipt-school-subtitle">School fee payment record</div>
                        </div>
                        <div className="fee-receipt-copy-label">PAYMENT<br />RECEIPT COPY</div>
                      </div>
                      <div className="fee-receipt-rule" />
                      <div className="fee-receipt-meta">
                        <div><span>Record reference</span><strong>{receiptRecord._id ? `FEE-${String(receiptRecord.stuNo || receiptRecord._id).slice(-8).toUpperCase()}-${receiptPaymentIndex + 1}` : `FEE-${receiptPaymentIndex + 1}`}</strong></div>
                        <div><span>Payment date</span><strong>{receiptRecord.paymentDetails[receiptPaymentIndex].date || "Not recorded"}</strong></div>
                        <div><span>Payment time</span><strong>{receiptRecord.paymentDetails[receiptPaymentIndex].time || "Not recorded"}</strong></div>
                      </div>
                      <h3 className="fee-receipt-section-title">Student details</h3>
                      <div className="fee-receipt-student">
                        <div><span>Student name</span><strong>{receiptRecord.studentName || "Not recorded"}</strong></div>
                        <div><span>GR / student number</span><strong>{receiptRecord.stuNo || "Not recorded"}</strong></div>
                        <div><span>Class</span><strong>{receiptRecord.standard || "Not recorded"}</strong></div>
                        <div><span>Academic year</span><strong>{receiptRecord.batchYear || "Not recorded"}</strong></div>
                      </div>
                      <div className="fee-receipt-amount-panel">
                        <span>Amount received in this payment</span>
                        <strong>{formatReceiptAmount(receiptRecord.paymentDetails[receiptPaymentIndex].amount)}</strong>
                      </div>
                      <h3 className="fee-receipt-section-title">Fee summary</h3>
                      <div className="fee-receipt-line"><span>Standard fees</span><strong>{formatReceiptAmount(receiptRecord.totalStandardFees)}</strong></div>
                      <div className="fee-receipt-line"><span>Discount recorded</span><strong>{formatReceiptAmount(receiptRecord.discount)}</strong></div>
                      <div className="fee-receipt-line"><span>Total paid to date</span><strong>{formatReceiptAmount(receiptRecord.totalFeesPaid)}</strong></div>
                      <div className="fee-receipt-line fee-receipt-balance"><span>Current remaining balance</span><strong>{formatReceiptAmount(Math.max(0, Number(receiptRecord.totalStandardFees || 0) - Number(receiptRecord.discount || 0) - Number(receiptRecord.totalFeesPaid || 0)))}</strong></div>
                      <p className="fee-receipt-note">This printout reflects the payment details currently saved in the school software. The current balance may include payments recorded after this payment date. Please check the school’s records if any detail appears incorrect.</p>
                      <div className="fee-receipt-signatures">
                        <div>Parent / guardian signature</div>
                        <div>Authorized school signature</div>
                      </div>
                      <div className="fee-receipt-footer">Please retain this copy for your records.</div>
                    </article>
                  ) : (
                    <div className="alert alert-warning mb-0">This fee record has no saved payment details. A receipt cannot be generated from a payment that is not recorded.</div>
                  )}
                </div>
                <div className="modal-footer no-print">
                  <button type="button" className="btn btn-outline-secondary" onClick={closeReceipt}>Close</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePrintReceipt}
                    disabled={!receiptRecord.paymentDetails?.[receiptPaymentIndex]}
                  >Print receipt</button>
                </div>
              </div>
            </div>
          </div>
        )}
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
