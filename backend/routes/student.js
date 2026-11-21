const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require("mongoose");
const Student = require('../models/Student');
const ReportCard = require("../models/ReportCard"); // to get Out Of Marks
const Subject = require('../models/Subject');
const { validateStudentReportMarks, calculateStudentReportResult } = require('../utils/studentReportMarks');
const Fees = require("../models/Fee");
const ParentAccount = require('../models/ParentAccount');
const { hasFeePaymentHistory } = require('../utils/feeValidation');

const router = express.Router();
// const { Student, Sequence } = require('../models/Student');
const Sequence = require('../models/sequence');
const { verifyUploadContent } = require('../middleware/verifyUploadContent');
const { STUDENT_PROFILE_FIELDS, pickProfileFields } = require('../utils/legacyProfileFields');
const { removeManagedUploadFile } = require('../utils/uploadFileStorage');
const uploadRoot = path.resolve(__dirname, '../uploads/students');

async function cleanupRequestUploads(req) {
  const files = Object.values(req.files || {}).flat().filter(Boolean);
  await Promise.all(files.map((file) => removeManagedUploadFile(uploadRoot, file.path)));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = uploadRoot;
    fs.mkdir(uploadDir, { recursive: true }, (error) => cb(error, uploadDir));
  },
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 50, parts: 53 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    if (!allowedExtensions.has(extension)) {
      return cb(new Error('Student and parent photographs must be JPG, PNG, WEBP or GIF images.'));
    }
    cb(null, true);
  },
});

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
  const year = String(new Date().getFullYear()).slice(-2);
  const initials = [firstName, middleName, lastName]
    .map((name) => String(name || '').trim().charAt(0) || 'X')
    .join('')
    .toUpperCase();

  let sequence;
  try {
    sequence = await Sequence.findOneAndUpdate(
      { year },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
  } catch (error) {
    // Two first admissions can race while the current year's counter is being
    // created. If the unique year index wins that race, retry the increment.
    if (error.code !== 11000) throw error;
    sequence = await Sequence.findOneAndUpdate(
      { year },
      { $inc: { seq: 1 } },
      { new: true, runValidators: true }
    );
    if (!sequence) throw error;
  }

  return `${year}${initials}${String(sequence.seq).padStart(3, '0')}`;
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
router.post('/', upload.fields([
  { name: 'studentPhoto', maxCount: 1 },
  { name: 'motherPhoto', maxCount: 1 },
  { name: 'fatherPhoto', maxCount: 1 },
]), verifyUploadContent('students'), async (req, res) => {
  try {
    const profileData = pickProfileFields(req.body, STUDENT_PROFILE_FIELDS);
    const { firstName, middleName, lastName, standard } = profileData;
    if (!String(firstName || '').trim()) {
      return res.status(400).json({ message: 'Student first name is required.' });
    }
    if (!String(standard || '').trim()) {
      return res.status(400).json({ message: 'Student standard is required.' });
    }

    const stuNo = await generateStudentNumber(firstName, middleName, lastName);
    const year = new Date().getFullYear();
    const batchYear = profileData.batchYear || `${year}-${year + 1}`;
    const files = req.files || {};

    const newStudent = new Student({
      ...profileData,
      ...(files.studentPhoto?.[0] && { studentPhoto: `uploads/students/${files.studentPhoto[0].filename}` }),
      ...(files.motherPhoto?.[0] && { motherPhoto: `uploads/students/${files.motherPhoto[0].filename}` }),
      ...(files.fatherPhoto?.[0] && { fatherPhoto: `uploads/students/${files.fatherPhoto[0].filename}` }),
      stuNo,
      batchYear,
    });

    await newStudent.save();
    return res.status(201).json({ message: 'Student registered successfully', student: newStudent });
  } catch (error) {
    await cleanupRequestUploads(req);
    console.error('Student registration failed:', error);
    const status = error.code === 11000 ? 409 : 400;
    return res.status(status).json({ message: status === 409 ? 'A record with this student number already exists.' : 'Unable to register student.' });
  }
});

// Update a student
router.put('/:id', upload.fields([
  { name: 'studentPhoto', maxCount: 1 },
  { name: 'motherPhoto', maxCount: 1 },
  { name: 'fatherPhoto', maxCount: 1 },
]), verifyUploadContent('students'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      await cleanupRequestUploads(req);
      return res.status(400).json({ message: 'Invalid student ID.' });
    }

    const updatedStudent = pickProfileFields(req.body, STUDENT_PROFILE_FIELDS);
    const files = req.files || {};
    if (files.studentPhoto?.[0]) updatedStudent.studentPhoto = `uploads/students/${files.studentPhoto[0].filename}`;
    if (files.motherPhoto?.[0]) updatedStudent.motherPhoto = `uploads/students/${files.motherPhoto[0].filename}`;
    if (files.fatherPhoto?.[0]) updatedStudent.fatherPhoto = `uploads/students/${files.fatherPhoto[0].filename}`;
    if (updatedStudent.parentEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(updatedStudent.parentEmail)) {
      await cleanupRequestUploads(req);
      return res.status(400).json({ message: 'Enter a valid parent email address.' });
    }
    if (Object.keys(updatedStudent).length === 0) {
      await cleanupRequestUploads(req);
      return res.status(400).json({ message: 'No supported student details were provided to update.' });
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: updatedStudent },
      { new: true, runValidators: true }
    );

    if (!student) { await cleanupRequestUploads(req); return res.status(404).json({ message: 'Student not found.' }); }
    return res.status(200).json({ message: 'Student updated successfully', student });
  } catch (error) {
    await cleanupRequestUploads(req);
    console.error('Student update failed:', error);
    return res.status(400).json({ message: 'Unable to update student.' });
  }
});

