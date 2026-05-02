const { db } = require("../config/db");

// Async handler
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/transactions
 */
const getTransactions = asyncHandler(async (req, res) => {
    const { date, month } = req.query;

    let whereClause = ``;
    const params = [];

    if (date) {
        params.push(date);
        whereClause += `
      AND t.created_at >= $${params.length}::date
      AND t.created_at < $${params.length}::date + INTERVAL '1 day'
    `;
    }

    if (month) {
        params.push(`${month}-01`);
        whereClause += `
      AND t.created_at >= date_trunc('month', $${params.length}::date)
      AND t.created_at < date_trunc('month', $${params.length}::date) + INTERVAL '1 month'
    `;
    }

    if (!date && !month) {
        const today = new Date().toISOString().slice(0, 10);
        params.push(today);
        whereClause += `
      AND t.created_at >= $${params.length}::date
      AND t.created_at < $${params.length}::date + INTERVAL '1 day'
    `;
    }

    const { rows } = await db.query(
        `
     SELECT
    t.*,
    u.name AS created_by_name
    FROM "Transaction" t
    JOIN "User" u ON t.created_by = u.id
    WHERE t.deleted_at IS NULL AND t.type = 'Expense'
    ${whereClause}
    ORDER BY t.created_at DESC;
    `,
        params
    );

    return res.status(200).json(rows);
});

/**
 * GET /api/transactions/:id
 * OLD EXTRA
 */
// const getTransactionById = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const { rows, rowCount } = await db.query(
//         `
//     SELECT *
//     FROM "Transaction"
//     WHERE id = $1
//       AND deleted_at IS NULL
//     `,
//         [id]
//     );

//     if (rowCount === 0) {
//         return res.status(404).json({ error: "Transaction not found" });
//     }

//     return res.status(200).json(rows[0]);
// });

/**
 * POST /api/transactions
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
    } = req.body;

    const created_by = req.user?.id || req.body.created_by;

    if (!created_by) {
        return res.status(401).json({ error: "Unauthorized" });
    }


    if (
        !type || !amount || !payment_method || !description
    ) {
        return res.status(400).json({
            error: "All fields are required",
        });
    }

    const { rows } = await db.query(
        `
      INSERT INTO "Transaction" ( amount, type, description, payment_method, product_id, service_id,  created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
        [
            amount,
            type,
            description,
            payment_method,
            product_id,
            service_id,
            created_by,
        ]
    );

    return res.status(201).json(rows[0]);
});

/**
 * PUT /api/transactions/:id
 * OLD EXTRA
 */
// const updateTransaction = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const {
//         amount,
//         type,
//         category,
//         description,
//         payment_method,
//         product_id,
//         service_id,
//         quantity,
//     } = req.body;

//     const created_by = req.user?.id;

//     if (!created_by) {
//         return res.status(401).json({ error: "Unauthorized" });
//     }

//     if (amount == null || !type || !category || !payment_method) {
//         return res.status(400).json({
//             error: "amount, type, category, and payment_method are required",
//         });
//     }

//     const { rows, rowCount } = await db.query(
//         `
//     UPDATE "Transaction"
//     SET
//       amount = $1,
//       type = $2,
//       category = $3,
//       description = $4,
//       payment_method = $5,
//       product_id = $6,
//       service_id = $7,
//       quantity = $8,
//       created_by = $9,
//       updated_at = NOW()
//     WHERE id = $10
//       AND deleted_at IS NULL
//     RETURNING *
//     `,
//         [
//             amount,
//             type,
//             category,
//             description || null,
//             payment_method,
//             product_id || null,
//             service_id || null,
//             quantity || 1,
//             created_by,
//             id,
//         ]
//     );

//     if (rowCount === 0) {
//         return res.status(404).json({ error: "Transaction not found" });
//     }

//     return res.status(200).json(rows[0]);
// });

/**
 * DELETE /api/transactions/:id
 */
const deleteTransaction = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await db.query(
        `
    UPDATE "Transaction"
    SET deleted_at = NOW()
    WHERE id = $1
    `,
        [id]
    );

    return res.status(200).json({
        message: "Transaction deleted (soft)",
    });
});

/**
 * GET /api/transactions/summary
 */
const getTransactionSummary = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const { rows } = await db.query(
        `
    SELECT
      COUNT(*) FILTER (WHERE t.deleted_at IS NULL) AS total_transactions,
      COUNT(*) FILTER (
        WHERE t.type = 'Sales' AND t.deleted_at IS NULL
      ) AS total_sales_count,
      COALESCE(SUM(t.amount) FILTER (
        WHERE t.type = 'Sales' AND t.deleted_at IS NULL
      ), 0) AS total_sales_amount
    FROM "Transaction" t
    WHERE
      t.created_at >= $1::date
      AND t.created_at < $1::date + INTERVAL '1 day'
      AND t.status = 'finished'
    `,
        [targetDate]
    );

    return res.status(200).json(rows[0]);
});

/**
 * GET /api/transactions/summary/monthly
 */
const getMonthlyTransactionSummary = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).send("Month is required");
    }

    const { rows } = await db.query(
        `
    SELECT
      COUNT(*) FILTER (WHERE t.deleted_at IS NULL) AS total_transactions
    FROM "Transaction" t
    WHERE
      t.created_at >= date_trunc('month', $1::date)
      AND t.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
      AND t.status = 'finished'
    `,
        [`${month}-01`]
    );

    return res.status(200).json(rows[0]);
});

/**
 * GET /api/transactions/monthly-list
 * OLD EXTRA
 */
// const getMonthlyTransactionsList = asyncHandler(async (req, res) => {
//     const { month } = req.query;

//     if (!month) {
//         return res.status(400).json({
//             error: "Month query parameter is required (YYYY-MM)",
//         });
//     }

//     const { rows } = await db.query(
//         `
//     SELECT *
//     FROM "Transaction"
//     WHERE deleted_at IS NULL
//       AND created_at >= date_trunc('month', $1::date)
//       AND created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
//     ORDER BY amount DESC
//     `,
//         [`${month}-01`]
//     );

//     return res.status(200).json(rows);
// });

module.exports = {
    getTransactions,
    // getTransactionById,     
    createTransaction,
    // updateTransaction,      
    deleteTransaction,
    getTransactionSummary,
    getMonthlyTransactionSummary,
    //  getMonthlyTransactionsList,
}