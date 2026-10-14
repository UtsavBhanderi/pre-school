'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestSecurityHeaders, createRateLimiter } = require('../middleware/requestSecurity');

function mockResponse() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { headers[name] = String(value); return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('API security headers disable sniffing, framing, referrers, browser capabilities and caching', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const req = { headers: {}, secure: false };
    const res = mockResponse();
    let called = false;

    requestSecurityHeaders(req, res, () => { called = true; });

    assert.equal(called, true);
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(res.headers['X-Frame-Options'], 'DENY');
    assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(res.headers['X-Permitted-Cross-Domain-Policies'], 'none');
    assert.equal(res.headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
    assert.equal(res.headers['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['Cross-Origin-Opener-Policy'], 'same-origin');
    assert.equal(res.headers['Strict-Transport-Security'], undefined);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test('HSTS is sent only in production over an HTTPS request', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const secureResponse = mockResponse();
    requestSecurityHeaders({ headers: {}, secure: true }, secureResponse, () => {});
    assert.equal(secureResponse.headers['Strict-Transport-Security'], 'max-age=15552000');

    const insecureResponse = mockResponse();
    requestSecurityHeaders({ headers: {}, secure: false }, insecureResponse, () => {});
    assert.equal(insecureResponse.headers['Strict-Transport-Security'], undefined);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test('rate limiter allows only the configured number of requests per client window', () => {
  let clock = 10000;
  const limiter = createRateLimiter({
    windowMs: 60000,
    max: 2,
    now: () => clock,
    keyGenerator: (req) => req.clientKey,
  });

  const first = mockResponse();
  let firstNext = 0;
  limiter({ clientKey: 'school-network-a' }, first, () => { firstNext += 1; });
  assert.equal(firstNext, 1);
  assert.equal(first.headers['RateLimit-Limit'], '2');
  assert.equal(first.headers['RateLimit-Remaining'], '1');

  const second = mockResponse();
  let secondNext = 0;
  limiter({ clientKey: 'school-network-a' }, second, () => { secondNext += 1; });
  assert.equal(secondNext, 1);
  assert.equal(second.headers['RateLimit-Remaining'], '0');

  const third = mockResponse();
  let thirdNext = 0;
  limiter({ clientKey: 'school-network-a' }, third, () => { thirdNext += 1; });
  assert.equal(thirdNext, 0);
  assert.equal(third.statusCode, 429);
  assert.equal(third.body.code, 'RATE_LIMITED');
  assert.equal(third.headers['Retry-After'], '60');

  const otherClient = mockResponse();
  let otherNext = 0;
  limiter({ clientKey: 'school-network-b' }, otherClient, () => { otherNext += 1; });
  assert.equal(otherNext, 1);
});

test('rate-limit windows reset at the exact expiry boundary', () => {
  let clock = 5000;
  const limiter = createRateLimiter({
    windowMs: 10000,
    max: 1,
    now: () => clock,
    keyGenerator: (req) => req.clientKey,
  });
  const req = { clientKey: 'client' };

  const allowed = mockResponse();
  let nextCount = 0;
  limiter(req, allowed, () => { nextCount += 1; });
  assert.equal(nextCount, 1);

  const limited = mockResponse();
  limiter(req, limited, () => { nextCount += 1; });
  assert.equal(limited.statusCode, 429);

  clock = 15000;
  const renewed = mockResponse();
  limiter(req, renewed, () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(renewed.statusCode, 200);
  assert.equal(renewed.headers['RateLimit-Remaining'], '0');
});

test('rate limiter bounds its in-memory client table without evicting live limits', () => {
  let clock = 1000;
  const limiter = createRateLimiter({
    windowMs: 30000,
    max: 3,
    maxKeys: 1,
    now: () => clock,
    keyGenerator: (req) => req.clientKey,
  });
  const first = mockResponse();
  limiter({ clientKey: 'client-a' }, first, () => {});

  const overflow = mockResponse();
  let called = false;
  limiter({ clientKey: 'client-b' }, overflow, () => { called = true; });
  assert.equal(called, false);
  assert.equal(overflow.statusCode, 503);
  assert.equal(overflow.body.code, 'RATE_LIMIT_CAPACITY_REACHED');

  clock = 31000;
  const afterExpiry = mockResponse();
  limiter({ clientKey: 'client-b' }, afterExpiry, () => { called = true; });
  assert.equal(called, true);
  assert.equal(afterExpiry.statusCode, 200);
});

test('rate limiter rejects invalid configuration', () => {
  assert.throws(() => createRateLimiter({ windowMs: 0, max: 2 }), /window/);
  assert.throws(() => createRateLimiter({ windowMs: 5000, max: 0 }), /limit/);
  assert.throws(() => createRateLimiter({ windowMs: 5000, max: 2, maxKeys: 0 }), /capacity/);
});
