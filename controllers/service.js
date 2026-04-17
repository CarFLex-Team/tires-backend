const { db } = require("../config/db");

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/services
 * Returns all non-deleted services
 */
const getServices = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT *
    FROM "Service"
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
  `);

    return res.status(200).json(rows);
});

/**
 * GET /api/services/:id
 * Returns service by ID
 */
// const getServiceById = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const { rows, rowCount } = await db.query(
//         `
//     SELECT *
//     FROM "Service"
//     WHERE id = $1
//       AND deleted_at IS NULL
//     `,
//         [Number(id)]
//     );

//     if (rowCount === 0) {
//         return res.status(404).json({ error: "Service not found" });
//     }

//     return res.status(200).json(rows[0]);
// });

/**
 * POST /api/services
 * Creates a new service
 */
const createService = asyncHandler(async (req, res) => {
    const { name, price } = req.body;

    if (!name || price == null) {
        return res.status(400).json({
            error: "Name and price are required",
        });
    }

    try {
        const { rows } = await db.query(
            `
      INSERT INTO "Service" (name, price)
      VALUES ($1, $2)
      RETURNING *
      `,
            [name, price]
        );

        return res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({
                error: "Service already exists",
            });
        }

        return res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * PUT /api/services/:id
 * Updates an existing service
 */
// const updateService = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { name, price } = req.body;

//     if (!name || price == null) {
//         return res.status(400).json({
//             error: "Name and price are required",
//         });
//     }

//     try {
//         const { rows, rowCount } = await db.query(
//             `
//       UPDATE "Service"
//       SET
//         name = $1,
//         price = $2,
//         updated_at = NOW()
//       WHERE id = $3
//         AND deleted_at IS NULL
//       RETURNING *
//       `,
//             [name, price, Number(id)]
//         );

//         if (rowCount === 0) {
//             return res.status(404).json({ error: "Service not found" });
//         }

//         return res.status(200).json(rows[0]);
//     } catch (error) {
//         if (error.code === "23505") {
//             return res.status(400).json({
//                 error: "Service already exists",
//             });
//         }

//         return res.status(500).json({
//             error: error.message,
//         });
//     }
// });

/**
 * DELETE /api/services/:id
 * Soft delete service
 */
const deleteService = asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
        const { rowCount } = await db.query(
            `
      UPDATE "Service"
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      `,
            [Number(id)]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: "Service not found" });
        }

        return res.status(200).json({
            message: "Service deleted (soft)",
        });
    } catch (error) {
        return res.status(500).json({
            error: "Failed to delete service",
        });
    }
});

/**
 * GET /api/services/top
 * Returns top services by turnover
//  
// const getTopServices = asyncHandler(async (req, res) => {
//     const { rows } = await db.query(`
//     SELECT
//       s.name AS service,
//       SUM(t.amount) AS turn_over
//     FROM "Transaction" t
//     JOIN "Service" s
//       ON s.id = t.service_id
//     WHERE t.deleted_at IS NULL
//       AND s.deleted_at IS NULL
//     GROUP BY s.id, s.name
//     ORDER BY turn_over DESC
//     LIMIT 5
//   `);

//     return res.status(200).json(rows);
// });

/**
 * GET /api/services/summary/monthly?month=YYYY-MM
 * Returns top 2 services for a given month
 */
const getMonthlyServices = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).send("Month is required");
    }

    try {
        const { rows } = await db.query(
            `
      SELECT
        s.name AS service,
        SUM(t.amount) AS turn_over
      FROM "Transaction" t
      JOIN "Service" s
        ON s.id = t.service_id
      WHERE t.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND t.created_at >= date_trunc('month', $1::date)
        AND t.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
      GROUP BY s.id, s.name
      ORDER BY turn_over DESC
      LIMIT 2
      `,
            [`${month}-01`]
        );

        return res.status(200).json(rows);
    } catch (error) {
        return res.status(500).json({
            error: "Failed to fetch services monthly summary",
            details: error.message,
        });
    }
});

module.exports = {
    getServices,
    //  getServiceById,
    createService,
    //  updateService,
    deleteService,
    //  getTopServices,
    getMonthlyServices,
};