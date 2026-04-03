// controllers/landController.js — PostgreSQL compatible, no yearly_summary
const db = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');

// GET /api/land?farmer_id=&year=&season=
const getLandUsage = asyncHandler(async (req, res) => {
  const { farmer_id, year, season } = req.query;
  const conditions = ['1=1'];
  const params     = [];
  let   i          = 1;

  if (farmer_id) { conditions.push(`lu.farmer_id = $${i++}`); params.push(farmer_id); }
  if (year)      { conditions.push(`lu.year = $${i++}`);       params.push(year); }
  if (season)    { conditions.push(`lu.season = $${i++}`);     params.push(season); }

  const sql = `
    SELECT lu.*, f.name AS farmer_name, f.area AS farmer_area
    FROM land_usage lu
    JOIN farmers f ON f.id = lu.farmer_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY f.name, lu.season, lu.owner_name
  `;

  const [rows] = await db.query(sql, params);
  res.json({ success: true, data: rows });
});

// POST /api/land
const createLandUsage = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { farmer_id, owner_name, season, year, katha, notes } = req.body;

  const [farmer] = await db.query(
    `SELECT id FROM farmers WHERE id = $1 AND is_active = 1`, [farmer_id]
  );
  if (!farmer.length) return res.status(404).json({ success: false, message: 'Farmer not found' });

  const [result] = await db.query(`
    INSERT INTO land_usage (farmer_id, owner_name, season, year, katha, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [farmer_id, owner_name.trim(), season, parseInt(year), parseFloat(katha), notes?.trim() || null]);

  res.status(201).json({ success: true, data: { id: result[0].id } });
});

// PUT /api/land/:id
const updateLandUsage = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { owner_name, season, year, katha, notes } = req.body;

  const [existing] = await db.query(`SELECT id FROM land_usage WHERE id = $1`, [req.params.id]);
  if (!existing.length) return res.status(404).json({ success: false, message: 'Record not found' });

  await db.query(`
    UPDATE land_usage
    SET owner_name = $1, season = $2, year = $3, katha = $4, notes = $5
    WHERE id = $6
  `, [owner_name.trim(), season, parseInt(year), parseFloat(katha), notes?.trim() || null, req.params.id]);

  res.json({ success: true, message: 'Land usage updated' });
});

// DELETE /api/land/:id
const deleteLandUsage = asyncHandler(async (req, res) => {
  const [existing] = await db.query(`SELECT id FROM land_usage WHERE id = $1`, [req.params.id]);
  if (!existing.length) return res.status(404).json({ success: false, message: 'Record not found' });

  await db.query(`DELETE FROM land_usage WHERE id = $1`, [req.params.id]);
  res.json({ success: true, message: 'Record deleted' });
});

module.exports = { getLandUsage, createLandUsage, updateLandUsage, deleteLandUsage };
