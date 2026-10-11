const express = require("express");
const router = express.Router();
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = require("docx");
const Student = require("./models/Student"); // Assume you have a Student model
// const app = express();

// Route to generate DOCX report card dynamically for a student
// router.get("/generate-docx/:studentId", async (req, res) => {
router.get("/generate-docx/:studentId/:reportId", async (req, res) => {
  //   const { studentId } = req.params;

  //   try {
  //     // Fetch student data dynamically from MongoDB
  //     const student = await Student.findById(studentId).populate("marks");  // Assuming 'marks' is a field in your Student model
  // console.log(student,"student reportDocx.js");

  //     if (!student) {
  //       return res.status(404).send("Student not found.");
  //     }

  //     // Create the DOCX report card dynamically
  //     const doc = new Document({
  //       sections: [
  //         {
  //           children: [
  //             new Paragraph({
  //               children: [new TextRun({
  //                 text: "BHANDERI INFO TECH",
  //                 bold: true,
  //                 size: 48,
  //               })],
  //               alignment: AlignmentType.CENTER,
  //             }),
  //             new Paragraph({
  //               children: [new TextRun({
  //                 text: `Exam Report Card`,
  //                 bold: true,
  //                 size: 32,
  //               })],
  //               alignment: AlignmentType.CENTER,
  //             }),
  //             new Paragraph({
  //               children: [
  //                 new TextRun({ text: `Student Name: ${student.middleName}`, size: 24 }),
  //                 new TextRun({ text: `     |     `, size: 24, bold: true }),
  //                 new TextRun({ text: `Class: ${student.standard}`, size: 24 }),
  //                 new TextRun({ text: `     |     `, size: 24, bold: true }),
  //                 new TextRun({ text: `Roll No: ${student.stuNo}`, size: 24 }),
  //               ],
  //               alignment: AlignmentType.CENTER,
  //             }),
  //             new Paragraph({ text: "", spacing: { after: 300 } }),

  //             // // Subjects Table
  //             new Table({
  //               width: { size: 100, type: WidthType.PERCENTAGE },
  //               rows: [
  //                 new TableRow({
  //                   children: [
  //                     // new TableCell({ children: [new Paragraph("Date")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
  //                     new TableCell({ children: [new Paragraph("Subject")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
  //                     new TableCell({ children: [new Paragraph("Marks Obtained")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
  //                     // new TableCell({ children: [new Paragraph("Total Marks")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
  //                   ],
  //                 }),
  //                 ...student.marks.map((subject) => new TableRow({
  //                   // var arr[] = subject.subjectData.map(() => );
  //                   children: [
  //                     // new TableCell({ children: [new Paragraph(subject.subjectData.date)] }),
  //                     new TableCell({ children: [new Paragraph(subject.subject)] }),
  //                     new TableCell({ children: [new Paragraph(subject.mark.toString())] }),
  //                     // new TableCell({ children: [new Paragraph(subject.totalMarks.toString())] }),
  //                     // new TableCell({ children: [new TextRun({ text: "100" })] }),
  //                   ],
  //                 })),
  //               ],
  //             }),

  //             // Remarks Section
  //             new Paragraph({ text: "", spacing: { after: 500 } }),
  //             new Paragraph({ children: [new TextRun({ text: "Teacher's Remarks: __________________________________________", size: 24 })] }),
  //             new Paragraph({ children: [new TextRun({ text: "Teacher's Signature: _____________________", size: 24 })] }),
  //             new Paragraph({ children: [new TextRun({ text: "Date: _____________________", size: 24 })] }),
  //           ],
  //         },
  //       ],
  //     });

  //     // Generate the DOCX file and send it as a response
  //     const buffer = await Packer.toBuffer(doc);
  //     res.set({
  //       "Content-Disposition": `attachment; filename=${student.name}_ReportCard.docx`,
  //       "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  //     });
  //     res.send(buffer);
  //   } catch (error) {
  //     console.error("Error generating DOCX:", error);
  //     res.status(500).send("Failed to generate report card.");
  //   }
  // });

  const { studentId, reportId } = req.params;

  try {
    // Fetch student data based on studentId and reportId
    // const student = await Student.findById(studentId).populate('marks.reportId');
    const student = await Student.findById(studentId).populate('marks');

    if (!student) {
      return res.status(404).send('Student not found.');
    }

    //     // Find the marks data for the specific reportId
    const report = student.marks.find(mark => mark.reportId.toString() === reportId);
    //     const report = student.marks.find(mark => mark.reportId === reportId);

    if (!report) {
      return res.status(404).send('Report card not found for the given reportId.');
    }

    // Extract subjectData from the found report
    const subjects = report.subjectData;
    // const subjects = student.subjectData;

    // Create the DOCX report card dynamically
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun({
                text: 'BHANDERI INFO TECH',
                bold: true,
                size: 48,
              })],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [new TextRun({
                text: `Exam Report Card`,
                bold: true,
                size: 32,
              })],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `Student Name: ${student.middleName}`, size: 24 }),
                new TextRun({ text: `     |     `, size: 24, bold: true }),
                new TextRun({ text: `Class: ${student.standard}`, size: 24 }),
                new TextRun({ text: `     |     `, size: 24, bold: true }),
                new TextRun({ text: `Roll No: ${student.stuNo}`, size: 24 }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "", spacing: { after: 300 } }),

            // Create table for subjects and marks
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Date")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
                    new TableCell({ children: [new Paragraph("Subject")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
                    new TableCell({ children: [new Paragraph("Marks Obtained")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
                    // new TableCell({ children: [new Paragraph("Total Marks")], borders: { top: { style: BorderStyle.SINGLE }, bottom: { style: BorderStyle.SINGLE } } }),
                  ],
                }),
                ...subjects.map(subject => new TableRow({
                  // ...student.map(subject => new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(subject.date)] }),
                    new TableCell({ children: [new Paragraph(subject.subject)] }),
                    new TableCell({ children: [new Paragraph(subject.mark.toString())] }),
                    // new TableCell({ children: [new Paragraph(subject.totalMarks.toString())] }),
                  ],
                })),
              ],
            }),

            // Add remarks and signature sections
            new Paragraph({ text: "", spacing: { after: 500 } }),
            new Paragraph({ children: [new TextRun({ text: "Teacher's Remarks: __________________________________________", size: 24 })] }),
            new Paragraph({ children: [new TextRun({ text: "Teacher's Signature: _____________________", size: 24 })] }),
            new Paragraph({ children: [new TextRun({ text: "Date: _____________________", size: 24 })] }),
          ],
        },
      ],
    });

    // Generate the DOCX file and send it as a response
    const buffer = await Packer.toBuffer(doc);
    res.set({
      "Content-Disposition": `attachment; filename=${student.name}_ReportCard.docx`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    res.send(buffer);

  } catch (error) {
    console.error('Error generating DOCX:', error);
    res.status(500).send('Failed to generate the report card.');
  }
});

module.exports = router;
