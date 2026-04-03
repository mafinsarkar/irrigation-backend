// controllers/farmersController.js — PostgreSQL compatible
const db = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');

// GET /api/farmers?area=&search=
const getAllFarmers = asyncHandler(async (req, res) => {
  const { area, search } = req.query;
  const conditions = ['is_active = 1'];
  const params     = [];
  let   i          = 1;

  if (area)   { conditions.push(`area = $${i++}`);         params.push(area); }
  if (search) { conditions.push(`name ILIKE $${i++}`);     params.push(`%${search}%`); }
  // ILIKE = case-insensitive LIKE in PostgreSQL (replaces MySQL's LIKE which is case-insensitive by default)

  const sql = `SELECT * FROM farmers WHERE ${conditions.join(' AND ')} ORDER BY name ASC`;
  const [rows] = await db.query(sql, params);
  res.json({ success: true, data: rows });
});

// GET /api/farmers/:id
const getFarmerById = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM farmers WHERE id = $1 AND is_active = 1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ success: false, message: 'Farmer not found' });
  res.json({ success: true, data: rows[0] });
});

// POST /api/farmers
const createFarmer = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { name, mobile, area } = req.body;
  const normalizedArea = area === 'Others' ? 'Purba Para' : area;

  const [result] = await db.query(`
    INSERT INTO farmers (name, mobile, area)
    VALUES ($1, $2, $3)
    RETURNING id
  `, [name.trim(), mobile?.trim() || null, normalizedArea]);

  res.status(201).json({ success: true, data: { id: result[0].id, name, mobile, area: normalizedArea } });
});

// PUT /api/farmers/:id
const updateFarmer = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { name, mobile, area } = req.body;
  const normalizedArea = area === 'Others' ? 'Purba Para' : area;

  const [result] = await db.query(`
    UPDATE farmers SET name = $1, mobile = $2, area = $3 WHERE id = $4
    RETURNING id
  `, [name.trim(), mobile?.trim() || null, normalizedArea, req.params.id]);

  if (!result.length) return res.status(404).json({ success: false, message: 'Farmer not found' });
  res.json({ success: true, message: 'Farmer updated' });
});

// DELETE /api/farmers/:id  (soft delete)
const deleteFarmer = asyncHandler(async (req, res) => {
  const [result] = await db.query(`
    UPDATE farmers SET is_active = 0 WHERE id = $1 RETURNING id
  `, [req.params.id]);

  if (!result.length) return res.status(404).json({ success: false, message: 'Farmer not found' });
  res.json({ success: true, message: 'Farmer deleted' });
});

module.exports = { getAllFarmers, getFarmerById, createFarmer, updateFarmer, deleteFarmer };
