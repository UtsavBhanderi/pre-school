// import React, { useEffect, useState, useCallback } from "react";
// import axios from "axios";
// import { useParams } from "react-router-dom";

// /* ===============================
//    API CONFIG
// ================================ */
// const API_BASE_URL =
//   // import.meta.env.VITE_API_URL || "http://localhost:5000";
//  "http://localhost:5000";

// const api = axios.create({
//   baseURL: API_BASE_URL,
//   headers: { "Content-Type": "application/json" },
// });

// /* ===============================
//    COMPONENT
// ================================ */
// const StudentsReport = () => {
//   const { standard, reportId } = useParams();

//   const [students, setStudents] = useState([]);
//   const [subjects, setSubjects] = useState([]);
//   const [selectedStudent, setSelectedStudent] = useState(null);
//   const [marks, setMarks] = useState({});
//   const [dates, setDates] = useState({});
//   const [loading, setLoading] = useState(false);

//   /* ===============================
//      FETCH STUDENTS & SUBJECTS
//   ================================ */
//   const fetchData = useCallback(async () => {
//     try {
//       const [studentsRes, subjectsRes] = await Promise.all([
//         api.get(`/api/students/${standard}`),
//         api.get(`/api/subjects/${standard}`),
//       ]);

//       setStudents(studentsRes.data || []);
//       setSubjects(subjectsRes.data?.subjects || []);
//     } catch (err) {
//       console.error("Error fetching data:", err);
//     }
//   }, [standard]);

//   useEffect(() => {
//     fetchData();
//   }, [fetchData]);

//   /* ===============================
//      EDIT STUDENT MARKS
//   ================================ */
//   const handleEdit = async (student) => {
//     setSelectedStudent(student);

//     try {
//       const { data } = await api.get(
//         `/api/students/${student._id}/${reportId}`
//       );

//       const marksData = {};
//       const datesData = {};

//       data.forEach((item) => {
//         marksData[item.subject] = item.mark;
//         datesData[item.subject] = item.date;
//       });

//       setMarks(marksData);
//       setDates(datesData);
//     } catch (err) {
//       console.error("Error fetching marks:", err);
//     }
//   };

//   /* ===============================
//      SAVE MARKS
//   ================================ */
//   const handleSave = async () => {
//     if (!selectedStudent) return;

//     setLoading(true);

//     const subjectData = subjects.map((subject) => ({
//       subject,
//       mark: Number(marks[subject]) || 0,
//       date: dates[subject] || "",
//     }));

//     try {
//       await api.post(
//         `/api/students/${selectedStudent._id}/${reportId}`,
//         { subjectData }
//       );

//       alert("Marks saved successfully");
//       setSelectedStudent(null);
//     } catch (err) {
//       console.error("Error saving marks:", err);
//       alert("Failed to save marks");
//     } finally {
//       setLoading(false);
//     }
//   };

//   /* ===============================
//      GENERATE REPORT CARD (DOCX)
//   ================================ */
//   const handleGenerateReportCard = async (studentId) => {
//     try {
//       const response = await fetch(
//         `${API_BASE_URL}/api/docx/generate-docx/${studentId}/${reportId}`
//       );

//       const blob = await response.blob();
//       const url = window.URL.createObjectURL(blob);

//       const link = document.createElement("a");
//       link.href = url;
//       link.download = `ReportCard_${studentId}_${reportId}.docx`;
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//     } catch (err) {
//       console.error("Error generating report card:", err);
//     }
//   };

//   /* ===============================
//      UI
//   ================================ */
//   return (
//     <div className="min-vh-100">
//       <h2>Students in Standard {standard}</h2>

//       <table className="table table-bordered table-striped">
//         <thead>
//           <tr>
//             <th>#</th>
//             <th>Name</th>
//             <th>Standard</th>
//             <th>Roll No</th>
//             <th>Actions</th>
//           </tr>
//         </thead>

//         <tbody>
//           {students.map((student, index) => {
//             const reportExists = student.marks?.some(
//               (m) => m.reportId === reportId
//             );

