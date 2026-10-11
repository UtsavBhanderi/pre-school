import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { Modal } from "bootstrap";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import PizZipUtils from "pizzip/utils/index.js";
import "./NewStudentReg.css";

const API_URL = API_BASE_URL;

const EMPTY_STUDENT = {
    studentPhoto: null,
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
    nationality: "",
    motherTongue: "",
    address: "",
    phoneNumber: "",
    standard: "",
    studentProblem: "",

    schoolName: "",
    schoolBoard: "",

    FatherName: "",
    FatherAge: "",
    FatherEducationQualification: "",
    FatherOccupation: "",
    FatherDesignation: "",
    FatherAnnualIncome: "",
    FatherMobileNumber: "",
    FatherPhoneNumber: "",
    EmergencyPhoneNumber: "",
    parentEmail: "",

    previousSchoolName: "",
    previousStandardMarks: "",
    previousSchoolBoard: "",

    siblingName: "",
    siblingAge: "",
    siblingSchoolName: "",
    siblingStandard: "",
};

const STANDARD_OPTIONS = [
    "ENG Play Group",
    "ENG NR.",
    "ENG JR.",
    "ENG SR.",
    "GUJ Play Group",
    "GUJ NR.",
    "GUJ JR.",
    "GUJ SR.",
];

