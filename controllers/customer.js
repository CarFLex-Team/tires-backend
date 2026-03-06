const { db } = require("../config/db");

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/customers
 * Returns all active customers
 */
const getcustomer = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT *
    FROM "customer"
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `);

    res.status(200).json({ success: true, data: rows });
});

/**
 * GET /api/customers/:id
 * Returns customer by ID
 */
const getcustomerById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows, rowCount } = await db.query(`
    SELECT *
    FROM "customer"
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Customer not found" });
    }

    res.status(200).json({ success: true, data: rows[0] });
});

/**
 * POST /api/customers
 * Creates a new customer
 */
const createcustomer = asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).json({ success: false, error: "Name, email and phone are required" });
    }

    try {
        const { rows } = await db.query(`
      INSERT INTO "customer" (name, email, phone)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, email, phone]);

        res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ success: false, error: "Email already exists" });
        }
        throw error;
    }
});

/**
 * PUT /api/customers/:id
 * Updates an existing customer
 */
const updatecustomer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).json({ success: false, error: "Name, email and phone are required" });
    }

    try {
        const { rows, rowCount } = await db.query(`
      UPDATE "customer"
      SET name = $1,
          email = $2,
          phone = $3,
          updated_at = NOW()
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING *
    `, [name, email, phone, id]);

        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: "Customer not found" });
        }

        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ success: false, error: "Email already exists" });
        }
        throw error;
    }
});

/**
 * DELETE /api/customers/:id
 * Soft delete a customer
 */
const deletecustomer = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rowCount } = await db.query(`
    UPDATE "customer"
    SET deleted_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Customer not found" });
    }

    res.status(204).send();
});

/**
 * GET /api/customers/top
 * Returns top customers by turnover
 * Optional query param: month=YYYY-MM
 */
const getTopcustomer = asyncHandler(async (req, res) => {
    const query = `
    SELECT
      c.name AS customer,
      COALESCE(SUM(i.total_amount), 0) AS turnover
    FROM "customer" c
    LEFT JOIN "invoice" i 
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


const getmonthlycustomer = async (req, res, next) => {
    try {
        const { month } = req.query;

        if (!month) {
            return res.status(400).json({
                error: "Month query parameter is required (format: YYYY-MM)"
            });
        }

        const { rows } = await db.query(
            `
            SELECT
                c.name AS customer,
                SUM(i.total_amount) AS turn_over
            FROM "invoice" i
            JOIN "customer" c ON c.id = i.customer_id
            WHERE i.deleted_at IS NULL
              AND c.deleted_at IS NULL
              AND i.created_at >= date_trunc('month', $1::date)
              AND i.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
            GROUP BY c.id, c.name
            ORDER BY turn_over DESC
            LIMIT 2;
            `,
            [`${month}-01`]
        );

        res.status(200).json(rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to fetch monthly top customers"
        });

    }
};

module.exports = {
    getcustomer,
    getcustomerById,
    createcustomer,
    updatecustomer,
    deletecustomer,
    getTopcustomer,
    getmonthlycustomer,
};