const express = require("express");
const {
    getInventory,
    // getInventoryById,
    createInventory,
    updateInventory,
    deleteInventory,
    getTopInventory,
    getMonthlyInventory,
} = require("../controllers/inventory");

const router = express.Router();

// ===== Inventory Summary Routes =====
router.get("/summary/product-monthly", getMonthlyInventory);
router.get("/summary", getTopInventory);

// ===== Inventory CRUD Routes =====
router.get("/", getInventory);
// router.get("/:id", getInventoryById);
router.post("/", createInventory);
router.put("/:id", updateInventory);
router.delete("/:id", deleteInventory);

module.exports = router;