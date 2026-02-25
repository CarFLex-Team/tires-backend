import { Router } from "express";
import { getMonthlyTopCustomers } from "./customer.controllermon";

const router = Router();


router.get("/summary/monthly", getMonthlyTopCustomers);

export default router;