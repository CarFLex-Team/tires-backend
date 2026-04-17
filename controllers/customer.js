const { db } = require("../config/db");

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/customers
 */
const getCustomers = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT *
    FROM "Customer"
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `);

    return res.status(200).json(rows);
});

/**
 * GET /api/customers/:id
 */
const getCustomerById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows } = await db.query(
        `
    SELECT
      c.*,
      COALESCE(
        json_agg(
          jsonb_build_object(
            'id', i.id,
            'invoice_no', i.invoice_no,
            'total_amount', i.total_amount,
            'created_at', i.created_at,
            'payment_method', i.payment_method,
            'created_by', u.name,
            'status', i.status,
            'subtotal', i.subtotal
          )
          ORDER BY i.created_at DESC
        )
        FILTER (WHERE i.id IS NOT NULL),
        '[]'
      ) AS invoices
    FROM "Customer" c
    LEFT JOIN "Invoice" i
      ON i.customer_id = c.id
      AND i.deleted_at IS NULL
    LEFT JOIN "User" u
      ON u.id = i.created_by
    WHERE c.id = $1
      AND c.deleted_at IS NULL
    GROUP BY c.id
    `,
        [id]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
    }

    return res.status(200).json(rows[0]);
});

/**
 * POST /api/customers
 */
const createCustomer = asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).json({
            error: "All fields are required",
        });
    }

    try {
        const { rows } = await db.query(
            `
      INSERT INTO "Customer" (name, email, phone)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
            [name, email, phone]
        );

        return res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({
                error: "Email already exists",
            });
        }

        return res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * PUT /api/customers/:id
 */
// const updateCustomer = asyncHandler(async (req, res) => {
//   const { id } = req.params;
//   const { name, email, phone } = req.body;

//   if (!name || !email || !phone) {
//     return res.status(400).json({
//       error: "Name, email and phone are required",
//     });
//   }

//   try {
//     const { rows, rowCount } = await db.query(
//       `
//       UPDATE "Customer"
//       SET
//         name = $1,
//         email = $2,
//         phone = $3,
//         updated_at = NOW()
//       WHERE id = $4
//         AND deleted_at IS NULL
//       RETURNING *
//       `,
//       [name, email, phone, id]
//     );

//     if (rowCount === 0) {
//       return res.status(404).json({ error: "Customer not found" });
//     }

//     return res.status(200).json(rows[0]);
//   } catch (error) {
//     if (error.code === "23505") {
//       return res.status(400).json({
//         error: "Email already exists",
//       });
//     }

//     return res.status(500).json({
//       error: error.message,
//     });
//   }
// });

/**
 * DELETE /api/customers/:id
 */
const deleteCustomer = asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
        await db.query(
            `
      UPDATE "Customer"
      SET deleted_at = NOW()
      WHERE id = $1
      `,
            [id]
        );

        return res.status(200).json({
            message: "Customer deleted (soft)",
        });
    } catch (error) {
        return res.status(500).json({
            error: "Failed to delete customer",
        });
    }
});

/**
 * GET /api/customers/summary
 */
const getCustomerSummary = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT
      c.name AS customer,
      SUM(i.total_amount) AS turn_over
    FROM "Invoice" i
    JOIN "Customer" c
      ON c.id = i.customer_id
    WHERE i.deleted_at IS NULL
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.name
    ORDER BY turn_over DESC
    LIMIT 3
  `);

    return res.status(200).json(rows);
});

/**
 * GET /api/customers/summary/monthly?month=YYYY-MM
 */
const getMonthlyCustomerSummary = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).send("Month is required");
    }

    const { rows } = await db.query(
        `
    SELECT
      c.name AS customer,
      SUM(i.total_amount) AS turn_over
    FROM "Invoice" i
    JOIN "Customer" c
      ON c.id = i.customer_id
    WHERE i.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND i.created_at >= date_trunc('month', $1::date)
      AND i.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
    GROUP BY c.id, c.name
    ORDER BY turn_over DESC
    LIMIT 2
    `,
        [`${month}-01`]
    );

    return res.status(200).json(rows);
});

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    //  updateCustomer, 
    deleteCustomer,
    getCustomerSummary,
    getMonthlyCustomerSummary,
};