//             return (
//               <tr key={student._id}>
//                 <td>{index + 1}</td>
//                 <td>{student.middleName}</td>
//                 <td>{student.standard}</td>
//                 <td>{student.stuNo}</td>
//                 <td>
//                   <button
//                     className="btn btn-warning btn-sm me-2"
//                     onClick={() => handleEdit(student)}
//                   >
//                     Edit
//                   </button>

//                   {reportExists && (
//                     <button
//                       className="btn btn-primary btn-sm"
//                       onClick={() =>
//                         handleGenerateReportCard(student._id)
//                       }
//                     >
//                       Report
//                     </button>
//                   )}
//                 </td>
//               </tr>
//             );
//           })}

//           {students.length === 0 && (
//             <tr>
//               <td colSpan="5" className="text-center">
//                 No Students Found
//               </td>
//             </tr>
//           )}
//         </tbody>
//       </table>

//       {/* ===============================
//          MODAL
//       ================================ */}
//       {selectedStudent && (
//         <div className="modal show" style={{ display: "block" }}>
//           <div className="modal-dialog modal-lg">
//             <div className="modal-content">
//               <div className="modal-header">
//                 <h5 className="modal-title">
//                   Enter Marks – {selectedStudent.middleName}
//                 </h5>
//                 <button
//                   className="btn-close"
//                   onClick={() => setSelectedStudent(null)}
//                 />
//               </div>

//               <div className="modal-body">
//                 <table className="table table-bordered">
//                   <thead>
//                     <tr>
//                       <th>Subject</th>
//                       <th>Date</th>
//                       <th>Marks</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {subjects.map((subject) => (
//                       <tr key={subject}>
//                         <td>{subject}</td>
//                         <td>
//                           <input
//                             type="date"
//                             className="form-control"
//                             value={dates[subject] || ""}
//                             onChange={(e) =>
//                               setDates({
//                                 ...dates,
//                                 [subject]: e.target.value,
//                               })
//                             }
//                           />
//                         </td>
//                         <td>
//                           <input
//                             type="number"
//                             className="form-control"
//                             value={marks[subject] || ""}
//                             onChange={(e) =>
//                               setMarks({
//                                 ...marks,
//                                 [subject]: e.target.value,
//                               })
//                             }
//                           />
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>

//               <div className="modal-footer">
//                 <button
//                   className="btn btn-primary"
//                   onClick={handleSave}
//                   disabled={loading}
//                 >
//                   {loading ? "Saving..." : "Save"}
//                 </button>
//                 <button
//                   className="btn btn-secondary"
//                   onClick={() => setSelectedStudent(null)}
//                 >
//                   Cancel
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default StudentsReport;
// // ----------------------------

// import React, { useEffect, useState, useCallback } from "react";
// import axios from "axios";
// import { useParams } from "react-router-dom";
// import "./StudentsReport.css";

// const API_BASE_URL =
//   // import.meta.env.VITE_API_URL || "http://localhost:5000";
//   "http://localhost:5000";

// const api = axios.create({ baseURL: API_BASE_URL });

// const StudentsReport = () => {
//   const { standard, reportId } = useParams();

//   const [students, setStudents] = useState([]);
//   const [subjects, setSubjects] = useState([]);
//   const [selectedStudent, setSelectedStudent] = useState(null);
//   const [marks, setMarks] = useState({});
//   const [dates, setDates] = useState({});
//   const [total, setTotal] = useState(0);
//   const [percentage, setPercentage] = useState(0);
//   const [grade, setGrade] = useState("");

//   const [printStudent, setPrintStudent] = useState(null);
//   const [printReport, setPrintReport] = useState(null);


//   /* ===============================
//      FETCH DATA
//   ================================ */
//   const fetchData = useCallback(async () => {
//     const [studentsRes, subjectsRes] = await Promise.all([
//       api.get(`/api/students/${standard}`),
//       api.get(`/api/subjects/${standard}`),
//     ]);

