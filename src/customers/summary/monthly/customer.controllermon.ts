import { Request, Response } from "express";
import { db } from "../../../../config/db"; // use correct relative path

export const getMonthlyTopCustomers = async (req: Request, res: Response) => {
  try {
    const month = req.query.month as string; // from query ?month=YYYY-MM

    if (!month) {
      return res.status(400).json({ error: "Month is required" });
    }

    const { rows } = await db.query(
      `
      SELECT
        c.name AS customer,
        SUM(i.total_amount) AS turn_over
      FROM "Invoice" i
      JOIN "Customer" c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND i.created_at >= date_trunc('month', $1::date)
        AND i.created_at < date_trunc('month', $1::date) + INTERVAL '1 month'
      GROUP BY c.id, c.name
      ORDER BY turn_over DESC
      LIMIT 2;
      `,
      [`${month}-01`]
    );

    res.json(rows);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch monthly top customers" });
  }
};