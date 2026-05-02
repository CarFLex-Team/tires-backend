const { db } = require("../config/db");


// Async handler to catch errors automatically
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const splitSets = (currentQuantity) => {
    const quantityToUsed = currentQuantity % 4;
    const newSetQuantity = currentQuantity - quantityToUsed;

    return { quantityToUsed, newSetQuantity };
};

const handleTireSet = async (client, product) => {
    if (!product) return;

    const remainingQuantity = Number(product.quantity);

    const { quantityToUsed, newSetQuantity } = splitSets(remainingQuantity);

    if (quantityToUsed === 0) {
        return;
    }

    const { rows: usedRows } = await client.query(
        `
        SELECT
            i.id AS inventory_id,
            p.id AS product_id
        FROM "Inventory" i
        INNER JOIN "Product" p
            ON i.product_id = p.id
        WHERE p.size = $1
          AND p.condition = 'USED'
          AND p.deleted_at IS NULL
        LIMIT 1
        `,
        [product.size]
    );

    if (usedRows.length > 0) {
        await client.query(
            `
            UPDATE "Inventory"
            SET quantity = quantity + $1
            WHERE id = $2
            `,
            [quantityToUsed, usedRows[0].inventory_id]
        );
    } else {
        const { rows: newUsedProductRows } = await client.query(
            `
            INSERT INTO "Product" (
                name,
                size,
                brand,
                sku,
                price,
                cost,
                condition,
                is_active,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'USED', true, NOW(), NOW())
            RETURNING id
            `,
            [
                `Used Tire ${product.size}`,
                product.size,
                product.brand || "Used",
                `USED-${product.size}-${Date.now()}`,
                product.price,
                product.cost,
            ]
        );

        await client.query(
            `
            INSERT INTO "Inventory" (
                product_id,
                quantity
            )
            VALUES ($1, $2)
            `,
            [newUsedProductRows[0].id, quantityToUsed]
        );
    }

    await client.query(
        `
        UPDATE "Inventory"
        SET quantity = $1
        WHERE product_id = $2
        `,
        [newSetQuantity, product.id]
    );
};


/**
 * GET /api/invoices
 * Returns invoices with filters
 */
const getInvoices = asyncHandler(async (req, res) => {
    const { date, month, status } = req.query;

    let whereClause = "";
    const params = [];

    if (!status) {
        return res.status(400).json({
            error: "Missing required query parameter: status. Optional filters: date, month."
        });
    }

    if (date) {
        params.push(date);
        whereClause += `
      AND i.created_at >= $${params.length}::date
      AND i.created_at < $${params.length}::date + INTERVAL '1 day'
    `;
    }

    if (month) {
        params.push(`${month}-01`);
        whereClause += `
      AND i.created_at >= date_trunc('month', $${params.length}::date)
      AND i.created_at < date_trunc('month', $${params.length}::date) + INTERVAL '1 month'
    `;
    }

    const { rows } = await db.query(
        `
    SELECT
      i.*,
      c.name AS customer_name,
      c.phone AS customer_phone,
      u.name AS created_by_name
    FROM "Invoice" i
    LEFT JOIN "Customer" c
      ON c.id = i.customer_id
    LEFT JOIN "User" u
      ON u.id = i.created_by
    WHERE i.deleted_at IS NULL
      AND i.status = $${params.length + 1}
      ${whereClause}
    ORDER BY i.created_at DESC
    `,
        [...params, status]
    );

    return res.status(200).json(rows);
});

/**
 * POST /api/invoices
 * Creates a new invoice with transactions and updates inventory
 */
