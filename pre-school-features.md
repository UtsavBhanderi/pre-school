---
title: "Pre-School Management System"
subtitle: "Project Features and Technical Overview"
author: "Project Documentation"
date: "11 October 2026"
output:
  html_document:
    toc: true
    toc_depth: 3
    number_sections: true
    theme: readable
---

# Project Overview

The Pre-School Management System is a web-based administrative application intended to centralize day-to-day preschool operations. The repository contains a React frontend and a Node.js/Express backend backed by MongoDB. The application provides separate administration and teacher workflows for maintaining student and staff records, recording attendance, tracking fees, preparing academic reports, maintaining a school calendar, and managing learning resources.

This document describes functionality visible in the current source code. It is a feature inventory, not a claim that every workflow has been end-to-end tested in a production environment.

# Key Features

## 1. Login, Authentication, and Role-Based Screens

- User registration and login endpoints are available.
- Passwords are hashed using bcrypt before storage and checked during login.
- Successful login issues a JSON Web Token (JWT); the token is configured to expire after one hour.
- The frontend stores the token in local storage and requests the current user's information from the authenticated profile endpoint.
- Frontend route guards restrict the administration dashboard to the admin role and the teacher dashboard to the teacher role.
- A logout action clears the saved token and current-user state.

**Current scope note:** The user model permits teacher, admin, and student roles, but the visible route configuration provides dashboard routes for administrators and teachers only. Several backend CRUD routes do not visibly apply authentication middleware, so frontend route guards alone should not be treated as complete API authorization.

## 2. Student Registration and Student Records

The student-registration module supports creating, viewing, editing, filtering, and deleting student records.

The registration form and student model include fields for:

- Student name, gender, date of birth, blood group, religion, caste, nationality, mother tongue, and address.
- Class/standard, admission batch year, and generated GR/student number.
- Student, mother, and father photographs.
- Parent/guardian contact details, email, occupation, education, designation, and other family information.
- Previous-school information and sibling details.
- Student-related notes, including a field for a student problem or special concern.

Additional workflow features include:

- Automatic generation of a student number using the admission year's two-digit suffix, initials, and a sequence number.
- Automatic setting of the admission batch year for a new student.
- Class, name, phone-number, and GR-number filters.
- Multi-select and select-all interactions for filtered student rows.
- Excel export functionality for student data.
- A student profile view that brings together the student's record, fee information, payment history, and report-card data.
- Uploading and serving student photographs through the backend's uploads directory.

## 3. Teacher Registration and Staff Records

The teacher-registration module provides record creation, listing, editing, and deletion for teachers. The teacher form supports personal and contact information, class/standard-related information, and photo uploads, including a teacher photo and parent photographs where supplied by the form.

Teacher records can be listed and filtered in the frontend. The backend uses a dedicated Teacher model and upload path for teacher images.

## 4. Attendance Management

Attendance is managed through separate entry and review screens.

- Attendance can be entered for a selected date and class/standard.
- Students in the selected class are loaded from the student database.
- Each student can be marked present or absent.
- A reason is required when a student is marked absent; the frontend validates this before submission and the API repeats the check.
- Attendance is saved as a dated record containing each student's status and, where relevant, absence reason.
- Attendance records can be reviewed with filters for date, class/standard, student name, GR number, and attendance status.
- A student's status and absence reason can be edited on an existing attendance record.
- Present/absent totals are calculated for the displayed data.
- Student-specific attendance records can also be retrieved through the backend.

## 5. Fee Management and Collection Overview

The fee-management screen supports fee records, payment entries, and administrative updates.

- Fee records include student details, class/standard, batch year, standard fee, amount paid, discount, remaining balance, and a list of payment details.
- A payment entry stores an amount and date/time information.
- Fee records can be created, edited, and deleted.
- The standard fee can be populated from a class-based fee table in the frontend.
- A collection overview displays aggregate totals and standard-wise summaries.
- Collection data can be examined by date, with student-level details shown from the summary.
- Backend endpoints calculate fee collection aggregates, including date-based and monthly collection summaries.
- The fee update code contains an email-notification workflow that uses environment-based Gmail credentials and an HTML template.

