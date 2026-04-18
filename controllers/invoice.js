const { db } = require("../config/db");
const handleTireSet = require("../lib/handleTireSet");

// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/invoices
 * Returns all pending invoices with customer names
 */
const getInvoices = asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
    SELECT
      i.*,
      c.name AS customer_name
    FROM "Invoice" i
    LEFT JOIN "Customer" c
      ON c.id = i.customer_id
    WHERE i.deleted_at IS NULL
      AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `);

    return res.status(200).json(rows);
});

/**
 * POST /api/invoices
 * Creates a new invoice with transactions and updates inventory
 */
const createInvoice = asyncHandler(async (req, res) => {
    const {
        total,
        subtotal,
        tax,
        customer_id,
        payment_method,
        status,
        transactions,
    } = req.body;

    const created_by = req.user?.id;

    if (!created_by) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (
        customer_id == null ||
        subtotal == null ||
        !status ||
        !Array.isArray(transactions) ||
        transactions.length === 0
    ) {
        return res.status(400).json({ error: "Invalid payload" });
    }

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        // 1) Create invoice
        const invoiceRes = await client.query(
            `
      INSERT INTO "Invoice"
        (customer_id, created_by, total_amount, subtotal, tax, created_at, payment_method, status)
      VALUES
        ($1, $2, $3, $4, $5, NOW(), $6, $7)
      RETURNING id
      `,
            [
                customer_id,
                created_by,
                total ?? null,
                subtotal,
                tax ?? null,
                payment_method ?? null,
                status,
            ]
        );

        const invoiceId = invoiceRes.rows[0].id;

        // 2) Create transactions and apply side effects
        for (const tx of transactions) {
            if (tx.category === "Tire") {
                await client.query(
                    `
          INSERT INTO "Transaction"
            (invoice_id, amount, description, created_at, type, category, created_by, payment_method, product_id, quantity, status)
          VALUES
            ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
          `,
                    [
                        invoiceId,
                        tx.amount,
                        tx.description,
                        tx.type,
                        tx.category,
                        created_by,
                        payment_method ?? null,
                        tx.product_id,
                        tx.quantity,
                        status,
                    ]
                );

                const { rows: updatedInventoryRows, rowCount } = await client.query(
                    `
          UPDATE "Inventory" i
          SET quantity = quantity - $1
          FROM "Product" p
          WHERE p.id = $2
            AND i.product_id = p.id
            AND p.deleted_at IS NULL
            AND i.quantity >= $1
          RETURNING p.id, i.quantity, p.price, p.cost, p.size
          `,
                    [tx.quantity, tx.product_id]
                );

                if (rowCount === 0) {
                    throw new Error(
                        `Insufficient inventory or invalid product for product_id ${tx.product_id}`
                    );
                }

                await client.query(
                    `
          INSERT INTO "Inventory_movement"
            (product_id, quantity, created_at, reason, invoice_id)
          VALUES
            ($1, $2, NOW(), 'sale', $3)
          `,
                    [tx.product_id, tx.quantity, invoiceId]
                );

                const productRes = await client.query(
                    `SELECT condition, size FROM "Product" WHERE id = $1`,
                    [tx.product_id]
                );

                if (
                    productRes.rows[0] &&
                    productRes.rows[0].condition === "SET" &&
                    tx.quantity % 4 !== 0
                ) {
                    await handleTireSet(client, updatedInventoryRows[0]);
                }
            } else if (tx.category === "Service") {
                await client.query(
                    `
          INSERT INTO "Transaction"
            (invoice_id, amount, description, created_at, type, category, created_by, payment_method, service_id, quantity, status)
          VALUES
            ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
          `,
                    [
                        invoiceId,
                        tx.amount,
                        tx.description,
                        tx.type,
                        tx.category,
                        created_by,
                        payment_method ?? null,
                        tx.service_id,
                        tx.quantity,
                        status,
                    ]
                );
            }
        }

        await client.query("COMMIT");

        return res.status(201).json({ invoice_id: invoiceId });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Create invoice error:", err);

        return res.status(500).json({
            error: err.message || "Failed to create invoice",
        });
    } finally {
        client.release();
    }
});

/**
 * GET /api/invoices/:id
 */
const getInvoiceById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows } = await db.query(
        `
    SELECT
      i.id,
      i.invoice_no,
      i.customer_id,
      i.total_amount,
      i.created_at,
      i.subtotal,
      i.tax,
      i.payment_method,
      COALESCE(
        json_agg(
          jsonb_build_object(
            'id', t.id,
            'amount', t.amount,
            'description', t.description,
            'type', t.type,
            'category', t.category,
            'quantity', t.quantity,
            'product_name', p.name,
            'service_name', s.name
          )
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'
      ) AS transactions
    FROM "Invoice" i
    LEFT JOIN "Transaction" t
      ON t.invoice_id = i.id
      AND t.deleted_at IS NULL
    LEFT JOIN "Service" s
      ON s.id = t.service_id
    LEFT JOIN "Product" p
      ON p.id = t.product_id
    WHERE i.id = $1
      AND i.deleted_at IS NULL
    GROUP BY i.id
    `,
        [id]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: "Invoice not found" });
    }

    return res.status(200).json(rows[0]);
});

/**
 * PUT /api/invoices/:id
 * Finalize invoice and its transactions
 */
const updateInvoiceId = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `
      UPDATE "Invoice"
      SET
        total_amount = $2,
        subtotal = $3,
        tax = $4,
        payment_method = $5,
        updated_at = NOW(),
        status = 'finished'
      WHERE id = $1
      `,
            [id, body.total_amount, body.subtotal, body.tax, body.payment_method]
        );

        await client.query(
            `
      UPDATE "Transaction"
      SET
        payment_method = $1,
        updated_at = NOW(),
        status = 'finished'
      WHERE invoice_id = $2
      `,
            [body.payment_method, id]
        );

        await client.query("COMMIT");

        return res.status(200).json({ success: true });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Edit Invoice Payment Method error:", err);

        return res.status(500).json({
            error: "Failed to update invoice payment method",
        });
    } finally {
        client.release();
    }
});

/**
 * DELETE /api/invoices/:id
 * Soft delete invoice and linked transactions
 */
const deleteInvoiceId = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `
      UPDATE "Invoice"
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      `,
            [id]
        );

        await client.query(
            `
      UPDATE "Transaction"
      SET deleted_at = NOW()
      WHERE invoice_id = $1
        AND deleted_at IS NULL
      `,
            [id]
        );

        await client.query("COMMIT");

        return res.status(200).json({ message: "Invoice deleted (soft)" });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("DELETE Invoice error:", err);

        return res.status(500).json({
            error: "Failed to delete invoice",
        });
    } finally {
        client.release();
    }
});

module.exports = {
    getInvoices,
    createInvoice,
    getInvoiceById,
    updateInvoiceId,
    deleteInvoiceId,
};