// Delete a student
router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid student ID.' });
  }
  try {
    const student = await Student.findById(req.params.id).select('stuNo marks').lean();
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const [parentAccess, linkedReport] = await Promise.all([
      ParentAccount.exists({ studentIds: student._id }),
      ReportCard.exists({ students: student._id }),
    ]);
    if (parentAccess) {
      return res.status(409).json({
        code: 'STUDENT_PARENT_ACCESS_PRESERVED',
        message: 'This student is linked to a parent portal account. Remove or transfer the family access before deleting the student.',
      });
    }
    if (Array.isArray(student.marks) && student.marks.length > 0) {
      return res.status(409).json({
        code: 'STUDENT_ACADEMIC_HISTORY_PRESERVED',
        message: 'This student has saved academic results. Keep the student record so report-card history remains available.',
      });
    }
    if (linkedReport) {
      return res.status(409).json({
        code: 'STUDENT_REPORT_HISTORY_PRESERVED',
        message: 'This student is included in a report-card template. Remove the student from that template before deleting the record.',
      });
    }

    const fee = student.stuNo
      ? await Fees.findOne({ stuNo: student.stuNo })
        .select('totalFeesPaid paymentDetails openingBalancePaid')
        .lean()
      : null;
    if (fee && hasFeePaymentHistory(fee)) {
      return res.status(409).json({
        code: 'STUDENT_PAYMENT_HISTORY_PRESERVED',
        message: 'This student has recorded fee payments. Keep the student record so receipts and financial history remain linked.',
      });
    }

    // Remove only an unpaid fee schedule, and re-check that it is still unpaid
    // in the delete query so a concurrent payment cannot be erased.
    if (fee) {
      const removedFee = await Fees.findOneAndDelete({
        _id: fee._id,
        $and: [
          { $or: [{ totalFeesPaid: { $lte: 0 } }, { totalFeesPaid: { $exists: false } }] },
          { $or: [{ openingBalancePaid: { $lte: 0 } }, { openingBalancePaid: { $exists: false } }] },
          { $or: [{ paymentDetails: { $size: 0 } }, { paymentDetails: { $exists: false } }, { paymentDetails: null }] },
        ],
      });
      if (!removedFee) {
        return res.status(409).json({
          code: 'STUDENT_FEE_RECORD_CHANGED',
          message: 'The fee record changed while this student was being deleted. Refresh the page and review the fee history.',
        });
      }
    }

    const deletedStudent = await Student.findOneAndDelete({ _id: req.params.id });
    if (!deletedStudent) {
      return res.status(409).json({ message: 'The student record changed while it was being deleted. Refresh and try again.' });
    }
    return res.json({ message: 'Unused student record and unpaid fee schedule deleted.' });
  } catch (error) {
    console.error('Student deletion failed:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to delete student record.' });
  }
});