**Important implementation note:** The fee values in the frontend fee form differ from the fee values defined in the backend student model's automatic fee-record creation logic. These two schedules should be reconciled before financial totals are relied on. The code also contains an SMS automation helper, but the SMS calls visible in the fee-update workflow are commented out; automatic SMS delivery should not be assumed to be active.

## 6. Academic Reports, Marks, and Report Cards

The academic-report module allows administrators to create and maintain report definitions for a particular standard.

- A report can have a name, standard, and maximum-marks/description value.
- When a report is created, the backend associates it with students of the selected standard.
- The student report screen loads students and the subjects configured for their standard.
- Marks and assessment dates can be entered for each subject and saved against the selected student and report.
- The backend stores subject-level marks and computes total marks, percentage, and grade.
- Saved marks can be retrieved for editing and displayed in a report-card layout.
- A print view is available for report cards and can be used with the browser's print/save-to-PDF functionality.
- Report/student data can be exported to Excel.

## 7. Subject Configuration

The backend includes subject endpoints that retrieve subjects by standard and create subject records. This supports showing the appropriate subject list when entering marks for a class.

## 8. School Calendar and Events

The calendar screen uses FullCalendar with day-grid, time-grid, and interaction support.

- Events can be viewed on a calendar.
- Selecting a date opens a form for a new event.
- Existing events can be opened for editing.
- Event data includes a title, start/end dates, and display color.
- Events can be created, updated, and deleted through the backend and stored in MongoDB.

## 9. Student and Teacher Birthday Lists

Dedicated student and teacher birthday screens are included in the application. The backend exposes birthday-list endpoints for both student and teacher records, allowing the frontend to retrieve records used by these screens.

## 10. PDF Learning Resources

The PDF administration screen manages learning documents.

- A PDF/resource can be represented by an external URL or an uploaded file.
- Resource metadata includes title, standard, subject, and chapter.
- Existing resources can be listed, filtered, edited, and deleted.
- Uploaded documents are stored under the backend PDF uploads directory and made available through static file serving.

## 11. Video Learning Resources

The video administration screen follows a similar resource-management workflow.

- Videos can be linked through a URL or uploaded as files.
- Metadata includes title, standard, subject, and chapter.
- The listing supports filtering by title, standard, subject, and chapter.
- Video records can be created, edited, and deleted.
- Uploaded video files are stored under the backend video uploads directory.

## 12. Photo Gallery Management

The gallery dashboard supports management of school photos.

- Administrators can upload a photo with a title, description, and sequence value.
- Photo records can be viewed, edited, and deleted.
- The gallery controller sorts photos by sequence.
- The backend provides an endpoint to update an individual photo's sequence, supporting ordering of gallery items.
- Uploaded gallery images are served from the gallery uploads directory.

## 13. Teacher Daily Work Reports

Teachers can submit daily work reports through the teacher dashboard.

A report can record time-in, time-out, subject, standard, branch, a written description of the day's work, and total students. The authenticated report endpoint associates submitted reports with the logged-in user; teachers can retrieve their own reports. A separate listing endpoint supplies work reports to the administrative view.

## 14. Student Profile Documents

The backend includes a document-generation route for producing a DOCX report for a selected student and report. This connects student/report data with a downloadable document workflow. The frontend also contains a DOCX template file in its public assets.

## 15. Administration Dashboard and Navigation

The administration layout provides navigation to the major operational modules, including:

- Fee overview and fee management.
- Attendance overview and attendance entry.
- Student and teacher registration.
- Student and teacher birthdays.
- Calendar/events.
- PDF and video resources.
- Gallery management.
- Report creation, student marks, and report cards.
- Teacher work reports.
- User administration.

The teacher dashboard provides the daily-work-report workflow. Protected frontend routes redirect users without a valid session or the required role to the login page.

# Technical Architecture

## Frontend

The frontend is a single-page application built with React 18 and Vite.

Key libraries visible in the frontend package include:

- React Router for page navigation and protected routes.
- Axios for HTTP requests to the backend.
- Bootstrap 5 and React-Bootstrap for responsive UI and modal/form elements.
- FullCalendar for school events.
- React Icons for interface icons.
- SheetJS (xlsx) and FileSaver for spreadsheet/export workflows.
- Docxtemplater and PizZip for working with Word document templates.

