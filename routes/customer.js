const express = require('express');
const {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
} = require('../controllers/customer');

const router = express.Router();

// GET all customers
router.get('/', getCustomers);

// GET single customer
router.get('/:id', getCustomerById);

// CREATE customer
router.post('/', createCustomer);

// UPDATE customer
router.put('/:id', updateCustomer);

// SOFT DELETE customer
router.delete('/:id', deleteCustomer);

module.exports = router;