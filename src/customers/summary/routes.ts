import { Router } from "express";
import { getTopCustomers } from "./customer.controllersum";

const router = Router();

// GET /api/v1/customers/top
router.get("/top", getTopCustomers);

export default router;