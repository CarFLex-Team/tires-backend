const { db } = require("../config/db");

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/inventory
 * Returns all inventory items
 */
const getInventory = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
   SELECT 
        i.id AS inventory_id,
        p.id,
        p.name,
        p.size,
        p.brand,
        p.sku,
        p.price,
        p.cost,
        i.quantity,
        p.is_active,
        p.created_at,
        p.updated_at,
        p.condition
      FROM "inventory" i
      INNER JOIN "product" p 
        ON i.product_id = p.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC
  `);

    res.status(200).json({ success: true, data: rows });
});

/**
 * GET /api/inventory/:id
 */
const getInventoryById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows, rowCount } = await db.query(
        `
    SELECT *
    FROM "inventory"
    WHERE id = $1
  `,
        [id]
    );

    if (rowCount === 0) {
        return res.status(404).json({ success: false, error: "Item not found" });
    }

    res.status(200).json({ success: true, data: rows[0] });
});

/**
 * POST /api/inventory
 * Create new inventory item
 */
const createInventory = asyncHandler(async (req, res) => {
    const { name, price, cost, is_active } = req.body;

    if (!name || price == null || cost == null) {
        return res.status(400).json({
            success: false,
            error: "Name, price and cost are required",
        });
    }

    const { rows } = await db.query(
        `
    INSERT INTO "inventory" (name, price, cost, is_active)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `,
        [name, price, cost, is_active ?? true]
    );

    res.status(201).json({ success: true, data: rows[0] });
});

/**
 * PUT /api/inventory/:id
 * Update inventory item
 */
const updateInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { price, cost, is_active } = req.body;

    if (price == null || cost == null || is_active == null) {
        return res.status(400).json({
            success: false,
            error: "Price, cost and is_active are required",
        });
    }

    const { rows, rowCount } = await db.query(
        `
    UPDATE "inventory"
    SET price = $2,
        cost = $3,
        is_active = $4,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,
        [id, price, cost, is_active]
    );

    if (rowCount === 0) {
        return res.status(404).json({
            success: false,
            error: "Inventory item not found",
        });
    }

    res.status(200).json({ success: true, data: rows[0] });
});

/**
 * DELETE /api/inventory/:id
 * Hard delete inventory item
 */
const deleteInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rowCount } = await db.query(
        `
    DELETE FROM "inventory"
    WHERE id = $1
  `,
        [id]
    );

    if (rowCount === 0) {
        return res.status(404).json({
            success: false,
            error: "Inventory item not found",
        });
    }

    res.status(204).send();
});

const getTopInventory = async (req, res) => {
    try {
        const { rows } = await db.query(`
      SELECT 
        i.id AS inventory_id,
        p.id AS id,
        p.name,
        p.size,
        p.brand,
        p.sku,
        p.price,
        p.cost,
        i.quantity,
        p.updated_at,
        p.condition
      FROM "inventory" AS i
      JOIN "product" AS p ON i.product_id = p.id
      WHERE i.quantity <= 10
      ORDER BY i.quantity ASC
    `);

        res.status(200).json({
            success: true,
            data: rows,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to fetch inventory summary",
            details: error.message,
        });
    }
};

const getMonthlyInventory = async (req, res) => {
    const { month } = req.query; // expects YYYY-MM

    if (!month) {
        return res.status(400).json({ error: "Month is required" });
    }

    try {
        const { rows } = await db.query(
            `
      SELECT
        p.name AS Product,
        SUM(t.amount) AS turn_over
      FROM "transaction" t
      JOIN "product" p ON p.id = t.product_id
      WHERE t.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND t.created_at >= date_trunc('month', $1::date)
        AND t.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
      GROUP BY p.id, p.name
      ORDER BY turn_over DESC
      LIMIT 2;
      `,
            [`${month}-01`]
        );

        res.status(200).json({
            success: true,
            data: rows,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Failed to fetch inventory monthly summary",
            details: error.message,
        });
    }
};


module.exports = {
    getInventory,
    getInventoryById,
    createInventory,
    updateInventory,
    deleteInventory,
    getTopInventory,
    getMonthlyInventory,
};