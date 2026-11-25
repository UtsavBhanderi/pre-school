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

async function mockSchoolApi(page, { rejectLogin = false, userRole = 'admin', requestObserver = null } = {}) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    requestObserver?.(request);
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
          id: 'browser-smoke-' + userRole,
          username: userRole === 'teacher' ? 'Demo Teacher' : 'Demo Admin',
          email: userRole === 'teacher' ? 'teacher@example.com' : 'admin@example.com',
          role: userRole,
          memberships: [],
        },
      };
    } else if (url.pathname === '/api/parent-access/config' && request.method() === 'GET') {
      body = {
        school: { name: 'Blooming Buds Preschool', slug: 'blooming-buds' },
        parentAccessUrl: 'https://school.example.test/parent-access/blooming-buds',
        mode: 'legacy_single_school',
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

test('manually-created teacher signs in with email and password and gets a mobile-friendly workspace', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockSchoolApi(page, { userRole: 'teacher' });
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('teacher@example.com');
  await page.locator('#login-password').fill('teacher-initial-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/teacher-dashboard"));
  await page.getByRole('heading', { name: 'Your teaching day' }).waitFor();
  const menuButton = page.locator('.teacher-menu-button');
  await menuButton.click();
  await page.locator('.teacher-sidebar.is-open').waitFor();
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'true');
  const drawerLayers = await page.evaluate(() => ({
    drawer: Number(getComputedStyle(document.querySelector('.teacher-sidebar')).zIndex),
    backdrop: Number(getComputedStyle(document.querySelector('.teacher-sidebar-backdrop')).zIndex),
    dock: Number(getComputedStyle(document.querySelector('.teacher-mobile-nav')).zIndex),
  }));
  assert.ok(drawerLayers.drawer > drawerLayers.backdrop && drawerLayers.backdrop > drawerLayers.dock,
    'The open teacher drawer and backdrop must cover the fixed bottom dock: ' + JSON.stringify(drawerLayers));
  await page.locator('.teacher-sidebar-backdrop').click({ position: { x: 350, y: 420 } });
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'false');

  // Use the visible, thumb-friendly dashboard actions to navigate on mobile.
  await page.locator('.teacher-quick-action.blue').click();
  await page.getByRole('heading', { name: 'Take attendance' }).first().waitFor();
  await page.locator('.teacher-page-home-link').click();
  await page.locator('.teacher-quick-action.violet').click();
  await page.getByRole('heading', { name: 'Parent communication' }).first().waitFor();

  const teacherMobileNav = page.locator('.teacher-mobile-nav');
  assert.equal(await teacherMobileNav.isVisible(), true, 'Teacher quick navigation should be visible on a phone.');
  assert.equal(await teacherMobileNav.locator('button').count(), 5, 'The teacher mobile dock should show five primary destinations.');
  const calendarLink = teacherMobileNav.locator('button').filter({ hasText: 'Calendar' });
  await calendarLink.click();
  assert.ok((await calendarLink.getAttribute('class')).includes('active'), 'Selecting a mobile destination should update the active state.');
  await page.getByRole('heading', { name: 'School calendar' }).waitFor();
  await page.getByText('No upcoming school events').waitFor();

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const mobileLayout = await page.evaluate(() => {
      const dock = document.querySelector('.teacher-mobile-nav');
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        dockWidth: dock.getBoundingClientRect().width,
        dockButtons: Array.from(dock.querySelectorAll('button')).map((button) => ({
          height: button.getBoundingClientRect().height,
          right: button.getBoundingClientRect().right,
          labelWidth: button.querySelector('span')?.getBoundingClientRect().width || 0,
          labelScrollWidth: button.querySelector('span')?.scrollWidth || 0,
        })),
      };
    });
    assert.ok(mobileLayout.document <= mobileLayout.viewport + 1,
      'Teacher workspace overflowed at ' + width + 'px: ' + JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.dockWidth <= width + 1, 'Teacher dock must fit the viewport at ' + width + 'px.');
    assert.ok(mobileLayout.dockButtons.every((button) => button.height >= 48 && button.right <= width + 1),
      'Every teacher dock destination must remain thumb-sized and inside the viewport at ' + width + 'px: ' + JSON.stringify(mobileLayout));
  }
  await page.close();
});

