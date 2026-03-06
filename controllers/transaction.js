const { db } = require("../config/db");
const { pool } = require('../config/db')

// Async handler
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/transactions
 * Returns all active transactions
 */
const getTransactions = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT t.*,
     u.name AS created_by
    FROM "transaction" t
    JOIN "user" u
      ON u.id = t.created_by 
    WHERE t.deleted_at IS NULL
    ORDER BY t.amount DESC
  `);

    res.status(200).json({ success: true, data: rows });
});

/**
 * GET /api/transactions/:id
 * Returns transaction by ID
 */
const getTransactionById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows, rowCount } = await db.query(`
        SELECT *
        FROM "transaction"
        WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    res.status(200).json({ success: true, data: rows[0] });
});

/**
 * POST /api/transactions
 * Creates a new transaction
 */
const createTransaction = asyncHandler(async (req, res) => {
    const {
        amount,
        type,
        category,
        description,
        payment_method,
        product_id,
        service_id,
        quantity,
        created_by,
    } = req.body;

    if (!amount || !type || !category || !payment_method || !quantity || !created_by) {
        return res.status(400).json({
            success: false,
            error: "amount, type, category, payment_method, quantity, created_by are required"
        });
    }

    const { rows } = await db.query(`
        INSERT INTO "transaction" 
        (amount, type, category, description, payment_method, product_id, service_id, quantity, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *;
    `, [
        amount,
        type,
        category,
        description || null,
        payment_method,
        product_id || null,
        service_id || null,
        quantity,
        created_by
    ]);

    res.status(201).json({ success: true, data: rows[0] });
});

/**
 * PUT /api/transactions/:id
 * Updates an existing transaction
 */
const updateTransaction = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        amount,
        type,
        category,
        description,
        payment_method,
        product_id,
        service_id,
        quantity,
        created_by,
    } = req.body;

    if (!amount || !type || !category || !payment_method) {
        return res.status(400).json({
            success: false,
            error: "amount, type, category, and payment_method are required"
        });
    }

    const { rows, rowCount } = await db.query(`
        UPDATE "transaction"
        SET amount=$1, type=$2, category=$3, description=$4,
            payment_method=$5, product_id=$6, service_id=$7,
            quantity=$8, created_by=$9, updated_at=NOW()
        WHERE id=$10 AND deleted_at IS NULL
        RETURNING *;
    `, [
        amount,
        type,
        category,
        description || null,
        payment_method,
        product_id || null,
        service_id || null,
        quantity || 1,
        created_by,
        id
    ]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    res.status(200).json({ success: true, data: rows[0] });
});

/**
 * DELETE /api/transactions/:id
 * Soft delete a transaction
 */
const deleteTransaction = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rowCount } = await db.query(`
        UPDATE "transaction"
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    res.status(204).send();
});

/**
 * GET /api/transactions/top
 * Returns top 5 transactions by amount
 */
const getTopTransaction = asyncHandler(async (req, res) => {
    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    // Start of day (00:00:00)
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    // End of day (exclusive, i.e., start of next day)
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(24, 0, 0, 0);

    try {
        const { rows } = await db.query(
            `
      SELECT
        COUNT(*) FILTER (WHERE t.deleted_at IS NULL) AS total_transactions,
        COUNT(*) FILTER (WHERE t.type = 'Sales' AND t.deleted_at IS NULL) AS total_sales_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'Sales' AND t.deleted_at IS NULL), 0) AS total_sales_amount,
        COUNT(*) FILTER (WHERE t.type = 'Sales' AND t.payment_method = 'Cash' AND t.deleted_at IS NULL) AS cash_sales_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'Sales' AND t.payment_method = 'Cash' AND t.deleted_at IS NULL), 0) AS cash_sales_amount,
        COUNT(*) FILTER (WHERE t.type = 'Sales' AND t.payment_method = 'Debit' AND t.deleted_at IS NULL) AS debit_sales_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'Sales' AND t.payment_method = 'Debit' AND t.deleted_at IS NULL), 0) AS debit_sales_amount
      FROM "transaction" t
      WHERE
        t.created_at >= $1
        AND t.created_at < $2
        AND t.status = 'finished'
      `,
            [startOfDay.toISOString(), endOfDay.toISOString()]
        );

        res.json(rows[0]);
    } catch (error) {
        console.error("Daily summary error:", error);
        res.status(500).json({ error: "Failed to fetch daily summary" });
    }
});

/**
 * GET /api/transactions/monthly
 * Returns top 5 transactions in a given month
 * Query param: month=YYYY-MM
 */
const getMonthlyTransactions = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ success: false, error: "Month query parameter is required (YYYY-MM)" });
    }

    const { rows } = await db.query(
        `
        SELECT *
        FROM "transaction"
        WHERE deleted_at IS NULL
          AND created_at >= date_trunc('month', $1::date)
          AND created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
        ORDER BY amount DESC;
    `
        ,
        [`${month}-01`]);

    res.status(200).json({ success: true, data: rows });
});

module.exports = {
    getTransactions,
    getTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getTopTransaction,
    getMonthlyTransactions,
};
