'use strict';
const MAX_INSTALLMENTS = 24;
function normalizeInstallments(input, totalStandardFees, discount = 0) {
  if (!Array.isArray(input)) return { valid: false, message: 'Installments must be a list.' };
  if (input.length > MAX_INSTALLMENTS) return { valid: false, message: 'A fee schedule can contain at most 24 installments.' };
  if (!input.length) return { valid: true, value: [] };
  const payable = Math.round((Number(totalStandardFees) - Number(discount || 0)) * 100) / 100;
  let sum = 0, previousDate = '';
  const value = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = input[index] || {};
    const dueDate = String(item.dueDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { valid: false, message: 'Installment ' + (index + 1) + ' needs a valid due date.' };
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return { valid: false, message: 'Installment ' + (index + 1) + ' has an invalid due date.' };
    if (previousDate && dueDate < previousDate) return { valid: false, message: 'Installment due dates must be in chronological order.' };
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) return { valid: false, message: 'Installment ' + (index + 1) + ' must have a valid amount greater than zero (up to two decimals).' };
    const label = String(item.label || ('Installment ' + (index + 1))).trim();
    if (!label || label.length > 60) return { valid: false, message: 'Installment names must be 1–60 characters.' };
    sum = Math.round((sum + amount) * 100) / 100;
    previousDate = dueDate;
    value.push({ label, dueDate, amount: Math.round(amount * 100) / 100 });
  }
  if (Math.abs(sum - payable) > 0.01) return { valid: false, message: 'Installment amounts must total the fee after discount (₹' + payable.toFixed(2) + ').' };
  return { valid: true, value };
}
function allocatePaymentsToInstallments(installments, totalPaid, today = new Date().toISOString().slice(0, 10)) {
  let remainingPaid = Math.max(0, Number(totalPaid) || 0);
  return (Array.isArray(installments) ? installments : []).map((item) => {
    const amount = Math.max(0, Number(item.amount) || 0);
    const paidAmount = Math.min(amount, Math.round(remainingPaid * 100) / 100);
    remainingPaid = Math.max(0, Math.round((remainingPaid - paidAmount) * 100) / 100);
    const balance = Math.max(0, Math.round((amount - paidAmount) * 100) / 100);
    return { ...item, paidAmount, balance, status: balance <= 0 ? 'paid' : item.dueDate < today ? 'overdue' : paidAmount > 0 ? 'partial' : 'upcoming' };
  });
}
module.exports = { MAX_INSTALLMENTS, normalizeInstallments, allocatePaymentsToInstallments };