test('teacher accounts cannot open administrator dashboard routes', async () => {
  const page = await browser.newPage();
  await mockSchoolApi(page, { userRole: 'teacher' });
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('teacher@example.com');
  await page.locator('#login-password').fill('teacher-initial-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  await page.waitForURL((url) => url.pathname.endsWith("/teacher-dashboard"));
  await page.goto(BASE_URL + '/dashboard/subjects');
  await page.waitForURL((url) => url.pathname.endsWith("/login"));
  assert.ok(new URL(page.url()).pathname.endsWith("/login"));
  await page.close();
});

test('administrator can open the class subject setup on mobile', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  await page.waitForURL((url) => url.pathname.endsWith('/dashboard/home'));
  await page.goto(BASE_URL + '/dashboard/subjects');
  await page.getByRole('heading', { name: 'Class subjects' }).waitFor();
  await page.getByLabel('Class / standard').selectOption('ENG JR.');
  assert.equal(await page.getByRole('textbox', { name: 'Subjects' }).count(), 1);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    'Subject setup should not overflow horizontally on a 390px mobile viewport: ' + JSON.stringify(dimensions),
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
  assert.ok(new URL(page.url()).pathname.endsWith("/login"));
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

test('report-card pages send the authenticated session token', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const reportRequests = [];
  await mockSchoolApi(page, {
    requestObserver: (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/reportCard')) {
        reportRequests.push({ path: new URL(request.url()).pathname, token: request.headers()['x-auth-token'] || '' });
      }
    },
  });
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL(/\/dashboard\/home$/);
  await page.goto(BASE_URL + '/dashboard/createReport');
  await page.getByRole('heading', { name: 'Report cards' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.report-create-form'));
  assert.ok(reportRequests.some((request) => request.path === '/api/reportCard' && request.token === 'browser-smoke-token'),
    'The report-card list request must include the signed-in session token.');
  await page.close();
});


async function mockTenantApi(page) {
  let savedChildren = [];
  let savedAttendance = [];
  let savedInvoices = [];
  const requestLog = [];
  let scopedChildCreateSeen = false;
  let scopedAttendanceSaveSeen = false;
  let scopedInvoiceCreateSeen = false;
  let scopedPaymentSeen = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requestLog.push({ path, method: request.method() });
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
    requestLog,
    hasScopedChildCreate: () => scopedChildCreateSeen,
    hasScopedAttendanceSave: () => scopedAttendanceSaveSeen,
    hasScopedInvoiceCreate: () => scopedInvoiceCreateSeen,
    hasScopedPayment: () => scopedPaymentSeen,
  };
}

test.skip('SaaS phase parked: organization owner tenant workspace and branch registration', async () => {
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
  // The workspace loads branch options asynchronously after membership has been
  // verified. Wait for the selector to be enabled and populated before using it.
  try {
    await page.waitForFunction(() => {
      const selectors = Array.from(document.querySelectorAll('.saas-topbar-selectors select'));
      const branchSelect = selectors[selectors.length - 1];
      return branchSelect &&
        !branchSelect.disabled &&
        Array.from(branchSelect.options).some((option) => option.value === 'branch-1');
    }, { timeout: 15000 });
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error('Branch selector never loaded. Requests=' + JSON.stringify(tenantApi.requestLog) +
      '; body=' + bodyText.slice(0, 1800) + '; browser errors=' + JSON.stringify(browserErrors) +
      '; cause=' + error.message);
  }
  await page.locator('.saas-topbar-selectors select').last().selectOption('branch-1');
  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
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

  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  await page.getByRole('heading', { name: 'Daily attendance' }).waitFor();
  const attendanceRow = page.locator('.saas-attendance-row').filter({ hasText: 'Aarav Patel' });
  await attendanceRow.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('button', { name: 'Save attendance', exact: true }).click();
  await page.getByText('Attendance saved.', { exact: true }).waitFor();
  assert.equal(tenantApi.hasScopedAttendanceSave(), true, 'Attendance writes must include organization and branch scope headers.');

  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
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


async function mockParentPortalApi(page) {
  const parentScopeRequests = [];
  const unscopedStudentRequests = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = request.headers();
    let status = 200;
    let body = {};

    if (path.startsWith('/api/saas/parent/')) {
      parentScopeRequests.push({
        path,
        organizationId: headers['x-organization-id'] || '',
        branchId: headers['x-branch-id'] || '',
      });
    }
    if (path === '/api/students' || path === '/api/saas/operations/children') {
      unscopedStudentRequests.push(path);
    }

    if (path === '/api/auth/login' && request.method() === 'POST') {
      body = { token: 'browser-smoke-parent-token' };
    } else if (path === '/api/auth/me' && request.method() === 'GET') {
      body = {
        user: {
          id: 'parent-user-1',
          username: 'Disha Patel',
          email: 'disha@example.com',
          role: 'admin',
          memberships: [{
            id: 'parent-membership-1',
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
            role: 'parent',
            status: 'active',
            classNames: [],
            branchIds: [{
              id: 'branch-1',
              name: 'Main Branch',
              code: 'MAIN',
              status: 'active',
              timezone: 'Asia/Kolkata',
            }],
            accessAllBranches: false,
          }],
        },
      };
    } else if (path === '/api/saas/parent/summary') {
      body = {
        organization: { name: 'Little Stars Preschool', currency: 'INR' },
        date: '2026-10-14',
        children: 1,
        attendanceToday: { present: 1, absent: 0 },
        fees: { outstandingPaise: 250000, outstanding: 2500, billingChildren: 1 },
      };
    } else if (path === '/api/saas/parent/children') {
      body = {
        total: 1,
        children: [{
          id: 'child-1',
          name: 'Aarav Patel',
          admissionNumber: 'STU-MAIN-2026-00001',
          className: 'Play Group',
          academicYear: '2026-2027',
          dateOfBirth: '2022-05-10',
          gender: 'Male',
          address: 'Family address',
          branch: { name: 'Main Branch', code: 'MAIN' },
          relationships: [{
            relationship: 'mother',
            isPrimaryContact: true,
            isBillingContact: true,
            authorizedPickup: true,
            receivesSchoolUpdates: true,
          }],
        }],
      };
    } else if (path === '/api/saas/media') {
      body = { assets: [] };
    } else if (path === '/api/saas/parent/fees') {
      body = {
        invoices: [{
          id: 'parent-invoice-1',
          invoiceNumber: 'INV-MAIN-2026-000001',
          childName: 'Aarav Patel',
          className: 'Play Group',
          academicYear: '2026-2027',
          dueDate: '2026-11-01',
          total: 15000,
          paid: 12500,
          outstanding: 2500,
          status: 'open',
          currency: 'INR',
          transactions: [{
            receiptNumber: 'REC-MAIN-2026-000001',
            transactionAt: '2026-10-10T09:00:00.000Z',
            method: 'upi',
            amount: 12500,
            type: 'payment',
          }],
        }],
      };
    } else if (path === '/api/saas/parent/attendance') {
      body = { children: [] };
    } else if (path === '/api/saas/notices' || path === '/api/saas/calendar' || path === '/api/saas/handover') {
      body = path === '/api/saas/calendar' || path === '/api/saas/handover' ? { events: [] } : [];
    }

    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  });

  return {
    parentScopeRequests,
    unscopedStudentRequests,
  };
}

test.skip('SaaS phase parked: organization-linked parent family portal', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const api = await mockParentPortalApi(page);

  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('disha@example.com');
  await page.locator('#login-password').fill('parent-test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  await page.waitForURL((url) => url.pathname === '/parent-portal', { timeout: 10000 });
  await page.getByRole('heading', { name: /Welcome, Disha Patel/ }).waitFor();
  await page.getByText('Aarav Patel', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'My children', exact: true }).click();
  await page.getByRole('heading', { name: 'My children' }).waitFor();
  await page.getByText('STU-MAIN-2026-00001', { exact: true }).waitFor();
  assert.equal(await page.getByText('Riya Sharma', { exact: true }).count(), 0,
    'The family portal must not render an unrelated child.');
  assert.ok(api.parentScopeRequests.length > 0, 'The portal should load the family-scoped APIs.');
  assert.ok(api.parentScopeRequests.every((entry) => entry.organizationId === 'org-1'),
    'Family-scoped requests must carry the selected organization.');
  assert.equal(api.unscopedStudentRequests.length, 0,
    'The parent portal must not call the school-wide student list or staff child-list API.');

  await page.getByRole('button', { name: 'Fee status', exact: true }).click();
  await page.getByRole('heading', { name: 'Fee status' }).waitFor();
  await page.getByText('INV-MAIN-2026-000001', { exact: true }).waitFor();
  await page.getByText('View payment receipts (1)', { exact: true }).click();
  await page.getByText('REC-MAIN-2026-000001', { exact: true }).waitFor();
  assert.equal(await page.getByText('Riya Sharma', { exact: true }).count(), 0,
    'The parent fee view must not expose another family.');
  await page.close();
});


