# Pre-School Management System

A React/Vite and Node.js/Express application backed by MongoDB for common preschool administration workflows.

## Main modules

- Administrator and teacher login, with JWT-based sessions and role-specific frontend routes
- Student and teacher records, including family/contact details and photo uploads
- Date- and class-based student attendance with absence reasons
- Fee records, payment history, discounts, and collection summaries
- Subject setup, assessment marks, report cards, printing, and spreadsheet exports
- School calendar, student/teacher birthdays, gallery, PDF/video learning resources
- Teacher daily-work reports and student report-document generation

## Requirements

- Node.js 20 or newer
- npm
- A running MongoDB instance or a MongoDB connection string

## Local setup

### 1. Start the API

```bash
cd backend
npm ci
```

Copy `.env.example` to `.env` and set at least:

- `MONGO_URI`: your MongoDB connection string
- `JWT_SECRET`: a long, random value that is kept private
- `PORT`: optional; defaults to `5000`
- `FRONTEND_ORIGIN`: your frontend origin; defaults to `http://localhost:5173`

To create the first administrator automatically, configure `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` together before the first start. Use a strong password. The bootstrap process skips creation if an administrator already exists. Remove these values from the runtime environment after initial setup.

Then run:

```bash
npm start
```

The API health endpoint is available at `http://localhost:5000/api/health`.

### 2. Start the frontend

In another terminal:

```bash
cd frontend
npm ci
```

Copy `.env.example` to `.env.local`. Set `VITE_API_BASE_URL` to the API origin, for example `http://localhost:5000`.

Then run:

```bash
npm run dev
```

Vite prints the local frontend URL after the development server starts.

## Validation

From `backend/`:

```bash
npm test
```

From `frontend/`:

```bash
npm run build
```

GitHub Actions also runs backend JavaScript syntax checks, backend unit tests, and a frontend production build on pushes to the maintenance branch and pull requests to `main`.

## Important deployment notes

- Keep `.env` files, JWT secrets, mail credentials, and real student data out of Git.
- Restrict MongoDB network access and create regular database/file-upload backups.
- Update `FRONTEND_ORIGIN` and `VITE_API_BASE_URL` for the production deployment.
- The backend protects administrative API groups by role. Uploaded media currently uses public static URLs so the frontend can render those files; review whether student/parent photos require authenticated media delivery for your school's privacy policy.
- Review the configured class fee schedule against the school's current approved fee policy before relying on fee balances.
- Test image/document uploads, email settings, backups, and account permissions in the actual hosting environment before production rollout.
