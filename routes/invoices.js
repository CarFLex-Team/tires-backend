// routes/invoices.js
const express = require('express');
const {
    getInvoices,
    createInvoice,
    getInvoicebyID,
    updateInvoice,
    deleteInvoice,
} = require('../controllers/invoice');

const router = express.Router();

// ===== Invoice CRUD Routes =====

// GET all pending invoices
router.get('/', getInvoices);

// GET single invoice by ID
router.get('/:id', getInvoicebyID);

// CREATE a new invoice
router.post('/', createInvoice);

// UPDATE invoice (e.g., payment method)
router.put('/:id', updateInvoice);

// SOFT DELETE invoice
router.delete('/:id', deleteInvoice);

module.exports = router;