test('parent direct sign-in page is labelled, readable and mobile-friendly', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/parent-access/blooming-buds');

  await page.getByRole('heading', { name: 'Welcome to your family portal' }).waitFor();
  assert.equal(await page.getByText('Blooming Buds Preschool').count(), 1);
  assert.equal(await page.getByLabel(/Student GR number or parent email/).count(), 1);
  assert.equal(await page.getByLabel(/Registered parent mobile number/).count(), 1);
  assert.equal(await page.getByRole('button', { name: /Sign in to parent dashboard/ }).count(), 1);
  assert.equal(await page.getByLabel(/password/i).count(), 0);
  assert.equal(await page.getByLabel(/Parent \/ guardian full name/).count(), 0);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    'Parent access setup should not overflow horizontally on a 390px mobile viewport: ' + JSON.stringify(dimensions),
  );
  await page.close();
});

test('single-school release does not expose organization signup or invitation screens', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/login');

  assert.equal(await page.getByRole('link', { name: 'Create a preschool account' }).count(), 0);
  assert.equal(await page.getByRole('link', { name: /accept invitation/i }).count(), 0);

  await page.goto(BASE_URL + '/signup');
  await page.waitForFunction(() => window.location.pathname === '/login');
  await page.goto(BASE_URL + '/accept-invitation');
  await page.waitForFunction(() => window.location.pathname === '/login');
  await page.close();
});

