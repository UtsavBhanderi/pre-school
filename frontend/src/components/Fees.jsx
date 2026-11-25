// import React, { useState, useEffect, useRef } from "react";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";



function InstallmentScheduleEditor({ installments, total, totalPaid, onChange, onRemove, onAdd, onGenerate }) {
  const [count, setCount] = React.useState('3');
  const [firstDueDate, setFirstDueDate] = React.useState(new Date().toISOString().slice(0, 10));
  let allocated = Math.max(0, totalPaid);
  const rows = installments.map((item) => {
    const amount = Number(item.amount) || 0;
    const paid = Math.min(amount, allocated);
    allocated = Math.max(0, allocated - paid);
    const balance = Math.max(0, amount - paid);
    const overdue = balance > 0 && item.dueDate < new Date().toISOString().slice(0, 10);
    return { ...item, paid, balance, status: balance <= 0 ? 'Paid' : overdue ? 'Overdue' : paid > 0 ? 'Part-paid' : 'Upcoming' };
  });
  const scheduled = installments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return (
    <div className="col-12">
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div><label className="form-label small">Number of installments</label><input className="form-control" type="number" min="1" max="24" value={count} onChange={(event) => setCount(event.target.value)} /></div>
        <div><label className="form-label small">First due date</label><input className="form-control" type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} /></div>
        <button type="button" className="btn btn-outline-primary" onClick={() => onGenerate(count, firstDueDate)}>Generate equal installments</button>
        <button type="button" className="btn btn-outline-secondary" onClick={onAdd}>Add one installment</button>
        {installments.length > 0 && <button type="button" className="btn btn-link text-danger" onClick={() => onRemove(-1)}>Clear schedule</button>}
      </div>
      {installments.length > 0 ? <>
        <div className="table-responsive"><table className="table table-sm table-bordered align-middle">
          <thead><tr><th>Installment</th><th>Due date</th><th>Amount (₹)</th><th>Paid (₹)</th><th>Balance (₹)</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((item, index) => <tr key={index}>
            <td><input className="form-control form-control-sm" maxLength="60" value={item.label} onChange={(event) => onChange(index, 'label', event.target.value)} aria-label={'Installment ' + (index + 1) + ' name'} /></td>
            <td><input className="form-control form-control-sm" type="date" value={item.dueDate} onChange={(event) => onChange(index, 'dueDate', event.target.value)} aria-label={'Installment ' + (index + 1) + ' due date'} /></td>
            <td><input className="form-control form-control-sm" type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => onChange(index, 'amount', event.target.value)} aria-label={'Installment ' + (index + 1) + ' amount'} /></td>
            <td>₹{item.paid.toFixed(2)}</td><td>₹{item.balance.toFixed(2)}</td>
            <td><span className={'badge ' + (item.status === 'Paid' ? 'bg-success' : item.status === 'Overdue' ? 'bg-danger' : 'bg-secondary')}>{item.status}</span></td>
            <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onRemove(index)} aria-label={'Remove installment ' + (index + 1)}>Remove</button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="d-flex flex-wrap justify-content-between small">
          <span>Scheduled: <strong>₹{scheduled.toFixed(2)}</strong> of ₹{total.toFixed(2)}</span>
          <span>Difference: <strong className={Math.abs(scheduled - total) <= 0.01 ? 'text-success' : 'text-danger'}>₹{(total - scheduled).toFixed(2)}</strong></span>
          <span>Outstanding: <strong>₹{rows.reduce((sum, item) => sum + item.balance, 0).toFixed(2)}</strong></span>
        </div>
        {Math.abs(scheduled - total) > 0.01 && <p className="text-danger small mt-2 mb-0">The installment amounts must equal the fee after discount before you save.</p>}
      </> : <p className="small text-muted mb-0">No schedule added. Flexible payments remain available.</p>}
    </div>
  );
}


