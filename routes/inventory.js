const express = require('express');
const {
    getInventory,
    getInventoryById,
    createInventory,
    updateInventory,
    deleteInventory,
    getTopInventory,
    getMonthlyInventory,
} = require('../controllers/inventory');

const router = express.Router();

// ===== Inventory CRUD Routes =====

// GET all inventory items
router.get('/', getInventory);

// Top 5 inventory items
router.get('/summary', getTopInventory);

// GET single inventory item
router.get('/:id', getInventoryById);

// CREATE inventory item
router.post('/', createInventory);

// UPDATE inventory item
router.put('/:id', updateInventory);

// SOFT DELETE inventory item
router.delete('/:id', deleteInventory);

// Monthly top inventory items
router.get('/summary/product-monthly', getMonthlyInventory);

module.exports = router;