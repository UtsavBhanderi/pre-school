'use strict';

const asAmount = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
};

const calculateRemaining = (total, paid, discount) =>
  Math.max(0, asAmount(total) - asAmount(paid) - asAmount(discount));

module.exports = { asAmount, calculateRemaining };
