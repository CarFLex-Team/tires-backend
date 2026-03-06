const express = require('express');
const {
    getcustomer,
    getcustomerById,
    createcustomer,
    updatecustomer,
    deletecustomer,
    getTopcustomer,
    getmonthlycustomer,
} = require('../controllers/customers');


const router = express.Router();

// ===== Customer CRUD Routes =====

// GET all customers
router.get('/', getcustomer);

// Top 5 customers by turnover
router.get('/summary', getTopcustomer);

// GET single customer
router.get('/:id', getcustomerById);

// CREATE customer
router.post('/', createcustomer);

// UPDATE customer
router.put('/:id', updatecustomer);

// SOFT DELETE customer
router.delete('/:id', deletecustomer);

// Monthly top customers
router.get('/summary/monthly', getmonthlycustomer);

module.exports = router;