function InstallmentOverview() {
  const [data, setData] = React.useState(null);
  const [status, setStatus] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let active = true;
    axios.get(API_BASE_URL + '/api/fees/installments/overview')
      .then((response) => { if (active) setData(response.data || null); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Unable to load installment overview.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const summary = data?.summary || {};
  const rows = (data?.installments || []).filter((item) => status === 'all' || item.status === status);
  const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
  return (
    <section className="page-card mb-4" aria-label="Installment tracking">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div><h3 className="mb-1">Installment tracking</h3><p className="page-subtitle mb-0">Upcoming dues, overdue balances and payment progress across students.</p></div>
        <select className="form-select" style={{ maxWidth: '190px' }} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter installments by status">
          <option value="all">All installments</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option><option value="partial">Part-paid</option><option value="paid">Paid</option>
        </select>
      </div>
      {error && <div className="alert alert-warning">{error}</div>}
      <div className="overview-stat-grid mb-3">
        <div className="overview-stat-card"><div className="overview-stat-label">Overdue installments</div><div className="overview-stat-value">{loading ? '—' : Number(summary.overdue || 0).toLocaleString('en-IN')}</div></div>
        <div className="overview-stat-card"><div className="overview-stat-label">Upcoming installments</div><div className="overview-stat-value">{loading ? '—' : Number(summary.upcoming || 0).toLocaleString('en-IN')}</div></div>
        <div className="overview-stat-card"><div className="overview-stat-label">Scheduled outstanding</div><div className="overview-stat-value">{loading ? '—' : currency(summary.outstanding)}</div></div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>Student</th><th>GR No.</th><th>Installment</th><th>Due date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8" className="text-center py-3">Loading installment schedule…</td></tr> :
              rows.length ? rows.map((item) => <tr key={item.feeRecordId + '-' + item._id}>
                <td>{item.studentName || '—'}</td><td>{item.stuNo || '—'}</td><td>{item.label}</td>
                <td>{item.dueDate ? new Date(item.dueDate + 'T00:00:00').toLocaleDateString('en-IN') : '—'}</td>
                <td>{currency(item.amount)}</td><td>{currency(item.paidAmount)}</td><td>{currency(item.balance)}</td>
                <td><span className={'badge ' + (item.status === 'paid' ? 'bg-success' : item.status === 'overdue' ? 'bg-danger' : 'bg-secondary')}>{item.status}</span></td>
              </tr>) : <tr><td colSpan="8" className="text-center text-muted py-3">{status === 'all' ? 'No installment schedules have been created yet.' : 'No installments match this status.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
    openingBalancePaid: 0,
    paymentDetails: [],
    installments: [],
    discount: 0,
  });
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [receiptRecord, setReceiptRecord] = useState(null);
  const [receiptPaymentIndex, setReceiptPaymentIndex] = useState(0);
  const [schoolDetails, setSchoolDetails] = useState({ name: "Pre-School", contactPhone: "", contactEmail: "", city: "" });

  useEffect(() => {
    fetchFeesData();
    fetchStandardFees();
    axios.get(`${linkone}/api/parent-access/config`).then((response) => {
      const school = response.data?.school || {};
      setSchoolDetails({ name: school.name || "Pre-School", contactPhone: school.contactPhone || school.phone || "", contactEmail: school.contactEmail || school.email || "", city: school.city || "" });
    }).catch(() => {});
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
      const message = error.response?.data?.message || "Unable to save this fee record.";
      if (error.response?.data?.code === "FEE_RECORD_CHANGED") {
        await fetchFeesData();
      }
      setPageError(message);
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
      openingBalancePaid: 0,
      paymentDetails: [],
      installments: [],
      discount: 0,
    });
    setEditMode(false);
    setEditId(null);
  };

  const handleEdit = (fees) => {
    const paymentDetails = Array.isArray(fees.paymentDetails)
      ? fees.paymentDetails.map((payment) => ({ ...payment }))
      : [];
    const totalFeesPaid = Number(fees.totalFeesPaid) || 0;
    const itemizedPayments = paymentDetails.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const openingBalancePaid = fees.openingBalancePaid !== undefined && fees.openingBalancePaid !== null
      ? Number(fees.openingBalancePaid) || 0
      : Math.max(0, Math.round((totalFeesPaid - itemizedPayments) * 100) / 100);
    setFormData({
      studentName: fees.studentName || "",
      studentPhoneNumber: fees.studentPhoneNumber || "",
      batchYear: fees.batchYear || "",
      standard: fees.standard || "",
      totalStandardFees: Number(fees.totalStandardFees) || 0,
      totalFeesPaid,
      openingBalancePaid,
      paymentDetails,
      installments: Array.isArray(fees.installments) ? fees.installments.map((item) => ({ ...item })) : [],
      discount: Number(fees.discount) || 0,
    });
    setEditMode(true); setEditId(fees._id); setPageError(""); setPageSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      setPageError(error.response?.data?.message || "Unable to delete fee record.");
    }
  };

  const handlePaymentDetailChange = (index, e) => {
    if (editMode && formData.paymentDetails[index]?._id) return;
    const { name, value } = e.target;
    const updatedPaymentDetails = formData.paymentDetails.map((detail, detailIndex) => detailIndex === index ? { ...detail, [name]: value } : detail);
    const totalFeesPaid = Math.round((Number(formData.openingBalancePaid || 0) + updatedPaymentDetails.reduce((sum, detail) => sum + (Number(detail.amount) || 0), 0)) * 100) / 100;
    setFormData((prevFormData) => ({ ...prevFormData, paymentDetails: updatedPaymentDetails, totalFeesPaid }));
  };


  const updateInstallment = (index, field, value) => setFormData((current) => ({
    ...current,
    installments: current.installments.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
  }));
  const addInstallment = () => {
    const next = formData.installments.length + 1;
    setFormData((current) => ({ ...current, installments: [...current.installments, { label: 'Installment ' + next, dueDate: new Date().toISOString().slice(0, 10), amount: '' }] }));
  };
  const generateInstallments = (countValue, firstDueDate) => {
    const count = Math.max(1, Math.min(24, Number(countValue) || 1));
    if (!firstDueDate) { setPageError('Choose the first installment due date.'); return; }
    const payable = Math.round((Number(formData.totalStandardFees || 0) - Number(formData.discount || 0)) * 100);
    if (payable <= 0) { setPageError('Enter the class fee and discount before generating installments.'); return; }
    const base = Math.floor(payable / count);
    const first = new Date(firstDueDate + 'T12:00:00');
    const schedule = Array.from({ length: count }, (_, index) => {
      const due = new Date(first.getFullYear(), first.getMonth() + index, first.getDate());
      return { label: 'Installment ' + (index + 1), dueDate: due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0'), amount: ((base + (index < payable % count ? 1 : 0)) / 100).toFixed(2) };
    });
    setFormData((current) => ({ ...current, installments: schedule }));
    setPageError('');
  };

  const addPaymentDetail = () => {
    const newPaymentDetail = {
      date: (() => { const now = new Date(); return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`; })(),
      time: new Date().toLocaleTimeString(),
      amount: "",
      method: "cash",
      reference: "",
    };
    setFormData((prevFormData) => ({
      ...prevFormData,
      paymentDetails: [...prevFormData.paymentDetails, newPaymentDetail],
    }));
  };

  const removePaymentDetail = (index) => {
    if (editMode && formData.paymentDetails[index]?._id) return;
    const updatedPaymentDetails = formData.paymentDetails.filter(
      (_, i) => i !== index
    );
    setFormData((prevFormData) => ({
      ...prevFormData,
      paymentDetails: updatedPaymentDetails,
      totalFeesPaid: Math.round((Number(formData.openingBalancePaid || 0) + updatedPaymentDetails.reduce((sum, detail) => sum + (Number(detail.amount) || 0), 0)) * 100) / 100,
    }));
  };

  const [feeQuickSearch, setFeeQuickSearch] = useState("");
  const [filter, setFilter] = useState({
    stuNo: "",
    studentName: "",
    standard: "",
    batchYear: "",
    paymentStatus: "",
  });
  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };
  
  const getRemainingBalance = (record = {}) => Math.max(
    0,
    (Number(record.totalStandardFees) || 0)
      - (Number(record.totalFeesPaid) || 0)
      - (Number(record.discount) || 0)
  );

  // const filteredfeesData = feesData;
  const filteredfeesData = feesData.filter((pdf) => {
    const balance = getRemainingBalance(pdf);
    const paid = Number(pdf.totalFeesPaid) || 0;
    const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "pending";
    const query = feeQuickSearch.trim().toLowerCase();
    const matchesQuickSearch = !query || [
      pdf.studentName, pdf.stuNo, pdf.studentPhoneNumber, pdf.parentEmail,
      pdf.ParentsMobileNumber, pdf.ParentsPhoneNumber,
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
    return matchesQuickSearch
      && String(pdf.stuNo ?? "").toLowerCase().includes(filter.stuNo.toLowerCase())
      && String(pdf.studentName ?? "").toLowerCase().includes(filter.studentName.toLowerCase())
      && String(pdf.standard ?? "").includes(filter.standard)
      && String(pdf.batchYear ?? "").includes(filter.batchYear)
      && (!filter.paymentStatus || status === filter.paymentStatus);
  });

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
      filteredfeesData.map((student) => ({
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
          getRemainingBalance(student),
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
    saveAs(data, "fee_register_filtered.xlsx");
  };
  function exportToExcelConfirm() {
    setPageError("");
    exportToExcel();
    setPageSuccess("Fee register exported successfully.");
  }
  function exportCheckedToExcelConfirm() {
    setPageError("");
    if (!selectedStudents.length) {
      setPageError("Select at least one student before exporting.");
      return;
    }
    exportCheckedToExcel();
    setPageSuccess("Selected fee records exported successfully.");
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
          getRemainingBalance(student),
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
        <details className="fees-overview-disclosure mb-3">
          <summary><strong>Installment tracking</strong><span>View upcoming dues and overdue balances</span></summary>
          <InstallmentOverview />
        </details>
        <form className="page-card fees-entry-card fees-entry-compact" onSubmit={handleFormSubmit}>
          <div className="fees-entry-heading">
            <div><span className="fees-entry-kicker">FEE MANAGEMENT</span><h3>{editMode ? "Update fee record" : "Add fee record"}</h3></div>
            {editMode && <button type="button" className="btn btn-link btn-sm text-secondary" onClick={resetForm}>Cancel editing</button>}
          </div>
          <div className="row g-3">
            <div className="form-group col-12 col-md-6">
              <label htmlFor="fee-student-name">Student name</label>
              <input id="fee-student-name" type="text" name="studentName" value={formData.studentName} onChange={handleInputChange} className="form-control" placeholder="Enter student name" required />
            </div>
            <div className="form-group col-12 col-md-6">
              <label htmlFor="fee-parent-phone">Parent mobile number</label>
              <input id="fee-parent-phone" type="tel" inputMode="tel" autoComplete="tel" name="studentPhoneNumber" value={formData.studentPhoneNumber} onChange={handleInputChange} className="form-control" placeholder="Parent / guardian mobile" required />
            </div>
            <div className="form-group col-12 col-md-6">
              <label htmlFor="fee-school-year">Academic year</label>
              <select id="fee-school-year" name="batchYear" className="form-select" value={formData.batchYear} onChange={handleInputChange} required={!editMode}>
                <option value="">Choose academic year</option>
                <option value="2022-23">2022-2023</option><option value="2023-24">2023-2024</option><option value="2024-25">2024-2025 (legacy)</option>
                {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 3 + index).map((year) => <option key={year} value={`${year}-${year + 1}`}>{year}-{year + 1}</option>)}
              </select>
            </div>
            <div className="form-group col-12 col-md-6">
              <label htmlFor="fee-standard">Class / standard</label>
              <select id="fee-standard" name="standard" value={formData.standard} onChange={handleInputChange} className="form-select" required>
                <option value="">Choose class</option>
                {Object.keys(standardFees).map((key) => <option key={key} value={key}>{key}</option>)}
              </select>
            </div>
          </div>
          <div className="fees-summary-strip" aria-label="Fee summary">
            <article><span>Class fee</span><strong>₹{Number(formData.totalStandardFees || 0).toLocaleString("en-IN")}</strong></article>
            <article><span>Paid so far</span><strong className="text-success">₹{Number(formData.totalFeesPaid || 0).toLocaleString("en-IN")}</strong></article>
            <article><span>Balance due</span><strong className="text-danger">₹{Math.max(0, Number(formData.totalStandardFees || 0) - Number(formData.totalFeesPaid || 0) - Number(formData.discount || 0)).toLocaleString("en-IN")}</strong></article>
            {Number(formData.discount || 0) > 0 && <article><span>Discount</span><strong>₹{Number(formData.discount).toLocaleString("en-IN")}</strong></article>}
          </div>
          <details className="fees-advanced-options">
            <summary><span>Discount & installment options</span><small>Optional settings</small></summary>
            <div className="row g-3 pt-3">
              <div className="form-group col-12 col-md-4">
                <label htmlFor="fee-discount">Discount (₹)</label>
                <input id="fee-discount" type="number" className="form-control" name="discount" value={formData.discount} min="0" max={formData.totalStandardFees} step="0.01" onChange={handleInputChange} />
              </div>
              <InstallmentScheduleEditor
                installments={formData.installments}
                total={Math.max(0, Number(formData.totalStandardFees || 0) - Number(formData.discount || 0))}
                totalPaid={Number(formData.totalFeesPaid || 0)}
                onChange={updateInstallment}
                onRemove={(index) => setFormData((current) => ({ ...current, installments: index < 0 ? [] : current.installments.filter((_, itemIndex) => itemIndex !== index) }))}
                onAdd={addInstallment}
                onGenerate={generateInstallments}
              />
            </div>
          </details>
          <section className="fees-payments-block" aria-label="Payments received">
            <div className="fees-payments-heading">
              <div><h4>Payments received</h4><p>Add the amount and method. Date and time are recorded automatically.</p></div>
              <button type="button" onClick={addPaymentDetail} className="btn btn-primary btn-sm">+ Add payment</button>
            </div>
            {editMode && Number(formData.openingBalancePaid) > 0 && <p className="fees-payment-note">Earlier paid balance of ₹{Number(formData.openingBalancePaid).toFixed(2)} is retained as an opening balance.</p>}
            {editMode && formData.paymentDetails.some((detail) => detail._id) && <p className="fees-payment-note">Previously saved receipts are locked. Add a new payment to record another collection.</p>}
            {formData.paymentDetails.length === 0 && <div className="fees-no-payments">No payment added yet. Use <strong>Add payment</strong> when money is received.</div>}
            {formData.paymentDetails.map((detail, index) => {
              const savedPayment = editMode && Boolean(detail._id);
              return (
                <div key={detail._id || index} className="fees-payment-row">
                  <div className="fees-payment-meta"><strong>Payment {index + 1}</strong><small>{[detail.date, detail.time].filter(Boolean).join(" · ") || "New payment"}</small></div>
                  <div className="fees-payment-fields">
                    <div>
                      <label className="form-label" htmlFor={"fee-payment-amount-" + index}>Amount (₹)</label>
                      <input id={"fee-payment-amount-" + index} type="number" name="amount" value={detail.amount} min="0.01" step="0.01" required disabled={savedPayment} aria-label={`Payment amount ${index + 1}`} onChange={(event) => handlePaymentDetailChange(index, event)} className="form-control" />
                    </div>
                    <div>
                      <label className="form-label" htmlFor={"fee-payment-method-" + index}>Method</label>
                      <select id={"fee-payment-method-" + index} name="method" className="form-select" value={detail.method || "cash"} onChange={(event) => handlePaymentDetailChange(index, event)} disabled={savedPayment}>
                        <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option>
                      </select>
                    </div>
                    <details className="fees-payment-reference" open={Boolean(detail.reference)}>
                      <summary>Reference {detail.reference ? "saved" : "(optional)"}</summary>
                      <input name="reference" type="text" maxLength="80" className="form-control" value={detail.reference || ""} placeholder="UPI / cheque reference" onChange={(event) => handlePaymentDetailChange(index, event)} disabled={savedPayment} aria-label={"Reference for payment " + (index + 1)} />
                    </details>
                  </div>
                  <button type="button" onClick={() => removePaymentDetail(index)} className="btn btn-outline-danger btn-sm fees-payment-remove" aria-label={`Remove payment ${index + 1}`} disabled={savedPayment}>Remove</button>
                </div>
              );
            })}
          </section>
          <div className="fees-form-actions">
            <button type="submit" className="btn btn-primary" disabled={savingFees}>{savingFees ? "Saving…" : editMode ? "Save changes" : "Save fee record"}</button>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline-primary" onClick={exportToExcelConfirm}>Export filtered</button>
              <button type="button" className="btn btn-outline-primary" disabled={selectedStudents.length === 0} onClick={exportCheckedToExcelConfirm}>Export selected</button>
            </div>
          </div>
        </form>
        <div className=""></div>

        <hr />
        <section className="fee-record-search" aria-label="Find fee records">
          <div className="fee-quick-search">
            <label className="visually-hidden" htmlFor="fee-quick-search">Search by student, GR number or parent mobile</label>
            <span aria-hidden="true">⌕</span>
            <input id="fee-quick-search" className="form-control" type="search" placeholder="Search student, GR number or parent mobile…" value={feeQuickSearch} onChange={(event) => setFeeQuickSearch(event.target.value)} />
            <strong>{filteredfeesData.length} records</strong>
            {(feeQuickSearch || Object.values(filter).some(Boolean)) && <button type="button" className="btn btn-link btn-sm" onClick={() => { setFeeQuickSearch(""); setFilter({ stuNo: "", studentName: "", standard: "", batchYear: "", paymentStatus: "" }); }}>Clear</button>}
          </div>
          <details className="fee-record-advanced-filters" open={Object.values(filter).some(Boolean) || undefined}>
            <summary><span>More filters</span><small>Class, academic year and payment status</small></summary>
            <div className="filter-panel mb-3 mt-2" aria-label="Advanced fee filters">
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
            <select name="batchYear" value={filter.batchYear} onChange={handleFilterChange} className="form-select" aria-label="Filter by school year">
              <option value="">All school years</option>
              {[...new Set(feesData.map((fee) => fee.batchYear).filter(Boolean))].sort().map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div className="col">
            <select name="paymentStatus" value={filter.paymentStatus} onChange={handleFilterChange} className="form-select" aria-label="Filter by payment status">
              <option value="">All payment statuses</option>
              <option value="pending">Unpaid</option>
              <option value="partial">Partially paid</option>
              <option value="paid">Fully paid</option>
            </select>
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
          </details>
        </section>
        <div className="overview-stat-grid mb-3" aria-label="Filtered fee totals">
          <section className="overview-stat-card"><div className="overview-stat-label">Students in view</div><div className="overview-stat-value">{filteredfeesData.length}</div></section>
          <section className="overview-stat-card"><div className="overview-stat-label">Total collected</div><div className="overview-stat-value">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(filteredfeesData.reduce((sum, fee) => sum + (Number(fee.totalFeesPaid) || 0), 0))}</div></section>
          <section className="overview-stat-card"><div className="overview-stat-label">Outstanding balance</div><div className="overview-stat-value">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(filteredfeesData.reduce((sum, fee) => sum + getRemainingBalance(fee), 0))}</div></section>
        </div>
        <div className="section-heading"><h3>Fee records</h3><span className="muted small">{filteredfeesData.length} records</span></div>
        <div className="table-responsive fee-record-table-desktop">
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
                    {getRemainingBalance(fees)}
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
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + (Number(fees.totalStandardFees) || 0), 0)}</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + (Number(fees.totalFeesPaid) || 0), 0)}</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + getRemainingBalance(fees), 0)}</td>
                <td colSpan="1" className="fw-bold">₹{filteredfeesData.reduce((sum, fees) => sum + (Number(fees.discount) || 0), 0)}</td>
                {/* <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + (Number(fees.totalStandardFees) || 0), 0))}</td>
              <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + (Number(fees.totalFeesPaid) || 0), 0))}</td>
              <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + getRemainingBalance(fees), 0))}</td>
              <td colSpan="1" className="fw-bold">₹{calculateSum(filteredfeesData.reduce((sum, fees) => sum + (Number(fees.discount) || 0), 0))}</td> */}
                <td colSpan="1"></td>
              </tr>

            </tbody>
          </table>
        </div>
        <section className="fee-record-mobile-list" aria-label="Fee records">
          {loadingFees ? (
            <div className="fee-mobile-state" role="status">Loading fee records…</div>
          ) : filteredfeesData.length === 0 ? (
            <div className="fee-mobile-state"><strong>No fee records found</strong><span>Try another search or adjust your filters.</span></div>
          ) : filteredfeesData.map((fee) => {
            const balance = getRemainingBalance(fee);
            const paid = Number(fee.totalFeesPaid) || 0;
            const status = balance <= 0 ? "Paid" : paid > 0 ? "Part-paid" : "Unpaid";
            return (
              <article className="fee-mobile-card" key={fee._id}>
                <div className="fee-mobile-card-heading">
                  <label className="fee-mobile-select">
                    <input type="checkbox" checked={selectedStudents.includes(fee._id)} onChange={() => handleCheckboxChange(fee)} aria-label={"Select fee record for " + fee.studentName} />
                  </label>
                  <div><strong>{fee.studentName || "Student"}</strong><span>GR No. {fee.stuNo || "—"} · {fee.standard || "Class not assigned"}</span></div>
                  <span className={"fee-mobile-status " + (balance <= 0 ? "paid" : paid > 0 ? "partial" : "due")}>{status}</span>
                </div>
                <div className="fee-mobile-metrics">
                  <div><span>Total fee</span><strong>{formatReceiptAmount(fee.totalStandardFees)}</strong></div>
                  <div><span>Paid</span><strong className="text-success">{formatReceiptAmount(fee.totalFeesPaid)}</strong></div>
                  <div><span>Balance due</span><strong className={balance > 0 ? "text-danger" : "text-success"}>{formatReceiptAmount(balance)}</strong></div>
                </div>
                <div className="fee-mobile-meta">
                  <span>Academic year: {fee.batchYear || "—"}</span>
                  <span>Parent mobile: {fee.studentPhoneNumber || fee.ParentsMobileNumber || "—"}</span>
                </div>
                <div className="fee-mobile-actions">
                  {Array.isArray(fee.paymentDetails) && fee.paymentDetails.length > 0 && <button type="button" className="btn btn-outline-primary" onClick={() => openReceipt(fee, fee.paymentDetails.length - 1)}>Receipt</button>}
                  <button type="button" className="btn btn-outline-primary" onClick={() => handleEdit(fee)} aria-label={"Edit fee record for " + fee.studentName}>Edit</button>
                  <button type="button" className="btn btn-outline-danger" onClick={() => handleDelete(fee._id)}>Delete</button>
                </div>
              </article>
            );
          })}
        </section>
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
                          <div className="fee-receipt-school-name">{schoolDetails.name}</div>
                          <div className="fee-receipt-school-subtitle">School fee payment record</div>
                          {(schoolDetails.contactPhone || schoolDetails.contactEmail || schoolDetails.city) && <div className="small">{[schoolDetails.contactPhone, schoolDetails.contactEmail, schoolDetails.city].filter(Boolean).join(" · ")}</div>}
                        </div>
                        <div className="fee-receipt-copy-label">PAYMENT<br />RECEIPT COPY</div>
                      </div>
                      <div className="fee-receipt-rule" />
                      <div className="fee-receipt-meta">
                        <div><span>Receipt number</span><strong>{receiptRecord.paymentDetails[receiptPaymentIndex].receiptNumber || (receiptRecord._id ? `LEGACY-${String(receiptRecord.stuNo || receiptRecord._id).slice(-8).toUpperCase()}-${receiptPaymentIndex + 1}` : `LEGACY-${receiptPaymentIndex + 1}`)}</strong></div>
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
                      <div className="fee-receipt-line"><span>Payment method</span><strong>{({ cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", card: "Card", cheque: "Cheque", other: "Other" })[receiptRecord.paymentDetails[receiptPaymentIndex].method] || "Not recorded"}</strong></div>
                      {receiptRecord.paymentDetails[receiptPaymentIndex].reference && <div className="fee-receipt-line"><span>Transaction / cheque reference</span><strong>{receiptRecord.paymentDetails[receiptPaymentIndex].reference}</strong></div>}
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
                  <h5 className="modal-title">Delete unpaid fee record</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close delete confirmation"
                    onClick={() => setDeleteId(null)}
                  />
                </div>
                <div className="modal-body">
                  <p className="mb-2">Are you sure you want to delete this fee record?</p>
                  <p className="text-muted small mb-0">Fee records with payment history cannot be deleted. They are retained for receipts and financial records.</p>
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
                    Delete unpaid record
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
