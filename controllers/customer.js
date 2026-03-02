
const { db } = require("../config/db");

/**
 * GET /api/customer/summary
 */
const getCustomers = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT *
            FROM "Customer"
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC
        `);

        res.status(200).json(rows);
    } catch (error) {
        console.error("GET CUSTOMERS ERROR:", error);
        res.status(500).json({ error: "Failed to fetch customers" });
    }
};

/**
 * GET /api/v1/customers/:id
 */
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;

        const { rows, rowCount } = await db.query(
            `
            SELECT *
            FROM "Customer"
            WHERE id = $1 AND deleted_at IS NULL
            `,
            [id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error("GET CUSTOMER BY ID ERROR:", error);
        res.status(500).json({ error: "Failed to fetch customer" });
    }
};

/**
 * POST /api/v1/customers
 */
const createCustomer = async (req, res) => {
    try {
        const { name, email, phone } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({
                error: "Name, email and phone are required",
            });
        }

        const { rows } = await db.query(
            `
            INSERT INTO "Customer" (name, email, phone)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [name, email, phone]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error("CREATE CUSTOMER ERROR:", error);

        // Unique violation (email must be UNIQUE in DB)
        if (error.code === "23505") {
            return res.status(400).json({
                error: "Email already exists",
            });
        }

        res.status(500).json({ error: "Failed to create customer" });
    }
};

/**
 * PUT /api/v1/customers/:id
 */
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({
                error: "Name, email and phone are required",
            });
        }

        const { rows, rowCount } = await db.query(
            `
            UPDATE "Customer"
            SET name = $1,
                email = $2,
                phone = $3,
                updated_at = NOW()
            WHERE id = $4
              AND deleted_at IS NULL
            RETURNING *
            `,
            [name, email, phone, id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error("UPDATE CUSTOMER ERROR:", error);

        if (error.code === "23505") {
            return res.status(400).json({
                error: "Email already exists",
            });
        }

        res.status(500).json({ error: "Failed to update customer" });
    }
};

/**
 * DELETE /api/v1/customers/:id
 * Soft delete
 */
const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        const { rowCount } = await db.query(
            `
            UPDATE "Customer"
            SET deleted_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
            `,
            [id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        res.status(204).send();
    } catch (error) {
        console.error("DELETE CUSTOMER ERROR:", error);
        res.status(500).json({ error: "Failed to delete customer" });
    }
};

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};