//     setStudents(studentsRes.data || []);
//     setSubjects(subjectsRes.data?.subjects || []);
//   }, [standard]);

//   useEffect(() => {
//     fetchData();
//   }, [fetchData]);

//   /* ===============================
//      CALCULATE TOTAL LIVE
//   ================================ */
//   useEffect(() => {
//     const sum = Object.values(marks).reduce(
//       (s, v) => s + Number(v || 0),
//       0
//     );
//     setTotal(sum);
//   }, [marks]);

//   /* ===============================
//      EDIT STUDENT
//   ================================ */
//   const handleEdit = async (student) => {
//     setSelectedStudent(student);
//     setMarks({});
//     setDates({});
//     setTotal(0);
//     setPercentage(0);
//     setGrade("");

//     try {
//       const { data } = await api.get(
//         `/api/students/${student._id}/${reportId}`
//       );

//       const m = {};
//       const d = {};

//       data.subjectData.forEach((s) => {
//         m[s.subject] = s.mark;
//         d[s.subject] = s.date;
//       });

//       setMarks(m);
//       setDates(d);
//       setTotal(data.total || 0);
//       setPercentage(data.percentage || 0);
//       setGrade(data.grade || "");

//     } catch (err) {
//       if (err.response?.status !== 404) {
//         console.error(err);
//       }
//     }
//   };

//   /* ===============================
//      SAVE
//   ================================ */
//   const handleSave = async () => {
//     const subjectData = subjects.map((s) => ({
//       subject: s,
//       mark: Number(marks[s]) || 0,
//       date: dates[s] || "",
//     }));

//     const res = await api.post(
//       `/api/students/${selectedStudent._id}/${reportId}`,
//       { subjectData }
//     );

//     setTotal(res.data.total);
//     setPercentage(res.data.percentage);
//     setGrade(res.data.grade);

//     alert("Marks saved successfully");
//     setSelectedStudent(null);
//     fetchData();
//   };

//   const handlePrintPreview = (student) => {
//     const report = student.marks?.find(
//       (m) => m.reportId.toString() === reportId
//     );

//     if (!report) {
//       alert("No report data found");
//       return;
//     }

//     setPrintStudent(student);
//     setPrintReport(report);
//   };

//   /* ===============================
//      UI
//   ================================ */
//   return (
//     <div>
//       <h2>Students – {standard}</h2>

//       <table className="table table-bordered">
//         <thead>
//           <tr>
//             <th>#</th>
//             <th>Name</th>
//             <th>Roll</th>
//             <th>Total</th>
//             <th>%</th>
//             <th>Action</th>
//           </tr>
//         </thead>
//         <tbody>
//           {students.map((s, i) => {
//             const report = s.marks?.find(
//               (m) => m.reportId.toString() === reportId
//             );

//             return (
//               <tr key={s._id}>
//                 <td>{i + 1}</td>
//                 <td>{s.middleName}</td>
//                 <td>{s.stuNo}</td>
//                 <td>{report?.total ?? "-"}</td>
//                 <td>{report?.percentage ?? "-"}</td>
//                 <td>
//                   <button
//                     className="btn btn-warning btn-sm"
//                     onClick={() => handleEdit(s)}
//                   >
//                     Edit
//                   </button>
//                   <button
//                     className="btn btn-secondary btn-sm ms-2"
//                     onClick={() => handlePrintPreview(s)}
//                   >
//                     Print
//                   </button>

//                 </td>

//               </tr>
//             );
//           })}
//         </tbody>
//       </table>

//       {/* MODAL */}
//       {selectedStudent && (
//         <div className="modal show" style={{ display: "block" }}>
//           <div className="modal-dialog modal-lg">
//             <div className="modal-content">
//               <div className="modal-header">
//                 <h5>{selectedStudent.middleName}</h5>
//                 <button
//                   className="btn-close"
//                   onClick={() => setSelectedStudent(null)}
//                 />
//               </div>