test('single-school parent portal opens with family-scoped child information on mobile', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.addInitScript(() => localStorage.setItem('token', 'parent-browser-smoke-token'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body = {};
    if (url.pathname === '/api/auth/me') {
      body = {
        user: {
          id: 'parent-user-1',
          username: 'Riya Patel',
          email: 'riya@example.com',
          role: 'parent',
          memberships: [],
          parentAccount: { mode: 'legacy_single_school', status: 'active', studentCount: 1 },
        },
      };
    } else if (url.pathname === '/api/parent-portal/summary') {
      body = {
        schoolName: 'Blooming Buds Preschool',
        date: '2026-11-03',
        children: 1,
        attendanceToday: { present: 1, absent: 0 },
        fees: { outstanding: 1200, currency: 'INR' },
        childSummaries: [],
      };
    } else if (url.pathname === '/api/parent-portal/children') {
      body = {
        total: 1,
        children: [{
          id: 'child-1',
          name: 'Aarav Patel',
          admissionNumber: 'GR-1001',
          className: 'Nursery',
          academicYear: '2026-2027',
          dateOfBirth: '2023-05-10',
          address: 'Surat',
        }],
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
  });
  await page.goto(BASE_URL + '/parent-portal');

  await page.getByRole('heading', { name: 'Family overview' }).waitFor();
  await page.getByRole('heading', { name: 'Good day, Riya Patel.' }).waitFor();
  await page.getByRole('heading', { name: 'Aarav Patel' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Attendance/ }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /Fees/ }).count(), 1);

  const parentMobileNav = page.locator('.legacy-parent-mobile-nav');
  assert.equal(await parentMobileNav.isVisible(), true, 'Parent quick navigation should be visible on a phone.');
  assert.equal(await parentMobileNav.locator('button').count(), 5, 'The parent mobile dock should show four primary destinations plus More.');
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const mobileLayout = await page.evaluate(() => {
      const dock = document.querySelector('.legacy-parent-mobile-nav');
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        dockWidth: dock.getBoundingClientRect().width,
        dockButtons: Array.from(dock.querySelectorAll('button')).map((button) => ({
          height: button.getBoundingClientRect().height,
          right: button.getBoundingClientRect().right,
          labelWidth: button.querySelector('span')?.getBoundingClientRect().width || 0,
          labelScrollWidth: button.querySelector('span')?.scrollWidth || 0,
        })),
      };
    });
    assert.ok(mobileLayout.document <= mobileLayout.viewport + 1,
      'Parent portal overflowed at ' + width + 'px: ' + JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.dockWidth <= width + 1, 'Parent dock must fit the viewport at ' + width + 'px.');
    assert.ok(mobileLayout.dockButtons.every((button) => button.height >= 48 && button.right <= width + 1),
      'Every parent dock destination must remain thumb-sized and inside the viewport at ' + width + 'px: ' + JSON.stringify(mobileLayout));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await parentMobileNav.getByRole('button', { name: 'More' }).click();
  const moreSheet = page.getByRole('dialog', { name: 'More from your school' });
  await moreSheet.waitFor();
  await moreSheet.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('heading', { name: 'School calendar' }).first().waitFor();
  assert.equal(await moreSheet.count(), 0, 'Choosing a More destination should close the mobile sheet.');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    'Parent portal should not overflow horizontally on a 390px mobile viewport: ' + JSON.stringify(dimensions),
  );
  await page.close();
});

test('parent can sign in directly with a GR number and registered mobile without registration or a password', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let submittedCredentials = null;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let status = 200;
    let body = {};

    if (url.pathname === '/api/parent-access/config' && request.method() === 'GET') {
      body = {
        school: { name: 'Blooming Buds Preschool', slug: 'blooming-buds' },
        parentAccessUrl: 'https://school.example.test/parent-access/blooming-buds',
        mode: 'legacy_single_school',
      };
    } else if (url.pathname === '/api/parent-access/login' && request.method() === 'POST') {
      submittedCredentials = request.postDataJSON();
      body = { token: 'passwordless-parent-smoke-token' };
    } else if (url.pathname === '/api/auth/me' && request.method() === 'GET') {
      body = {
        user: {
          id: 'parent-smoke-user',
          username: 'Disha Patel',
          email: 'disha@example.com',
          role: 'parent',
          memberships: [],
          parentAccount: {
            mode: 'legacy_single_school',
            status: 'active',
            studentCount: 1,
          },
        },
      };
    } else if (url.pathname === '/api/parent-portal/summary' && request.method() === 'GET') {
      body = {
        schoolName: 'Blooming Buds Preschool',
        date: '2026-11-17',
        children: 1,
        attendanceToday: { present: 1, absent: 0 },
        fees: { outstanding: 1200, currency: 'INR' },
      };
    } else if (url.pathname === '/api/parent-portal/children' && request.method() === 'GET') {
      body = {
        total: 1,
        children: [{
          id: 'parent-smoke-child',
          name: 'Aarav Patel',
          admissionNumber: 'GR-1001',
          className: 'Nursery',
          academicYear: '2026-2027',
          dateOfBirth: '2023-05-10',
        }],
      };
    }

    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  });

  await page.goto(BASE_URL + '/parent-access/blooming-buds');
  await page.getByRole('heading', { name: 'Welcome to your family portal' }).waitFor();
  await page.getByLabel(/Student GR number or parent email/).fill('GR-1001');
  await page.getByLabel(/Registered parent mobile number/).fill('9876543210');
  await page.getByRole('button', { name: /Sign in to parent dashboard/ }).click();

  await page.waitForURL((url) => url.pathname === '/parent-portal', { timeout: 10000 });
  await page.getByRole('heading', { name: 'Family overview' }).waitFor();
  await page.getByRole('heading', { name: 'Good day, Disha Patel.' }).waitFor();
  await page.getByRole('heading', { name: 'Aarav Patel' }).waitFor();

  assert.deepEqual(submittedCredentials, {
    schoolSlug: 'blooming-buds',
    identifier: 'GR-1001',
    phone: '9876543210',
  }, 'Parent login should send only the school slug, GR/email identifier and registered mobile.');
  assert.equal(await page.getByLabel(/password/i).count(), 0,
    'Passwordless parent access must not ask for a password.');
  assert.equal(await page.getByRole('link', { name: /registration/i }).count(), 0,
    'Parents should not need a separate registration flow.');
  assert.equal(await page.getByText('Someone Else Child', { exact: true }).count(), 0,
    'The portal must not show an unrelated child.');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    'Parent sign-in and portal should not overflow horizontally on a 390px mobile viewport: ' + JSON.stringify(dimensions),
  );

  await page.close();
});