const NewStudentRegister = () => {
    // ============================================================
    // STATE
    // ============================================================

    const [students, setStudents] = useState([]);
    const [student, setStudent] = useState({ ...EMPTY_STUDENT });

    const [profile, setProfile] = useState(null);

    const [isEdit, setIsEdit] = useState(false);
    const [currentStudentId, setCurrentStudentId] = useState(null);

    const [selectedStudents, setSelectedStudents] = useState([]);
    const [allChecked, setAllChecked] = useState(false);

    const [loadingStudents, setLoadingStudents] = useState(false);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [savingStudent, setSavingStudent] = useState(false);

    const [selectedReport, setSelectedReport] = useState("");

    const [filter, setFilter] = useState({
        stuNo: "",
        firstName: "",
        middleName: "",
        lastName: "",
        standard: "",
        phoneNumber: "",
    });

    const modalRef = useRef(null);
    const modalProfileRef = useRef(null);

    // ============================================================
    // FETCH STUDENTS
    // ============================================================

    const fetchStudents = useCallback(async () => {
        setLoadingStudents(true);

        try {
            const response = await axios.get(`${API_URL}/api/students`);

            setStudents(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error("Failed to fetch students:", error);

            alert(
                error.response?.data?.message ||
                "Unable to load students. Please try again."
            );

            setStudents([]);
        } finally {
            setLoadingStudents(false);
        }
    }, []);

    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    // ============================================================
    // HELPERS
    // ============================================================

    const normalize = (value) => {
        return String(value ?? "")
            .toLowerCase()
            .trim();
    };

    const getImageUrl = (image) => {
        if (!image) {
            return "/placeholder-student.png";
        }

        if (typeof image === "string" && image.startsWith("http")) {
            return image;
        }

        return `${API_URL}/${String(image).replace(/^\/+/, "")}`;
    };

    const dateToIndianFormat = (dateString) => {
        if (!dateString) return "";

        const date = new Date(dateString);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        return `${day}-${month}-${year}`;
    };

    const dateToInputFormat = (dateString) => {
        if (!dateString) return "";

        const date = new Date(dateString);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    };

    // ============================================================
    // FORM HANDLERS
    // ============================================================

    const handleChange = (e) => {
        const { name, value } = e.target;

        setStudent((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleFileChange = (e) => {
        const { name, files } = e.target;

        setStudent((prev) => ({
            ...prev,
            [name]: files?.[0] || null,
        }));
    };

    // ============================================================
    // FORM RESET
    // ============================================================

    const resetForm = () => {
        setStudent({ ...EMPTY_STUDENT });
        setIsEdit(false);
        setCurrentStudentId(null);

        if (modalRef.current) {
            const modal = Modal.getInstance(modalRef.current);

            if (modal) {
                modal.hide();
            }
        }
    };

    // ============================================================
    // OPEN ADD MODAL
    // ============================================================

    const handleAddStudent = () => {
        setStudent({ ...EMPTY_STUDENT });
        setIsEdit(false);
        setCurrentStudentId(null);

        if (modalRef.current) {
            const modal = Modal.getOrCreateInstance(modalRef.current);
            modal.show();
        }
    };

    // ============================================================
    // SUBMIT STUDENT
    // ============================================================

    const handleSubmit = async (e) => {
        e.preventDefault();

        setSavingStudent(true);

        try {
            const formData = new FormData();

            Object.entries(student).forEach(([key, value]) => {
                // Don't send null or undefined
                if (value === null || value === undefined) {
                    return;
                }

                // File
                if (value instanceof File) {
                    formData.append(key, value);
                    return;
                }

                // Existing image path during edit:
                // Don't send it as a file.
                if (
                    (key === "studentPhoto" ||
                        key === "motherPhoto" ||
                        key === "fatherPhoto") &&
                    typeof value === "string"
                ) {
                    return;
                }

                // Normal field
                if (value !== "") {
                    formData.append(key, String(value));
                }
            });

            if (isEdit) {
                await axios.put(
                    `${API_URL}/api/students/${currentStudentId}`,
                    formData
                );

                alert("Student updated successfully.");
            } else {
                await axios.post(`${API_URL}/api/students`, formData);

                alert("Student registered successfully.");
            }

            await fetchStudents();

            resetForm();
        } catch (error) {
            console.error("Student save error:", error);

            const message =
                error.response?.data?.message ||
                error.response?.data?.error ||
                "Unable to save student.";

            alert(message);
        } finally {
            setSavingStudent(false);
        }
    };

    // ============================================================
    // EDIT STUDENT
    // ============================================================

    const handleEdit = (studentData) => {
        setStudent({
            studentPhoto: studentData.studentPhoto || null,
            motherPhoto: studentData.motherPhoto || null,
            fatherPhoto: studentData.fatherPhoto || null,

            firstName: studentData.firstName || "",
            middleName: studentData.middleName || "",
            lastName: studentData.lastName || "",
            gender: studentData.gender || "",
            dob: dateToInputFormat(studentData.dob),
            bloodGroup: studentData.bloodGroup || "",
            religion: studentData.religion || "",
            cast: studentData.cast || "",
            //   nationality: studentData.nationality || "",
            motherTongue: studentData.motherTongue || "",
            address: studentData.address || "",
            phoneNumber: studentData.phoneNumber || "",
            standard: studentData.standard || "",
            studentProblem: studentData.studentProblem || "",

            schoolName: studentData.schoolName || "",
            schoolBoard: studentData.schoolBoard || "",

            FatherName: studentData.FatherName || "",
            FatherAge: studentData.FatherAge || "",
            FatherEducationQualification:
                studentData.FatherEducationQualification || "",
            FatherOccupation: studentData.FatherOccupation || "",
            FatherDesignation: studentData.FatherDesignation || "",
            FatherAnnualIncome: studentData.FatherAnnualIncome || "",
            FatherMobileNumber: studentData.FatherMobileNumber || "",
            FatherPhoneNumber: studentData.FatherPhoneNumber || "",
            EmergencyPhoneNumber: studentData.EmergencyPhoneNumber || "",
            parentEmail: studentData.parentEmail || "",

            previousSchoolName: studentData.previousSchoolName || "",
            previousStandardMarks: studentData.previousStandardMarks || "",
            previousSchoolBoard: studentData.previousSchoolBoard || "",

            siblingName: studentData.siblingName || "",
            siblingAge: studentData.siblingAge || "",
            siblingSchoolName: studentData.siblingSchoolName || "",
            siblingStandard: studentData.siblingStandard || "",
        });

        setIsEdit(true);
        setCurrentStudentId(studentData._id);

        if (modalRef.current) {
            const modal = Modal.getOrCreateInstance(modalRef.current);
            modal.show();
        }
    };

    // ============================================================
    // DELETE STUDENT
    // ============================================================

    const handleDelete = async (id) => {
        const confirmed = window.confirm("Are you sure you want to delete this student?");
        if (!confirmed) return;

        try {
            await axios.delete(`${API_URL}/api/students/${id}`);
            setSelectedStudents((prev) => prev.filter((studentId) => studentId !== id));
            await fetchStudents();
        } catch (error) {
            console.error("Unable to delete student:", error);
            alert(error.response?.data?.message || "Unable to delete student.");
        }
    };

    // ============================================================
    // FILTER
    // ============================================================

    const handleFilterChange = (e) => {
        const { name, value } = e.target;

        setFilter((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const filteredStudents = useMemo(() => {
        return students.filter((item) => {
            return (
                normalize(item.firstName).includes(normalize(filter.firstName)) &&
                normalize(item.middleName).includes(normalize(filter.middleName)) &&
                normalize(item.lastName).includes(normalize(filter.lastName)) &&
                normalize(item.standard).includes(normalize(filter.standard)) &&
                normalize(item.phoneNumber).includes(normalize(filter.phoneNumber)) &&
                normalize(item.stuNo).includes(normalize(filter.stuNo))
            );
        });
    }, [students, filter]);

    // ============================================================
    // CHECKBOXES
    // ============================================================

    const handleCheckboxChange = (studentData) => {
        setSelectedStudents((prev) => {
            if (prev.includes(studentData._id)) {
                return prev.filter((id) => id !== studentData._id);
            }

            return [...prev, studentData._id];
        });
    };

    const handleAllCheckboxChange = () => {
        if (allChecked) {
            setSelectedStudents((prev) =>
                prev.filter(
                    (id) =>
                        !filteredStudents.some((studentData) => studentData._id === id)
                )
            );
        } else {
            setSelectedStudents((prev) => [
                ...new Set([
                    ...prev,
                    ...filteredStudents.map((studentData) => studentData._id),
                ]),
            ]);
        }
    };

    useEffect(() => {
        if (filteredStudents.length === 0) {
            setAllChecked(false);
            return;
        }

        const isEverythingSelected = filteredStudents.every((studentData) =>
            selectedStudents.includes(studentData._id)
        );

        setAllChecked(isEverythingSelected);
    }, [filteredStudents, selectedStudents]);

    // ============================================================
    // EXCEL EXPORT
    // ============================================================

    const exportToExcel = () => {
        if (!students.length) {
            alert("No students available to export.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(
            students.map((item) => ({
                GR_NO: item.stuNo || "",
                Student_Photo: getImageUrl(item.studentPhoto),
                Name: `${item.firstName || ""} ${item.middleName || ""} ${item.lastName || ""
                    }`.trim(),
                Class: item.standard || "",
                Gender: item.gender || "",
                Address: item.address || "",
                Register_Phone_Number: item.phoneNumber || "",
                Father_Phone_Number: item.FatherPhoneNumber || "",
                Father_Mobile_Number: item.FatherMobileNumber || "",
                DOB: dateToIndianFormat(item.dob),
                Blood_Group: item.bloodGroup || "",
                Religion: item.religion || "",
                Mother_Tongue: item.motherTongue || "",
                Student_Problem: item.studentProblem || "",
            }))
        );

        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(workbook, worksheet, "Students");

        const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
        });

        const data = new Blob([excelBuffer], {
            type: "application/octet-stream",
        });

        saveAs(data, "students.xlsx");
    };

    const exportCheckedToExcel = () => {
        const selected = filteredStudents.filter((item) =>
            selectedStudents.includes(item._id)
        );

        if (!selected.length) {
            alert("Please select at least one student.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(
            selected.map((item) => ({
                GR_NO: item.stuNo || "",
                Name: `${item.firstName || ""} ${item.middleName || ""} ${item.lastName || ""
                    }`.trim(),
                Class: item.standard || "",
                Gender: item.gender || "",
                Address: item.address || "",
                Register_Phone_Number: item.phoneNumber || "",
                Father_Phone_Number: item.FatherPhoneNumber || "",
                Father_Mobile_Number: item.FatherMobileNumber || "",
                DOB: dateToIndianFormat(item.dob),
                Blood_Group: item.bloodGroup || "",
                Religion: item.religion || "",
                Mother_Tongue: item.motherTongue || "",
                Student_Problem: item.studentProblem || "",
            }))
        );

        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Selected Students"
        );

        const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
        });

        const data = new Blob([excelBuffer], {
            type: "application/octet-stream",
        });

        saveAs(data, "selected_students.xlsx");
    };

    // ============================================================
    // CERTIFICATE
    // ============================================================

    const loadFile = (url, callback) => {
        PizZipUtils.getBinaryContent(url, callback);
    };

    const numberToWords = (num) => {
        const ones = [
            "",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ];

        const tens = [
            "",
            "",
            "twenty",
            "thirty",
            "forty",
            "fifty",
            "sixty",
            "seventy",
            "eighty",
            "ninety",
        ];

        if (num < 20) {
            return ones[num];
        }

        if (num < 100) {
            return (
                tens[Math.floor(num / 10)] +
                (num % 10 !== 0 ? ` ${ones[num % 10]}` : "")
            );
        }

        if (num < 1000) {
            return (
                `${ones[Math.floor(num / 100)]} hundred` +
                (num % 100 !== 0
                    ? ` and ${numberToWords(num % 100)}`
                    : "")
            );
        }

        if (num < 100000) {
            return (
                `${numberToWords(Math.floor(num / 1000))} thousand` +
                (num % 1000 !== 0
                    ? ` ${numberToWords(num % 1000)}`
                    : "")
            );
        }

        if (num < 10000000) {
            return (
                `${numberToWords(Math.floor(num / 100000))} lakh` +
                (num % 100000 !== 0
                    ? ` ${numberToWords(num % 100000)}`
                    : "")
            );
        }

        return (
            `${numberToWords(Math.floor(num / 10000000))} crore` +
            (num % 10000000 !== 0
                ? ` ${numberToWords(num % 10000000)}`
                : "")
        );
    };

    const dateToFullWords = (dateString) => {
        if (!dateString) return "";

        const date = new Date(dateString);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const months = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ];

        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        return `${numberToWords(day)} ${month.toLowerCase()} ${numberToWords(
            year
        )}`;
    };

    const getCurrentDateInIndianFormat = () => {
        return dateToIndianFormat(new Date());
    };

    const generateDocx = (studentData) => {
        loadFile("/temp.docx", (error, content) => {
            if (error) {
                console.error("Unable to load temp.docx:", error);
                alert(
                    "Certificate template could not be loaded. Make sure temp.docx is inside the public folder."
                );
                return;
            }

            try {
                const zip = new PizZip(content);

                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                doc.setData({
                    certificateNo: "90",

                    name: `${studentData.firstName || ""} ${studentData.middleName || ""
                        } ${studentData.lastName || ""}`.trim(),

                    studentName: studentData.middleName || "",

                    class: studentData.standard || "",

                    year: studentData.batchYear || "",

                    birthDateFigure: dateToIndianFormat(studentData.dob),

                    birthDateWords: dateToFullWords(studentData.dob),

                    religion: studentData.religion || "",

                    grNo: studentData.stuNo || "",

                    date: getCurrentDateInIndianFormat(),

                    place: "SURAT",
                });

                doc.render();

                const output = doc.getZip().generate({
                    type: "blob",
                    mimeType:
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                });

                saveAs(
                    output,
                    `certificate_${studentData.middleName || "student"}.docx`
                );
            } catch (error) {
                console.error("Certificate generation error:", error);

                alert(
                    "Unable to generate certificate. Please check your template placeholders."
                );
            }
        });
    };

    // ============================================================
    // PROFILE
    // ============================================================

    const loadProfile = async (id) => {
        setLoadingProfile(true);
        setProfile(null);
        setSelectedReport("");

        try {
            const response = await axios.get(
                `${API_URL}/api/students/student-profile/${id}`
            );

            const data = response.data;

            setProfile(data);

            const firstReport = data?.reports?.[0];

            setSelectedReport(firstReport?._id || "");
        } catch (error) {
            console.error("Failed to load student profile:", error);

            alert(
                error.response?.data?.message ||
                "Unable to load student profile."
            );
        } finally {
            setLoadingProfile(false);
        }
    };

    const openProfile = async (id) => {
        await loadProfile(id);

        if (modalProfileRef.current) {
            const modal = Modal.getOrCreateInstance(
                modalProfileRef.current
            );

            modal.show();
        }
    };

    // ============================================================
    // FEES
    // ============================================================

    const getPaymentProgress = (fees) => {
        const totalFees = Number(fees?.totalStandardFees) || 0;
        const paidFees = Number(fees?.totalFeesPaid) || 0;
        const discount = Number(fees?.discount) || 0;

        if (totalFees <= 0) {
            return 0;
        }

        const progress = ((paidFees + discount) / totalFees) * 100;

        return Math.min(100, Math.max(0, Math.round(progress)));
    };

    const getRemainingFees = (fees) => {
        const total = Number(fees?.totalStandardFees) || 0;
        const paid = Number(fees?.totalFeesPaid) || 0;
        const discount = Number(fees?.discount) || 0;

        return Math.max(0, total - paid - discount);
    };

    const getProgressColor = (progress) => {
        if (progress >= 100) return "bg-success";
        if (progress >= 60) return "bg-info";
        if (progress >= 30) return "bg-warning";
        return "bg-danger";
    };

    // ============================================================
    // REPORT MARKS
    // ============================================================

    const getReportMarks = (reportId) => {
        return profile?.student?.marks?.find(
            (mark) =>
                mark?.reportId?.toString() === reportId?.toString()
        );
    };

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div className="mt-1 w-100">
            {/* ======================================================
          PAGE HEADER
      ====================================================== */}

            <div className="page-header">
                <div>
                    <h2 className="mb-0">Student records</h2>
                    <p className="page-subtitle">Keep student profiles, contact details, and class information up to date.</p>
                </div>

                <div className="page-actions">
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleAddStudent}
                    >
                        Add Student
                    </button>

                    <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={() =>
                            window.confirm("Export the complete student list?") &&
                            exportToExcel()
                        }
                    >
                        Export all
                    </button>

                    <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={selectedStudents.length === 0}
                        onClick={() =>
                            window.confirm("Export the selected student records?") &&
                            exportCheckedToExcel()
                        }
                    >
                        Export selected
                    </button>
                </div>
            </div>

            {/* ======================================================
          FILTERS
      ====================================================== */}

            <div className="filter-panel mb-3" aria-label="Filter student records">
                <div className="col-lg-2 col-md-4">
                    <input
                        type="text"
                        name="stuNo"
                        placeholder="GR No."
                        className="form-control"
                        value={filter.stuNo}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="col-lg-2 col-md-4">
                    <input
                        type="text"
                        name="phoneNumber"
                        placeholder="Register Mobile Number"
                        className="form-control"
                        value={filter.phoneNumber}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="col-lg-2 col-md-4">
                    <input
                        type="text"
                        name="firstName"
                        placeholder="Surname"
                        className="form-control"
                        value={filter.firstName}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="col-lg-2 col-md-4">
                    <input
                        type="text"
                        name="middleName"
                        placeholder="Student Name"
                        className="form-control"
                        value={filter.middleName}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="col-lg-2 col-md-4">
                    <input
                        type="text"
                        name="lastName"
                        placeholder="Father Name"
                        className="form-control"
                        value={filter.lastName}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="col-lg-2 col-md-4">
                    <select
                        name="standard"
                        value={filter.standard}
                        onChange={handleFilterChange}
                        className="form-select"
                    >
                        <option value="">All Standards</option>

                        {STANDARD_OPTIONS.map((standard) => (
                            <option key={standard} value={standard}>
                                {standard}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ======================================================
          STUDENT COUNT
      ====================================================== */}

            <div className="selection-summary">
                <small className="text-muted">
                    Showing {filteredStudents.length} of {students.length} students
                </small>

                {selectedStudents.length > 0 && (
                    <small className="text-primary fw-bold">
                        {selectedStudents.length} selected
                    </small>
                )}
            </div>

            {/* ======================================================
          TABLE
      ====================================================== */}

            <div className="table-responsive">
                <table className="table table-bordered table-striped align-middle">
                    <thead>
                        <tr>
                            <th>
                                <input
                                    type="checkbox"
                                    checked={allChecked}
                                    onChange={handleAllCheckboxChange}
                                    disabled={filteredStudents.length === 0}
                                />
                            </th>

                            <th>#</th>
                            <th>GR No.</th>
                            <th>Photo</th>
                            <th>Name</th>
                            <th>Mother Name</th>
                            <th>Class</th>
                            <th>D.O.B.</th>
                            <th>Gender</th>
                            <th>Register Mobile</th>
                            <th>Father Mobile</th>
                            <th>Blood Group</th>
                            <th>Student Problem</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loadingStudents ? (
                            <tr>
                                <td colSpan="14" className="text-center py-4">
                                    <div
                                        className="spinner-border text-primary"
                                        role="status"
                                    >
                                        <span className="visually-hidden">
                                            Loading...
                                        </span>
                                    </div>

                                    <div className="mt-2">
                                        Loading students...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredStudents.length === 0 ? (
                            <tr>
                                <td colSpan="14" className="text-center py-4">
                                    No students match these filters. Clear or change the filters, or add a new student.
                                </td>
                            </tr>
                        ) : (
                            filteredStudents.map((item, index) => (
                                <tr key={item._id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedStudents.includes(item._id)}
                                            onChange={() =>
                                                handleCheckboxChange(item)
                                            }
                                        />
                                    </td>

                                    <td>{index + 1}</td>

                                    <td>{item.stuNo || "-"}</td>

                                    <td>
                                        <div className="d-flex gap-1">
                                            <img
                                                src={getImageUrl(item.studentPhoto)}
                                                alt="Student"
                                                style={{
                                                    width: "50px",
                                                    height: "50px",
                                                    objectFit: "cover",
                                                    borderRadius: "5px",
                                                }}
                                            />

                                            <img
                                                src={getImageUrl(item.motherPhoto)}
                                                alt="Mother"
                                                style={{
                                                    width: "50px",
                                                    height: "50px",
                                                    objectFit: "cover",
                                                    borderRadius: "5px",
                                                }}
                                            />

                                            <img
                                                src={getImageUrl(item.fatherPhoto)}
                                                alt="Father"
                                                style={{
                                                    width: "50px",
                                                    height: "50px",
                                                    objectFit: "cover",
                                                    borderRadius: "5px",
                                                }}
                                            />
                                        </div>
                                    </td>

                                    <td>
                                        {item.firstName || ""}{" "}
                                        {item.middleName || ""}{" "}
                                        {item.lastName || ""}
                                    </td>

                                    <td>{item.FatherName || "-"}</td>

                                    <td>{item.standard || "-"}</td>

                                    <td>{dateToIndianFormat(item.dob) || "-"}</td>

                                    <td>{item.gender || "-"}</td>

                                    <td>{item.phoneNumber || "-"}</td>

                                    <td>
                                        {item.FatherMobileNumber || "-"}
                                    </td>

                                    <td>{item.bloodGroup || "-"}</td>

                                    <td>
                                        {item.studentProblem || "-"}
                                    </td>

                                    <td>
                                        <div className="d-flex gap-2">
                                            {/* EDIT */}
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-warning"
                                                title="Edit"
                                                onClick={() => handleEdit(item)}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="20"
                                                    height="20"
                                                    fill="currentColor"
                                                    viewBox="0 0 16 16"
                                                >
                                                    <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293z" />

                                                    <path d="M13.752 4.396l-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z" />

                                                    <path
                                                        fillRule="evenodd"
                                                        d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5z"
                                                    />
                                                </svg>
                                            </button>

                                            {/* DELETE */}
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-danger"
                                                title="Delete"
                                                onClick={() =>
                                                    handleDelete(item._id)
                                                }
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="20"
                                                    height="20"
                                                    fill="currentColor"
                                                    viewBox="0 0 16 16"
                                                >
                                                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />

                                                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
                                                </svg>
                                            </button>

                                            {/* CERTIFICATE */}
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-primary"
                                                title="Generate Certificate"
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            "Confirm certificate download?"
                                                        )
                                                    ) {
                                                        generateDocx(item);
                                                    }
                                                }}
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
                                            </button>

                                            {/* PROFILE */}
                                            <button
                                                type="button"
                                                className="btn btn-info btn-sm"
                                                title="Student Profile"
                                                onClick={() =>
                                                    openProfile(item._id)
                                                }
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="20"
                                                    height="20"
                                                    fill="currentColor"
                                                    viewBox="0 0 16 16"
                                                >
                                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" />

                                                    <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* ======================================================
          ADD / EDIT STUDENT MODAL
      ====================================================== */}

            <div
                className="modal fade"
                id="studentModal"
                tabIndex="-1"
                aria-labelledby="studentModalLabel"
                aria-hidden="true"
                ref={modalRef}
            >
                <div className="modal-dialog modal-xl modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5
                                className="modal-title"
                                id="studentModalLabel"
                            >
                                {isEdit ? "Edit Student" : "Add Student"}
                            </h5>

                            <button
                                type="button"
                                className="btn-close"
                                data-bs-dismiss="modal"
                                aria-label="Close"
                            />
                        </div>

                        <div className="modal-body">
                            <form onSubmit={handleSubmit}>
                                {/* ==================================================
                    PHOTOS
                ================================================== */}

                                <h5 className="mb-3">
                                    Photos
                                </h5>

                                <div className="row">
                                    {/* Student */}
                                    <div className="mb-3 col-lg-4">
                                        <label
                                            htmlFor="studentPhoto"
                                            className="form-label"
                                        >
                                            Student Photo
                                        </label>

                                        {isEdit &&
                                            typeof student.studentPhoto ===
                                            "string" &&
                                            student.studentPhoto && (
                                                <div className="mb-2">
                                                    <img
                                                        src={getImageUrl(
                                                            student.studentPhoto
                                                        )}
                                                        alt="Current Student"
                                                        style={{
                                                            width: "80px",
                                                            height: "80px",
                                                            objectFit: "cover",
                                                            borderRadius: "8px",
                                                        }}
                                                    />
                                                </div>
                                            )}

                                        <input
                                            type="file"
                                            className="form-control"
                                            id="studentPhoto"
                                            name="studentPhoto"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    {/* Mother */}
                                    <div className="mb-3 col-lg-4">
                                        <label
                                            htmlFor="motherPhoto"
                                            className="form-label"
                                        >
                                            Mother Photo
                                        </label>

                                        {isEdit &&
                                            typeof student.motherPhoto ===
                                            "string" &&
                                            student.motherPhoto && (
                                                <div className="mb-2">
                                                    <img
                                                        src={getImageUrl(
                                                            student.motherPhoto
                                                        )}
                                                        alt="Current Mother"
                                                        style={{
                                                            width: "80px",
                                                            height: "80px",
                                                            objectFit: "cover",
                                                            borderRadius: "8px",
                                                        }}
                                                    />
                                                </div>
                                            )}

                                        <input
                                            type="file"
                                            className="form-control"
                                            id="motherPhoto"
                                            name="motherPhoto"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    {/* Father */}
                                    <div className="mb-3 col-lg-4">
                                        <label
                                            htmlFor="fatherPhoto"
                                            className="form-label"
                                        >
                                            Father Photo
                                        </label>

                                        {isEdit &&
                                            typeof student.fatherPhoto ===
                                            "string" &&
                                            student.fatherPhoto && (
                                                <div className="mb-2">
                                                    <img
                                                        src={getImageUrl(
                                                            student.fatherPhoto
                                                        )}
                                                        alt="Current Father"
                                                        style={{
                                                            width: "80px",
                                                            height: "80px",
                                                            objectFit: "cover",
                                                            borderRadius: "8px",
                                                        }}
                                                    />
                                                </div>
                                            )}

                                        <input
                                            type="file"
                                            className="form-control"
                                            id="fatherPhoto"
                                            name="fatherPhoto"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            required={!isEdit}
                                        />
                                    </div>
                                </div>

                                <hr />

                                {/* ==================================================
                    BASIC INFORMATION
                ================================================== */}

                                <h5 className="mb-3">
                                    Student Information
                                </h5>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="firstName"
                                            className="form-label"
                                        >
                                            Surname
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="firstName"
                                            name="firstName"
                                            value={student.firstName}
                                            placeholder="Surname"
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="middleName"
                                            className="form-label"
                                        >
                                            Student Name
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="middleName"
                                            name="middleName"
                                            value={student.middleName}
                                            placeholder="Student Name"
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="lastName"
                                            className="form-label"
                                        >
                                            Father Name
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="lastName"
                                            name="lastName"
                                            value={student.lastName}
                                            placeholder="Father Name"
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="gender"
                                            className="form-label"
                                        >
                                            Gender
                                        </label>

                                        <select
                                            className="form-select"
                                            id="gender"
                                            name="gender"
                                            value={student.gender}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        >
                                            <option value="">
                                                Select Gender
                                            </option>
                                            <option value="Male">
                                                Male
                                            </option>
                                            <option value="Female">
                                                Female
                                            </option>
                                            <option value="Other">
                                                Other
                                            </option>
                                        </select>
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="dob"
                                            className="form-label"
                                        >
                                            Date of Birth
                                        </label>

                                        <input
                                            type="date"
                                            className="form-control"
                                            id="dob"
                                            name="dob"
                                            value={student.dob}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="bloodGroup"
                                            className="form-label"
                                        >
                                            Blood Group
                                        </label>

                                        <select
                                            className="form-select"
                                            id="bloodGroup"
                                            name="bloodGroup"
                                            value={student.bloodGroup}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        >
                                            <option value="">
                                                Select
                                            </option>
                                            <option value="A+">A+</option>
                                            <option value="A-">A-</option>
                                            <option value="B+">B+</option>
                                            <option value="B-">B-</option>
                                            <option value="AB+">
                                                AB+
                                            </option>
                                            <option value="AB-">
                                                AB-
                                            </option>
                                            <option value="O+">O+</option>
                                            <option value="O-">O-</option>
                                            <option value="None">
                                                None
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="religion"
                                            className="form-label"
                                        >
                                            Religion
                                        </label>

                                        <select
                                            className="form-select"
                                            id="religion"
                                            name="religion"
                                            value={student.religion}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        >
                                            <option value="">
                                                Select
                                            </option>
                                            <option value="Hindu">
                                                Hindu
                                            </option>
                                            <option value="Muslim">
                                                Muslim
                                            </option>
                                            <option value="Christian">
                                                Christian
                                            </option>
                                            <option value="Sikh">
                                                Sikh
                                            </option>
                                            <option value="Buddhist">
                                                Buddhist
                                            </option>
                                            <option value="Jain">
                                                Jain
                                            </option>
                                            <option value="Other">
                                                Other
                                            </option>
                                        </select>
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="cast"
                                            className="form-label"
                                        >
                                            Caste
                                        </label>

                                        <select
                                            className="form-select"
                                            id="cast"
                                            name="cast"
                                            value={student.cast}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        >
                                            <option value="">
                                                Select Caste
                                            </option>
                                            <option value="SC">
                                                SC
                                            </option>
                                            <option value="ST">
                                                ST
                                            </option>
                                            <option value="OBC">
                                                OBC
                                            </option>
                                            <option value="General">
                                                General
                                            </option>
                                            <option value="Other">
                                                Other
                                            </option>
                                        </select>
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="motherTongue"
                                            className="form-label"
                                        >
                                            Mother Tongue
                                        </label>

                                        <select
                                            className="form-select"
                                            id="motherTongue"
                                            name="motherTongue"
                                            value={student.motherTongue}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        >
                                            <option value="">
                                                Select
                                            </option>
                                            <option value="Gujarati">
                                                Gujarati
                                            </option>
                                            <option value="Hindi">
                                                Hindi
                                            </option>
                                            <option value="English">
                                                English
                                            </option>
                                            <option value="Other">
                                                Other
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <div className="row">
                                    {/* <div className="mb-3 col-md-4">
                    <label
                      htmlFor="nationality"
                      className="form-label"
                    >
                      Nationality
                    </label>

                    <input
                      type="text"
                      className="form-control"
                      id="nationality"
                      name="nationality"
                      value={student.nationality}
                      onChange={handleChange}
                    />
                  </div> */}

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="address"
                                            className="form-label"
                                        >
                                            Address
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="address"
                                            name="address"
                                            value={student.address}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="phoneNumber"
                                            className="form-label"
                                        >
                                            Register Mobile Number
                                        </label>

                                        <input
                                            type="tel"
                                            className="form-control"
                                            id="phoneNumber"
                                            name="phoneNumber"
                                            value={student.phoneNumber}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="standard"
                                            className="form-label"
                                        >
                                            Standard
                                        </label>

                                        <select
                                            name="standard"
                                            value={student.standard}
                                            onChange={handleChange}
                                            className="form-select"
                                            id="standard"
                                            required={!isEdit}
                                        >
                                            <option value="">
                                                Select Standard
                                            </option>

                                            {STANDARD_OPTIONS.map(
                                                (standard) => (
                                                    <option
                                                        key={standard}
                                                        value={standard}
                                                    >
                                                        {standard}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="studentProblem"
                                            className="form-label"
                                        >
                                            Student Problem
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="studentProblem"
                                            name="studentProblem"
                                            value={student.studentProblem}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    {/* <div className="mb-3 col-md-4">
                    <label
                      htmlFor="schoolName"
                      className="form-label"
                    >
                      Current School Name
                    </label>

                    <input
                      type="text"
                      className="form-control"
                      id="schoolName"
                      name="schoolName"
                      value={student.schoolName}
                      onChange={handleChange}
                    />
                  </div> */}
                                </div>

                                <hr />

                                {/* ==================================================
                    PREVIOUS EDUCATION
                ================================================== */}

                                <h5 className="mb-3">
                                    Previous Education
                                </h5>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="previousSchoolName"
                                            className="form-label"
                                        >
                                            Previous School Name
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="previousSchoolName"
                                            name="previousSchoolName"
                                            value={student.previousSchoolName}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="previousStandardMarks"
                                            className="form-label"
                                        >
                                            Previous Standard Marks
                                        </label>

                                        <input
                                            type="number"
                                            className="form-control"
                                            id="previousStandardMarks"
                                            name="previousStandardMarks"
                                            value={student.previousStandardMarks || 0}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="previousSchoolBoard"
                                            className="form-label"
                                        >
                                            Previous School Board
                                        </label>

                                        <select
                                            className="form-select"
                                            id="previousSchoolBoard"
                                            name="previousSchoolBoard"
                                            value={student.previousSchoolBoard}
                                            onChange={handleChange}
                                        >
                                            <option value="">
                                                Select School Board
                                            </option>
                                            <option value="GSEB">
                                                GSEB
                                            </option>
                                            <option value="CBSE">
                                                CBSE
                                            </option>
                                            <option value="ICSE">
                                                ICSE
                                            </option>
                                            <option value="Other">
                                                Other
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <hr />

                                {/* ==================================================
                    FATHER / GUARDIAN
                ================================================== */}

                                <h5 className="mb-3">
                                    Father / Guardian Information
                                </h5>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherName"
                                            className="form-label"
                                        >
                                            Mother / Guardian Name
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="FatherName"
                                            name="FatherName"
                                            value={student.FatherName}
                                            onChange={handleChange}
                                            required={!isEdit}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherAge"
                                            className="form-label"
                                        >
                                            Father Age
                                        </label>

                                        <input
                                            type="number"
                                            className="form-control"
                                            id="FatherAge"
                                            name="FatherAge"
                                            value={student.FatherAge || 0}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherEducationQualification"
                                            className="form-label"
                                        >
                                            Education Qualification
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="FatherEducationQualification"
                                            name="FatherEducationQualification"
                                            value={
                                                student.FatherEducationQualification
                                            }
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherOccupation"
                                            className="form-label"
                                        >
                                            Occupation
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="FatherOccupation"
                                            name="FatherOccupation"
                                            value={student.FatherOccupation}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherDesignation"
                                            className="form-label"
                                        >
                                            Designation
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="FatherDesignation"
                                            name="FatherDesignation"
                                            value={student.FatherDesignation}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherAnnualIncome"
                                            className="form-label"
                                        >
                                            Annual Income
                                        </label>

                                        <input
                                            type="number"
                                            className="form-control"
                                            id="FatherAnnualIncome"
                                            name="FatherAnnualIncome"
                                            value={student.FatherAnnualIncome || 0}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherMobileNumber"
                                            className="form-label"
                                        >
                                            Father Mobile No.
                                        </label>

                                        <input
                                            type="tel"
                                            className="form-control"
                                            id="FatherMobileNumber"
                                            name="FatherMobileNumber"
                                            value={student.FatherMobileNumber}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="FatherPhoneNumber"
                                            className="form-label"
                                        >
                                            Father Phone No.
                                        </label>

                                        <input
                                            type="tel"
                                            className="form-control"
                                            id="FatherPhoneNumber"
                                            name="FatherPhoneNumber"
                                            value={student.FatherPhoneNumber}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="EmergencyPhoneNumber"
                                            className="form-label"
                                        >
                                            Emergency Phone No.
                                        </label>

                                        <input
                                            type="tel"
                                            className="form-control"
                                            id="EmergencyPhoneNumber"
                                            name="EmergencyPhoneNumber"
                                            value={student.EmergencyPhoneNumber}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="mb-3 col-md-4">
                                        <label
                                            htmlFor="parentEmail"
                                            className="form-label"
                                        >
                                            Parent's Email ID
                                        </label>

                                        <input
                                            type="email"
                                            className="form-control"
                                            id="parentEmail"
                                            name="parentEmail"
                                            value={student.parentEmail}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <hr />

                                {/* ==================================================
                    SIBLINGS
                ================================================== */}

                                <h5 className="mb-3">
                                    Siblings Information
                                </h5>

                                <div className="row">
                                    <div className="mb-3 col-md-3">
                                        <label
                                            htmlFor="siblingName"
                                            className="form-label"
                                        >
                                            Sibling Name
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="siblingName"
                                            name="siblingName"
                                            value={student.siblingName}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-3">
                                        <label
                                            htmlFor="siblingAge"
                                            className="form-label"
                                        >
                                            Sibling Age
                                        </label>

                                        <input
                                            type="number"
                                            className="form-control"
                                            id="siblingAge"
                                            name="siblingAge"
                                            value={student.siblingAge || 0}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-3">
                                        <label
                                            htmlFor="siblingSchoolName"
                                            className="form-label"
                                        >
                                            Sibling School Name
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="siblingSchoolName"
                                            name="siblingSchoolName"
                                            value={student.siblingSchoolName || 0}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="mb-3 col-md-3">
                                        <label
                                            htmlFor="siblingStandard"
                                            className="form-label"
                                        >
                                            Sibling Standard
                                        </label>

                                        <input
                                            type="text"
                                            className="form-control"
                                            id="siblingStandard"
                                            name="siblingStandard"
                                            value={student.siblingStandard}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                {/* ==================================================
                    BUTTONS
                ================================================== */}

                                <div className="d-flex gap-2 mt-3">
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={savingStudent}
                                    >
                                        {savingStudent ? (
                                            <>
                                                <span
                                                    className="spinner-border spinner-border-sm me-2"
                                                    role="status"
                                                />

                                                Saving...
                                            </>
                                        ) : isEdit ? (
                                            "Update Student"
                                        ) : (
                                            "Add Student"
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        data-bs-dismiss="modal"
                                        onClick={() => {
                                            if (!isEdit) {
                                                setStudent({ ...EMPTY_STUDENT });
                                            }
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* ========================================================
          FULLSCREEN PROFILE MODAL
      ======================================================== */}

            <div
                className="modal fade"
                id="exampleModal"
                tabIndex="-1"
                aria-labelledby="exampleModalLabel"
                aria-hidden="true"
                ref={modalProfileRef}
            >
                <div className="modal-dialog modal-fullscreen">
                    <div className="modal-content">
                        {/* ==================================================
                PROFILE HEADER
            ================================================== */}

                        <div className="modal-header">
                            <h5
                                className="modal-title"
                                id="exampleModalLabel"
                            >
                                Student Profile
                            </h5>

                            <button
                                type="button"
                                className="btn-close"
                                data-bs-dismiss="modal"
                                aria-label="Close"
                            />
                        </div>

                        {/* ==================================================
                PROFILE BODY
            ================================================== */}

                        <div className="modal-body bg-light">
                            {loadingProfile ? (
                                <div className="d-flex justify-content-center align-items-center py-5">
                                    <div className="text-center">
                                        <div
                                            className="spinner-border text-primary"
                                            role="status"
                                        >
                                            <span className="visually-hidden">
                                                Loading...
                                            </span>
                                        </div>

                                        <p className="mt-3">
                                            Loading student profile...
                                        </p>
                                    </div>
                                </div>
                            ) : !profile?.student ? (
                                <div className="alert alert-warning">
                                    No student profile data found.
                                </div>
                            ) : (
                                <div className="container-fluid">
                                    <div className="row g-4">
                                        {/* ==================================================
                        LEFT COLUMN
                    ================================================== */}

                                        <div className="col-lg-4">
                                            {/* STUDENT CARD */}

                                            <div className="card shadow-sm border-0 p-4 text-center align-items-center">
                                                <img
                                                    src={getImageUrl(
                                                        profile.student.studentPhoto
                                                    )}
                                                    className="profile-img mb-3"
                                                    alt="Student"
                                                    style={{
                                                        width: "150px",
                                                        height: "150px",
                                                        objectFit: "cover",
                                                        borderRadius: "50%",
                                                    }}
                                                />

                                                <h4>
                                                    {profile.student.firstName}{" "}
                                                    {profile.student.middleName}{" "}
                                                    {profile.student.lastName}
                                                </h4>

                                                <p className="text-muted">
                                                    Student No :{" "}
                                                    {profile.student.stuNo || "-"}
                                                </p>

                                                <div className="row mt-3 w-100">
                                                    <div className="col-6 mb-3">
                                                        <small className="text-muted">
                                                            Standard
                                                        </small>

                                                        <h6>
                                                            {profile.student.standard ||
                                                                "-"}
                                                        </h6>
                                                    </div>

                                                    <div className="col-6 mb-3">
                                                        <small className="text-muted">
                                                            Batch
                                                        </small>

                                                        <h6>
                                                            {profile.student.batchYear ||
                                                                "-"}
                                                        </h6>
                                                    </div>

                                                    <div className="col-6">
                                                        <small className="text-muted">
                                                            Gender
                                                        </small>

                                                        <h6>
                                                            {profile.student.gender ||
                                                                "-"}
                                                        </h6>
                                                    </div>

                                                    <div className="col-6">
                                                        <small className="text-muted">
                                                            Blood
                                                        </small>

                                                        <h6>
                                                            {profile.student.bloodGroup ||
                                                                "-"}
                                                        </h6>
                                                    </div>
                                                </div>

                                                <hr className="w-100" />

                                                <p>
                                                    <b>Phone</b>
                                                    <br />
                                                    {profile.student.phoneNumber ||
                                                        "-"}
                                                </p>

                                                <p>
                                                    <b>Address</b>
                                                    <br />
                                                    {profile.student.address || "-"}
                                                </p>
                                            </div>

                                            {/* ==================================================
                          FEES
                      ================================================== */}

                                            <div className="card shadow-sm border-0 p-4 mt-4">
                                                <h5 className="section-title">
                                                    Fees Details
                                                </h5>

                                                <div className="row g-3 text-center mb-4">
                                                    <div className="col-md-6">
                                                        <div className="border rounded p-3 h-100">
                                                            <h6>
                                                                Total Fees
                                                            </h6>

                                                            <h4 className="text-primary">
                                                                ₹
                                                                {Number(
                                                                    profile.fees
                                                                        ?.totalStandardFees ||
                                                                    0
                                                                ).toLocaleString()}
                                                            </h4>
                                                        </div>
                                                    </div>

                                                    <div className="col-md-6">
                                                        <div className="border rounded p-3 h-100">
                                                            <h6>
                                                                Fees Paid
                                                            </h6>

                                                            <h4 className="text-success">
                                                                ₹
                                                                {Number(
                                                                    profile.fees
                                                                        ?.totalFeesPaid || 0
                                                                ).toLocaleString()}
                                                            </h4>
                                                        </div>
                                                    </div>

                                                    <div className="col-md-6">
                                                        <div className="border rounded p-3 h-100">
                                                            <h6>
                                                                Remaining
                                                            </h6>

                                                            <h4 className="text-danger">
                                                                ₹
                                                                {getRemainingFees(
                                                                    profile.fees
                                                                ).toLocaleString()}
                                                            </h4>
                                                        </div>
                                                    </div>

                                                    <div className="col-md-6">
                                                        <div className="border rounded p-3 h-100">
                                                            <h6>
                                                                Discount
                                                            </h6>

                                                            <h4 className="text-warning">
                                                                ₹
                                                                {Number(
                                                                    profile.fees?.discount ||
                                                                    0
                                                                ).toLocaleString()}
                                                            </h4>
                                                        </div>
                                                    </div>
                                                </div>

                                                <h6>
                                                    Fees Payment Progress
                                                </h6>

                                                <div
                                                    className="progress mb-4"
                                                    style={{ height: "25px" }}
                                                >
                                                    <div
                                                        className={`progress-bar ${getProgressColor(
                                                            getPaymentProgress(
                                                                profile.fees
                                                            )
                                                        )}`}
                                                        style={{
                                                            width: `${getPaymentProgress(
                                                                profile.fees
                                                            )}%`,
                                                        }}
                                                        role="progressbar"
                                                        aria-valuenow={getPaymentProgress(
                                                            profile.fees
                                                        )}
                                                        aria-valuemin="0"
                                                        aria-valuemax="100"
                                                    >
                                                        {getPaymentProgress(
                                                            profile.fees
                                                        )}
                                                        % Paid
                                                    </div>
                                                </div>

                                                <h6>
                                                    Payment History
                                                </h6>

                                                <div className="table-responsive">
                                                    <table className="table table-bordered">
                                                        <thead className="table-light">
                                                            <tr>
                                                                <th>Date</th>
                                                                <th>Time</th>
                                                                <th>Amount</th>
                                                            </tr>
                                                        </thead>

                                                        <tbody>
                                                            {profile.fees?.paymentDetails
                                                                ?.length > 0 ? (
                                                                profile.fees.paymentDetails.map(
                                                                    (pay, index) => (
                                                                        <tr key={index}>
                                                                            <td>
                                                                                {pay.date || "-"}
                                                                            </td>

                                                                            <td>
                                                                                {pay.time || "-"}
                                                                            </td>

                                                                            <td>
                                                                                ₹
                                                                                {Number(
                                                                                    pay.amount || 0
                                                                                ).toLocaleString()}
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                )
                                                            ) : (
                                                                <tr>
                                                                    <td
                                                                        colSpan="3"
                                                                        className="text-center"
                                                                    >
                                                                        No payment history.
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ==================================================
                        RIGHT COLUMN
                    ================================================== */}

                                        <div className="col-lg-8">
                                            {/* ==================================================
                          PERSONAL INFORMATION
                      ================================================== */}

                                            <div className="card shadow-sm border-0 p-4 mb-4">
                                                <h5 className="section-title">
                                                    Personal Information
                                                </h5>

                                                <div className="row">
                                                    <div className="col-md-4 mb-3">
                                                        <label className="text-muted">
                                                            DOB
                                                        </label>

                                                        <p>
                                                            {dateToIndianFormat(
                                                                profile.student.dob
                                                            ) || "-"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4 mb-3">
                                                        <label className="text-muted">
                                                            Religion
                                                        </label>

                                                        <p>
                                                            {profile.student.religion ||
                                                                "-"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4 mb-3">
                                                        <label className="text-muted">
                                                            Caste
                                                        </label>

                                                        <p>
                                                            {profile.student.cast || "-"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4 mb-3">
                                                        <label className="text-muted">
                                                            Mother Tongue
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .motherTongue || "-"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4 mb-3">
                                                        <label className="text-muted">
                                                            Aadhar
                                                        </label>

                                                        <p>
                                                            {profile.student.aadhar ||
                                                                "-"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4 mb-3">
                                                        <label className="text-muted">
                                                            Student Problem
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .studentProblem ||
                                                                "None"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ==================================================
                          PARENT INFORMATION
                      ================================================== */}

                                            <div className="card shadow-sm border-0 p-4 mb-4">
                                                <h5 className="section-title">
                                                    Parent Information
                                                </h5>

                                                <div className="row g-4">
                                                    {/* FATHER */}

                                                    <div className="col-md-6">
                                                        <div className="d-flex gap-3">
                                                            <img
                                                                src={getImageUrl(
                                                                    profile.student
                                                                        .fatherPhoto
                                                                )}
                                                                className="parent-img"
                                                                alt="Father"
                                                                style={{
                                                                    width: "100px",
                                                                    height: "100px",
                                                                    objectFit: "cover",
                                                                    borderRadius: "10px",
                                                                }}
                                                            />

                                                            <div>
                                                                <h6>
                                                                    Father / Guardian
                                                                </h6>

                                                                <p className="mb-1">
                                                                    Name :{" "}
                                                                    {profile.student
                                                                        .lastName ||
                                                                        "Not specified"}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Occupation :{" "}
                                                                    {profile.student
                                                                        .FatherOccupation ||
                                                                        "Not specified"}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Designation :{" "}
                                                                    {profile.student
                                                                        .FatherDesignation ||
                                                                        "Not specified"}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Education :{" "}
                                                                    {profile.student
                                                                        .FatherEducationQualification ||
                                                                        "Not specified"}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Income : ₹
                                                                    {Number(
                                                                        profile.student
                                                                            .FatherAnnualIncome ||
                                                                        0
                                                                    ).toLocaleString()}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Mobile :{" "}
                                                                    {profile.student
                                                                        .FatherMobileNumber ||
                                                                        "Not specified"}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Phone :{" "}
                                                                    {profile.student
                                                                        .FatherPhoneNumber ||
                                                                        "Not specified"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* MOTHER */}

                                                    <div className="col-md-6">
                                                        <div className="d-flex gap-3">
                                                            <img
                                                                src={getImageUrl(
                                                                    profile.student
                                                                        .motherPhoto
                                                                )}
                                                                className="parent-img"
                                                                alt="Mother"
                                                                style={{
                                                                    width: "100px",
                                                                    height: "100px",
                                                                    objectFit: "cover",
                                                                    borderRadius: "10px",
                                                                }}
                                                            />

                                                            <div>
                                                                <h6>
                                                                    Mother
                                                                </h6>

                                                                <p className="mb-1">
                                                                    Name :{" "}
                                                                    {profile.student
                                                                        .FatherName ||
                                                                        "Not specified"}
                                                                </p>

                                                                <p className="mb-1">
                                                                    Email :{" "}
                                                                    {profile.student
                                                                        .parentEmail ||
                                                                        "Not specified"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ==================================================
                          SIBLING
                      ================================================== */}

                                            <div className="card shadow-sm border-0 p-4 mb-4">
                                                <h5 className="section-title">
                                                    Sibling Details
                                                </h5>

                                                <div className="row">
                                                    <div className="col-md-3">
                                                        <label className="text-muted">
                                                            Name
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .siblingName ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-3">
                                                        <label className="text-muted">
                                                            Age
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .siblingAge ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-3">
                                                        <label className="text-muted">
                                                            School
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .siblingSchoolName ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-3">
                                                        <label className="text-muted">
                                                            Standard
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .siblingStandard ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ==================================================
                          PREVIOUS EDUCATION
                      ================================================== */}

                                            <div className="card shadow-sm border-0 p-4 mb-4">
                                                <h5 className="section-title">
                                                    Previous Education
                                                </h5>

                                                <div className="row">
                                                    <div className="col-md-4">
                                                        <label className="text-muted">
                                                            School
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .previousSchoolName ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <label className="text-muted">
                                                            Board
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .previousSchoolBoard ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <label className="text-muted">
                                                            Marks
                                                        </label>

                                                        <p>
                                                            {profile.student
                                                                .previousStandardMarks ||
                                                                "Not specified"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ==================================================
                          REPORTS
                      ================================================== */}

                                            <div className="card shadow-sm border-0 mb-4">
                                                <div className="card-body">
                                                    <h5 className="section-title">
                                                        Academic Reports
                                                    </h5>

                                                    {profile.reports?.length > 0 ? (
                                                        <>
                                                            <ul className="nav nav-tabs mb-4">
                                                                {profile.reports.map(
                                                                    (report) => (
                                                                        <li
                                                                            className="nav-item"
                                                                            key={report._id}
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                className={`nav-link ${selectedReport ===
                                                                                        report._id
                                                                                        ? "active"
                                                                                        : ""
                                                                                    }`}
                                                                                onClick={() =>
                                                                                    setSelectedReport(
                                                                                        report._id
                                                                                    )
                                                                                }
                                                                            >
                                                                                {
                                                                                    report.reportName
                                                                                }
                                                                            </button>
                                                                        </li>
                                                                    )
                                                                )}
                                                            </ul>

                                                            {profile.reports
                                                                .filter(
                                                                    (report) =>
                                                                        report._id ===
                                                                        selectedReport
                                                                )
                                                                .map((report) => {
                                                                    const reportData =
                                                                        getReportMarks(
                                                                            report._id
                                                                        );

                                                                    return (
                                                                        <div
                                                                            key={report._id}
                                                                        >
                                                                            <div className="row g-3 mb-4">
                                                                                <div className="col-md-4">
                                                                                    <div className="border rounded p-3 h-100">
                                                                                        <h6 className="fw-bold">
                                                                                            Report Name
                                                                                        </h6>

                                                                                        <p className="mb-0">
                                                                                            {
                                                                                                report.reportName
                                                                                            }
                                                                                        </p>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="col-md-4">
                                                                                    <div className="border rounded p-3 h-100">
                                                                                        <h6 className="fw-bold">
                                                                                            Standard
                                                                                        </h6>

                                                                                        <p className="mb-0">
                                                                                            {
                                                                                                report.standard
                                                                                            }
                                                                                        </p>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="col-md-4">
                                                                                    <div className="border rounded p-3 h-100">
                                                                                        <h6 className="fw-bold">
                                                                                            Created Date
                                                                                        </h6>

                                                                                        <p className="mb-0">
                                                                                            {report.createdAt
                                                                                                ? new Date(
                                                                                                    report.createdAt
                                                                                                ).toLocaleDateString()
                                                                                                : "-"}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="mb-4">
                                                                                <h6 className="fw-bold">
                                                                                    Description
                                                                                </h6>

                                                                                <p>
                                                                                    {report.description ||
                                                                                        "No description"}
                                                                                </p>
                                                                            </div>

                                                                            {reportData ? (
                                                                                <>
                                                                                    <div className="table-responsive">
                                                                                        <table className="table table-bordered table-hover align-middle">
                                                                                            <thead className="table-light">
                                                                                                <tr>
                                                                                                    <th>
                                                                                                        #
                                                                                                    </th>
                                                                                                    <th>
                                                                                                        Subject
                                                                                                    </th>
                                                                                                    <th>
                                                                                                        Marks
                                                                                                    </th>
                                                                                                    <th>
                                                                                                        Date
                                                                                                    </th>
                                                                                                </tr>
                                                                                            </thead>

                                                                                            <tbody>
                                                                                                {reportData
                                                                                                    ?.subjectData
                                                                                                    ?.length >
                                                                                                    0 ? (
                                                                                                    reportData.subjectData.map(
                                                                                                        (
                                                                                                            item,
                                                                                                            index
                                                                                                        ) => (
                                                                                                            <tr
                                                                                                                key={
                                                                                                                    index
                                                                                                                }
                                                                                                            >
                                                                                                                <td>
                                                                                                                    {index +
                                                                                                                        1}
                                                                                                                </td>

                                                                                                                <td>
                                                                                                                    {
                                                                                                                        item.subject
                                                                                                                    }
                                                                                                                </td>

                                                                                                                <td>
                                                                                                                    {
                                                                                                                        item.mark
                                                                                                                    }
                                                                                                                </td>

                                                                                                                <td>
                                                                                                                    {
                                                                                                                        item.date
                                                                                                                    }
                                                                                                                </td>
                                                                                                            </tr>
                                                                                                        )
                                                                                                    )
                                                                                                ) : (
                                                                                                    <tr>
                                                                                                        <td
                                                                                                            colSpan="4"
                                                                                                            className="text-center"
                                                                                                        >
                                                                                                            No subject
                                                                                                            marks
                                                                                                            available.
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                )}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>

                                                                                    <div className="row mt-4">
                                                                                        <div className="col-md-4 mb-3">
                                                                                            <div className="card text-center border-primary">
                                                                                                <div className="card-body">
                                                                                                    <h6>
                                                                                                        Total
                                                                                                        Marks
                                                                                                    </h6>

                                                                                                    <h3>
                                                                                                        {
                                                                                                            reportData.total
                                                                                                        }
                                                                                                    </h3>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="col-md-4 mb-3">
                                                                                            <div className="card text-center border-success">
                                                                                                <div className="card-body">
                                                                                                    <h6>
                                                                                                        Percentage
                                                                                                    </h6>

                                                                                                    <h3>
                                                                                                        {
                                                                                                            reportData.percentage
                                                                                                        }
                                                                                                        %
                                                                                                    </h3>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="col-md-4 mb-3">
                                                                                            <div className="card text-center border-warning">
                                                                                                <div className="card-body">
                                                                                                    <h6>
                                                                                                        Grade
                                                                                                    </h6>

                                                                                                    <h3>
                                                                                                        {
                                                                                                            reportData.grade
                                                                                                        }
                                                                                                    </h3>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </>
                                                                            ) : (
                                                                                <div className="alert alert-warning">
                                                                                    No marks found for
                                                                                    this report.
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                        </>
                                                    ) : (
                                                        <div className="alert alert-info">
                                                            No academic reports available.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ==================================================
                          ATTENDANCE
                      ================================================== */}

                                            <div className="card shadow-sm border-0 p-4 mb-4">
                                                <h5 className="section-title">
                                                    Attendance
                                                </h5>

                                                <div className="alert alert-secondary">
                                                    Attendance data is not currently
                                                    connected to the API.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewStudentRegister;
