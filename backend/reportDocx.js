'use strict';

const express = require('express');
const mongoose = require('mongoose');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} = require('docx');
const Student = require('./models/Student');
const ReportCard = require('./models/ReportCard');

const router = express.Router();

const asText = (value, fallback = '—') => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
};

const asNumberText = (value, suffix = '') => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) + suffix : '—';
};

const safeFilenamePart = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 64) || 'student';

const cell = (value, bold = false) => new TableCell({
  children: [new Paragraph({ children: [new TextRun({ text: asText(value), bold })] })],
  borders: {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'D9E1EC' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9E1EC' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'D9E1EC' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'D9E1EC' },
  },
});

router.get('/generate-docx/:studentId/:reportId', async (req, res) => {
  const { studentId, reportId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ message: 'Choose a valid student and report card.' });
  }

  try {
    const [student, template] = await Promise.all([
      Student.findById(studentId).select('firstName middleName lastName standard stuNo marks').lean(),
      ReportCard.findById(reportId).select('reportName standard description students').lean(),
    ]);

    if (!student) return res.status(404).json({ message: 'Student not found.' });
    if (!template) return res.status(404).json({ message: 'Report template not found.' });

    const isLinked = (template.students || []).some((id) => String(id) === String(student._id));
    if (!isLinked || String(student.standard || '') !== String(template.standard || '')) {
      return res.status(403).json({ message: 'This student is not included in the selected report template.' });
    }

    const savedMarks = (student.marks || []).find((item) => String(item.reportId || '') === String(template._id));
    if (!savedMarks) return res.status(404).json({ message: 'No saved marks are available for this report card.' });

    const studentName = [student.firstName, student.middleName, student.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Student';
    const schoolName = asText(process.env.SCHOOL_NAME, 'School');
    const maximumMarks = asText(template.description);
    const subjectRows = Array.isArray(savedMarks.subjectData) ? savedMarks.subjectData : [];

    const rows = [
      new TableRow({
        children: [cell('Date', true), cell('Subject', true), cell('Marks obtained', true)],
      }),
      ...subjectRows.map((subject) => new TableRow({
        children: [
          cell(subject.date),
          cell(subject.subject),
          cell(asNumberText(subject.mark)),
        ],
      })),
    ];

    const document = new Document({
      sections: [{
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: schoolName, bold: true, size: 32 })],
            spacing: { after: 120 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Student Progress Report', bold: true, size: 28 })],
            spacing: { after: 300 },
          }),
          new Paragraph({ children: [new TextRun({ text: 'Student: ', bold: true }), new TextRun(studentName)] }),
          new Paragraph({ children: [new TextRun({ text: 'Class: ', bold: true }), new TextRun(asText(student.standard))] }),
          new Paragraph({ children: [new TextRun({ text: 'GR / Admission No.: ', bold: true }), new TextRun(asText(student.stuNo))] }),
          new Paragraph({ children: [new TextRun({ text: 'Assessment: ', bold: true }), new TextRun(asText(template.reportName))] }),
          new Paragraph({ children: [new TextRun({ text: 'Maximum marks: ', bold: true }), new TextRun(maximumMarks)] }),
          new Paragraph({ text: '', spacing: { after: 180 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({ text: '', spacing: { after: 220 } }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Total: ', bold: true }),
              new TextRun(asNumberText(savedMarks.total)),
              new TextRun({ text: '     Percentage: ', bold: true }),
              new TextRun(asNumberText(savedMarks.percentage, '%')),
              new TextRun({ text: '     Grade: ', bold: true }),
              new TextRun(asText(savedMarks.grade)),
            ],
          }),
          new Paragraph({ text: '', spacing: { after: 320 } }),
          new Paragraph({ children: [new TextRun({ text: 'Teacher remarks: ', bold: true }), new TextRun('______________________________________________')] }),
          new Paragraph({ children: [new TextRun({ text: 'Teacher signature: ', bold: true }), new TextRun('___________________________________________')] }),
          new Paragraph({ children: [new TextRun({ text: 'Date: ', bold: true }), new TextRun('________________________')] }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(document);
    const filename = 'Progress_Report_' + safeFilenamePart(studentName) + '.docx';
    res.set({
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(buffer);
  } catch (error) {
    console.error('Unable to generate student DOCX report:', error?.name || 'docx_error');
    return res.status(500).json({ message: 'The student report could not be generated. Please try again.' });
  }
});

module.exports = router;