test('report cards reuse class assessment dates and move to the next child after saving', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const reportMarks = new Map([
    ['student-a', {
      subjectData: [
        { subject: 'English', mark: 18, date: '2026-11-20' },
        { subject: 'Mathematics', mark: 17, date: '2026-11-20' },
      ],
      total: 35,
      percentage: 87.5,
      grade: 'A',
    }],
  ]);
  const children = [
    { _id: 'student-a', firstName: 'Aarav', middleName: 'Patel', lastName: '', standard: 'ENG JR.', stuNo: 'GR-001', batchYear: '2026-2027' },
    { _id: 'student-b', firstName: 'Bina', middleName: 'Shah', lastName: '', standard: 'ENG JR.', stuNo: 'GR-002', batchYear: '2026-2027' },
    { _id: 'student-c', firstName: 'Chitra', middleName: 'Desai', lastName: '', standard: 'ENG JR.', stuNo: 'GR-003', batchYear: '2026-2027' },
  ];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let status = 200;
    let body = {};

    if (path === '/api/auth/login' && request.method() === 'POST') {
      body = { token: 'browser-smoke-token' };
    } else if (path === '/api/auth/me' && request.method() === 'GET') {
      body = { user: { id: 'report-admin', username: 'Report Admin', email: 'report@example.com', role: 'admin', memberships: [] } };
    } else if (path === '/api/parent-access/config' && request.method() === 'GET') {
      body = { school: { name: 'Blooming Buds Preschool' } };
    } else if (path === '/api/reportCard/report-1/roster' && request.method() === 'GET') {
      body = {
        report: { _id: 'report-1', reportName: 'Term 1 Assessment', standard: 'ENG JR.', outOfMarks: 20 },
        subjects: ['English', 'Mathematics'],
        students: children.map((child) => {
          const saved = reportMarks.get(child._id);
          return { ...child, marks: saved ? [{ reportId: 'report-1', ...saved }] : [] };
        }),
      };
    } else if (/^\/api\/students\/student-[abc]\/report-1$/.test(path) && request.method() === 'GET') {
      const studentId = path.split('/')[3];
      const saved = reportMarks.get(studentId);
      if (saved) body = saved;
      else { status = 404; body = { message: 'No marks have been saved for this student yet.' }; }
    } else if (/^\/api\/students\/student-[abc]\/report-1$/.test(path) && request.method() === 'POST') {
      const studentId = path.split('/')[3];
      const subjectData = request.postDataJSON().subjectData || [];
      const total = subjectData.reduce((sum, item) => sum + Number(item.mark || 0), 0);
      const maximum = subjectData.length * 20;
      const percentage = maximum ? Number(((total / maximum) * 100).toFixed(2)) : 0;
      const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'E';
      reportMarks.set(studentId, { subjectData, total, percentage, grade });
      body = { message: 'Marks saved successfully.', total, percentage, grade };
    } else {
      status = 404;
      body = { message: 'Not found in the browser test fixture.' };
    }

    await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
  });

  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('report@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL(/\/dashboard\/home$/);
  await page.goto(BASE_URL + '/dashboard/students/ENG%20JR./report-1');
  await page.getByRole('heading', { name: 'Student report cards' }).waitFor();
  await page.getByText('1 of 3 reports completed').waitFor();

  const search = page.getByRole('searchbox', { name: 'Search students by name or GR number' });
  await search.fill('GR-002');
  assert.equal(await page.locator('.report-student-table-wrap tbody tr').count(), 1);
  await search.fill('');

  const binaRow = page.locator('.report-student-table-wrap tbody tr').filter({ hasText: 'Bina Shah' });
  await binaRow.getByRole('button', { name: 'Enter marks' }).click();
  await page.getByRole('heading', { name: /Enter marks · Bina Shah/ }).waitFor();
  assert.equal(await page.locator('#report-common-assessment-date').inputValue(), '2026-11-20');
  assert.equal(await page.getByLabel('Assessment date for English').inputValue(), '2026-11-20');
  await page.getByLabel('Marks for English').fill('16');
  await page.getByLabel('Marks for Mathematics').fill('18');
  await page.getByRole('button', { name: 'Save & next student' }).click();
  await page.getByRole('heading', { name: /Enter marks · Chitra Desai/ }).waitFor();
  assert.equal(await page.getByLabel('Assessment date for English').inputValue(), '2026-11-20');
  assert.equal(await page.getByLabel('Assessment date for Mathematics').inputValue(), '2026-11-20');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('checkbox', { name: 'Select all completed reports shown' }).check();
  await page.getByRole('button', { name: /Print selected \(2\)/ }).click();
  const printArea = page.locator('#print-area');
  await printArea.getByText('Assessment results').first().waitFor();
  await printArea.getByText('Aarav Patel').waitFor();
  await printArea.getByText('Bina Shah').waitFor();
  assert.equal(await printArea.locator('.report-card-print-page').count(), 2,
    'Printing a class selection should create one report page per completed student.');
  assert.equal(await printArea.getByText('Blooming Buds Preschool', { exact: true }).count(), 2);
  assert.equal(await printArea.getByText('2026-2027', { exact: true }).count(), 2,
    'Each printed card should include the student academic year.');
  assert.equal(await printArea.getByText('20 Nov 2026', { exact: true }).count(), 4,
    'Each student subject row should retain its saved assessment date.');

  await page.emulateMedia({ media: 'print' });
  const pageBreaks = await printArea.locator('.report-card-print-page').evaluateAll((cards) =>
    cards.map((card) => getComputedStyle(card).breakAfter)
  );
  assert.equal(pageBreaks[0], 'page', 'Each report card except the last should start a fresh printed page.');
  assert.ok(['auto', 'initial'].includes(pageBreaks[1]), 'The final report card should not add a blank trailing page.');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // Verify that the assessment form becomes a touch-friendly card layout on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  const chitraCard = page.locator('.report-student-mobile-card').filter({ hasText: 'Chitra Desai' });
  await chitraCard.getByRole('button', { name: 'Enter marks' }).click();
  const mobileSubjectCards = page.locator('.report-entry-mobile-list .report-entry-subject-card');
  await mobileSubjectCards.first().waitFor();
  assert.equal(await mobileSubjectCards.count(), 2,
    'A phone-sized mark-entry form should show one compact card per subject.');
  assert.equal(await page.locator('.report-entry-table-wrap').isVisible(), false,
    'The wide subject table should be replaced by the mobile card layout.');
  const mobileReportDimensions = await page.evaluate(() => {
    const modal = document.querySelector('.report-modal-backdrop .modal-content');
    return {
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      modal: modal?.getBoundingClientRect().width || 0,
      modalScroll: modal?.scrollWidth || 0,
      modalClient: modal?.clientWidth || 0,
    };
  });
  assert.ok(mobileReportDimensions.document <= mobileReportDimensions.viewport + 1,
    'Mobile report entry must not overflow the page: ' + JSON.stringify(mobileReportDimensions));
  assert.ok(mobileReportDimensions.modal <= 390 && mobileReportDimensions.modalScroll <= mobileReportDimensions.modalClient + 1,
    'The mobile mark-entry dialog and its controls must fit the phone width: ' + JSON.stringify(mobileReportDimensions));
  const reusedMobileDates = await page.locator('.report-entry-mobile-list input[type="date"]').evaluateAll((inputs) =>
    inputs.map((input) => input.value)
  );
  assert.deepEqual(reusedMobileDates, ['2026-11-20', '2026-11-20'],
    'Shared assessment dates should also be reused in the mobile entry layout.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.close();
});