const createInvoice = asyncHandler(async (req, res) => {
    const client = await db.connect();

    try {
        const {
            total,
            subtotal,
            tax,
            customer_id,
            payment_method,
            status,
            transactions,
            cash_amount,
            debit_amount,
        } = req.body;

        const created_by = req.user?.id || req.body.created_by;

        if (
            !customer_id ||
            !created_by ||
            subtotal == null ||
            !status ||
            !Array.isArray(transactions)
        ) {
            return res.status(400).json({ error: "Invalid payload" });
        }

        await client.query("BEGIN");

        const invoiceRes = await client.query(
            `
      INSERT INTO "Invoice" (
        customer_id,
        created_by,
        total_amount,
        subtotal,
        tax,
        cash_amount,
        debit_amount,
        created_at,
        payment_method,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
      RETURNING id
      `,
            [
                customer_id,
                created_by,
                total || null,
                subtotal,
                tax || null,
                cash_amount || null,
                debit_amount || null,
                payment_method || null,
                status,
            ]
        );

        const invoiceId = invoiceRes.rows[0].id;

        for (const tx of transactions) {
            if (tx.category === "Tire") {
                await client.query(
                    `
          INSERT INTO "Transaction" (
            invoice_id,
            amount,
            description,
            created_at,
            type,
            category,
            created_by,
            payment_method,
            product_id,
            quantity,
            status
          )
          VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
          `,
                    [
                        invoiceId,
                        tx.amount,
                        tx.description,
                        tx.type,
                        tx.category,
                        created_by,
                        payment_method || null,
                        tx.product_id,
                        tx.quantity,
                        status,
                    ]
                );

                const { rows: updatedInventoryRows } = await client.query(
                    `
          UPDATE "Inventory" i
          SET quantity = quantity - $1
          FROM "Product" p
          WHERE p.id = $2
            AND i.product_id = p.id
            AND p.deleted_at IS NULL
            AND i.quantity >= $1
          RETURNING p.id, quantity, price, cost, size
          `,
                    [tx.quantity, tx.product_id]
                );

                if (updatedInventoryRows.length === 0) {
                    throw new Error("Insufficient inventory");
                }

                await client.query(
                    `
          INSERT INTO "Inventory_movement" (
            product_id,
            quantity,
            created_at,
            reason,
            invoice_id
          )
          VALUES ($1, $2, NOW(), 'sale', $3)
          `,
                    [tx.product_id, tx.quantity, invoiceId]
                );

                const productRes = await client.query(
                    `SELECT condition, size FROM "Product" WHERE id = $1`,
                    [tx.product_id]
                );

                if (
                    productRes.rows[0]?.condition === "SET" &&
                    tx.quantity % 4 !== 0
                ) {
                    await handleTireSet(client, updatedInventoryRows[0]);
                }
            } else if (tx.category === "Service") {
                await client.query(
                    `
          INSERT INTO "Transaction" (
            invoice_id,
            amount,
            description,
            created_at,
            type,
            category,
            created_by,
            payment_method,
            service_id,
            quantity,
            status
          )
          VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
          `,
                    [
                        invoiceId,
                        tx.amount,
                        tx.description,
                        tx.type,
                        tx.category,
                        created_by,
                        payment_method || null,
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

        return res.status(500).json({ error: "Failed to create invoice" });
    } finally {
        client.release();
    }
});

/**
 * GET /api/invoices/:id
 * Returns a single invoice with its transactions
 */
const getInvoiceId = asyncHandler(async (req, res) => {
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
      i.cash_amount,
      i.debit_amount,
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
            'product_id', t.product_id,
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
 * Fully update invoice:
 * - customer
 * - totals
 * - payment method
 * - cash/debit amounts
 * - status
 * - tire/product items
 * - service items
 * - inventory quantities
 * - inventory movement logs
 */
const updateInvoiceId = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const client = await db.connect();

    try {
        const {
            customer_id,
            total_amount,
            subtotal,
            tax,
            payment_method,
            cash_amount,
            debit_amount,
            status,
            transactions,
        } = req.body;

        const updated_by = req.user?.id || req.body.created_by;

        if (!updated_by) {
            return res.status(401).json({
                error: "Unauthorized",
            });
        }

        if (
            !customer_id ||
            subtotal == null ||
            !status ||
            !Array.isArray(transactions)
        ) {
            return res.status(400).json({
                error: "Invalid payload",
            });
        }

        await client.query("BEGIN");

        const invoiceRes = await client.query(
            `
            SELECT *
            FROM "Invoice"
            WHERE id = $1
              AND deleted_at IS NULL
            `,
            [id]
        );

        if (invoiceRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                error: "Invoice not found",
            });
        }

        const oldTransactionsRes = await client.query(
            `
            SELECT *
            FROM "Transaction"
            WHERE invoice_id = $1
              AND deleted_at IS NULL
            `,
            [id]
        );

        const oldTransactions = oldTransactionsRes.rows;

        for (const oldTx of oldTransactions) {
            if (oldTx.product_id && oldTx.quantity) {
                await client.query(
                    `
                    UPDATE "Inventory"
                    SET
                        quantity = quantity + $1,
                        updated_at = NOW()
                    WHERE product_id = $2
                    `,
                    [oldTx.quantity, oldTx.product_id]
                );

                await client.query(
                    `
                    INSERT INTO "Inventory_movement" (
                        product_id,
                        quantity,
                        created_at,
                        reason,
                        invoice_id
                    )
                    VALUES ($1, $2, NOW(), 'return', $3)
                    `,
                    [oldTx.product_id, oldTx.quantity, id]
                );
            }
        }

        await client.query(
            `
            UPDATE "Transaction"
            SET
                deleted_at = NOW(),
                updated_at = NOW()
            WHERE invoice_id = $1
              AND deleted_at IS NULL
            `,
            [id]
        );

        const updatedInvoiceRes = await client.query(
            `
            UPDATE "Invoice"
            SET
                customer_id = $2,
                total_amount = $3,
                subtotal = $4,
                tax = $5,
                payment_method = $6,
                cash_amount = $7,
                debit_amount = $8,
                status = $9,
                updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
            RETURNING *
            `,
            [
                id,
                customer_id,
                total_amount ?? null,
                subtotal,
                tax ?? null,
                payment_method ?? null,
                cash_amount ?? null,
                debit_amount ?? null,
                status,
            ]
        );

        for (const tx of transactions) {
            if (
                tx.amount == null ||
                !tx.type ||
                !tx.category ||
                tx.quantity == null
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Invalid transaction payload",
                });
            }

            if (tx.category === "Tire") {
                if (!tx.product_id) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        error: "Product ID is required for tire transactions",
                    });
                }

                const inventoryRes = await client.query(
                    `
                    UPDATE "Inventory" i
                    SET
                        quantity = i.quantity - $1,
                        updated_at = NOW()
                    FROM "Product" p
                    WHERE p.id = $2
                      AND i.product_id = p.id
                      AND p.deleted_at IS NULL
                      AND i.quantity >= $1
                    RETURNING
                        p.id,
                        i.quantity,
                        p.price,
                        p.cost,
                        p.size,
                        p.condition
                    `,
                    [tx.quantity, tx.product_id]
                );

                if (inventoryRes.rowCount === 0) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        error: "Insufficient inventory",
                    });
                }

                await client.query(
                    `
                    INSERT INTO "Transaction" (
                        invoice_id,
                        amount,
                        description,
                        created_at,
                        type,
                        category,
                        created_by,
                        payment_method,
                        product_id,
                        quantity,
                        status
                    )
                    VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
                    `,
                    [
                        id,
                        tx.amount,
                        tx.description || null,
                        tx.type,
                        tx.category,
                        updated_by,
                        payment_method || null,
                        tx.product_id,
                        tx.quantity,
                        status,
                    ]
                );

                await client.query(
                    `
                    INSERT INTO "Inventory_movement" (
                        product_id,
                        quantity,
                        created_at,
                        reason,
                        invoice_id
                    )
                    VALUES ($1, $2, NOW(), 'sale', $3)
                    `,
                    [tx.product_id, tx.quantity, id]
                );

                if (
                    inventoryRes.rows[0]?.condition === "SET" &&
                    tx.quantity % 4 !== 0 &&
                    typeof handleTireSet === "function"
                ) {
                    await handleTireSet(client, inventoryRes.rows[0]);
                }
            }

            else if (tx.category === "Service") {
                if (!tx.service_id) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        error: "Service ID is required for service transactions",
                    });
                }

                await client.query(
                    `
                    INSERT INTO "Transaction" (
                        invoice_id,
                        amount,
                        description,
                        created_at,
                        type,
                        category,
                        created_by,
                        payment_method,
                        service_id,
                        quantity,
                        status
                    )
                    VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
                    `,
                    [
                        id,
                        tx.amount,
                        tx.description || null,
                        tx.type,
                        tx.category,
                        updated_by,
                        payment_method || null,
                        tx.service_id,
                        tx.quantity,
                        status,
                    ]
                );
            }

            else {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: `Unsupported transaction category: ${tx.category}`,
                });
            }
        }

        await client.query("COMMIT");

        return res.status(200).json({
            message: "Invoice updated successfully",
            invoice: updatedInvoiceRes.rows[0],
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Update invoice error:", err);

        return res.status(500).json({
            error: "Failed to update invoice",
        });
    } finally {
        client.release();
    }
});

