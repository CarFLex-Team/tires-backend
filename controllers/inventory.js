const { db } = require("../config/db");
const { supabase } = require("../config/supabase");


// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/inventory
 * Returns all inventory items joined with product data
 */
const getInventory = asyncHandler(async (req, res) => {
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
      p.is_active,
      p.created_at,
      p.updated_at,
      p.condition,
      pi.image_path
    FROM "Inventory" AS i
    INNER JOIN "Product" AS p
      ON i.product_id = p.id
    LEFT JOIN "ProductImage" AS pi
      ON pi.product_id = p.id
      AND pi.deleted_at IS NULL
      AND pi.is_main = true
    WHERE p.deleted_at IS NULL
    ORDER BY p.size ASC
  `);

    const baseUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_BUCKET}`;

    const result = rows.map((item) => ({
        ...item,
        image_url: item.image_path
            ? `${baseUrl}/${item.image_path}`
            : null,
    }));

    return res.status(200).json(result);
});

/**
 * GET /api/inventory/:id
 * Returns a single inventory item by PRODUCT id
 */
// const getInventoryById = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const { rows, rowCount } = await db.query(
//         `
//     SELECT
//       i.id AS inventory_id,
//       p.id AS id,
//       p.name,
//       p.size,
//       p.brand,
//       p.sku,
//       p.price,
//       p.cost,
//       i.quantity,
//       p.is_active,
//       p.created_at,
//       p.updated_at,
//       p.condition
//     FROM "Inventory" AS i
//     INNER JOIN "Product" AS p
//       ON i.product_id = p.id
//     WHERE p.id = $1
//       AND p.deleted_at IS NULL
//     `,
//         [id]
//     );

//     if (rowCount === 0) {
//         return res.status(404).json({ error: "Inventory item not found" });
//     }

//     return res.status(200).json(rows[0]);
// });

/**
 * POST /api/inventory
 * Create new product + inventory record
 */