test('administrator workspace has a thumb-first mobile dock across phone widths', async () => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/dashboard/home'));

  const dock = page.locator('.admin-mobile-nav');
  assert.equal(await dock.isVisible(), true, 'Administrator quick navigation should be visible on phones.');
  assert.equal(await dock.locator('a,button').count(), 5,
    'The administrator dock should offer Home, Attendance, Fees, Children and More.');

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    const layout = await page.evaluate(() => {
      const nav = document.querySelector('.admin-mobile-nav');
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        dockWidth: nav.getBoundingClientRect().width,
        items: Array.from(nav.querySelectorAll('a,button')).map((item) => {
          const rect = item.getBoundingClientRect();
          return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
        }),
      };
    });
    assert.ok(layout.document <= layout.viewport + 1,
      'Administrator workspace must not overflow at ' + width + 'px: ' + JSON.stringify(layout));
    assert.ok(layout.dockWidth <= width + 1 && layout.items.every((item) =>
      item.width >= 44 && item.height >= 48 && item.left >= -1 && item.right <= width + 1
    ), 'Every administrator dock item must fit and remain touch-sized at ' + width + 'px: ' + JSON.stringify(layout));
  }

  await dock.getByRole('button', { name: 'More' }).click();
  await page.locator('.admin-sidebar.is-open').waitFor();
  assert.equal(await dock.getByRole('button', { name: 'More' }).getAttribute('aria-expanded'), 'true');
  await page.locator('.admin-sidebar').getByRole('link', { name: 'Help and guides' }).click();
  await page.getByRole('heading', { name: /step by step/i }).waitFor();
  assert.equal(await dock.getByRole('link', { name: 'Home' }).count(), 1,
    'The quick dock remains available while navigating the full administrator workspace.');
  await page.close();
});

