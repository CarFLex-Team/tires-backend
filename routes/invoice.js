// routes/invoices.js
const express = require('express');
const {
    getInvoices,
    createInvoice,
    getInvoiceId,
    updateInvoiceId,
    deleteInvoiceId,
    getInvoiceSummary,
    getMonthlyInvoiceSummary,
} = require('../controllers/invoice');

const router = express.Router();

// ===== Invoice CRUD Routes =====

// GET all pending invoices
router.get('/', getInvoices);

// CREATE a new invoice
router.post('/', createInvoice);

// GET a Invoice summary by date
router.get('/summary', getInvoiceSummary);

// GET Monthly Invoices Summary
router.get('/summary/monthly', getMonthlyInvoiceSummary);

// GET single invoice by ID
router.get('/:id', getInvoiceId);

// UPDATE invoice (e.g., payment method)
router.put('/:id', updateInvoiceId);

// SOFT DELETE invoice
router.delete('/:id', deleteInvoiceId);

module.exports = router;