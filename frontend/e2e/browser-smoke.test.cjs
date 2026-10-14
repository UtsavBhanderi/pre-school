'use strict';

const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightModule);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4179';

let viteProcess;
let browser;

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (viteProcess?.exitCode !== null && viteProcess?.exitCode !== undefined) {
      throw new Error('Vite exited before it became ready (exit code ' + viteProcess.exitCode + ').');
    }
    try {
      const response = await fetch(BASE_URL + '/login');
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Frontend did not become ready at ' + BASE_URL + '. ' + (lastError?.message || ''));
}

before(async () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  viteProcess = spawn(npm, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4179', '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: { ...process.env, BROWSER: 'none' },
  });
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (viteProcess && viteProcess.exitCode === null) {
    viteProcess.kill('SIGTERM');
    await Promise.race([
      once(viteProcess, 'exit').catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    if (viteProcess.exitCode === null) viteProcess.kill('SIGKILL');
  }
});

async function mockSchoolApi(page, { rejectLogin = false } = {}) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let status = 200;
    let body = {};

    if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
      const credentials = request.postDataJSON();
      if (rejectLogin || credentials.email === 'wrong@school.com') {
        status = 401;
        body = { message: 'Invalid email or password.' };
      } else {
        body = { token: 'browser-smoke-token' };
      }
    } else if (url.pathname === '/api/auth/me' && request.method() === 'GET') {
      body = {
        user: {
          id: 'browser-smoke-admin',
          username: 'Demo Admin',
          email: 'admin@example.com',
          role: 'admin',
          memberships: [],
        },
      };
    } else if (url.pathname === '/api/students') {
      body = [];
    } else if (url.pathname === '/api/attendance/attendances') {
      body = [];
    } else if (url.pathname === '/api/fees/fees-collection-data') {
      body = { today: { totalPaid: 0 }, standardWise: [] };
    } else if (url.pathname === '/api/announcements') {
      body = [];
    }

    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  });
}

test('login form exposes labels and the password visibility control works', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/login');

  const email = page.getByRole('textbox', { name: 'Email address' });
  const password = page.locator('#login-password');
  const toggle = page.getByRole('button', { name: 'Show password' });

  assert.equal(await email.count(), 1);
  assert.equal(await password.getAttribute('type'), 'password');
  await toggle.click();
  assert.equal(await password.getAttribute('type'), 'text');
  assert.equal(await page.getByRole('button', { name: 'Hide password' }).count(), 1);
  await page.getByRole('button', { name: 'Hide password' }).click();
  assert.equal(await password.getAttribute('type'), 'password');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    'Login page should not overflow horizontally on a 390px mobile viewport: ' + JSON.stringify(dimensions),
  );
  await page.close();
});

test('invalid credentials show a readable error and keep the user on login', async () => {
  const page = await browser.newPage();
  await mockSchoolApi(page, { rejectLogin: true });
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('wrong@school.com');
  await page.locator('#login-password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  await page.getByRole('alert').getByText('Invalid email or password.').waitFor();
  assert.match(page.url(), /\/login$/);
  await page.close();
});

test('successful administrator login reaches the task-first dashboard', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  await page.waitForURL(/\/dashboard\/home$/);
  await page.getByRole('heading', { name: /Demo Admin/ }).waitFor();
  await page.getByRole('heading', { name: 'Common tasks' }).waitFor();
  assert.match(page.url(), /\/dashboard\/home$/);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    'The dashboard should not overflow horizontally on a 390px mobile viewport: ' + JSON.stringify(dimensions),
  );
  await page.close();
});