test('administrator daily workflows use readable phone layouts at 320px to 430px', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const child = {
    _id: 'mobile-child-1', firstName: 'Aarav', middleName: 'Patel', lastName: '',
    stuNo: 'GR-1001', standard: 'ENG JR.', dob: '2022-05-10', gender: 'Male',
    status: 'active', phoneNumber: '9876543210', FatherName: 'Riya Patel',
    FatherMobileNumber: '9876543210', studentPhoto: '',
  };
  await mockSchoolApi(page);
  await page.route('**/api/students', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([child]) }));
  await page.route('**/api/fees/all', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{
      _id: 'mobile-fee-1', studentName: 'Aarav Patel', studentPhoneNumber: '9876543210',
      stuNo: 'GR-1001', standard: 'ENG JR.', batchYear: '2026-2027',
      totalStandardFees: 12000, totalFeesPaid: 5000, discount: 0, paymentDetails: [],
    }]),
  }));
  await page.route('**/api/fees/standard-fees', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ 'ENG JR.': 12000 }) }));
  await page.route('**/api/attendance/students**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ ...child, attendanceStatus: '', attendanceReason: '' }]),
  }));
  await page.route('**/api/school-engagement/staff/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies = {
      '/api/school-engagement/staff/classes': { classes: ['ENG JR.'] },
      '/api/school-engagement/staff/homework': { homework: [] },
      '/api/school-engagement/staff/complaints': { complaints: [] },
      '/api/school-engagement/staff/polls': { polls: [] },
      '/api/school-engagement/staff/messages': { messages: [] },
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bodies[path] || {}) });
  });

  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL(/\/dashboard\/home$/);

  const assertNoOverflow = async (label) => {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(dimensions.document <= dimensions.viewport + 1,
        label + ' must not overflow at ' + width + 'px: ' + JSON.stringify(dimensions));
    }
    await page.setViewportSize({ width: 390, height: 844 });
  };

  await page.goto(BASE_URL + '/dashboard/studentRegister');
  await page.getByRole('heading', { name: 'Children and families' }).waitFor();
  await page.getByRole('searchbox', { name: 'Search by child name, GR number or mobile' }).fill('GR-1001');
  const studentMobileCards = page.locator('.student-register-mobile-list .student-mobile-card');
  await studentMobileCards.getByText('Aarav Patel', { exact: true }).waitFor();
  assert.equal(await studentMobileCards.count(), 1);
  assert.equal(await page.locator('.student-register-table-desktop').isVisible(), false);
  await assertNoOverflow('Student management');

  await page.goto(BASE_URL + '/dashboard/fees');
  await page.getByRole('heading', { name: 'Fees and payments' }).waitFor();
  await page.getByRole('searchbox', { name: 'Search by student, GR number or parent mobile' }).fill('Aarav');
  assert.equal(await page.locator('.fee-record-mobile-list .fee-mobile-card').count(), 1);
  assert.equal(await page.locator('.fee-record-table-desktop').isVisible(), false);
  await assertNoOverflow('Fees management');

  await page.goto(BASE_URL + '/dashboard/attendanceEntryPage');
  await page.getByRole('heading', { name: 'Take attendance' }).waitFor();
  await page.getByLabel('Select class for attendance').selectOption('ENG JR.');
  await page.locator('.attendance-mobile-roster .attendance-mobile-card').first().waitFor();
  assert.equal(await page.locator('.attendance-mobile-roster .attendance-mobile-card').count(), 1);
  assert.equal(await page.locator('.attendance-roster-card').isVisible(), false);
  await page.locator('.attendance-mobile-card input[type="radio"]').first().check();
  await assertNoOverflow('Attendance');

  await page.goto(BASE_URL + '/dashboard/communications');
  await page.getByRole('heading', { name: 'School communication' }).waitFor();
  assert.ok(await page.getByRole('tab', { name: /Homework/ }).isVisible());
  await page.getByRole('tab', { name: /Parent messages/ }).click();
  await page.getByRole('heading', { name: 'Messages from parents' }).waitFor();
  await assertNoOverflow('School communication');
  await page.close();
});

