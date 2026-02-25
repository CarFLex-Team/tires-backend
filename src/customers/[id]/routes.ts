import { Router } from "express";
import {
  getCustomerById,
  deleteCustomer
} from "./customer.controllerid.ts";

const router = Router();

router.get("/:id", getCustomerById);
router.delete("/:id", deleteCustomer);

export default router;