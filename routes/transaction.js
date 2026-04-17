const express = require("express");
const {
    getTransactions,
    //  getTransactionById,              
    createTransaction,
    //  updateTransaction,               
    deleteTransaction,
    getTransactionSummary,
    getMonthlyTransactionSummary,
    // getMonthlyTransactionsList,      
} = require("../controllers/transaction");

const router = express.Router();

// ===== Transaction Routes =====

//summary routes 
router.get("/summary/monthly", getMonthlyTransactionSummary);
router.get("/summary", getTransactionSummary);

// route monthly list
// router.get("/monthly-list", getMonthlyTransactionsList);

// Core routes
router.get("/", getTransactions);
// router.get("/:id", getTransactionById);      
router.post("/", createTransaction);
// router.put("/:id", updateTransaction);       
router.delete("/:id", deleteTransaction);

module.exports = router;