const createInventory = asyncHandler(async (req, res) => {
    const client = await db.connect();

    try {
        const { size, brand, price, cost, quantity, condition } = req.body;

        if (
            !size ||
            !brand ||
            price == null ||
            cost == null ||
            quantity == null ||
            !condition
        ) {
            return res.status(400).json({
                error: "size, brand, price, cost, quantity and condition are required",
            });
        }

        await client.query("BEGIN");

        const productResult = await client.query(
            `
      INSERT INTO "Product"
        (size, brand, price, cost, is_active, created_at, updated_at, name, condition)
      VALUES
        ($1, $2, $3, $4, true, NOW(), NOW(), $5, $6)
      RETURNING id
      `,
            [size, brand, price, cost, `${condition} ${brand} ${size}`, condition]
        );

        const productId = productResult.rows[0].id;

        const inventoryResult = await client.query(
            `
      INSERT INTO "Inventory" (product_id, quantity, updated_at)
      VALUES ($1, $2, NOW())
      RETURNING *
      `,
            [productId, quantity]
        );

        let image = null;

        if (req.file) {
            let ext = req.file.mimetype.split("/")[1];

            if (ext === "jpeg") ext = "jpg";

            const fileName = `${Date.now()}.${ext}`;
            const imagePath = `${id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from(process.env.SUPABASE_BUCKET || "product")
                .upload(imagePath, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false,
                });

            if (uploadError) {
                throw new Error(uploadError.message);
            }

            const imageResult = await client.query(
                `
        INSERT INTO "ProductImage"
          (product_id, image_path, is_main, created_at, updated_at)
        VALUES
          ($1, $2, true, NOW(), NOW())
        RETURNING *
        `,
                [productId, imagePath]
            );

            image = imageResult.rows[0];
        }

        await client.query("COMMIT");

        return res.status(201).json({
            inventory: inventoryResult.rows[0],
            image,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        return res.status(500).json({
            error: "Failed to create inventory item",
            details: error.message,
        });
    } finally {
        client.release();
    }
});

/**
 * PUT /api/inventory/:id
 * Update product + inventory by PRODUCT id
 */
const updateInventory = asyncHandler(async (req, res) => {
    const client = await db.connect();

    try {
        const { id } = req.params;
        const { price, cost, is_active, size, quantity } = req.body;

        await client.query("BEGIN");

        const productResult = await client.query(
            `
      UPDATE "Product"
      SET
        price = $2,
        cost = $3,
        is_active = $4,
        updated_at = NOW(),
        size = $5
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id
      `,
            [id, price, cost, is_active, size]
        );

        if (productResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Product not found" });
        }

        await client.query(
            `
      UPDATE "Inventory"
      SET quantity = $1, updated_at = NOW()
      WHERE product_id = $2
      `,
            [quantity, id]
        );

        await client.query("COMMIT");

        return res.status(200).json({ success: true });
    } catch (error) {
        await client.query("ROLLBACK");
        return res.status(500).json({
            error: "Failed to update inventory item",
            details: error.message,
        });
    } finally {
        client.release();
    }
});

/**
 * DELETE /api/inventory/:id
 * Soft delete PRODUCT by product id
 */
const deleteInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rowCount } = await db.query(
        `
    UPDATE "Product"
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1
      AND deleted_at IS NULL
    `,
        [id]
    );

    if (rowCount === 0) {
        return res.status(404).json({ error: "Product not found" });
    }

    return res.status(200).json({ message: "Product deleted (soft)" });
});

/**
 * GET /api/inventory/summary
 * Low stock items
 */
const getTopInventory = asyncHandler(async (req, res) => {
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
      p.is_active,
      p.created_at,
      p.updated_at,
      p.condition
    FROM "Inventory" AS i
    INNER JOIN "Product" AS p
      ON i.product_id = p.id
    WHERE p.deleted_at IS NULL
      AND i.quantity <= 4
    ORDER BY i.quantity ASC
  `);

    return res.status(200).json(rows);
});

/**
 * GET /api/inventory/summary/product-monthly?month=YYYY-MM
 */
const getMonthlyInventory = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ error: "Month is required" });
    }

    const { rows } = await db.query(
        `
    SELECT
      p.name AS Product,
      SUM(t.amount) AS turn_over
    FROM "Transaction" t
    JOIN "Product" p
      ON p.id = t.product_id
    WHERE t.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND t.created_at >= date_trunc('month', $1::date)
      AND t.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
    GROUP BY p.id, p.name
    ORDER BY turn_over DESC
    LIMIT 2
    `,
        [`${month}-01`]
    );

    return res.status(200).json(rows);
});


const updateInventoryImage = asyncHandler(async (req, res) => {
    const client = await db.connect();

    try {
        const { id } = req.params; // product_id

        if (!req.file) {
            return res.status(400).json({ error: "Image file is required" });
        }

        await client.query("BEGIN");

        const productResult = await client.query(
            `
      SELECT id
      FROM "Product"
      WHERE id = $1
        AND deleted_at IS NULL
      `,
            [id]
        );

        if (productResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Product not found" });
        }

        // NOW: only one active image per product
        // FUTURE: remove this block if you want multiple active images
        await client.query(
            `
      UPDATE "ProductImage"
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE product_id = $1
        AND deleted_at IS NULL
      `,
            [id]
        );

        let ext = req.file.mimetype.split("/")[1];

        if (ext === "jpeg") ext = "jpg";

        const fileName = `${Date.now()}.${ext}`;
        const imagePath = `${id}/${fileName}`;


        const { error: uploadError } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET || "product")
            .upload(imagePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false,
            });

        if (uploadError) {
            await client.query("ROLLBACK");
            return res.status(500).json({
                error: "Failed to upload image",
                details: uploadError.message,
            });
        }

        const imageResult = await client.query(
            `
      INSERT INTO "ProductImage"
        (product_id, image_path, is_main, created_at, updated_at)
      VALUES
        ($1, $2, true, NOW(), NOW())
      RETURNING *
      `,
            [id, imagePath]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            message: "Product image updated successfully",
            image: imageResult.rows[0],
        });
    } catch (error) {
        await client.query("ROLLBACK");

        return res.status(500).json({
            error: "Failed to update product image",
            details: error.message,
        });
    } finally {
        client.release();
    }
});


module.exports = {
    getInventory,
    // getInventoryById,
    createInventory,
    updateInventory,
    deleteInventory,
    getTopInventory,
    getMonthlyInventory,
    updateInventoryImage,
};