//               <div className="modal-body">
//                 <table className="table">
//                   <thead>
//                     <tr>
//                       <th>Subject</th>
//                       <th>Date</th>
//                       <th>Marks</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {subjects.map((sub) => (
//                       <tr key={sub}>
//                         <td>{sub}</td>
//                         <td>
//                           <input
//                             type="date"
//                             value={dates[sub] || ""}
//                             onChange={(e) =>
//                               setDates({ ...dates, [sub]: e.target.value })
//                             }
//                           />
//                         </td>
//                         <td>
//                           <input
//                             type="number"
//                             value={marks[sub] || ""}
//                             onChange={(e) =>
//                               setMarks({ ...marks, [sub]: e.target.value })
//                             }
//                           />
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>

//                 <h5>Total: {total}</h5>
//                 <h5>Percentage: {percentage}%</h5>
//               </div>

//               <div className="modal-footer">
//                 <button className="btn btn-primary" onClick={handleSave}>
//                   Save
//                 </button>
//                 <button
//                   className="btn btn-secondary"
//                   onClick={() => setSelectedStudent(null)}
//                 >
//                   Cancel
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {printStudent && printReport && (
//         <div className="modal show" style={{ display: "block" }}>
//           <div className="modal-dialog modal-xl">
//             <div className="modal-content">

//               {/* HEADER */}
//               <div className="modal-header">
//                 <h4>Report Card Preview</h4>
//                 <button
//                   className="btn-close"
//                   onClick={() => {
//                     setPrintStudent(null);
//                     setPrintReport(null);
//                   }}
//                 />
//               </div>

//               {/* BODY */}
//               <div className="modal-body" id="print-area">
//                 <div className="text-center mb-3">
//                   <h3>KIDZERA NURSERY SCHOOL</h3>
//                   <p><strong>Academic Report Card</strong></p>
//                 </div>

//                 <table className="table table-bordered mb-4">
//                   <tbody>
//                     <tr>
//                       <th>Name</th>
//                       <td>{printStudent.middleName}</td>
//                       <th>Roll No</th>
//                       <td>{printStudent.stuNo}</td>
//                     </tr>
//                     <tr>
//                       <th>Standard</th>
//                       <td>{printStudent.standard}</td>
//                       <th>Report</th>
//                       <td>{reportId}</td>
//                     </tr>
//                   </tbody>
//                 </table>

//                 <table className="table table-bordered">
//                   <thead>
//                     <tr>
//                       <th>Subject</th>
//                       <th>Date</th>
//                       <th>Marks</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {printReport.subjectData.map((s, i) => (
//                       <tr key={i}>
//                         <td>{s.subject}</td>
//                         <td>{s.date || "-"}</td>
//                         <td>{s.mark}</td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>

//                 <div className="d-flex justify-content-end mt-3">
//                   <h5 className="me-4">Total: {printReport.total}</h5>
//                   <h5>Percentage: {printReport.percentage}%</h5>
//                 </div>

//                 <div className="mt-5 d-flex justify-content-between">
//                   <div>
//                     <p>_____________________</p>
//                     <p>Class Teacher</p>
//                   </div>
//                   <div>
//                     <p>_____________________</p>
//                     <p>Principal</p>
//                   </div>
//                 </div>
//               </div>

//               {/* FOOTER */}
//               <div className="modal-footer">
//                 <button
//                   className="btn btn-success"
//                   onClick={() => window.print()}
//                 >
//                   Print / Save PDF
//                 </button>
//                 <button
//                   className="btn btn-secondary"
//                   onClick={() => {
//                     setPrintStudent(null);
//                     setPrintReport(null);
//                   }}
//                 >
//                   Close
//                 </button>
//               </div>

//             </div>
//           </div>
//         </div>
//       )}

//     </div>
//   );
// };

// export default StudentsReport;
// // ----------------------------

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";

/* ===============================
   API CONFIG
================================ */
const API_BASE_URL = `https://api.kidzeranursery.com`;

const api = axios.create({ baseURL: API_BASE_URL });

/* ===============================
   COMPONENT
================================ */
const StudentsReport = () => {
  const { standard, reportId } = useParams();

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [marks, setMarks] = useState({});
  const [dates, setDates] = useState({});

  const [total, setTotal] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [grade, setGrade] = useState("");

  const [printStudent, setPrintStudent] = useState(null);
  const [printReport, setPrintReport] = useState(null);

  /* ===============================
     FETCH DATA
  ================================ */
  const fetchData = useCallback(async () => {
    const [studentsRes, subjectsRes] = await Promise.all([
      api.get(`/api/students/${standard}`),
      api.get(`/api/subjects/${standard}`),
    ]);

    setStudents(studentsRes.data || []);
    setSubjects(subjectsRes.data?.subjects || []);
  }, [standard]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ===============================
     LIVE TOTAL CALCULATION
  ================================ */
  useEffect(() => {
    const sum = Object.values(marks).reduce(
      (s, v) => s + Number(v || 0),
      0
    );
    setTotal(sum);
  }, [marks]);

  /* ===============================
     EDIT STUDENT
  ================================ */
  const handleEdit = async (student) => {
    setSelectedStudent(student);
    setMarks({});
    setDates({});
    setTotal(0);
    setPercentage(0);
    setGrade("");

    try {
      const { data } = await api.get(
        `/api/students/${student._id}/${reportId}`
      );

      const m = {};
      const d = {};

      data.subjectData.forEach((s) => {
        m[s.subject] = s.mark;
        d[s.subject] = s.date;
      });

      setMarks(m);
      setDates(d);
      setTotal(data.total);
      setPercentage(data.percentage);
      setGrade(data.grade);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error(err);
      }
    }
  };

  /* ===============================
     SAVE MARKS
  ================================ */
  const handleSave = async () => {
    const subjectData = subjects.map((s) => ({
      subject: s,
      mark: Number(marks[s]) || 0,
      date: dates[s] || "",
    }));

    const res = await api.post(
      `/api/students/${selectedStudent._id}/${reportId}`,
      { subjectData }
    );

    setTotal(res.data.total);
    setPercentage(res.data.percentage);
    setGrade(res.data.grade);

    alert("Marks saved successfully");
    setSelectedStudent(null);
    fetchData();
  };

  /* ===============================
     PRINT PREVIEW
  ================================ */
  const handlePrintPreview = (student) => {
    const report = student.marks?.find(
      (m) => m.reportId.toString() === reportId
    );

    if (!report) {
      alert("No report data found");
      return;
    }

    setPrintStudent(student);
    setPrintReport(report);
  };

  /* ===============================
     UI
  ================================ */
  return (
    <div className="container mt-3">
      <h3>Students – {standard}</h3>

      <table className="table table-bordered">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Roll</th>
            <th>Total</th>
            <th>%</th>
            <th>Grade</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => {
            const report = s.marks?.find(
              (m) => m.reportId.toString() === reportId
            );

            return (
              <tr key={s._id}>
                <td>{i + 1}</td>
                <td>{s.middleName}</td>
                <td>{s.stuNo}</td>
                <td>{report?.total ?? "-"}</td>
                <td>{report?.percentage ?? "-"}</td>
                <td>{report?.grade ?? "-"}</td>
                <td>
                  <button
                    className="btn btn-warning btn-sm me-2"
                    onClick={() => handleEdit(s)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handlePrintPreview(s)}
                  >
                    Print
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ===============================
         EDIT MODAL
      ================================ */}
      {selectedStudent && (
        <div className="modal show" style={{ display: "block" }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5>{selectedStudent.middleName}</h5>
                <button
                  className="btn-close"
                  onClick={() => setSelectedStudent(null)}
                />
              </div>

              <div className="modal-body">
                <table className="table table-bordered">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((sub) => (
                      <tr key={sub}>
                        <td>{sub}</td>
                        <td>
                          <input
                            type="date"
                            value={dates[sub] || ""}
                            onChange={(e) =>
                              setDates({ ...dates, [sub]: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={marks[sub] || ""}
                            onChange={(e) =>
                              setMarks({ ...marks, [sub]: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h6>Total: {total}</h6>
                <h6>Percentage: {percentage}%</h6>
                <h6>Grade: {grade}</h6>
              </div>

              <div className="modal-footer">
                <button className="btn btn-primary" onClick={handleSave}>
                  Save
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedStudent(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===============================
         PRINT PREVIEW MODAL
      ================================ */}
      {printStudent && printReport && (
        <div className="modal show" style={{ display: "block" }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">

              <div className="modal-body" id="print-area">

                <div className="report-card">
                  <div className="header">
                    <div className="school-name">
                      Kidz Era Pre-School
                    </div>
                    <div className="report-title">
                      Student Report Card
                    </div>
                  </div>

                  <div className="info">
                    <div><span>Student Name:</span> {printStudent.middleName}</div>
                    <div><span>Class:</span> {printStudent.standard}</div>
                    <div><span>Roll No:</span> {printStudent.stuNo}</div>
                    <div><span>Academic Year:</span> 2025 – 2026</div>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Subject / Skill</th>
                        <th>Marks Obtained</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReport.subjectData.map((s, i) => (
                        <tr key={i}>
                          <td>{s.subject}</td>
                          <td>{s.mark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="summary">
                    <div>Total Marks: {printReport.total}</div>
                    <div>Grade: {printReport.grade}</div>
                  </div>

                  <div className="remarks">
                    <div className="remarks-title">Teacher’s Remarks</div>
                    <div className="remarks-box"></div>
                  </div>

                  <div className="signatures">
                    <div className="sign-box">
                      <div className="line"></div>Class Teacher
                    </div>
                    <div className="sign-box">
                      <div className="line"></div>Head Teacher
                    </div>
                    <div className="sign-box">
                      <div className="line"></div>Parent / Guardian
                    </div>
                  </div>
                </div>

              </div>

              <div className="modal-footer">
                <button className="btn btn-success" onClick={() => window.print()}>
                  Print / Save PDF
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setPrintStudent(null);
                    setPrintReport(null);
                  }}
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* PRINT CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
      <style>{`
/* ================= REPORT CARD STYLES ================= */

.report-card {
  max-width: 850px;
  margin: auto;
  background: #fff;
  border: 1px solid #cfd6e4;
  font-family: "Segoe UI", Arial, sans-serif;
  color: #222;
}

.header {
  text-align: center;
  padding: 20px;
  border-bottom: 2px solid #2f5bea;
}

.school-name {
  font-size: 24px;
  font-weight: 600;
  color: #2f5bea;
}

.report-title {
  font-size: 18px;
  margin-top: 5px;
  font-weight: 500;
}

.info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 20px;
  font-size: 14px;
}

.info span {
  font-weight: 600;
}

.report-card table {
  width: 100%;
  border-collapse: collapse;
}

.report-card th,
.report-card td {
  border: 1px solid #cfd6e4;
  padding: 10px;
  font-size: 14px;
  text-align: center;
}

.report-card th {
  background: #eef2ff;
  font-weight: 600;
}

.report-card td:first-child {
  text-align: left;
}

.summary {
  display: flex;
  justify-content: space-between;
  padding: 15px 20px;
  background: #f8f9fd;
  border-top: 2px solid #2f5bea;
  font-size: 15px;
  font-weight: 600;
}

.remarks {
  padding: 20px;
}

.remarks-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.remarks-box {
  border: 1px solid #cfd6e4;
  min-height: 70px;
  padding: 10px;
}

.signatures {
  display: flex;
  justify-content: space-between;
  padding: 25px 20px;
  font-size: 14px;
}

.sign-box {
  width: 30%;
  text-align: center;
}

.line {
  margin-top: 40px;
  border-top: 1px solid #444;
}

/* ================= PRINT ONLY ================= */

@media print {
  body * {
    visibility: hidden;
  }

  #print-area,
  #print-area * {
    visibility: visible;
  }

  #print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
`}</style>


    </div>
  );
};

export default StudentsReport;
