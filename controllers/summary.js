const { db } = require('../config/db');

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/v1/customers/top
 * Returns top 5 customers by turnover
 */
const getTopCustomers = asyncHandler(async (req, res) => {
    const query = `
    SELECT
      c.name AS customer,
      COALESCE(SUM(i.total_amount), 0) AS turnover
    FROM "Customer" c
    LEFT JOIN "Invoice" i 
      ON i.customer_id = c.id AND i.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.name
    ORDER BY turnover DESC
    LIMIT 5;
  `;

    // Execute the query
    const { rows } = await db.query(query);

    // Handle case where no customers exist
    if (!rows || rows.length === 0) {
        return res.status(200).json({
            success: true,
            message: 'No customers found',
            data: [],
        });
    }

    // Respond with top customers
    res.status(200).json({
        success: true,
        data: rows,
    });
});

module.exports = {
    getTopCustomers,
};