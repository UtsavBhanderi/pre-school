# Preschool Management System

A single-preschool management application built with React, Vite, Bootstrap, Node.js, Express and MongoDB.

This release is deliberately for **one preschool using one school-wide dataset**. It does not expose organization signup, branch switching, staff/parent invitations or multi-school SaaS workspaces. Those capabilities are a later product phase and must not be enabled in this release.

## What the school can manage

- Administrator and teacher accounts, with role-based access.
- Student admission records, parent contacts and student photos.
- Daily attendance and attendance history.
- Fee records, payments, discounts, collection summaries and receipts.
- Teacher records and teacher work reports.
- Subjects, assessments, report cards and printable student reports.
- School calendar, events, holidays and birthdays.
- Worksheets, PDFs, learning videos and school photo gallery.
- School notices and family engagement: homework, parent messages/complaints and polls.
- A mobile-friendly parent portal showing only children linked to the authenticated family account.

Parents do not register or need an invitation. They use the school's one shared parent portal link and sign in with the child's GR/admission number (or registered parent email) plus the mobile number saved in the school record. Teachers are added manually by the administrator and sign in with their email and password.

## Technology requirements

- Node.js 22 or newer (Node.js 24 recommended)
- npm
- MongoDB
- A modern browser

## Local setup

### 1. Configure and start the backend

```bash
cd backend
npm ci
```

Copy `.env.example` to `.env` and set:

- `MONGO_URI`: MongoDB connection string for this preschool's database.
- `JWT_SECRET`: a strong, private random secret.
- `SINGLE_SCHOOL_NAME`: the name shown on the parent portal.
- `FRONTEND_ORIGIN`: allowed frontend origin.
- `FRONTEND_URL`: public frontend origin used to generate the parent portal link.
- `API_PUBLIC_URL`: canonical public API origin for signed private media links.
- `PRIVATE_MEDIA_SECRET`: a separate strong random secret for short-lived private media links.

Set `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` together before the first start to create the first administrator. Use a strong password. The bootstrap step skips account creation if an administrator already exists; remove these bootstrap values after the initial setup.

Password recovery email requires SMTP configuration in production: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_USER`, `EMAIL_PASS` and `EMAIL_FROM`. Organization verification and invitation emails are not part of this release.

Start the API:

```bash
npm start
```

The health endpoint is `http://localhost:5000/api/health`.

### 2. Configure and start the frontend

Open another terminal:

```bash
cd frontend
npm ci
```

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL=http://localhost:5000` when the API runs separately.

Start Vite:

```bash
npm run dev
```

### 3. First school setup

1. Sign in using the administrator account.
2. Add the school's student records and class/standard information.
3. Add teacher profiles and create teacher login accounts from **User access**.
4. Review the school fee structure and record payments against the correct student.
5. Share the parent portal link from **User access**. The same link is used by every family; parent accounts are created automatically after the GR/email and registered mobile match the school record.
6. Publish notices, homework and polls from the school communication screens.

The parent access link is generated from `SINGLE_SCHOOL_NAME` and `FRONTEND_URL`. Read [the single-school parent portal guide](docs/SINGLE_SCHOOL_PARENT_PORTAL.md) for the exact matching fields and account-management behavior.

## Security and data handling

- Keep environment files, credentials, JWT secrets, mail passwords and real student data out of Git.
- Use HTTPS in production and restrict database network access to the backend.
- Keep private media links and their signing secret protected; do not expose the uploads directory as a public static folder.
- Back up both MongoDB data and uploaded files, and rehearse restores before relying on the system for school operations.
- Parent access matches the mobile number against the school record, but does not prove current possession of that phone. This release does not send SMS OTP codes.
- The runtime refuses mixed organization/branch data rather than attempting to combine it with the school-wide collections. Do not delete organization records to bypass this check; take a backup and arrange a reviewed data reconciliation first.

## Tests

From `backend/`:

```bash
npm test
npm run test:integration
```

The active integration command runs the single-school parent, teacher and engagement workflows. It uses disposable databases; never point it at live school data.

From `frontend/`:

```bash
npm run build
```

GitHub Actions also runs browser smoke tests for staff sign-in, the parent sign-in screen, the single-school family portal and mobile layout.

## Current product boundary

The active app has one preschool, one shared school dataset and no branch or organization selector. SaaS and multi-tenant implementation files remain parked in the repository for a future, separately reviewed phase; they are not mounted by the current backend or exposed by the frontend.
