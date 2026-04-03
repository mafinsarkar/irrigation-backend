// controllers/dashboardController.js
// Fully dynamic — calculates everything from land_usage, rates, payments in real-time.
// No yearly_summary table dependency. PostgreSQL / Supabase compatible.

const db = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE CORE BILLING CTE
// Calculates per-farmer totals dynamically for a given year ($1).
// land_costs  → sums katha/bigha/cost per farmer per season
// paid_totals → sums all payments per farmer
// billing     → joins farmers with land_costs + paid_totals → balance
// ─────────────────────────────────────────────────────────────────────────────
const BILLING_CTE = `
  WITH land_costs AS (
    SELECT
      lu.farmer_id,
      COALESCE(SUM(CASE WHEN lu.season = 'Borsha'
        THEN lu.katha ELSE 0 END), 0)                        AS borsha_katha,
      COALESCE(SUM(CASE WHEN lu.season = 'Boro'
        THEN lu.katha ELSE 0 END), 0)                        AS boro_katha,
      COALESCE(SUM(CASE WHEN lu.season = 'Borsha'
        THEN lu.bigha ELSE 0 END), 0)                        AS borsha_bigha,
      COALESCE(SUM(CASE WHEN lu.season = 'Boro'
        THEN lu.bigha ELSE 0 END), 0)                        AS boro_bigha,
      COALESCE(SUM(CASE WHEN lu.season = 'Borsha'
        THEN lu.bigha * r.rate_per_bigha ELSE 0 END), 0)     AS borsha_cost,
      COALESCE(SUM(CASE WHEN lu.season = 'Boro'
        THEN lu.bigha * r.rate_per_bigha ELSE 0 END), 0)     AS boro_cost
    FROM land_usage lu
    LEFT JOIN rates r
      ON r.year = lu.year AND r.season = lu.season
    WHERE lu.year = $1
    GROUP BY lu.farmer_id
  ),
  paid_totals AS (
    SELECT
      farmer_id,
      COALESCE(SUM(amount), 0) AS total_paid
    FROM payments
    WHERE year = $1
    GROUP BY farmer_id
  ),
  billing AS (
    SELECT
      f.id                                                  AS farmer_id,
      f.name                                                AS farmer_name,
      f.mobile,
      f.area,
      COALESCE(lc.borsha_katha, 0)                          AS borsha_katha,
      COALESCE(lc.boro_katha,   0)                          AS boro_katha,
      COALESCE(lc.borsha_bigha, 0)                          AS borsha_bigha,
      COALESCE(lc.boro_bigha,   0)                          AS boro_bigha,
      COALESCE(lc.borsha_cost,  0)                          AS borsha_cost,
      COALESCE(lc.boro_cost,    0)                          AS boro_cost,
      COALESCE(lc.borsha_cost, 0) + COALESCE(lc.boro_cost, 0) AS total_payable,
      COALESCE(pt.total_paid, 0)                            AS total_paid,
      COALESCE(lc.borsha_cost, 0) + COALESCE(lc.boro_cost, 0)
        - COALESCE(pt.total_paid, 0)                        AS balance
    FROM farmers f
    INNER JOIN land_costs lc ON lc.farmer_id = f.id
    LEFT JOIN  paid_totals pt ON pt.farmer_id = f.id
    WHERE f.is_active = 1
  )
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard?year=2025
// Lightweight — only aggregate stats (for dashboard header cards)
// ─────────────────────────────────────────────────────────────────────────────
const getDashboardStats = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ success: false, message: 'year is required' });

  const sql = `
    ${BILLING_CTE}
    SELECT
      COUNT(*)::INTEGER                                        AS total_farmers,
      COALESCE(SUM(total_payable), 0)::NUMERIC(12,2)          AS total_payable,
      COALESCE(SUM(total_paid), 0)::NUMERIC(12,2)             AS total_collected,
      COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)
        ::NUMERIC(12,2)                                        AS outstanding_due,
      COUNT(CASE WHEN balance > 0 THEN 1 END)::INTEGER        AS defaulters
    FROM billing
  `;

  const [rows] = await db.query(sql, [year]);
  const d = rows[0];

  res.json({
    success: true,
    data: {
      total_farmers:   parseInt(d.total_farmers),
      total_payable:   parseFloat(d.total_payable),
      total_collected: parseFloat(d.total_collected),
      outstanding_due: parseFloat(d.outstanding_due),
      defaulters:      parseInt(d.defaulters),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/summary?year=2025&area=Purba+Para
// Full farmer billing table + aggregate stats, with optional area filter
// ─────────────────────────────────────────────────────────────────────────────
const getSummary = asyncHandler(async (req, res) => {
  const { year, area } = req.query;
  if (!year) return res.status(400).json({ success: false, message: 'year is required' });

  // $1 = year (used inside CTE), $2 = area (optional, used after CTE)
  const hasArea  = Boolean(area);
  const params   = hasArea ? [year, area] : [year];
  const areaWhere = hasArea ? `AND area = $2` : '';

  const sql = `
    ${BILLING_CTE}
    SELECT
      farmer_id,
      farmer_name,
      mobile,
      area,
      borsha_katha,
      boro_katha,
      borsha_bigha,
      boro_bigha,
      borsha_cost,
      boro_cost,
      total_payable,
      total_paid,
      balance
    FROM billing
    WHERE 1=1 ${areaWhere}
    ORDER BY area, farmer_name
  `;

  const [rows] = await db.query(sql, params);

  // Compute stats from the already-fetched rows — no second DB call needed
  const stats = rows.reduce(
    (acc, r) => {
      acc.totalFarmers  += 1;
      acc.totalPayable  += parseFloat(r.total_payable || 0);
      acc.totalPaid     += parseFloat(r.total_paid    || 0);
      acc.totalBalance  += parseFloat(r.balance       || 0);
      if (parseFloat(r.balance) > 0) acc.defaulterCount += 1;
      return acc;
    },
    { totalFarmers: 0, totalPayable: 0, totalPaid: 0, totalBalance: 0, defaulterCount: 0 }
  );

  res.json({ success: true, data: { stats, farmers: rows } });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/defaulters?year=2025
// Farmers with balance > 0, sorted by largest debt first
// ─────────────────────────────────────────────────────────────────────────────
const getDefaulters = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ success: false, message: 'year is required' });

  const sql = `
    ${BILLING_CTE}
    SELECT
      farmer_id,
      farmer_name,
      mobile,
      area,
      total_payable,
      total_paid,
      balance
    FROM billing
    WHERE balance > 0
    ORDER BY balance DESC
  `;

  const [rows] = await db.query(sql, [year]);
  res.json({ success: true, data: rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/farmer/:id?year=2025
// Per-farmer detail: land usage rows + payments + yearly summary
// ─────────────────────────────────────────────────────────────────────────────
const getFarmerBilling = asyncHandler(async (req, res) => {
  const farmerId = req.params.id;
  const { year } = req.query;

  // Parameterize year filter to avoid SQL injection
  const luYearFilter = year ? `AND lu.year = $2` : '';
  const pyYearFilter = year ? `AND p.year  = $2` : '';
  const params       = year ? [farmerId, year] : [farmerId];

  // 1. Land usage rows with cost per row
  const [landRows] = await db.query(`
    SELECT
      lu.id,
      lu.owner_name,
      lu.season,
      lu.year,
      lu.katha,
      lu.bigha,
      r.rate_per_bigha,
      COALESCE(lu.bigha * r.rate_per_bigha, 0) AS cost
    FROM land_usage lu
    LEFT JOIN rates r ON r.year = lu.year AND r.season = lu.season
    WHERE lu.farmer_id = $1 ${luYearFilter}
    ORDER BY lu.year DESC, lu.season
  `, params);

  // 2. Payment history
  const [paymentRows] = await db.query(`
    SELECT id, year, amount, payment_date, notes, recorded_by
    FROM payments
    WHERE farmer_id = $1 ${pyYearFilter}
    ORDER BY payment_date DESC
  `, params);

  // 3. Year-wise billing summary for this farmer
  const [summaryRows] = await db.query(`
    WITH lc AS (
      SELECT
        lu.year,
        COALESCE(SUM(CASE WHEN lu.season = 'Borsha'
          THEN lu.bigha * r.rate_per_bigha ELSE 0 END), 0) AS borsha_cost,
        COALESCE(SUM(CASE WHEN lu.season = 'Boro'
          THEN lu.bigha * r.rate_per_bigha ELSE 0 END), 0) AS boro_cost
      FROM land_usage lu
      LEFT JOIN rates r ON r.year = lu.year AND r.season = lu.season
      WHERE lu.farmer_id = $1
      GROUP BY lu.year
    ),
    pd AS (
      SELECT year, COALESCE(SUM(amount), 0) AS total_paid
      FROM payments
      WHERE farmer_id = $1
      GROUP BY year
    )
    SELECT
      lc.year,
      lc.borsha_cost,
      lc.boro_cost,
      lc.borsha_cost + lc.boro_cost          AS total_payable,
      COALESCE(pd.total_paid, 0)             AS total_paid,
      lc.borsha_cost + lc.boro_cost
        - COALESCE(pd.total_paid, 0)         AS balance
    FROM lc
    LEFT JOIN pd ON pd.year = lc.year
    ORDER BY lc.year DESC
  `, [farmerId]);

  res.json({
    success: true,
    data: { landUsage: landRows, payments: paymentRows, summary: summaryRows },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/export?year=2025&area=
// Data for CSV export — double-quoted aliases for PostgreSQL compatibility
// ─────────────────────────────────────────────────────────────────────────────
const getExportData = asyncHandler(async (req, res) => {
  const { year, area } = req.query;
  if (!year) return res.status(400).json({ success: false, message: 'year is required' });

  const hasArea   = Boolean(area);
  const params    = hasArea ? [year, area] : [year];
  const areaWhere = hasArea ? `AND area = $2` : '';

  const sql = `
    ${BILLING_CTE}
    SELECT
      farmer_name                          AS "Farmer Name",
      COALESCE(mobile, '')                 AS "Mobile",
      area                                 AS "Area",
      borsha_katha                         AS "Borsha Katha",
      ROUND(borsha_bigha::NUMERIC, 3)      AS "Borsha Bigha",
      ROUND(borsha_cost::NUMERIC, 2)       AS "Borsha Cost (INR)",
      boro_katha                           AS "Boro Katha",
      ROUND(boro_bigha::NUMERIC, 3)        AS "Boro Bigha",
      ROUND(boro_cost::NUMERIC, 2)         AS "Boro Cost (INR)",
      ROUND(total_payable::NUMERIC, 2)     AS "Total Payable (INR)",
      ROUND(total_paid::NUMERIC, 2)        AS "Total Paid (INR)",
      ROUND(balance::NUMERIC, 2)           AS "Balance (INR)"
    FROM billing
    WHERE 1=1 ${areaWhere}
    ORDER BY area, farmer_name
  `;

  const [rows] = await db.query(sql, params);
  res.json({ success: true, data: rows });
});

module.exports = {
  getDashboardStats,
  getSummary,
  getDefaulters,
  getFarmerBilling,
  getExportData,
};
