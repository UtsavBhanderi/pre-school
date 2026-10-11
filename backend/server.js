const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const galleryRoutes = require('./routes/gallery');
const pdfRoutes = require('./routes/pdf');
const videoRoutes = require('./routes/video');
const feesRoutes = require('./routes/fees');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const authRoutes = require('./routes/auth');
const dailyWorkReportRoutes = require('./routes/dailyWorkReport')
const UserDetailRoutes = require('./routes/userDetails')
const attendance = require('./routes/attendance')
const ReportCard = require('./routes/reportCard')
const reportDocx = require('./reportDocx')

const eventRoutes = require('./routes/calendar');

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const subject = require('./routes/subject');



dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api/auth', authRoutes); // Use the auth routes
app.use('/api/dailyWorkReport', dailyWorkReportRoutes);

app.use('/uploads/gallery', express.static('uploads/gallery'));
app.use('/uploads/pdf', express.static(path.join(__dirname, 'uploads/pdf')));
app.use('/uploads/students', express.static('uploads/students'));
app.use('/uploads/teachers', express.static('uploads/teachers'));
app.use('/uploads/video', express.static(path.join(__dirname, 'uploads/video')));
app.use('/api/gallery', galleryRoutes);
app.use('/api/pdfs', pdfRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/userDetailsself', UserDetailRoutes);
app.use('/api/reportCard', ReportCard);
app.use('/api/subjects', subject);
app.use('/api/docx', reportDocx);
app.use('/api/events', eventRoutes);
app.use('/api/attendance', attendance);

mongoose.connect(process.env.MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
}).then(() => {
  app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
}).catch((err) => console.error(err));
