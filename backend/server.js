'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const auth = require('./middleware/auth');
const adminOnly = require('./middleware/adminOnly');
const staffOnly = require('./middleware/staffOnly');
const legacySingleTenantOnly = require('./middleware/legacySingleTenantOnly');

const galleryRoutes = require('./routes/gallery');
const pdfRoutes = require('./routes/pdf');
const videoRoutes = require('./routes/video');
const feesRoutes = require('./routes/fees');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const authRoutes = require('./routes/auth');
const dailyWorkReportRoutes = require('./routes/dailyWorkReport');
const userDetailsRoutes = require('./routes/userDetails');
const attendanceRoutes = require('./routes/attendance');
const reportCardRoutes = require('./routes/reportCard');
const reportDocxRoutes = require('./reportDocx');
const eventRoutes = require('./routes/calendar');
const announcementsRoutes = require('./routes/announcements');
const organizationsRoutes = require('./routes/organizations');
const tenantWorkspaceRoutes = require('./routes/tenantWorkspace');
const tenantSettingsRoutes = require('./routes/tenantSettings');
const tenantOperationsRoutes = require('./routes/tenantOperations');
const invitationsRoutes = require('./routes/invitations');
const publicInvitationsRoutes = require('./routes/publicInvitations');
const parentPortalRoutes = require('./routes/parentPortal');
const tenantPrivacyRequestsRoutes = require('./routes/tenantPrivacyRequests');
const tenantAnnouncementRoutes = require('./routes/tenantAnnouncements');
const tenantCalendarRoutes = require('./routes/tenantCalendar');
const tenantHandoverRoutes = require('./routes/tenantHandover');
const tenantWorkReportsRoutes = require('./routes/tenantWorkReports');
const privateMediaRoutes = require('./routes/privateMedia');
const tenantMediaRoutes = require('./routes/tenantMedia');
const privateMediaResponse = require('./middleware/privateMediaResponse');
const subjectRoutes = require('./routes/subject');
const User = require('./models/User');
// Register the migration-run model at application boot so its unique idempotency index is provisioned with the SaaS schema.
const LegacyMigrationRun = require('./models/LegacyMigrationRun');
const TenantStaffProfile = require('./models/TenantStaffProfile');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const allowedOrigins = String(process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS.'));
  },
}));

// Ensure upload folders exist regardless of the directory used to launch Node.
const uploadRoot = path.join(__dirname, 'uploads');
for (const directory of ['gallery', 'pdf', 'students', 'teachers', 'video']) {
  fs.mkdirSync(path.join(uploadRoot, directory), { recursive: true });
}

// Gallery, school photos, PDFs and video files are delivered through short-lived, authorization-checked links.

// Authentication endpoints must remain reachable before a session exists.
app.use('/api/auth', authRoutes);
app.use('/api/media', privateMediaRoutes);
app.use('/api/saas/media', auth, tenantMediaRoutes);

// Organization registration and membership discovery are separate from the
// single-school APIs. Public registration has two explicit readiness gates.
app.use('/api/organizations', organizationsRoutes);
app.use('/api/invitations', publicInvitationsRoutes);
app.use('/api/saas/invitations', auth, invitationsRoutes);
app.use('/api/saas/parent', auth, parentPortalRoutes);
app.use('/api/saas/privacy-requests', auth, tenantPrivacyRequestsRoutes);
app.use('/api/saas/notices', auth, tenantAnnouncementRoutes);
app.use('/api/saas/calendar', auth, tenantCalendarRoutes);
app.use('/api/saas/handover', auth, tenantHandoverRoutes);
app.use('/api/saas/work-reports', auth, tenantWorkReportsRoutes);
app.use('/api/saas/operations', auth, tenantOperationsRoutes);
app.use('/api/saas', auth, tenantWorkspaceRoutes);
app.use('/api/saas/settings', auth, tenantSettingsRoutes);

// Teachers can submit and view their own work reports; administrative listing
// is separately protected inside the report router.
app.use('/api/dailyWorkReport', auth, legacySingleTenantOnly, dailyWorkReportRoutes);
app.use('/api/announcements', auth, legacySingleTenantOnly, staffOnly, announcementsRoutes);

// Legacy school-management APIs require an authenticated administrator. Local private media URLs are signed by the response middleware.
app.use('/api/gallery', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, galleryRoutes);
app.use('/api/pdfs', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, pdfRoutes);
app.use('/api/videos', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, videoRoutes);
app.use('/api/fees', auth, legacySingleTenantOnly, adminOnly, feesRoutes);
app.use('/api/students', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, studentRoutes);
app.use('/api/teachers', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, teacherRoutes);
app.use('/api/userDetailsself', auth, legacySingleTenantOnly, adminOnly, userDetailsRoutes);
app.use('/api/reportCard', auth, legacySingleTenantOnly, adminOnly, reportCardRoutes);
app.use('/api/subjects', auth, legacySingleTenantOnly, adminOnly, subjectRoutes);
app.use('/api/docx', auth, legacySingleTenantOnly, adminOnly, reportDocxRoutes);
app.use('/api/events', auth, legacySingleTenantOnly, adminOnly, eventRoutes);
app.use('/api/attendance', auth, legacySingleTenantOnly, staffOnly, attendanceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const isUploadLimit = typeof error.code === 'string' && error.code.startsWith('LIMIT_');
  const status = isUploadLimit ? 413 : 400;
  if (process.env.NODE_ENV !== 'production') {
    console.error('Request processing error:', error);
  }

  return res.status(status).json({
    message: isUploadLimit
      ? 'The uploaded file is too large or exceeds the allowed upload limit.'
      : (error.message || 'The request could not be processed.'),
  });
});

async function bootstrapAdminIfConfigured() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');

  if (!username && !email && !password) return;
  if (!username || !email || !password) {
    throw new Error('Set BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD together, or leave all three blank.');
  }
  if (password.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 8 characters.');
  }

  const existingAdmin = await User.findOne({ role: 'admin' }).select('_id');
  if (existingAdmin) {
    console.log('Bootstrap admin skipped because an administrator already exists.');
    return;
  }

  const existingEmail = await User.findOne({ email }).select('_id');
  if (existingEmail) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL already belongs to a non-admin account.');
  }

  await User.create({ username, email, password, role: 'admin' });
  console.log('Bootstrap administrator account created.');
}

async function startServer() {
  const missing = ['MONGO_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. Configure backend/.env.`);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await bootstrapAdminIfConfigured();
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => {
    console.log(`Pre-School API listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start the Pre-School API:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
