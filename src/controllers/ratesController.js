// controllers/ratesController.js — PostgreSQL / Supabase compatible
const db = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/rates?year=2025
const getRates = asyncHandler(async (req, res) => {
  const { year } = req.query;
  const sql    = year
    ? `SELECT * FROM rates WHERE year = $1 ORDER BY season ASC`
    : `SELECT * FROM rates ORDER BY year DESC, season ASC`;
  const params = year ? [year] : [];
  const [rows] = await db.query(sql, params);
  res.json({ success: true, data: rows });
});

// GET /api/rates/years
const getAvailableYears = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT DISTINCT year FROM rates ORDER BY year DESC`
  );
  res.json({ success: true, data: rows.map(r => r.year) });
});

// POST /api/rates — upsert using PostgreSQL ON CONFLICT (replaces MySQL ON DUPLICATE KEY)
const setRate = asyncHandler(async (req, res) => {
  const { year, season, rate_per_bigha } = req.body;

  if (!year || !season || !rate_per_bigha) {
    return res.status(400).json({ success: false, message: 'year, season, rate_per_bigha are required' });
  }
  if (!['Borsha', 'Boro'].includes(season)) {
    return res.status(400).json({ success: false, message: 'season must be Borsha or Boro' });
  }

  // PostgreSQL upsert syntax — ON CONFLICT replaces MySQL's ON DUPLICATE KEY UPDATE
  await db.query(`
    INSERT INTO rates (year, season, rate_per_bigha)
    VALUES ($1, $2, $3)
    ON CONFLICT (year, season)
    DO UPDATE SET rate_per_bigha = EXCLUDED.rate_per_bigha
  `, [parseInt(year), season, parseFloat(rate_per_bigha)]);

  res.json({ success: true, message: 'Rate saved successfully' });
});

module.exports = { getRates, getAvailableYears, setRate };
