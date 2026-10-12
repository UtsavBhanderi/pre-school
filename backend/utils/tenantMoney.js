'use strict';

const MAX_MONEY_PAISE = 100000000000; // ₹100 crore maximum per line/transaction.

function parseMoneyToPaise(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const paise = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise < 0 || paise > MAX_MONEY_PAISE) return null;
  return paise;
}

function formatPaise(paise) {
  if (!Number.isSafeInteger(paise)) return null;
  return (paise / 100).toFixed(2);
}

function normalizeInvoiceLines(lines) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 30) {
    return { valid: false, error: 'Add between 1 and 30 invoice items.' };
  }

  const normalized = [];
  let subtotalPaise = 0;
  for (const [index, item] of lines.entries()) {
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    const quantity = Number(item?.quantity ?? 1);
    const unitAmountPaise = parseMoneyToPaise(item?.unitAmount);
    if (description.length < 2 || description.length > 160) {
      return { valid: false, error: 'Item ' + (index + 1) + ' needs a description between 2 and 160 characters.' };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      return { valid: false, error: 'Item ' + (index + 1) + ' quantity must be a whole number from 1 to 1000.' };
    }
    if (unitAmountPaise === null) {
      return { valid: false, error: 'Item ' + (index + 1) + ' has an invalid amount.' };
    }
    const lineTotalPaise = unitAmountPaise * quantity;
    if (!Number.isSafeInteger(lineTotalPaise) || lineTotalPaise > MAX_MONEY_PAISE) {
      return { valid: false, error: 'Item ' + (index + 1) + ' amount is too large.' };
    }
    subtotalPaise += lineTotalPaise;
    if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise > MAX_MONEY_PAISE) {
      return { valid: false, error: 'Invoice subtotal is too large.' };
    }
    normalized.push({ description, quantity, unitAmountPaise, lineTotalPaise });
  }

  return { valid: true, lineItems: normalized, subtotalPaise };
}

function calculateInvoiceBalance(totalAmountPaise, transactions) {
  if (!Number.isSafeInteger(totalAmountPaise) || totalAmountPaise < 0) {
    throw new TypeError('Invoice total must be a non-negative integer in paise.');
  }
  const netPaidPaise = (Array.isArray(transactions) ? transactions : []).reduce((total, transaction) => {
    if (!Number.isSafeInteger(transaction?.amountPaise) || transaction.amountPaise < 0) {
      throw new TypeError('Transaction amounts must be non-negative integers in paise.');
    }
    if (transaction.type === 'payment') return total + transaction.amountPaise;
    if (transaction.type === 'refund') return total - transaction.amountPaise;
    throw new TypeError('Unknown fee transaction type.');
  }, 0);
  return {
    netPaidPaise,
    outstandingPaise: Math.max(0, totalAmountPaise - netPaidPaise),
    overpaidPaise: Math.max(0, netPaidPaise - totalAmountPaise),
  };
}

function calculateInvoiceBalanceForStatus(status, totalAmountPaise, transactions) {
  const balance = calculateInvoiceBalance(totalAmountPaise, transactions);
  // A void invoice is not an amount owed, even if its original face value is retained for audit.
  if (status === 'void') return { ...balance, outstandingPaise: 0 };
  if (status !== 'open') throw new TypeError('Unknown invoice status.');
  return balance;
}

module.exports = { MAX_MONEY_PAISE, parseMoneyToPaise, formatPaise, normalizeInvoiceLines, calculateInvoiceBalance, calculateInvoiceBalanceForStatus };