/**
 * DELETE /api/invoices/:id
 * Soft delete invoice and linked transactions,
 * restore inventory, and log inventory movement
 */
const deleteInvoiceId = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { items = [] } = req.body;
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

        for (const transaction of items) {
            if (transaction.product_id) {
                await client.query(
                    `
          UPDATE "Inventory"
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE product_id = $2
          `,
                    [transaction.quantity, transaction.product_id]
                );
            }

            await client.query(
                `
          INSERT INTO "Inventory_movement"
            (product_id, quantity, created_at, reason, invoice_id)
          VALUES ($1, $2, NOW(), 'return', $3)
          `,
                [transaction.product_id, transaction.quantity, id]
            );
        }

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


const getInvoiceSummary = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    try {
        const { rows } = await db.query(
            `
            SELECT
              COUNT(*) FILTER (WHERE i.deleted_at IS NULL) AS total_transactions,

              COUNT(*) FILTER (
                WHERE i.status = 'finished' AND i.deleted_at IS NULL
              ) AS total_sales_count,

              COALESCE(SUM(i.total_amount) FILTER (
                WHERE i.status = 'finished' AND i.deleted_at IS NULL
              ), 0) AS total_sales_amount,

              COUNT(*) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Cash' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ) AS cash_sales_count,

              COALESCE(SUM(i.cash_amount) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Cash' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ), 0) AS cash_sales_amount,

              COUNT(*) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Debit' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ) AS debit_sales_count,

              COALESCE(SUM(i.debit_amount) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Debit' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ), 0) AS debit_sales_amount
            FROM "Invoice" i
            WHERE
              i.created_at >= $1::date
              AND i.created_at < $1::date + INTERVAL '1 day'
              AND i.status = 'finished'
            `,
            [targetDate]
        );

        return res.status(200).json(rows[0]);
    } catch (error) {
        console.error("Daily invoice summary error:", error);
        return res.status(500).json({
            error: "Failed to fetch daily invoice summary",
        });
    }
});

