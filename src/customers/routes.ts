import { Router } from "express";
import { getCustomers, createCustomer } from "./customer.controller";

const router = Router();

// GET all customers
router.get("/", getCustomers);

// POST new customer
router.post("/", createCustomer);

export default router;