const express = require('express');
const {
    getTransactions,
    getTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getTopTransaction,
    getMonthlyTransactions,
} = require('../controllers/transactions');


const router = express.Router();

// ===== Customer CRUD Routes =====

// GET all customers
router.get('/', getTransactions);

// Top 5 customers by turnover
router.get('/summary', getTopTransaction);

// Monthly top customers
router.get('/summary/monthly', getMonthlyTransactions);

// GET single customer
router.get('/:id', getTransactionById);

// CREATE customer
router.post('/', createTransaction);

// UPDATE customer
router.put('/:id', updateTransaction);

// SOFT DELETE customer
router.delete('/:id', deleteTransaction);



module.exports = router;