'use strict';

const DEFAULT_MAX_KEYS = 10000;

function requestSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (process.env.NODE_ENV === 'production' && (req.secure === true || forwardedProto === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }

  return next();
}

function defaultClientKey(req) {
  const address = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  return String(address).slice(0, 128);
}

function createRateLimiter({
  windowMs,
  max,
  message = 'Too many attempts. Please wait before trying again.',
  keyGenerator = defaultClientKey,
  now = Date.now,
  maxKeys = DEFAULT_MAX_KEYS,
} = {}) {
  if (!Number.isFinite(windowMs) || windowMs < 1000) {
    throw new TypeError('A rate-limit window of at least 1000 milliseconds is required.');
  }
  if (!Number.isInteger(max) || max < 1) {
    throw new TypeError('A positive integer request limit is required.');
  }
  if (typeof keyGenerator !== 'function' || typeof now !== 'function') {
    throw new TypeError('Rate-limit key and clock functions must be callable.');
  }
  if (!Number.isInteger(maxKeys) || maxKeys < 1) {
    throw new TypeError('The rate-limit key capacity must be a positive integer.');
  }

  const windows = new Map();

  function pruneExpired(currentTime) {
    for (const [key, value] of windows) {
      if (value.resetAt <= currentTime) windows.delete(key);
    }
  }

  return function rateLimitRequest(req, res, next) {
    const currentTime = now();
    let key;
    try {
      key = String(keyGenerator(req) || 'unknown').slice(0, 256);
    } catch {
      key = 'unknown';
    }

    let current = windows.get(key);
    if (!current || current.resetAt <= currentTime) {
      if (windows.size >= maxKeys) pruneExpired(currentTime);
      // Never evict a live client's bucket just to make room: once capacity is
      // exhausted, fail closed for new client keys until an existing bucket expires.
      if (!windows.has(key) && windows.size >= maxKeys) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(windowMs / 1000))));
        return res.status(503).json({
          code: 'RATE_LIMIT_CAPACITY_REACHED',
          message: 'The service is busy. Please retry later.',
        });
      }
      current = { count: 0, resetAt: currentTime + windowMs };
      windows.set(key, current);
    }

    const resetSeconds = Math.max(1, Math.ceil((current.resetAt - currentTime) / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - current.count)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (current.count >= max) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message,
        retryAfterSeconds: resetSeconds,
      });
    }

    current.count += 1;
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - current.count)));
    return next();
  };
}

module.exports = { requestSecurityHeaders, createRateLimiter, defaultClientKey };
