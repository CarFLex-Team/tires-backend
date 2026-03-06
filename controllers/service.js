const { db } = require("../config/db");

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/services
 * Returns all active services
 */
const getService = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT *
    FROM "service"
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `);

    res.status(200).json({ success: true, data: rows });
});

/**
 * GET /api/services/:id
 * Returns service by ID
 */
const getServiceById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows, rowCount } = await db.query(`
    SELECT *
    FROM "service"
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Service not found" });
    }

    res.status(200).json({ success: true, data: rows[0] });
});

/**
 * POST /api/services
 * Creates a new service
 */
const createService = asyncHandler(async (req, res) => {
    const { name, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ success: false, error: "Name and price are required" });
    }

    try {
        const { rows } = await db.query(`
      INSERT INTO "service" (name, price)
      VALUES ($1, $2)
      RETURNING *
    `, [name, price]);

        res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ success: false, error: "Service already exists" });
        }
        throw error;
    }
});

/**
 * PUT /api/services/:id
 * Updates an existing service
 */
const updateService = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ success: false, error: "Name and price are required" });
    }

    try {
        const { rows, rowCount } = await db.query(`
      UPDATE "service"
      SET name = $1,
          price = $2,
          updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [name, price, id]);

        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: "Service not found" });
        }

        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ success: false, error: "Service already exists" });
        }
        throw error;
    }
});

/**
 * DELETE /api/services/:id
 * Soft delete a service
 */
const deleteService = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rowCount } = await db.query(`
    UPDATE "service"
    SET deleted_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Service not found" });
    }

    res.status(204).send();
});

/**
 * GET /api/services/top
 * Returns top services by turnover
 */
const getTopService = asyncHandler(async (req, res) => {
    const query = `
    SELECT
        s.name AS service,
        SUM(t.amount) AS turn_over
      FROM "transaction" t
      JOIN "service" s ON s.id = t.service_id
      WHERE t.deleted_at IS NULL
        AND s.deleted_at IS NULL
      GROUP BY s.id, s.name
      ORDER BY turn_over DESC
      LIMIT 5;
  `;

    const { rows } = await db.query(query);

    if (!rows || rows.length === 0) {
        return res.status(200).json({
            success: true,
            message: 'No services found',
            data: [],
        });
    }

    res.status(200).json({ success: true, data: rows });
});


/**
 * GET /api/services/monthly
 * Returns top services for a given month
 * Query param: month=YYYY-MM
 */
const getMonthlyService = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({
            error: "Month query parameter is required (format: YYYY-MM)"
        });
    }

    const { rows } = await db.query(
        `
        SELECT
        s.name AS service,
        SUM(t.amount) AS turn_over
      FROM "transaction" t
      JOIN "service" s ON s.id = t.service_id
      WHERE t.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND t.created_at >= date_trunc('month', $1::date)
        AND t.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
      GROUP BY s.id, s.name
      ORDER BY turn_over DESC
      LIMIT 2;
        `,
        [`${month}-01`]
    );

    if (rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: "Service not found"
        });
    }

    return res.status(200).json({
        success: true,
        data: rows
    });
});
module.exports = {
    getService,
    getServiceById,
    createService,
    updateService,
    deleteService,
    getTopService,
    getMonthlyService,
};