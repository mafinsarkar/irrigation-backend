// utils/calculator.js - Core billing calculation engine

/**
 * Convert katha to bigha
 * 1 Bigha = 20 Katha
 */
const kathaToBigha = (katha) => parseFloat((katha / 20).toFixed(4));

/**
 * Calculate cost for a season
 * cost = bigha × rate_per_bigha
 */
const calculateSeasonCost = (katha, ratePerBigha) => {
  const bigha = kathaToBigha(katha);
  return parseFloat((bigha * ratePerBigha).toFixed(2));
};

/**
 * Calculate final balance for a farmer in a given year
 * balance = borsha_cost + boro_cost + previous_due - total_paid
 */
const calculateBalance = ({ borshaKatha, boroKatha, borshaRate, boroRate, previousDue, totalPaid }) => {
  const borshaBigha = kathaToBigha(borshaKatha || 0);
  const boroBigha   = kathaToBigha(boroKatha   || 0);

  const borshaCost = parseFloat((borshaBigha * (borshaRate || 0)).toFixed(2));
  const boroCost   = parseFloat((boroBigha   * (boroRate   || 0)).toFixed(2));

  const totalPayable = parseFloat((borshaCost + boroCost + (previousDue || 0)).toFixed(2));
  const balance      = parseFloat((totalPayable - (totalPaid || 0)).toFixed(2));

  return {
    borshaBigha,
    boroBigha,
    borshaCost,
    boroCost,
    totalPayable,
    balance,
    isDefaulter: balance > 0,
  };
};

module.exports = { kathaToBigha, calculateSeasonCost, calculateBalance };
