'use strict';

const nodemailer = require('nodemailer');
const { getFrontendBaseUrl } = require('./invitationEmail');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function createPasswordResetUrl(token) {
  // Keep the secret in the fragment so it is not sent in HTTP requests/referrers.
  return getFrontendBaseUrl() + '/reset-password#token=' + encodeURIComponent(token);
}

function mailTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '');
  if (!host || !user || !pass) return null;

  const port = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

async function sendPasswordResetEmail({ email, fullName, resetUrl }) {
  const transport = mailTransport();
  if (!transport) return { sent: false, reason: 'SMTP is not configured.' };

  const from = String(process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  const safeName = escapeHtml(fullName);
  const safeUrl = escapeHtml(resetUrl);
  try {
    await transport.sendMail({
      from,
      to: email,
      subject: 'Reset your preschool workspace password',
      text: [
        'Hello ' + fullName + ',',
        '',
        'A request was made to reset the password for your preschool workspace account.',
        'Use the one-time link below to choose a new password:',
        resetUrl,
        '',
        'The link expires after 30 minutes and can be used once. If you did not request this, ignore this email.',
      ].join('\n'),
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#22344c;line-height:1.6">' +
        '<h2 style="color:#2f4fbd">Reset your password</h2>' +
        '<p>Hello ' + safeName + ',</p>' +
        '<p>A request was made to reset your preschool workspace password. Use the button below to choose a new password.</p>' +
        '<p><a href="' + safeUrl + '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#3655ce;color:white;text-decoration:none">Choose a new password</a></p>' +
        '<p>This one-time link expires after 30 minutes and can be used once. If you did not request this, you can safely ignore this email.</p></div>',
    });
    return { sent: true };
  } catch (error) {
    console.error('Password reset email delivery failed:', error?.code || error?.name || 'mail_error');
    return { sent: false, reason: 'Email delivery failed.' };
  }
}

module.exports = { createPasswordResetUrl, sendPasswordResetEmail };
