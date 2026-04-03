// routes/index.js — Central route registry
// PostgreSQL / Supabase compatible. No ON DUPLICATE KEY, no yearly_summary.

const express   = require('express');
const router    = express.Router();
const { body }  = require('express-validator');

const farmersCtrl   = require('../controllers/farmersController');
const landCtrl      = require('../controllers/landController');
const paymentsCtrl  = require('../controllers/paymentsController');
const ratesCtrl     = require('../controllers/ratesController');
const dashboardCtrl = require('../controllers/dashboardController');

const AREAS        = ['Poschim Para', 'Modhho Para', 'Purba Para', 'Others'];
const SEASONS      = ['Borsha', 'Boro'];
const currentYear  = new Date().getFullYear();

// ── Farmers ─────────────────────────────────────────────────
router.get('/farmers',      farmersCtrl.getAllFarmers);
router.get('/farmers/:id',  farmersCtrl.getFarmerById);
router.post('/farmers', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('area').isIn(AREAS).withMessage('Invalid area'),
  body('mobile').optional({ checkFalsy: true }),
], farmersCtrl.createFarmer);
router.put('/farmers/:id', [
  body('name').notEmpty().trim(),
  body('area').isIn(AREAS),
], farmersCtrl.updateFarmer);
router.delete('/farmers/:id', farmersCtrl.deleteFarmer);

// ── Land Usage ───────────────────────────────────────────────
router.get('/land',      landCtrl.getLandUsage);
router.post('/land', [
  body('farmer_id').isInt({ min: 1 }).withMessage('Valid farmer_id required'),
  body('owner_name').notEmpty().trim().withMessage('Owner name required'),
  body('season').isIn(SEASONS).withMessage('season must be Borsha or Boro'),
  body('year').isInt({ min: 2000, max: currentYear + 5 }).withMessage('Invalid year'),
  body('katha').isFloat({ min: 0.5 }).withMessage('katha must be >= 0.5'),
], landCtrl.createLandUsage);
router.put('/land/:id', [
  body('owner_name').notEmpty().trim(),
  body('season').isIn(SEASONS),
  body('year').isInt({ min: 2000, max: currentYear + 5 }),
  body('katha').isFloat({ min: 0.5 }),
], landCtrl.updateLandUsage);
router.delete('/land/:id', landCtrl.deleteLandUsage);

// ── Payments ─────────────────────────────────────────────────
router.get('/payments',      paymentsCtrl.getPayments);
router.post('/payments', [
  body('farmer_id').isInt({ min: 1 }),
  body('year').isInt({ min: 2000, max: currentYear + 5 }),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be positive'),
  body('payment_date').isDate().withMessage('Valid date required (YYYY-MM-DD)'),
], paymentsCtrl.createPayment);
router.delete('/payments/:id', paymentsCtrl.deletePayment);

// ── Rates ────────────────────────────────────────────────────
router.get('/rates',         ratesCtrl.getRates);
router.get('/rates/years',   ratesCtrl.getAvailableYears);
router.post('/rates',        ratesCtrl.setRate);

// ── Dashboard — fully dynamic, no yearly_summary ─────────────
router.get('/dashboard',             dashboardCtrl.getDashboardStats);
router.get('/dashboard/summary',     dashboardCtrl.getSummary);
router.get('/dashboard/defaulters',  dashboardCtrl.getDefaulters);
router.get('/dashboard/farmer/:id',  dashboardCtrl.getFarmerBilling);
router.get('/dashboard/export',      dashboardCtrl.getExportData);

module.exports = router;