async function mockTenantApi(page) {
  let savedChildren = [];
  let savedAttendance = [];
  let savedInvoices = [];
  let scopedChildCreateSeen = false;
  let scopedAttendanceSaveSeen = false;
  let scopedInvoiceCreateSeen = false;
  let scopedPaymentSeen = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let status = 200;
    let body = {};

    if (path === '/api/auth/login' && request.method() === 'POST') {
      body = { token: 'browser-smoke-tenant-token' };
    } else if (path === '/api/auth/me' && request.method() === 'GET') {
      body = {
        user: {
          id: 'owner-user-1',
          username: 'School Owner',
          email: 'owner@example.com',
          role: 'admin',
          memberships: [{
            id: 'membership-1',
            organization: {
              id: 'org-1',
              name: 'Little Stars Preschool',
              slug: 'little-stars-abc123',
              timezone: 'Asia/Kolkata',
              locale: 'en-IN',
              currency: 'INR',
              status: 'active',
              subscription: { plan: 'growth', status: 'active' },
            },
            role: 'organization_owner',
            status: 'active',
            branchIds: [{
              id: 'branch-1',
              name: 'Main Branch',
              code: 'MAIN',
              status: 'active',
              timezone: 'Asia/Kolkata',
            }],
            accessAllBranches: true,
          }],
        },
      };
    } else if (path === '/api/saas/branches') {
      body = [{
        _id: 'branch-1',
        id: 'branch-1',
        name: 'Main Branch',
        code: 'MAIN',
        status: 'active',
        timezone: 'Asia/Kolkata',
        address: { city: 'Surat', state: 'Gujarat', postalCode: '395001', country: 'India' },
      }];
    } else if (path === '/api/saas/operations/summary') {
      body = {
        organization: { id: 'org-1', name: 'Little Stars Preschool' },
        branch: url.searchParams.get('branchId') ? { id: 'branch-1', name: 'Main Branch' } : null,
        date: '2026-10-14',
        branchCount: 1,
        children: { total: savedChildren.length, addedToday: savedChildren.length },
        attendance: {
          present: savedAttendance.flatMap((record) => record.children || []).filter((child) => child.status === 'present').length,
          absent: savedAttendance.flatMap((record) => record.children || []).filter((child) => child.status === 'absent').length,
          recorded: savedAttendance.flatMap((record) => record.children || []).length,
        },
        fees: {
          collectedTodayPaise: 0,
          collectedToday: 0,
          outstandingPaise: savedInvoices.reduce((sum, invoice) => sum + invoice.outstandingPaise, 0),
          outstanding: savedInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
          currency: 'INR',
        },
      };
    } else if (path === '/api/saas/operations/classes') {
      body = [{
        id: 'class-1',
        name: 'Play Group',
        code: 'PG',
        status: 'active',
        defaultFee: 15000,
        feeFrequency: 'annual',
        minAgeMonths: 18,
        maxAgeMonths: 36,
        capacity: 25,
        description: 'First preschool classroom',
      }];
    } else if (path === '/api/saas/operations/children' && request.method() === 'POST') {
      const headers = request.headers();
      scopedChildCreateSeen =
        headers['x-organization-id'] === 'org-1' &&
        headers['x-branch-id'] === 'branch-1';
      const input = request.postDataJSON();
      const guardian = input.guardians?.[0] || {};
      const child = {
        id: 'child-1',
        admissionNumber: 'STU-MAIN-2026-00001',
        firstName: input.firstName || 'Aarav',
        middleName: input.middleName || '',
        lastName: input.lastName || 'Patel',
        fullName: [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' '),
        dateOfBirth: input.dateOfBirth || '',
        gender: input.gender || '',
        className: input.className || 'Play Group',
        academicYear: input.academicYear || '2026-2027',
        address: input.address || '',
        guardians: [{
          id: 'guardian-1',
          name: guardian.name || 'Disha Patel',
          email: guardian.email || '',
          phone: guardian.phone || '+91 98765 43210',
          relationship: guardian.relationship || 'mother',
          primaryContact: true,
          billingContact: guardian.isBillingContact !== false,
          emergencyContact: guardian.isEmergencyContact !== false,
          authorizedPickup: guardian.authorizedPickup !== false,
          receivesSchoolUpdates: guardian.receivesSchoolUpdates !== false,
        }],
        createdAt: '2026-10-14T09:00:00.000Z',
        updatedAt: '2026-10-14T09:00:00.000Z',
      };
      savedChildren = [child];
      body = { message: 'Child registered successfully.', child };
      status = 201;
    } else if (path === '/api/saas/operations/children' && request.method() === 'GET') {
      body = { total: savedChildren.length, children: savedChildren };
    } else if (path === '/api/saas/operations/attendance' && request.method() === 'GET') {
      const date = url.searchParams.get('date');
      const className = url.searchParams.get('className');
      body = savedAttendance.filter((record) =>
        (!date || record.date === date) && (!className || record.className === className)
      );
    } else if (path === '/api/saas/operations/attendance' && request.method() === 'POST') {
      const headers = request.headers();
      scopedAttendanceSaveSeen =
        headers['x-organization-id'] === 'org-1' &&
        headers['x-branch-id'] === 'branch-1';
      const input = request.postDataJSON();
      const children = (input.children || []).map((entry) => {
        const child = savedChildren.find((item) => item.id === entry.childId);
        return {
          id: entry.childId,
          name: child?.fullName || 'Unknown child',
          admissionNumber: child?.admissionNumber || '',
          status: entry.status,
          reason: entry.reason || '',
        };
      });
      const record = {
        id: 'attendance-1',
        date: input.date,
        className: input.className,
        updatedAt: '2026-10-14T09:05:00.000Z',
        children,
      };
      savedAttendance = [record];
      body = {
        message: 'Attendance saved.',
        recordId: record.id,
        date: input.date,
        className: input.className,
        total: children.length,
        present: children.filter((item) => item.status === 'present').length,
        absent: children.filter((item) => item.status === 'absent').length,
      };
    } else if (path === '/api/saas/operations/fees/invoices' && request.method() === 'GET') {
      body = { total: savedInvoices.length, invoices: savedInvoices };
    } else if (path === '/api/saas/operations/fees/invoices' && request.method() === 'POST') {
      const headers = request.headers();
      scopedInvoiceCreateSeen =
        headers['x-organization-id'] === 'org-1' &&
        headers['x-branch-id'] === 'branch-1';
      const input = request.postDataJSON();
      const child = savedChildren.find((item) => item.id === input.childId);
      const lineInput = input.lineItems?.[0] || {};
      const quantity = Number(lineInput.quantity || 1);
      const unitAmountPaise = Math.round(Number(lineInput.unitAmount || 0) * 100);
      const lineTotalPaise = quantity * unitAmountPaise;
      const subtotalPaise = lineTotalPaise;
      const discountPaise = Math.round(Number(input.discount || 0) * 100);
      const totalAmountPaise = subtotalPaise - discountPaise;
      const invoice = {
        id: 'invoice-1',
        invoiceNumber: 'INV-MAIN-2026-000001',
        academicYear: input.academicYear,
        child: child ? {
          id: child.id,
          name: child.fullName,
          admissionNumber: child.admissionNumber,
          className: child.className,
        } : null,
        lineItems: [{
          description: lineInput.description,
          quantity,
          unitAmountPaise,
          unitAmount: unitAmountPaise / 100,
          lineTotalPaise,
          lineTotal: lineTotalPaise / 100,
        }],
        subtotalPaise,
        subtotal: subtotalPaise / 100,
        discountPaise,
        discount: discountPaise / 100,
        totalAmountPaise,
        totalAmount: totalAmountPaise / 100,
        paidPaise: 0,
        paid: 0,
        outstandingPaise: totalAmountPaise,
        outstanding: totalAmountPaise / 100,
        overpaidPaise: 0,
        status: 'open',
        dueDate: input.dueDate || '',
        notes: input.notes || '',
        transactions: [],
        createdAt: '2026-10-14T09:10:00.000Z',
      };
      savedInvoices = [invoice];
      body = { message: 'Invoice created.', invoice };
      status = 201;
    } else if (/^\/api\/saas\/operations\/fees\/invoices\/[^/]+\/transactions$/.test(path) && request.method() === 'POST') {
      const headers = request.headers();
      scopedPaymentSeen =
        headers['x-organization-id'] === 'org-1' &&
        headers['x-branch-id'] === 'branch-1';
      const input = request.postDataJSON();
      const invoice = savedInvoices.find((item) => path.includes(item.id));
      if (!invoice) {
        status = 404;
        body = { message: 'Invoice not found.' };
      } else {
        const amount = Number(input.amount || 0);
        const amountPaise = Math.round(amount * 100);
        const transaction = {
          id: 'transaction-1',
          receiptNumber: 'REC-MAIN-2026-000001',
          type: input.type || 'payment',
          amountPaise,
          amount,
          method: input.method || 'cash',
          reference: input.reference || '',
          transactionAt: '2026-10-14T09:15:00.000Z',
          relatedTransactionId: null,
          reason: '',
        };
        invoice.transactions.push(transaction);
        invoice.paidPaise += amountPaise;
        invoice.paid = invoice.paidPaise / 100;
        invoice.outstandingPaise = Math.max(0, invoice.totalAmountPaise - invoice.paidPaise);
        invoice.outstanding = invoice.outstandingPaise / 100;
        body = { message: 'Payment recorded.', transaction, invoice };
        status = 201;
      }
    } else if (path === '/api/saas/media') {
      body = { assets: [] };
    } else if (path === '/api/saas/context') {
      body = {
        organization: { id: 'org-1', name: 'Little Stars Preschool', currency: 'INR', status: 'active' },
        membership: { role: 'organization_owner', status: 'active', accessAllBranches: true, branchIds: ['branch-1'] },
        branch: null,
      };
    }

    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  });

  return {
    hasScopedChildCreate: () => scopedChildCreateSeen,
    hasScopedAttendanceSave: () => scopedAttendanceSaveSeen,
    hasScopedInvoiceCreate: () => scopedInvoiceCreateSeen,
    hasScopedPayment: () => scopedPaymentSeen,
  };
}

