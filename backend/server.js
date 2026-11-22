'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { validateProductionConfig } = require('./utils/productionConfig');
const { requestSecurityHeaders, createRateLimiter } = require('./middleware/requestSecurity');
const { getHttpErrorResponse } = require('./utils/httpErrorResponse');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Trust only the explicitly configured number of reverse-proxy hops. Leaving
// this at zero is safest for direct connections; hosted deployments should set
// the exact hop count required by their known load balancer/proxy topology.
const trustProxyHopsText = String(process.env.TRUST_PROXY_HOPS || '0').trim();
if (!/^\d+$/.test(trustProxyHopsText) || Number(trustProxyHopsText) > 10) {
  throw new Error('TRUST_PROXY_HOPS must be a whole number between 0 and 10.');
}
app.set('trust proxy', Number(trustProxyHopsText));

const auth = require('./middleware/auth');
const adminOnly = require('./middleware/adminOnly');
const staffOnly = require('./middleware/staffOnly');
const legacySingleTenantOnly = require('./middleware/legacySingleTenantOnly');

const galleryRoutes = require('./routes/gallery');
const pdfRoutes = require('./routes/pdf');
const videoRoutes = require('./routes/video');
const feesRoutes = require('./routes/fees');
const adminOverviewRoutes = require('./routes/adminOverview');
const studentRoutes = require('./routes/student');
const studentDocumentsRoutes = require('./routes/studentDocuments');
const teacherRoutes = require('./routes/teacher');
const authRoutes = require('./routes/auth');
const dailyWorkReportRoutes = require('./routes/dailyWorkReport');
const userDetailsRoutes = require('./routes/userDetails');
const attendanceRoutes = require('./routes/attendance');
const reportCardRoutes = require('./routes/reportCard');
const reportDocxRoutes = require('./reportDocx');
const eventRoutes = require('./routes/calendar');
const teacherPortalCalendarRoutes = require('./routes/teacherPortalCalendar');
const announcementsRoutes = require('./routes/announcements');
const parentAccessRoutes = require('./routes/parentAccess');
const legacyParentPortalRoutes = require('./routes/legacyParentPortal');
const schoolEngagementRoutes = require('./routes/schoolEngagement');
const privateMediaRoutes = require('./routes/privateMedia');
const privateMediaResponse = require('./middleware/privateMediaResponse');
const subjectRoutes = require('./routes/subject');
const User = require('./models/User');
const { isValidNewPassword } = require('./utils/passwordResetTokens');
// Register the migration-run model at application boot so its unique idempotency index is provisioned with the SaaS schema.

app.disable('x-powered-by');
app.use(requestSecurityHeaders);

// These bounded per-process limits are a baseline defense for public
// credential/token endpoints. Production deployments must also enforce
// distributed limits at the reverse proxy, CDN or API gateway.
const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sign-in attempts. Please wait 15 minutes before trying again.',
});
const accountRegistrationRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many account-creation attempts. Please try again later.',
});
const passwordResetRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password recovery attempts. Please try again in an hour.',
});
// A school may have many families sharing one public IP (for example, a
// mobile carrier or campus network). Keep a broad IP ceiling and apply the
// stricter limit to each GR/email + phone combination instead of blocking
// every family behind the same NAT after five sign-ins.
const parentAccessIpRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 120,
  message: 'Too many parent sign-in requests from this network. Please try again later.',
});
const parentAccessIdentityRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many attempts for these family details. Please wait before trying again or contact the preschool office.',
  keyGenerator(req) {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase().slice(0, 254);
    const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
    const digest = crypto.createHash('sha256').update(JSON.stringify([identifier, phone])).digest('hex');
    const address = req.ip || req.socket?.remoteAddress || 'unknown';
    return String(address).slice(0, 128) + ':' + digest;
  },
});
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
    const error = new Error('Origin is not allowed by CORS.');
    error.code = 'CORS_ORIGIN_DENIED';
    return callback(error);
  },
}));

// Ensure upload folders exist regardless of the directory used to launch Node.
const uploadRoot = path.join(__dirname, 'uploads');
for (const directory of ['gallery', 'pdf', 'students', 'teachers', 'video']) {
  fs.mkdirSync(path.join(uploadRoot, directory), { recursive: true });
}

// Gallery, school photos, PDFs and video files are delivered through short-lived, authorization-checked links.

// Authentication and single-school parent access are the only public identity
// flows in this release. All management routes use the original school dataset.
app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth/register', accountRegistrationRateLimit);
app.use('/api/auth/forgot-password', passwordResetRateLimit);
app.use('/api/auth/reset-password', passwordResetRateLimit);
app.use('/api/auth', authRoutes);
app.use('/api/parent-access/activate', parentAccessIpRateLimit, parentAccessIdentityRateLimit);
app.use('/api/parent-access/login', parentAccessIpRateLimit, parentAccessIdentityRateLimit);
app.use('/api/parent-access', parentAccessRoutes);
app.use('/api/media', privateMediaRoutes);
app.use('/api/parent-portal', auth, legacySingleTenantOnly, legacyParentPortalRoutes);
app.use('/api/teacher-portal', auth, legacySingleTenantOnly, teacherPortalCalendarRoutes);
app.use('/api/school-engagement', auth, legacySingleTenantOnly, schoolEngagementRoutes);

// Multi-school APIs intentionally return a clear unavailable response in this
// release. Their implementation remains parked for a later product phase.
const saasUnavailable = (_req, res) => res.status(404).json({
  code: 'SAAS_NOT_AVAILABLE',
  message: 'This installation is configured for one preschool. Organization signup, invitations and multi-school workspaces are not available in this release.',
});
app.use(['/api/organizations', '/api/invitations', '/api/saas'], saasUnavailable);

// Teachers can submit and view their own work reports; administrative listing
// is separately protected inside the report router.
app.use('/api/dailyWorkReport', auth, legacySingleTenantOnly, staffOnly, dailyWorkReportRoutes);
app.use('/api/announcements', auth, legacySingleTenantOnly, announcementsRoutes);

// Legacy school-management APIs require an authenticated administrator. Local private media URLs are signed by the response middleware.
app.use('/api/gallery', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, galleryRoutes);
app.use('/api/pdfs', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, pdfRoutes);
app.use('/api/videos', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, videoRoutes);
app.use('/api/fees', auth, legacySingleTenantOnly, adminOnly, feesRoutes);
app.use('/api/admin/overview', auth, legacySingleTenantOnly, adminOnly, adminOverviewRoutes);
app.use('/api/students', auth, legacySingleTenantOnly, adminOnly, privateMediaResponse, studentRoutes);
app.use('/api/student-documents', auth, legacySingleTenantOnly, adminOnly, studentDocumentsRoutes);
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

// Readiness is distinct from liveness so a load balancer can stop routing
// database-backed requests when MongoDB is disconnected or still connecting.
app.get('/api/ready', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  return res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ready' : 'not_ready',
    database: databaseReady ? 'connected' : 'disconnected',
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (process.env.NODE_ENV !== 'production') {
    console.error('Request processing error:', error);
  }

  const response = getHttpErrorResponse(error);
  return res.status(response.status).json(response.body);
});

async function bootstrapAdminIfConfigured() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');

  if (!username && !email && !password) return;
  if (!username || !email || !password) {
    throw new Error('Set BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD together, or leave all three blank.');
  }
  if (!isValidNewPassword(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain 12 to 128 characters.');
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
  const productionConfigErrors = validateProductionConfig(process.env);
  if (productionConfigErrors.length) {
    throw new Error('Production configuration is unsafe: ' + productionConfigErrors.join(' '));
  }

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
