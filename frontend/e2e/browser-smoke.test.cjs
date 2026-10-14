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
  const password = page.getByRole('textbox', { name: 'Password' });
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
  await page.getByRole('textbox', { name: 'Password' }).fill('incorrect-password');
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
  await page.getByRole('textbox', { name: 'Password' }).fill('test-password');
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