## Backend

The backend uses Node.js with Express. It exposes REST-style routes and uses Mongoose to read and write MongoDB records.

Key backend libraries and mechanisms include:

- Mongoose models for application data.
- JWT authentication and bcrypt password hashing.
- Multer for photo, PDF, and video uploads.
- Express static routes for serving uploaded files.
- Nodemailer for email sending.
- Puppeteer-based browser automation code for an SMS helper.
- A DOCX document-generation module.

## Main Data Models

| Model | Purpose |
|---|---|
| Student | Student identity, contact/family data, photographs, standard, and marks |
| Teacher | Teacher/staff details and photographs |
| User | Login credentials and user role |
| Fee | Standard fee, paid amount, discount, remaining balance, and payment history |
| Attendance | Date-wise attendance and student status/reason |
| ReportCard | Report definition and associated students |
| Subject | Subjects associated with a standard |
| Calendar | Calendar events |
| Photo | Gallery photo metadata and display sequence |
| Video | Video metadata and uploaded-file/external-URL details |
| Pdf | PDF/learning-resource metadata and uploaded-file/external-URL details |
| DailyWorkReport | Teacher's time-in/time-out and daily-work details |
| Sequence | Year-wise sequence used when generating student numbers |

# Typical Workflows

## Student admission

1. An administrator opens student registration.
2. Student, family, class, and photograph details are entered.
3. The backend generates a student number and batch year and stores the student record.
4. The student model's save hook attempts to initialize a corresponding fee record.

## Daily attendance

1. An administrator selects a date and standard.
2. The student list for that standard is loaded.
3. Students are marked present or absent; an absence reason must be supplied.
4. The attendance record is saved and can later be filtered or corrected.

## Assessment and report cards

1. An administrator creates a report for a standard.
2. Subject rows are loaded for that class.
3. Marks and assessment dates are entered and saved for individual students.
4. Totals, percentages, and grades are stored and shown in the report-card view, which can be printed or exported.

## Fee collection review

1. Fee records and payment details are maintained.
2. The overview aggregates amounts by standard/time period.
3. Administrators can inspect date-specific collections and student-level details.

# Configuration and Readiness Notes

The following items should be reviewed before deployment or before treating this as a production-ready system.

1. **API base URL:** Several frontend components use a hard-coded localhost API address. Configure the API base URL through environment-specific configuration so a deployed frontend calls the deployed backend.
2. **Backend authorization:** The frontend protects dashboard routes, but role checks should also be enforced on every sensitive backend endpoint. In the visible source, some route groups do not apply authentication middleware consistently.
3. **Fee schedule consistency:** Reconcile class-based fee values in the frontend and backend to prevent student fee records and collection views from disagreeing.
4. **Uploads and persistence:** Ensure the student, teacher, gallery, PDF, and video upload directories exist, are writable, and are backed up. Confirm uploaded files are persisted correctly in the hosting environment.
5. **Email setup:** Configure EMAIL_USER and EMAIL_PASS securely and verify that the expected HTML email template is available before relying on fee email alerts.
6. **SMS dependency:** The SMS helper uses browser automation and a machine-specific Chrome executable path. The current update workflow has SMS calls commented out, so this needs deliberate configuration and testing if SMS is required.
7. **Input validation and errors:** Add consistent server-side field validation, upload type/size limits, and predictable API error responses across the modules.
8. **Credential and deletion controls:** Do not rely on client-side prompts or hidden UI controls as security boundaries. Enforce permissions on the server and store secrets only in environment variables.
9. **End-to-end testing:** Test admission, automatic fee initialization, fee updates, attendance validation, mark calculations, report exports, file uploads, and role-restricted access with representative records before production use.

# Project Scope Summary

The current source describes a preschool administration system covering the core operational areas of student and teacher records, attendance, fee tracking, assessment/report cards, calendar events, birthdays, learning materials, gallery content, and teacher work reporting. The React frontend presents role-specific administrative screens, while the Express/MongoDB backend supplies data and file-management endpoints.

The most important next step for a reliable deployment is to standardize configuration, reconcile fee schedules, and apply consistent server-side authorization and validation across the APIs.
