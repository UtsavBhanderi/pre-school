const express = require('express');
const multer = require('multer');
const mongoose = require("mongoose");
const Student = require('../models/Student');
const ReportCard = require("../models/ReportCard"); // to get Out Of Marks
const Fees = require("../models/Fee");

const router = express.Router();
// const { Student, Sequence } = require('../models/Student');
const Sequence = require('../models/sequence');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/students');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Helper function to get next student number
// const getNextStudentNumber = async () => {
//   const lastStudent = await Student.findOne().sort({ stuNo: -1 });
//   return lastStudent ? lastStudent.stuNo + 1 : 1;
// };



// Generate student number
// async function generateStudentNumber(firstName, middleName, lastName) {
//   const currentYear = new Date().getFullYear().toString().slice(-2);
//   const initials = `${firstName[0]}${middleName[0]}${lastName[0]}`.toUpperCase();

//   let sequence = await Sequence.findOne({ year: currentYear });

//   if (!sequence) {
//     sequence = new Sequence({ year: currentYear, sequenceNumber: 0 });
//   }

//   sequence.sequenceNumber += 1;
//   await sequence.save();

//   const sequenceNumber = String(sequence.sequenceNumber).padStart(3, '0');
//   console.log(currentYear ," ", initials ," ", sequenceNumber, " stuNO routs student");
//   return `${currentYear}${initials}${sequenceNumber}`;
// }
const generateStudentNumber = async (firstName, middleName, lastName) => {
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const initials = `${firstName[0]}${middleName[0]}${lastName[0]}`.toUpperCase();

  // Find or create the sequence for the current year
  let sequence = await Sequence.findOne({ year: currentYear });
  if (!sequence) {
    sequence = new Sequence({ year: currentYear, seq: 0 });
  }

  sequence.seq += 1;
  await sequence.save();

  const seqNumber = sequence.seq.toString().padStart(3, '0');
  return `${currentYear}${initials}${seqNumber}`;
};





//students .get/students
// Get all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Create a new student
router.post('/', upload.fields([{ name: 'studentPhoto' }, { name: 'motherPhoto' }, { name: 'fatherPhoto' }]), async (req, res) => {
  try {
    // const stuNo = await getNextStudentNumber();
    // const stuNo = await generateStudentNumber();
    // --------
    // const { firstName, middleName, lastName, ...rest } = req.body;
    // const stuNo = await generateStudentNumber(firstName, middleName, lastName);
    // ------------
    const { firstName, middleName, lastName } = req.body;
    const stuNo = await generateStudentNumber(firstName, middleName, lastName);

    const batchYear = new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);

    const newStudent = new Student({
      ...req.body,
      studentPhoto: req.files.studentPhoto[0].path,
      motherPhoto: req.files.motherPhoto[0].path,
      fatherPhoto: req.files.fatherPhoto[0].path,
      stuNo,
      batchYear
    });
    await newStudent.save();
    res.status(201).send('Student registered successfully');
  } catch (error) {
    console.log(error, "student.js catch routs backend post");
    res.status(400).send(error);
  }
});

// Update a student
router.put('/:id', upload.fields([{ name: 'studentPhoto' }, { name: 'motherPhoto' }, { name: 'fatherPhoto' }]), async (req, res) => {
  try {
    const updatedStudent = {
      batchYear: "2026-2027",
      ...req.body,
    };

    if (req.files.studentPhoto) {
      updatedStudent.studentPhoto = req.files.studentPhoto[0].path;
    }
    if (req.files.motherPhoto) {
      updatedStudent.motherPhoto = req.files.motherPhoto[0].path;
    }
    if (req.files.fatherPhoto) {
      updatedStudent.fatherPhoto = req.files.fatherPhoto[0].path;
    }

    await Student.findByIdAndUpdate(req.params.id, updatedStudent);
    res.status(200).send('Student updated successfully');
  } catch (error) {
    console.log("error on updating ", error);

    res.status(400).send(error);
  }
});

// Delete a student
router.delete('/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.status(200).send('Student deleted successfully');
  } catch (error) {
    res.status(400).send(error);
  }
});


