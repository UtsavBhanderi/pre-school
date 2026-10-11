import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { Modal } from "bootstrap";
// import { saveAs } from "file-saver";
// import * as XLSX from "xlsx";

// import PizZip from 'pizzip';
// import Docxtemplater from 'docxtemplater';
// // import { saveAs } from 'file-saver';
// import PizZipUtils from 'pizzip/utils/index.js';

function NewTeacherRegister() {
  const linkone = API_BASE_URL;

  const [teachers, setTeachers] = useState([]);
  const [teacher, setTeacher] = useState({
    selfPhoto: null,
    motherPhoto: null,
    fatherPhoto: null,
    firstName: "",
    middleName: "",
    lastName: "",
    gender: "",
    dob: "",
    bloodGroup: "",
    religion: "",
    cast: "",
    motherTongue: "",
    address: "",
    RegisterPhoneNumber: "",
    standard: "",
    GR_No: "",
    batchYear: "",
    Problem: "",
    MotherMobileNumber: "",
    FatherMobileNumber: "",
    EmergencyPhoneNumber: "",
    Email: "",
    Village: "",
    Taluka: "",
    District: "",
    drivingLicence: "",
    vehical: "",
    married: "",
  });

  const [isEdit, setIsEdit] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      const response = await axios.get(`${linkone}/api/teachers`);
      setTeachers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Unable to load teachers:", error);
      alert(error.response?.data?.message || "Unable to load teacher records.");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTeacher({
      ...teacher,
      [name]: value,
    });
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    setTeacher({
      ...teacher,
      [name]: files[0],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    for (const [key, value] of Object.entries(teacher)) {
      if (value === null || value === undefined || value === "") continue;
      if (typeof File !== "undefined" && value instanceof File) {
        formData.append(key, value);
      } else {
        formData.append(key, String(value));
      }
    }
    try {
      if (isEdit) {
        await axios.put(`${linkone}/api/teachers/${currentTeacherId}`, formData);
        alert("Teacher updated successfully.");
      } else {
        await axios.post(`${linkone}/api/teachers`, formData);
        alert("Teacher registered successfully.");
      }
      await fetchTeachers();
      resetForm();
    } catch (error) {
      console.error("There was an error!", error);
    }
  };

  const handleEdit = (teacher) => {
    setTeacher({
      ...teacher,
    });
    setIsEdit(true);
    setCurrentTeacherId(teacher._id);
    const modal = Modal.getOrCreateInstance(modalRef.current);
    modal.show();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this teacher record?")) return;
    try {
      await axios.delete(`${linkone}/api/teachers/${id}`);
      alert("Teacher deleted successfully.");
      await fetchTeachers();
    } catch (error) {
      console.error("Unable to delete teacher:", error);
      alert(error.response?.data?.message || "Unable to delete teacher record.");
    }
  };

  const resetForm = () => {
    setTeacher({
      selfPhoto: null,
      motherPhoto: null,
      fatherPhoto: null,
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      dob: "",
      bloodGroup: "",
      religion: "",
      cast: "",
      motherTongue: "",
      address: "",
      RegisterPhoneNumber: "",
      standard: "",
      GR_No: "",
      batchYear: "",
      Problem: "",
      MotherMobileNumber: "",
      FatherMobileNumber: "",
      EmergencyPhoneNumber: "",
      Email: "",
      Village: "",
      Taluka: "",
      District: "",
      drivingLicence: "",
      vehical: "",
      married: "",
    });
    setIsEdit(false);
    setCurrentTeacherId(null);
    const modal = modalRef.current ? Modal.getInstance(modalRef.current) : null;
    modal?.hide();
  };

  const [filter, setFilter] = useState({
    GR_No: "",
    firstName: "",
    middleName: "",
    lastName: "",
    standard: "",
    RegisterPhoneNumber: "",
    // subject: '',
    // chapter: '',
  });
  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };
  const filteredteachers = teachers.filter(
    (pdf) =>
      String(pdf.firstName ?? "").toLowerCase().includes(filter.firstName.toLowerCase()) &&
      String(pdf.middleName ?? "").toLowerCase().includes(filter.middleName.toLowerCase()) &&
      String(pdf.lastName ?? "").toLowerCase().includes(filter.lastName.toLowerCase()) &&
      String(pdf.standard ?? "").includes(filter.standard) &&
      String(pdf.RegisterPhoneNumber ?? "").includes(filter.RegisterPhoneNumber) &&
      String(pdf.GR_No ?? "").includes(filter.GR_No)
  );

  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [allChecked, setAllChecked] = useState(false);

  //   const exportToExcel = () => {
  //     // const worksheet = XLSX.utils.json_to_sheet(students);//for get all data in excel
  //     // --------------
  //     //// for get custom data in excel
  //     // const worksheet = XLSX.utils.json_to_sheet(students.map(student => ({
  //     //   name: student.name,
  //     //   age: student.age,
  //     //   class: student.class,
  //     //   feesPaid: student.feesPaid,
  //     //   feesRemaining: student.feesRemaining
  //     // })));
  //     // -------------------
  //     //// for get filter data in excel
  //     // const filteredStudentsExcel = filteredstudents.filter(
  //     //   (student) => student.feesPaid < 5000
  //     // );

  //     const worksheet = XLSX.utils.json_to_sheet(
  //       teachers.map((student) => ({
  //         // const worksheet = XLSX.utils.json_to_sheet(
  //         //   filteredStudentsExcel.map((student) => ({
  //         GR_NO: student.stuNo,
  //         // selfPhoto: "/" + student.selfPhoto,
  //         name:
  //           student.firstName + " " + student.middleName + " " + student.lastName,
  //         class: student.standard,
  //         gender: student.gender,
  //         address: student.address,
  //         RegisterPhoneNumber: student.phoneNumber,
  //         MotherMobileNumber: student.MotherMobileNumber,
  //         FatherMobileNumber: student.FatherMobileNumber,
  //         // DOB: student.dob,
  //         DOB: dateToIndianFormat(student.dob),
  //       }))
  //     );
  //     // const worksheet = XLSX.utils.json_to_sheet(students);//for get all data in excel

  //     const workbook = XLSX.utils.book_new();
  //     XLSX.utils.book_append_sheet(workbook, worksheet, "Teachers");
  //     const excelBuffer = XLSX.write(workbook, {
  //       bookType: "xlsx",
  //       type: "array",
  //     });
  //     const data = new Blob([excelBuffer], { type: "application/octet-stream" });
  //     saveAs(data, "teachers.xlsx");
  //   };

  //   const exportCheckedToExcel = () => {
  //     const filteredStudentExcel = filteredteachers.filter((student) =>
  //       selectedTeachers.includes(student._id)
  //     );
  //     const worksheets = XLSX.utils.json_to_sheet(filteredStudentExcel);
  //     // const worksheets = XLSX.utils.json_to_sheet(students);
  //     const workbooks = XLSX.utils.book_new();
  //     XLSX.utils.book_append_sheet(workbooks, worksheets, "Selected Teachers");
  //     const excelBuffers = XLSX.write(workbooks, {
  //       bookType: "xlsx",
  //       type: "array",
  //     });
  //     const datas = new Blob([excelBuffers], {
  //       type: "application/octet-stream",
  //     });
  //     saveAs(datas, "selected_teachers.xlsx");
  //   };

  const handleCheckboxChange = (teacher) => {
    setSelectedTeachers((prevSelectedTeachers) => {
      if (prevSelectedTeachers.includes(teacher._id)) {
        return prevSelectedTeachers.filter((id) => id !== teacher._id);
      } else {
        return [...prevSelectedTeachers, teacher._id];
      }
    });
  };

  const handleAllCheckboxChange = () => {
    if (allChecked) {
      setSelectedTeachers([]);
    } else {
      setSelectedTeachers(filteredteachers.map((teacher) => teacher._id));
    }
    setAllChecked(!allChecked);
  };
  //   // -----------------bonafied
  //   const loadFile = (url, callback) => {
  //     PizZipUtils.getBinaryContent(url, callback);
  //   };

  function dateToIndianFormat(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  }

  //   const generateDocx = (student) => {
  //     // loadFile("../../public/template.docx", (error, content) => {
  //     loadFile("./temp.docx", (error, content) => {
  //       if (error) {
  //         throw error;
  //       }

  //       const zip = new PizZip(content);
  //       const doc = new Docxtemplater(zip, {
  //         paragraphLoop: true,
  //         linebreaks: true,
  //       });

  //       // --------------

  //       function numberToWords(num) {
  //         const ones = [
  //           "",
  //           "one",
  //           "two",
  //           "three",
  //           "four",
  //           "five",
  //           "six",
  //           "seven",
  //           "eight",
  //           "nine",
  //           "ten",
  //           "eleven",
  //           "twelve",
  //           "thirteen",
  //           "fourteen",
  //           "fifteen",
  //           "sixteen",
  //           "seventeen",
  //           "eighteen",
  //           "nineteen",
  //         ];
  //         const tens = [
  //           "",
  //           "",
  //           "twenty",
  //           "thirty",
  //           "forty",
  //           "fifty",
  //           "sixty",
  //           "seventy",
  //           "eighty",
  //           "ninety",
  //         ];

  //         if (num < 20) return ones[num];
  //         if (num < 100)
  //           return (
  //             tens[Math.floor(num / 10)] +
  //             (num % 10 !== 0 ? " " + ones[num % 10] : "")
  //           );
  //         if (num < 1000)
  //           return (
  //             ones[Math.floor(num / 100)] +
  //             " hundred" +
  //             (num % 100 !== 0 ? " and " + numberToWords(num % 100) : "")
  //           );

  //         return (
  //           numberToWords(Math.floor(num / 1000)) +
  //           " thousand" +
  //           (num % 1000 !== 0 ? " " + numberToWords(num % 1000) : "")
  //         );
  //       }

  //       // Function to get the ordinal day in words (1st, 2nd, 3rd, etc.)
  //       function getOrdinalSuffix(day) {
  //         const suffixes = ["th", "st", "nd", "rd"];
  //         const value = day % 100;
  //         return (
  //           day + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0])
  //         );
  //       }

  //       // Function to convert date to words
  //       function dateToFullWords(dateString) {
  //         const date = new Date(dateString);
  //         const months = [
  //           "January",
  //           "February",
  //           "March",
  //           "April",
  //           "May",
  //           "June",
  //           "July",
  //           "August",
  //           "September",
  //           "October",
  //           "November",
  //           "December",
  //         ];
  //         const day = date.getDate();
  //         const month = months[date.getMonth()];
  //         const year = date.getFullYear();

  //         const dayInWords = numberToWords(day);
  //         const yearInWords = numberToWords(year);

  //         return `${dayInWords} ${month.toLowerCase()} ${yearInWords}`;
  //       }

  //       function getCurrentDateInIndianFormat() {
  //         const date = new Date();
  //         const day = String(date.getDate()).padStart(2, "0");
  //         const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  //         const year = date.getFullYear();

  //         return `${day}-${month}-${year}`;
  //       }

  //       const birthDateFigure = new Date(student.dob);
  //       // --------------

  //       doc.setData({
  //         certificateNo: "90",
  //         name:
  //           student.firstName + " " + student.middleName + " " + student.lastName,
  //         studentName: student.middleName,
  //         class: student.standard,
  //         year: student.batchYear,
  //         birthDateFigure: dateToIndianFormat(student.dob),
  //         birthDateWords: dateToFullWords(birthDateFigure),
  //         religion: student.religion,
  //         // birthPlace: student.birthPlace,
  //         grNo: student.stuNo,
  //         date: getCurrentDateInIndianFormat(),
  //         place: "SURAT",
  //       });

  //       try {
  //         doc.render();
  //       } catch (error) {
  //         console.log(JSON.stringify({ error: error }, null, 2));
  //         throw error;
  //       }

  //       const out = doc.getZip().generate({
  //         type: "blob",
  //         mimeType:
  //           "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  //       });

  //       saveAs(out, `certificate_${teacher.middleName}.docx`);
  //     });
  //   };

  return (
    <div className="mt-1">
      <div className="page-header">
        <div>
          <h2 className="mb-0">Teacher records</h2>
          <p className="page-subtitle">Manage staff details, contact information, and classroom assignments.</p>
        </div>
        <div className="page-actions">
        <button
          type="button"
          className="btn btn-primary mb-3"
          onClick={() => {
            resetForm();
            const modal = Modal.getOrCreateInstance(modalRef.current);
            modal.show();
          }}
        >
          Add Teacher
        </button>
        </div>
      </div>

      <div className="filter-panel mb-3" aria-label="Filter teacher records">
        <div className="col">
          <input
            type="text"
            name="GR_No"
            placeholder="GR number"
            className="form-control"
            value={filter.GR_No}
            onChange={handleFilterChange}
          />
        </div>
        <div className="col">
          <input
            type="tel"
            name="RegisterPhoneNumber"
            placeholder="Register Mobile Number"
            className="form-control"
            value={filter.RegisterPhoneNumber}
            onChange={handleFilterChange}
          />
        </div>
        <div className="col">
          <input
            type="text"
            name="middleName"
            placeholder="Teacher Name"
            className="form-control"
            value={filter.middleName}
            onChange={handleFilterChange}
          />
        </div>
        <div className="col">
          <input
            type="text"
            name="standard"
            placeholder="Standard"
            className="form-control"
            value={filter.standard}
            onChange={handleFilterChange}
          />
          {/* <select
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
        </select> */}
        </div>
      </div>
      <div className="page-card p-0 table-responsive">
        <table className="table table-hover align-middle">
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
              <th>GR NO.</th>
              <th>Photo</th>
              <th>Name</th>
              <th>Standard</th>
              <th>Date of Birth</th>
              <th>Register Mobile Number</th>
              <th>Gender</th>
              <th>Address</th>
              {/* <th>Mother Phone Number</th>
            <th>Father Phone Number</th>
            <th>Parent's Email ID</th>
            <th>Religion</th>
            <th>Cast</th>
            <th>Mother Tongue</th>
            <th>Batch Year</th>
            <th>Blood Group</th> */}
              <th>Teacher Problem</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* {students.map((student) => ( */}
            {filteredteachers.map((teacher, index) => (
              <tr key={teacher._id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedTeachers.includes(teacher._id)}
                    onChange={() => handleCheckboxChange(teacher)}
                  />
                </td>
                <td>{index + 1}</td>
                <td>{teacher.GR_No}</td>
                <td>
                  <img
                    src={teacher.selfPhoto ? (String(teacher.selfPhoto).startsWith("http") ? teacher.selfPhoto : linkone + "/" + String(teacher.selfPhoto).replace(/^\/+/, "")) : "https://ui-avatars.com/api/?name=" + encodeURIComponent(teacher.middleName || "Teacher")}
                    // src={`https://kidzera.vedantclasses.org.in/` + student.selfPhoto}
                    alt={teacher.middleName}
                    style={{ width: "50px", height: "50px" }}
                  />
                </td>
                <td>
                  {teacher.firstName} {teacher.middleName} {teacher.lastName}
                </td>
                <td>{teacher.standard}</td>
                <td>{dateToIndianFormat(teacher.dob)}</td>
                {/* <td>{new Date(teacher.dob).toLocaleDateString()}</td> */}
                <td>{teacher.RegisterPhoneNumber}</td>
                <td>{teacher.gender}</td>
                <td>{teacher.address}</td>
                <td>{teacher.Problem}</td>
                <td>
                  <div className="d-flex column-gap-2">
                    <button
                      className="btn btn-sm btn-warning "
                      onClick={() => handleEdit(teacher)}
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
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(teacher._id)}
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
                    {/* <button
                    className="btn btn-sm btn-primary"
                    onClick={() => generateDocx(teacher)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="25"
                      height="25"
                      fill="currentColor"
                      className="bi bi-bootstrap"
                      viewBox="0 0 16 16"
                    >
                      <path d="M5.062 12h3.475c1.804 0 2.888-.908 2.888-2.396 0-1.102-.761-1.916-1.904-2.034v-.1c.832-.14 1.482-.93 1.482-1.816 0-1.3-.955-2.11-2.542-2.11H5.062zm1.313-4.875V4.658h1.78c.973 0 1.542.457 1.542 1.237 0 .802-.604 1.23-1.764 1.23zm0 3.762V8.162h1.822c1.236 0 1.887.463 1.887 1.348 0 .896-.627 1.377-1.811 1.377z" />
                      <path d="M0 4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4zm4-3a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3z" />
                    </svg>
                    //bonafide
                  </button> */}
                  </div>
                </td>
                {/* <td>{teacher.FatherMobileNumber}</td>
              <td>{teacher.MotherMobileNumber}</td>
              <td>{teacher.parentEmail}</td>
              <td>{teacher.religion}</td>
              <td>{teacher.cast}</td>
              <td>{teacher.motherTongue}</td>
              <td>{teacher.batchYear}</td>
              <td>{teacher.bloodGroup}</td> */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="modal fade"
        id="teacherModal"
        tabIndex="-1"
        aria-labelledby="teacherModalLabel"
        aria-hidden="true"
        ref={modalRef}
      >
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="teacherModalLabel">
                {isEdit ? "Edit Teacher" : "Add Teacher"}
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="selfPhoto" className="form-label">
                      Teacher Photo
                    </label>
                    <input
                      type="file"
                      className="form-control"
                      id="selfPhoto"
                      name="selfPhoto"
                      onChange={handleFileChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="motherPhoto" className="form-label">
                      Mother Photo
                    </label>
                    <input
                      type="file"
                      className="form-control"
                      id="motherPhoto"
                      name="motherPhoto"
                      onChange={handleFileChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="fatherPhoto" className="form-label">
                      Father Photo
                    </label>
                    <input
                      type="file"
                      className="form-control"
                      id="fatherPhoto"
                      name="fatherPhoto"
                      onChange={handleFileChange}
                      required={!isEdit}
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="firstName" className="form-label">
                      First Name
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="firstName"
                      name="firstName"
                      value={teacher.firstName}
                      placeholder="Surname"
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="middleName" className="form-label">
                      Middle Name
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="middleName"
                      name="middleName"
                      value={teacher.middleName}
                      placeholder="Teacher Name"
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="lastName" className="form-label">
                      Last Name
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="lastName"
                      name="lastName"
                      value={teacher.lastName}
                      placeholder="Father Name"
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="gender" className="form-label">
                      Gender
                    </label>
                    <select
                      className="form-select"
                      id="gender"
                      name="gender"
                      value={teacher.gender}
                      onChange={handleChange}
                      required={!isEdit}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="dob" className="form-label">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      id="dob"
                      name="dob"
                      value={teacher.dob}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    {/* <input type="text" className="form-control" id="bloodGroup" name="bloodGroup" value={teacher.bloodGroup} onChange={handleChange} required />  */}
                    <label htmlFor="bloodGroup" className="form-label">
                      Blood Group
                    </label>
                    <select
                      className="form-select"
                      id="bloodGroup"
                      name="bloodGroup"
                      value={teacher.bloodGroup}
                      onChange={handleChange}
                      required={!isEdit}
                    >
                      <option value="">Select</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                </div>
                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="religion" className="form-label">
                      Religion
                    </label>
                    <select
                      className="form-select"
                      id="religion"
                      name="religion"
                      value={teacher.religion}
                      onChange={handleChange}
                      required={!isEdit}
                    >
                      <option value="">Select</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Muslim">Muslim</option>
                      <option value="Christian">Christian</option>
                      <option value="Sikh">Sikh</option>
                      <option value="Buddhist">Buddhist</option>
                      <option value="Jain">Jain</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="mb-3 col-4">
                    <label htmlFor="cast" className="form-label">
                      Cast
                    </label>
                    <select
                      className="form-select"
                      id="cast"
                      name="cast"
                      value={teacher.cast}
                      onChange={handleChange}
                      required={!isEdit}
                    >
                      <option value="">Select Cast</option>
                      <option value="SC">SC</option>
                      <option value="ST">ST</option>
                      <option value="OBC">OBC</option>
                      <option value="General">General</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {/* <div className="mb-3 col-4">
                  <label htmlFor="nationality" className="form-label">Nationality</label>
                  <input type="text" className="form-control" id="nationality" name="nationality" value={teacher.nationality} onChange={handleChange} required />
                </div> */}

                  <div className="mb-3 col-4">
                    {/* <input type="text" className="form-control" id="motherTongue" name="motherTongue" value={teacher.motherTongue} onChange={handleChange} required /> */}
                    <label htmlFor="motherTongue" className="form-label">
                      Mother Tongue
                    </label>
                    <select
                      className="form-select"
                      id="motherTongue"
                      name="motherTongue"
                      value={teacher.motherTongue}
                      onChange={handleChange}
                      required={!isEdit}
                    >
                      <option value="">Select</option>
                      <option value="Gujarati">Gujarati</option>
                      <option value="Hindi">Hindi</option>
                      <option value="English">English</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="address" className="form-label">
                      Address
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="address"
                      name="address"
                      value={teacher.address}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="RegisterPhoneNumber" className="form-label">
                      Register Mobile Number
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="RegisterPhoneNumber"
                      name="RegisterPhoneNumber"
                      value={teacher.RegisterPhoneNumber}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>

                  <div className="mb-3 col-4">
                    <label htmlFor="standard" className="form-label">
                      Standard
                    </label>
                    {/* <input type="text" className="form-control" id="standard" name="standard" value={teacher.standard} onChange={handleChange} required/> */}

                    <select
                      name="standard"
                      value={teacher.standard}
                      onChange={handleChange}
                      className="form-control"
                      id="standard"
                      required={!isEdit}
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
                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="Problem" className="form-label">
                      Teacher Problem
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="Problem"
                      name="Problem"
                      value={teacher.Problem}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="GR_No" className="form-label">
                      GR_No
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="GR_No"
                      name="GR_No"
                      value={teacher.GR_No}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="MotherMobileNumber" className="form-label">
                      Father Mobile No.
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="MotherMobileNumber"
                      name="MotherMobileNumber"
                      value={teacher.MotherMobileNumber}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="FatherMobileNumber" className="form-label">
                      Mother Phone No.
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="FatherMobileNumber"
                      name="FatherMobileNumber"
                      value={teacher.FatherMobileNumber}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label
                      htmlFor="EmergencyPhoneNumber"
                      className="form-label"
                    >
                      Emergency Phone No.
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="EmergencyPhoneNumber"
                      name="EmergencyPhoneNumber"
                      value={teacher.EmergencyPhoneNumber}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="Email" className="form-label">
                      Email ID.
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      id="Email"
                      name="Email"
                      value={teacher.Email}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="Village" className="form-label">
                      Village
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="Village"
                      name="Village"
                      value={teacher.Village}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="Taluka" className="form-label">
                      Taluka
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="Taluka"
                      name="Taluka"
                      value={teacher.Taluka}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="District" className="form-label">
                      District
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="District"
                      name="District"
                      value={teacher.District}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="mb-3 col-4">
                    <label htmlFor="drivingLicence" className="form-label">
                      Driving Licence No.
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="drivingLicence"
                      name="drivingLicence"
                      value={teacher.drivingLicence}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="vehical" className="form-label">
                      Vehical
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="vehical"
                      name="vehical"
                      value={teacher.vehical}
                      onChange={handleChange}
                      required={!isEdit}
                    />
                  </div>
                  <div className="mb-3 col-4">
                    <label htmlFor="married" className="form-label">
                      Married
                    </label>
                    <select
                      className="form-select"
                      id="married"
                      name="married"
                      value={teacher.married}
                      onChange={handleChange}
                      required={!isEdit}
                    >
                      <option value="">Select</option>
                      <option value="true">yes</option>
                      <option value="false">no</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary">
                  {isEdit ? "Update Teacher" : "Add Teacher"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary ms-2"
                  data-bs-dismiss="modal"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewTeacherRegister;