test('administrator navigation remains usable with touch input from 320px to 430px', async () => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mockSchoolApi(page);
  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/dashboard/home'));

  const menuButton = page.locator('.admin-menu-button');
  assert.equal(await menuButton.isVisible(), true);
  const menuSize = await menuButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(menuSize.width >= 44 && menuSize.height >= 44,
    'Administrator menu must have a minimum 44px touch target: ' + JSON.stringify(menuSize));

  await menuButton.click();
  await page.locator('.admin-sidebar.is-open').waitFor();
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'true',
    'Opening administrator navigation must update its expanded state.');
  await page.waitForFunction(() => document.body.style.overflow === 'hidden',
    null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden',
    'The page behind the administrator drawer must not scroll.');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.admin-sidebar')?.classList.contains('is-open'));
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'false',
    'Escape must close administrator navigation.');
  await page.waitForFunction(() => document.body.style.overflow === '',
    null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '',
    'Closing administrator navigation must restore page scrolling.');

  await menuButton.click();
  await page.locator('.admin-sidebar.is-open').waitFor();
  const sidebarSize = await page.locator('.admin-sidebar').evaluate((element) => ({
    zIndex: Number(getComputedStyle(element).zIndex),
    height: element.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
  }));
  assert.ok(sidebarSize.zIndex > 1000 && sidebarSize.height >= sidebarSize.viewportHeight - 1,
    'Administrator drawer must cover the screen and stay above the overlay: ' + JSON.stringify(sidebarSize));

  const closeLink = page.locator('.admin-sidebar').getByRole('link', { name: 'Help and guides' });
  await closeLink.click();
  await page.getByRole('heading', { name: /step by step/i }).waitFor();

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    const mobileLayout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      contentRight: document.querySelector('.admin-main-content').getBoundingClientRect().right,
    }));
    assert.ok(mobileLayout.document <= mobileLayout.viewport + 1,
      'Administrator page overflowed at ' + width + 'px: ' + JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.contentRight <= width + 1,
      'Administrator content must stay within the viewport at ' + width + 'px: ' + JSON.stringify(mobileLayout));
  }
  await page.close();
});


test('teacher daily work reports are easy to submit and review on phone screens', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  let reports = [{
    _id: 'teacher-report-1',
    date: '2026-11-24',
    TimeIn: '09:00',
    TimeOut: '13:00',
    subject: 'Storytelling and phonics',
    standard: 'ENG JR.',
    dailyWorkReport: 'Read a picture story, practised letter sounds and completed a group activity.',
    totalStudents: 22,
    todaysWorkingHours: 4,
  }];
  const submittedPayloads = [];

  await mockSchoolApi(page, { userRole: 'teacher' });
  await page.route('**/api/attendance/teacher-class', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ standard: 'ENG JR.' }),
  }));
  await page.route('**/api/dailyWorkReport', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      submittedPayloads.push(payload);
      reports = [{
        _id: 'teacher-report-2',
        date: '2026-11-25',
        ...payload,
        todaysWorkingHours: 3.5,
      }, ...reports];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Daily work report submitted successfully.', report: reports[0] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reports),
    });
  });

  await page.goto(BASE_URL + '/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('teacher@example.com');
  await page.locator('#login-password').fill('teacher-initial-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/teacher-dashboard'));
  await page.locator('.teacher-mobile-nav').getByRole('button', { name: 'Daily report' }).click();
  await page.getByRole('heading', { name: 'Daily work report', exact: true }).waitFor();

  const reportCards = page.locator('.daily-report-mobile-list .daily-report-mobile-card');
  await reportCards.first().waitFor();
  assert.equal(await reportCards.count(), 1);
  assert.equal(await page.locator('.daily-report-table-wrap').isVisible(), false,
    'The wide report table should be replaced by stacked report cards on phones.');

  await page.getByRole('searchbox', { name: 'Search your reports' }).fill('phonics');
  assert.equal(await reportCards.count(), 1);
  await page.getByRole('searchbox', { name: 'Search your reports' }).fill('does not exist');
  assert.equal(await reportCards.count(), 0);
  await page.getByRole('button', { name: 'Clear all' }).click();
  assert.equal(await reportCards.count(), 1);

  await page.getByLabel('Time in').fill('09:00');
  await page.getByLabel('Time out').fill('12:30');
  await page.locator('#report-subject').fill('Art and colours');
  await page.waitForFunction(() => document.querySelector('#report-standard')?.value === 'ENG JR.');
  assert.equal(await page.locator('#report-standard').inputValue(), 'ENG JR.');
  await page.getByLabel('Number of students').fill('20');
  await page.getByLabel('What did you work on today?').fill('Children explored primary colours through painting and sorting.');
  await page.getByRole('button', { name: 'Submit work report' }).click();
  await page.getByRole('status').filter({ hasText: 'submitted successfully' }).waitFor();
  assert.equal(submittedPayloads.length, 1);
  assert.equal(submittedPayloads[0].standard, 'ENG JR.');
  assert.equal(submittedPayloads[0].totalStudents, 20);
  await page.waitForFunction(() => document.querySelectorAll('.daily-report-mobile-card').length === 2);
  assert.equal(await reportCards.count(), 2);
  await reportCards.first().getByText('Art and colours', { exact: true }).waitFor();

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      cards: Array.from(document.querySelectorAll('.daily-report-mobile-card')).map((card) => ({
        width: card.getBoundingClientRect().width,
        right: card.getBoundingClientRect().right,
      })),
    }));
    assert.ok(dimensions.document <= dimensions.viewport + 1,
      'Teacher report page must not overflow at ' + width + 'px: ' + JSON.stringify(dimensions));
    assert.ok(dimensions.cards.every((card) => card.width <= width + 1 && card.right <= width + 1),
      'Each teacher report card must fit inside the phone at ' + width + 'px: ' + JSON.stringify(dimensions));
  }
  await page.close();
});