const getMonthlyInvoiceSummary = asyncHandler(async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({
            error: "Month is required",
        });
    }

    try {
        const { rows } = await db.query(
            `
            SELECT
              COUNT(*) FILTER (WHERE i.deleted_at IS NULL) AS total_transactions,

              COUNT(*) FILTER (
                WHERE i.status = 'finished' AND i.deleted_at IS NULL
              ) AS total_sales_count,

              COALESCE(SUM(i.total_amount) FILTER (
                WHERE i.status = 'finished' AND i.deleted_at IS NULL
              ), 0) AS total_sales_amount,

              COUNT(*) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Cash' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ) AS cash_sales_count,

              COALESCE(SUM(i.cash_amount) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Cash' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ), 0) AS cash_sales_amount,

              COUNT(*) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Debit' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ) AS debit_sales_count,

              COALESCE(SUM(i.debit_amount) FILTER (
                WHERE i.status = 'finished'
                  AND (i.payment_method = 'Debit' OR i.payment_method = 'Mix')
                  AND i.deleted_at IS NULL
              ), 0) AS debit_sales_amount
            FROM "Invoice" i
            WHERE
              i.created_at >= date_trunc('month', $1::date)
              AND i.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
              AND i.status = 'finished'
            `,
            [`${month}-01`]
        );

        return res.status(200).json(rows[0]);
    } catch (error) {
        console.error("Monthly invoice summary error:", error);
        return res.status(500).json({
            error: "Failed to fetch monthly invoice summary",
        });
    }
});



module.exports = {
    getInvoices,
    createInvoice,
    getInvoiceSummary,
    getMonthlyInvoiceSummary,
    getInvoiceId,
    updateInvoiceId,
    deleteInvoiceId,
};