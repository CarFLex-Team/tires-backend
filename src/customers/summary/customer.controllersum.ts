import { Request, Response } from "express";
import { db } from "../../../config/db";

export const getTopCustomers = async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(`
      SELECT
        c.name AS customer,
        SUM(i.total_amount) AS turn_over
      FROM "Invoice" i
      JOIN "Customer" c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL
        AND c.deleted_at IS NULL
      GROUP BY c.id, c.name
      ORDER BY turn_over DESC
      LIMIT 3;
    `);

    res.json(rows);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch top customers" });
  }
};