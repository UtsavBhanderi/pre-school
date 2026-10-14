'use strict';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function value(env, key) {
  return typeof env[key] === 'string' ? env[key].trim() : '';
}

function parseCanonicalHttpsOrigin(raw, field, errors) {
  if (!raw) {
    errors.push(field + ' is required in production.');
    return null;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(field + ' must be a valid HTTPS origin.');
    return null;
  }

  if (parsed.protocol !== 'https:') {
    errors.push(field + ' must use HTTPS in production.');
  }
  if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    errors.push(field + ' cannot point to localhost or a loopback address in production.');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    errors.push(field + ' must contain only the canonical origin, without credentials, paths, query strings or fragments.');
  }

  return parsed;
}

function validateProductionConfig(env = process.env) {
  if (value(env, 'NODE_ENV') !== 'production') return [];

  const errors = [];
  const mongoUri = value(env, 'MONGO_URI');
  if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
    errors.push('MONGO_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
  } else {
    try {
      const parsedMongo = new URL(mongoUri);
      if (LOOPBACK_HOSTS.has(parsedMongo.hostname.toLowerCase())) {
        errors.push('MONGO_URI cannot point to localhost or a loopback address in production.');
      }
    } catch {
      errors.push('MONGO_URI is not a valid MongoDB connection string.');
    }
  }

  const jwtSecret = value(env, 'JWT_SECRET');
  if (jwtSecret.length < 32 || /^(replace|change|example|your[-_])/i.test(jwtSecret)) {
    errors.push('JWT_SECRET must be a non-placeholder secret with at least 32 characters.');
  }

  const mediaSecret = value(env, 'PRIVATE_MEDIA_SECRET');
  if (mediaSecret.length < 32 || /^(replace|change|example|your[-_])/i.test(mediaSecret)) {
    errors.push('PRIVATE_MEDIA_SECRET must be a non-placeholder secret with at least 32 characters.');
  }
  if (jwtSecret && mediaSecret && jwtSecret === mediaSecret) {
    errors.push('PRIVATE_MEDIA_SECRET must be different from JWT_SECRET.');
  }

  const origins = value(env, 'FRONTEND_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.length || origins.includes('*')) {
    errors.push('FRONTEND_ORIGIN must list one or more explicit HTTPS frontend origins; wildcard CORS is not allowed in production.');
  } else {
    origins.forEach((origin, index) => {
      parseCanonicalHttpsOrigin(origin, 'FRONTEND_ORIGIN entry ' + (index + 1), errors);
    });
  }

  parseCanonicalHttpsOrigin(value(env, 'FRONTEND_URL'), 'FRONTEND_URL', errors);
  parseCanonicalHttpsOrigin(value(env, 'API_PUBLIC_URL'), 'API_PUBLIC_URL', errors);

  const smtpHost = value(env, 'SMTP_HOST');
  const smtpPortText = value(env, 'SMTP_PORT') || '587';
  const smtpPort = Number(smtpPortText);
  const emailUser = value(env, 'EMAIL_USER');
  const emailPass = value(env, 'EMAIL_PASS');
  const emailFrom = value(env, 'EMAIL_FROM');
  const fromAddress = emailFrom.match(/<([^<>]+)>/)?.[1]?.trim() || emailFrom;

  if (!smtpHost) errors.push('SMTP_HOST is required in production for password recovery and invitation delivery.');
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    errors.push('SMTP_PORT must be a valid TCP port number.');
  }
  if (value(env, 'SMTP_SECURE') && !['true', 'false'].includes(value(env, 'SMTP_SECURE').toLowerCase())) {
    errors.push('SMTP_SECURE must be true or false.');
  }
  if (!emailUser) errors.push('EMAIL_USER is required in production for email delivery.');
  if (!emailPass) errors.push('EMAIL_PASS is required in production for email delivery.');
  if (!EMAIL_PATTERN.test(fromAddress)) errors.push('EMAIL_FROM must contain a valid sender email address.');

  return [...new Set(errors)];
}

module.exports = { validateProductionConfig, parseCanonicalHttpsOrigin };