router.get('/birthdays', async (req, res) => {
  try {
    // Birthday views need only identity and calendar fields. Do not expose
    // family contact numbers, address, identity documents or medical notes.
    const students = await Student.find({})
      .select('_id firstName middleName lastName gender dob standard stuNo studentPhoto')
      .lean();
    return res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// exports.getStudentProfile = async (req, res) => {
router.get('/student-profile/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(studentId)) return res.status(400).json({ message: 'Invalid student ID.' });
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
  if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ message: 'Choose a valid student and report.' });
  }
  try {
    const [student, report] = await Promise.all([
      Student.findById(studentId).select('standard marks').lean(),
      ReportCard.findById(reportId).select('standard students').lean(),
    ]);
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    if (!report) return res.status(404).json({ message: 'Report template not found.' });
    const isLinked = (report.students || []).some((id) => String(id) === String(studentId));
    if (!isLinked || student.standard !== report.standard) {
      return res.status(403).json({ message: 'This student is not included in the selected report template.' });
    }
    const result = (student.marks || []).find((item) => String(item.reportId || '') === reportId);
    if (!result) return res.status(404).json({ message: 'No marks have been saved for this student yet.' });
    return res.json({
      subjectData: result.subjectData || [],
      total: result.total ?? 0,
      percentage: result.percentage ?? 0,
      grade: result.grade || 'E',
    });
  } catch (error) {
    console.error('Unable to load student marks:', error?.name || 'query_error');
    return res.status(500).json({ message: 'Student marks could not be loaded.' });
  }
});

/* =====================================================
   SAVE / UPDATE MARKS + TOTAL + PERCENTAGE
===================================================== */
router.post("/:studentId/:reportId", async (req, res) => {
  const { studentId, reportId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ message: 'Choose a valid student and report.' });
  }
  try {
    const [student, report] = await Promise.all([
      Student.findById(studentId),
      ReportCard.findById(reportId).select('standard students description').lean(),
    ]);
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    if (!report) return res.status(404).json({ message: 'Report template not found.' });
    const isLinked = (report.students || []).some((id) => String(id) === String(studentId));
    if (!isLinked || student.standard !== report.standard) {
      return res.status(403).json({ message: 'This student is not included in the selected report template.' });
    }
    const subjectConfig = await Subject.findOne({ standard: report.standard }).select('subjects').lean();
    if (!subjectConfig) {
      return res.status(409).json({ message: 'No subjects are configured for this class. Configure subjects before entering marks.' });
    }
    const validation = validateStudentReportMarks(req.body?.subjectData, subjectConfig.subjects, report.description);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    const subjectData = validation.value;
    const result = calculateStudentReportResult(subjectData, report.description);
    if (!Array.isArray(student.marks)) student.marks = [];
    const reportIndex = student.marks.findIndex((item) => String(item.reportId || '') === reportId);
    const reportPayload = { reportId, subjectData, ...result };
    if (reportIndex === -1) student.marks.push(reportPayload);
    else student.marks[reportIndex] = reportPayload;
    await student.save();
    return res.json({ message: 'Marks saved successfully.', ...result });
  } catch (error) {
    console.error('Unable to save student marks:', error?.name || 'save_error');
    return res.status(500).json({ message: 'Student marks could not be saved. Please try again.' });
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
