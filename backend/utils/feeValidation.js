'use strict';

const MAX_FEE_AMOUNT = 10000000;

function parseFeeAmount(value, fieldName, options = {}) {
  const allowZero = options.allowZero !== false;
  if (value === undefined || value === null || String(value).trim() === '') return { valid: false, message: fieldName + ' is required.' };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_FEE_AMOUNT) return { valid: false, message: fieldName + ' must be a valid non-negative amount.' };
  const paise = Math.round(amount * 100);
  if (Math.abs(amount * 100 - paise) > 1e-7) return { valid: false, message: fieldName + ' can have at most two decimal places.' };
  const normalized = paise / 100;
  if (!allowZero && normalized <= 0) return { valid: false, message: fieldName + ' must be greater than zero.' };
  return { valid: true, value: normalized };
}

function validPaymentDate(value) {
  if (!value) return true;
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const month = Number(match[1]); const day = Number(match[2]); const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizePaymentDetails(details) {
  if (!Array.isArray(details)) return { valid: false, message: 'Payment details must be a list.' };
  if (details.length > 100) return { valid: false, message: 'A fee record cannot contain more than 100 payment entries.' };
  const paymentDetails = [];
  for (let index = 0; index < details.length; index += 1) {
    const item = details[index] || {};
    const amount = parseFeeAmount(item.amount, 'Payment ' + (index + 1), { allowZero: false });
    if (!amount.valid) return amount;
    const date = typeof item.date === 'string' ? item.date.trim() : '';
    const time = typeof item.time === 'string' ? item.time.trim() : '';
    if (date && !validPaymentDate(date)) return { valid: false, message: 'Payment ' + (index + 1) + ' must use a valid MM/DD/YYYY date.' };
    if (date.length > 20 || time.length > 40) return { valid: false, message: 'Payment date or time is too long.' };
    paymentDetails.push({ date, time, amount: amount.value });
  }
  return { valid: true, value: paymentDetails };
}

function validatePaymentHistoryUpdate(existingRecord = {}, incomingDetails = []) {
  const existingDetails = Array.isArray(existingRecord.paymentDetails) ? existingRecord.paymentDetails : [];
  if (!Array.isArray(incomingDetails)) {
    return { valid: false, code: 'INVALID_PAYMENT_HISTORY', message: 'Payment history must be a list.' };
  }
  if (incomingDetails.length < existingDetails.length) {
    return { valid: false, code: 'PAYMENT_HISTORY_IMMUTABLE', message: 'Previously recorded payments cannot be removed. Add a new payment entry instead.' };
  }

  let previousDetailTotal = 0;
  for (let index = 0; index < existingDetails.length; index += 1) {
    const previous = existingDetails[index] || {};
    const incoming = incomingDetails[index] || {};
    const previousAmount = Math.round(Number(previous.amount || 0) * 100) / 100;
    const incomingAmount = Math.round(Number(incoming.amount || 0) * 100) / 100;
    previousDetailTotal += previousAmount;
    if (
      String(previous.date || '').trim() !== String(incoming.date || '').trim()
      || String(previous.time || '').trim() !== String(incoming.time || '').trim()
      || previousAmount !== incomingAmount
    ) {
      return { valid: false, code: 'PAYMENT_HISTORY_IMMUTABLE', message: 'Previously recorded payments cannot be changed. Add a new payment entry instead.' };
    }
  }

  previousDetailTotal = Math.round(previousDetailTotal * 100) / 100;
  const previousTotalPaid = Math.round(Number(existingRecord.totalFeesPaid || 0) * 100) / 100;
  if (previousTotalPaid + 0.001 < previousDetailTotal) {
    return { valid: false, code: 'PAYMENT_HISTORY_RECONCILIATION_REQUIRED', message: 'The saved payment entries do not match the recorded total. Contact the preschool administrator before changing this fee record.' };
  }

  const openingBalancePaid = existingRecord.openingBalancePaid === undefined || existingRecord.openingBalancePaid === null
    ? Math.round((previousTotalPaid - previousDetailTotal) * 100) / 100
    : Math.round(Number(existingRecord.openingBalancePaid || 0) * 100) / 100;
  const incomingTotal = Math.round(incomingDetails.reduce((sum, item) => sum + Number(item.amount || 0), 0) * 100) / 100;

  return {
    valid: true,
    openingBalancePaid,
    totalFeesPaid: Math.round((openingBalancePaid + incomingTotal) * 100) / 100,
  };
}

function hasFeePaymentHistory(record = {}) {
  const totalPaid = Number(record.totalFeesPaid || 0);
  return (Number.isFinite(totalPaid) && totalPaid > 0)
    || (Array.isArray(record.paymentDetails) && record.paymentDetails.length > 0);
}

function validateFeeAmounts(input = {}) {
  const total = parseFeeAmount(input.totalStandardFees, 'Total class fees');
  if (!total.valid) return total;
  const discount = parseFeeAmount(input.discount === undefined ? 0 : input.discount, 'Discount');
  if (!discount.valid) return discount;
  if (discount.value > total.value) return { valid: false, message: 'Discount cannot be greater than the total class fees.' };
  let paymentDetails = Array.isArray(input.paymentDetails) ? input.paymentDetails : [];
  let totalFeesPaid;
  if (input.paymentDetailsProvided) {
    const normalized = normalizePaymentDetails(paymentDetails);
    if (!normalized.valid) return normalized;
    paymentDetails = normalized.value;
    totalFeesPaid = Math.round(paymentDetails.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  } else {
    const paid = parseFeeAmount(input.totalFeesPaid === undefined ? 0 : input.totalFeesPaid, 'Total paid');
    if (!paid.valid) return paid;
    totalFeesPaid = paid.value;
  }
  return { valid: true, value: { totalStandardFees: total.value, discount: discount.value, paymentDetails, totalFeesPaid } };
}

module.exports = { MAX_FEE_AMOUNT, parseFeeAmount, validPaymentDate, normalizePaymentDetails, validateFeeAmounts, validatePaymentHistoryUpdate, hasFeePaymentHistory };
