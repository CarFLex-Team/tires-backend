import { Request, Response } from "express";
import { db } from "../../config/db"; 

// GET /api/v1/customers
export const getCustomers = async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(`
      SELECT *
      FROM "Customer"
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

// POST /api/v1/customers
export const createCustomer = async (req: Request, res: Response) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: "All fields are required" });
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
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};