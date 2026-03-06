const { db } = require("../config/db");

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
        FROM "invoice" i
        LEFT JOIN "customer" c ON c.id = i.customer_id
        WHERE i.deleted_at IS NULL AND i.status = 'pending'
        ORDER BY i.created_at DESC
    `);
    res.status(200).json({ success: true, data: rows });
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
        created_by = null, // Allow passing creator or leave null
    } = req.body;

    if (
        !customer_id ||
        !subtotal ||
        !status ||
        !Array.isArray(transactions)
    ) {
        return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const invoiceRes = await client.query(
            `
            INSERT INTO "invoice" 
            (customer_id, created_by, total_amount, subtotal, tax, created_at, payment_method, status)
            VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
            RETURNING id
            `,
            [customer_id, created_by, total || null, subtotal, tax || null, payment_method || null, status]
        );

        const invoiceId = invoiceRes.rows[0].id;

        for (const tx of transactions) {
            if (tx.category === "Tire") {
                await client.query(
                    `
                    INSERT INTO "transaction" 
                    (invoice_id, amount, description, created_at, type, category, created_by, payment_method, product_id, quantity, status)
                    VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9,$10)
                    `,
                    [invoiceId, tx.amount, tx.description, tx.type, tx.category, created_by, payment_method || null, tx.product_id, tx.quantity, status]
                );

                await client.query(
                    `
                    UPDATE "inventory" i
                    SET quantity = quantity - $1
                    FROM "product" p
                    WHERE p.id = $2
                        AND i.product_id = p.id
                        AND p.deleted_at IS NULL
                        AND i.quantity >= $1
                    `,
                    [tx.quantity, tx.product_id]
                );

                await client.query(
                    `
                    INSERT INTO "inventory_movement" (product_id, quantity, created_at, reason, invoice_id)
                    VALUES ($1, $2, NOW(), 'sale', $3)
                    `,
                    [tx.product_id, tx.quantity, invoiceId]
                );
            } else if (tx.category === "Service") {
                await client.query(
                    `
                    INSERT INTO "transaction" 
                    (invoice_id, amount, description, created_at, type, category, created_by, payment_method, service_id, quantity, status)
                    VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9,$10)
                    `,
                    [invoiceId, tx.amount, tx.description, tx.type, tx.category, created_by, payment_method || null, tx.service_id, tx.quantity, status]
                );
            }
        }

        await client.query("COMMIT");
        res.status(201).json({ success: true, invoice_id: invoiceId });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Create invoice error", err);
        res.status(500).json({ success: false, error: "Failed to create invoice" });
    } finally {
        client.release();
    }
});

/**
 * GET /api/invoices/:id
 */
const getInvoicebyID = asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
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
            FROM "invoice" i
            LEFT JOIN "transaction" t
                ON t.invoice_id = i.id
                AND t.deleted_at IS NULL
            LEFT JOIN "service" s
                ON s.id = t.service_id
            LEFT JOIN "product" p
                ON p.id = t.product_id
            WHERE i.id = $1
                AND i.deleted_at IS NULL
            GROUP BY i.id;
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("GET Invoice error:", err);
        res.status(500).json({ error: "Failed to fetch invoice" });
    }
});

/**
 * PUT /api/invoices/:id
 */
const updateInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `
            UPDATE "invoice"
            SET total_amount = $2, subtotal = $3, tax = $4, payment_method = $5, updated_at = NOW(), status = 'finished'
            WHERE id = $1
            `,
            [id, body.total_amount, body.subtotal, body.tax, body.payment_method]
        );

        await client.query(
            `
            UPDATE "transaction"
            SET payment_method = $1, updated_at = NOW(), status = 'finished'
            WHERE invoice_id = $2
            `,
            [body.payment_method, id]
        );

        await client.query("COMMIT");
        res.json({ success: true });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Edit Invoice error:", err);
        res.status(500).json({ error: "Failed to update invoice" });
    } finally {
        client.release();
    }
});

/**
 * DELETE /api/invoices/:id
 * Soft delete
 */
const deleteInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `UPDATE "invoice" SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        await client.query(
            `UPDATE "transaction" SET deleted_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL`,
            [id]
        );

        await client.query("COMMIT");
        res.json({ message: "Invoice deleted (soft)" });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("DELETE Invoice error:", err);
        res.status(500).json({ error: "Failed to delete invoice" });
    } finally {
        client.release();
    }
});

module.exports = {
    getInvoices,
    createInvoice,
    getInvoicebyID,
    updateInvoice,
    deleteInvoice,
};