test('organization owner can enter the tenant workspace and register a child in the selected branch', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const tenantApi = await mockTenantApi(page);

  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('owner@example.com');
  await page.locator('#login-password').fill('a-test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  // Tenant members render the SaaS workspace from LayoutAdmin at /dashboard.
  try {
    await page.locator('.saas-workspace').waitFor({ state: 'attached', timeout: 15000 });
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error('Tenant workspace did not mount. URL=' + page.url() +
      '; body=' + bodyText.slice(0, 2500) +
      '; browser errors=' + JSON.stringify(browserErrors) +
      '; cause=' + error.message);
  }
  await page.locator('.saas-topbar-selectors select').selectOption('branch-1');
  await page.getByRole('button', { name: 'Children', exact: true }).click();
  await page.getByRole('heading', { name: 'Children and families' }).waitFor();
  await page.getByRole('button', { name: 'Register a child' }).first().click();

  await page.locator('input[name="firstName"]').fill('Aarav');
  await page.locator('input[name="lastName"]').fill('Patel');
  await page.locator('select[name="className"] option[value="Play Group"]').waitFor({ state: 'attached' });
  await page.locator('select[name="className"]').selectOption('Play Group');
  await page.locator('input[name="guardianName"]').fill('Disha Patel');
  await page.locator('input[name="guardianPhone"]').fill('+91 98765 43210');
  await page.locator('input[name="guardianEmail"]').fill('disha@example.com');
  await page.getByRole('button', { name: 'Save child record' }).click();

  await page.getByText('Child registered successfully.', { exact: true }).waitFor();
  await page.getByText('Aarav Patel', { exact: true }).first().waitFor();
  assert.equal(tenantApi.hasScopedChildCreate(), true, 'Child creation must send both the organization and selected branch IDs.');

  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  await page.getByRole('heading', { name: 'Daily attendance' }).waitFor();
  const attendanceRow = page.locator('.saas-attendance-row').filter({ hasText: 'Aarav Patel' });
  await attendanceRow.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('button', { name: 'Save attendance', exact: true }).click();
  await page.getByText('Attendance saved.', { exact: true }).waitFor();
  assert.equal(tenantApi.hasScopedAttendanceSave(), true, 'Attendance writes must include organization and branch scope headers.');

  await page.getByRole('button', { name: 'Fees & payments', exact: true }).click();
  await page.getByRole('heading', { name: 'Fees and payments' }).waitFor();
  await page.locator('select[name="childId"] option[value="child-1"]').waitFor({ state: 'attached' });
  await page.locator('select[name="childId"]').selectOption('child-1');
  await page.locator('input[name="amount"]').fill('15000');
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await page.getByText('Invoice created.', { exact: true }).waitFor();
  assert.equal(tenantApi.hasScopedInvoiceCreate(), true, 'Invoice creation must include organization and branch scope headers.');

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.locator('.saas-modal input[type="number"]').fill('15000');
  await page.locator('.saas-modal button[type="submit"]').click();
  await page.getByText('Payment recorded. Receipt: REC-MAIN-2026-000001', { exact: true }).waitFor();
  assert.equal(tenantApi.hasScopedPayment(), true, 'Payment writes must include organization and branch scope headers.');
  await page.close();
});