// Helper function to get start and end dates for filters
const getStartAndEndDates = (dateFilter) => {
  const now = new Date();
  let start, end;

  switch (dateFilter) {
    case 'today':
      start = new Date(now.setHours(0, 0, 0, 0));
      end = new Date(now.setHours(23, 59, 59, 999));
      break;
    case 'thisWeek':
      const dayOfWeek = now.getDay();
      start = new Date(now.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      // If a specific date is passed
      start = new Date(dateFilter);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
};

// // Route to get students' birthdays with filters
// router.get('/birthdays', async (req, res) => {
//   const { dob, middleName, standard, stuNo } = req.query;
//   let filter = {};

//   // console.log(req , "req birthday");


//   if (dob) {
//       const start = new Date(dob);
//       const end = new Date(dob);
//       // const start = new String(dob);
//       // const end = new String(dob);
//       end.setDate(end.getDate() + 1);

//       filter.dateOfBirth = {
//           $gte: start,
//           $lt: end,
//       };
//   }
// //   if (dob) {
// //     const { start, end } = getStartAndEndDates(dob);
// //     filter.dateOfBirth = {
// //         $gte: start,
// //         $lt: end,
// //     };
// // }

//   if (middleName) filter.middleName = middleName;
//   if (standard) filter.standard = standard;
//   if (stuNo) filter.stuNo = stuNo;

//   try {
//       const students = await Student.find(filter);
//       console.log(students,"students birthday.js");

//       res.json(students);
//   } catch (err) {
//       res.status(500).json({ message: err.message });
//   }
// });

router.get('/birthdays', async (req, res) => {
  try {
    const students = await Student.find({});
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// exports.getStudentProfile = async (req, res) => {
router.get('/student-profile/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const feesData = await Fees.findOne({ stuNo: student.stuNo });

    //store selected fees fields in a new object
    const fees = {
      studentName: feesData?.studentName || '',
      stuNo: feesData?.stuNo || '',
      totalStandardFees: feesData?.totalStandardFees || 0,
      totalFeesPaid: feesData?.totalFeesPaid || 0,
      totalFeesRemaining: feesData?.totalFeesRemaining || 0,
      paymentDetails: feesData?.paymentDetails || [],
      discount: feesData?.discount || 0,
    };

    const reports = await ReportCard.find({
      students: studentId
    });

    res.json({
      student,
      fees,
      reports
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// router.get('/:id', async (req, res) => {
//   const studentId = req.params.id;

//   try {
//     const student = await Student.findById(studentId);
//     if (!student) {
//       return res.status(404).json({ message: 'Student not found' });
//     }
//     res.status(200).json(student);
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching student', error });
//   }
// });

// Get all students based on standard
router.get('/:standard', async (req, res) => {
  const { standard } = req.params;

  try {
    const students = await Student.find({ standard });

    if (!students) {
      return res.status(404).json({ message: 'No students found for this standard' });
    }
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching students', error });
  }
});

router.get("/:studentId/:reportId", async (req, res) => {
  const { studentId, reportId } = req.params;

  try {
    if (
      !mongoose.Types.ObjectId.isValid(studentId) ||
      !mongoose.Types.ObjectId.isValid(reportId)
    ) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });

    const report = student.marks?.find(
      (m) => m.reportId.toString() === reportId
    );

    if (!report)
      return res.status(404).json({ message: "No marks found" });

    return res.json({
      subjectData: report.subjectData || [],
      total: report.total || 0,
      percentage: report.percentage || 0,
      grade: report.grade || "E",
    });

  } catch (err) {
    console.error("GET MARKS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SAVE / UPDATE MARKS + TOTAL + PERCENTAGE
===================================================== */
router.post("/:studentId/:reportId", async (req, res) => {
  const { studentId, reportId } = req.params;
  const { subjectData } = req.body;

  try {
    if (!Array.isArray(subjectData)) {
      return res.status(400).json({ message: "Invalid subject data" });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!Array.isArray(student.marks)) student.marks = [];

    // 🔹 TOTAL
    const total = subjectData.reduce(
      (sum, s) => sum + Number(s.mark || 0),
      0
    );

    // 🔹 OUT OF MARKS
    const report = await ReportCard.findById(reportId).lean();
    const outOfMarks = Number(report?.description || 0);
    const maxTotal = subjectData.length * outOfMarks;

    // 🔹 PERCENTAGE
    const percentage =
      maxTotal > 0 ? Number(((total / maxTotal) * 100).toFixed(2)) : 0;

    // 🔹 GRADE LOGIC
    let grade = "E";
    if (percentage >= 90) grade = "A+";
    else if (percentage >= 80) grade = "A";
    else if (percentage >= 70) grade = "B";
    else if (percentage >= 60) grade = "C";
    else if (percentage >= 50) grade = "D";

    const reportIndex = student.marks.findIndex(
      (m) => m.reportId.toString() === reportId
    );

    const reportPayload = {
      reportId,
      subjectData,
      total,
      percentage,
      grade,
    };

    if (reportIndex === -1) {
      student.marks.push(reportPayload);
    } else {
      student.marks[reportIndex] = reportPayload;
    }

    await student.save();

    res.json({
      message: "Marks saved successfully",
      total,
      percentage,
      grade,
    });
  } catch (err) {
    console.error("SAVE MARKS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET /api/reports/:reportId/students
router.get("/reports/:reportId/students", async (req, res) => {
  try {

    const { reportId } = req.params;

    console.log("Fetching students for reportId:", reportId);
    // // ✅ 1. Validate ObjectId
    // if (!mongoose.Types.ObjectId.isValid(reportId)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid reportId",
    //   });
    // }


    // ✅ 2. Check report exists
    const report = await ReportCard.findById(reportId)
      .select("reportName students")
      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // ✅ 3. Fetch only required students
    const students = await Student.find({
      _id: { $in: report.students },
    })
      .select("name marks") // only needed fields
      .lean();

    // ✅ 4. Filter marks for this report only
    const result = students.map((student) => {
      const reportMarks = student.marks.find(
        (m) => m.reportId.toString() === reportId
      );

console.log("Student:", student.name, "Report Marks:", reportMarks);

      return {
        _id: student._id,
        name: student.name,
        total: reportMarks?.total || null,
        percentage: reportMarks?.percentage || null,
        grade: reportMarks?.grade || null,
        subjectData: reportMarks?.subjectData || [],
      };
    });

    // ✅ 5. Send clean response
    return res.status(200).json({
      success: true,
      reportName: report.reportName,
      count: result.length,
      data: result,
    });

  } catch (error) {
    console.error("Error fetching report students:", error);

    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});


// GET /api/student/:id/reports

// router.get("/student/:id/reports", async (req, res) => {
//   //no use
//   try {
//     const student = await Student.findById(req.params.id)
//       .populate("marks.reportId", "reportName")
//       .lean();

//     if (!student) {
//       return res.status(404).json({ success: false, message: "Not found" });
//     }

//     const data = student.marks.map((m) => ({
//       reportId: m.reportId._id,
//       reportName: m.reportId.reportName,
//       subjectData: m.subjectData,
//       total: m.total,
//       percentage: m.percentage,
//       grade: m.grade,
//     }));

//     res.json({ success: true, data });

//   } catch (err) {
//     res.status(500).json({ success: false });
//   }
// });

// router.get("/student/:id/reports", async (req, res) => {
//   try {
//     const student = await Student.findById(req.params.id)
//       .populate({
//         path: "marks.reportId",
//         select: "reportName",
//       });

//     if (!student) {
//       return res.status(404).json({
//         success: false,
//         message: "Student not found",
//       });
//     }

//     res.status(200).json(student);
//   } catch (error) {
//     console.log(error);

//     res.status(500).json({
//       success: false,
//       message: "Server Error",
//     });
//   }
// });

router.get("/:id/reports", async (req, res) => {
  try {
    const { id } = req.params;

    // VALIDATE OBJECT ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
    }

    // FETCH STUDENT
    const student = await Student.findById(id)
      .populate({
        path: "marks.reportId",
        select: "reportName standard",
      })
      .lean();

    // NOT FOUND
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // SORT REPORTS BY LATEST
    if (student?.marks?.length > 0) {
      student.marks.sort((a, b) => {
        return (
          new Date(
            b?.subjectData?.[0]?.date || 0
          ).getTime() -
          new Date(
            a?.subjectData?.[0]?.date || 0
          ).getTime()
        );
      });
    }

    return res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    console.error(
      "GET STUDENT REPORTS ERROR :",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


module.exports = router;
