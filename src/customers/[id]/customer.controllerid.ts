import { Request, Response } from "express";
import { db } from "../../../config/db";

export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await db.query(
      `
      SELECT
        c.*,
        COALESCE(
          json_agg(
            jsonb_build_object(
              'id', i.id,
              'invoice_no', i.invoice_no,
              'total_amount', i.total_amount,
              'created_at', i.created_at,
              'payment_method', i.payment_method,
              'created_by', u.name
            )
            ORDER BY i.created_at DESC
          )
          FILTER (WHERE i.id IS NOT NULL),
          '[]'
        ) AS invoices
      FROM "Customer" c
      LEFT JOIN "Invoice" i
        ON i.customer_id = c.id
        AND i.deleted_at IS NULL
      LEFT JOIN "User" u
        ON u.id = i.created_by
      WHERE c.id = $1
        AND c.deleted_at IS NULL
      GROUP BY c.id;
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch customer" });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      UPDATE "Customer"
      SET deleted_at = NOW()
      WHERE id = $1
      `,
      [id]
    );

    res.json({ message: "Customer deleted (soft)" });
  } catch {
    res.status(500).json({ error: "Failed to delete customer" });
  }
};