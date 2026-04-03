// controllers/paymentsController.js — PostgreSQL compatible, no yearly_summary
const db = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');

// GET /api/payments?farmer_id=&year=
const getPayments = asyncHandler(async (req, res) => {
  const { farmer_id, year } = req.query;
  const conditions = ['1=1'];
  const params     = [];
  let   i          = 1;

  if (farmer_id) { conditions.push(`p.farmer_id = $${i++}`); params.push(farmer_id); }
  if (year)      { conditions.push(`p.year = $${i++}`);       params.push(year); }

  const sql = `
    SELECT p.*, f.name AS farmer_name, f.area AS farmer_area
    FROM payments p
    JOIN farmers f ON f.id = p.farmer_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.payment_date DESC
  `;

  const [rows] = await db.query(sql, params);
  res.json({ success: true, data: rows });
});

// POST /api/payments
const createPayment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { farmer_id, year, amount, payment_date, notes, recorded_by } = req.body;

  const [farmer] = await db.query(
    `SELECT id FROM farmers WHERE id = $1 AND is_active = 1`, [farmer_id]
  );
  if (!farmer.length) return res.status(404).json({ success: false, message: 'Farmer not found' });

  const [result] = await db.query(`
    INSERT INTO payments (farmer_id, year, amount, payment_date, notes, recorded_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [farmer_id, parseInt(year), parseFloat(amount), payment_date, notes?.trim() || null, recorded_by?.trim() || null]);

  res.status(201).json({ success: true, data: { id: result[0].id } });
});

// DELETE /api/payments/:id
const deletePayment = asyncHandler(async (req, res) => {
  const [existing] = await db.query(`SELECT id FROM payments WHERE id = $1`, [req.params.id]);
  if (!existing.length) return res.status(404).json({ success: false, message: 'Payment not found' });

  await db.query(`DELETE FROM payments WHERE id = $1`, [req.params.id]);
  res.json({ success: true, message: 'Payment deleted' });
});

module.exports = { getPayments, createPayment, deletePayment };
