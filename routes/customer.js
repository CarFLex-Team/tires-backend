const express = require("express");
const {
    getCustomers,
    getCustomerById,
    createCustomer,
    //  updateCustomer
    deleteCustomer,
    getCustomerSummary,
    getMonthlyCustomerSummary,
    getCustomerByIdInvoices,
    getCustomerById,
} = require("../controllers/customer");

const router = express.Router();


router.get("/summary/monthly", getMonthlyCustomerSummary);
router.get("/summary", getCustomerSummary);

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.get("/:id/invoices", getCustomerByIdInvoices);
router.post("/", createCustomer);
// router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;