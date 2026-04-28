const express = require("express");
const {
    getInventory,
    // getInventoryById,
    createInventory,
    updateInventory,
    deleteInventory,
    getTopInventory,
    getMonthlyInventory,
    updateInventoryImage,
    deleteInventoryImage

} = require("../controllers/inventory");

const router = express.Router();
const uploadImage = require("../middleware/uploadImage.js");

// ===== Inventory Summary Routes =====
router.get("/summary/product-monthly", getMonthlyInventory);
router.get("/summary", getTopInventory);

// ===== Inventory CRUD Routes =====
router.get("/", getInventory);
// router.get("/:id", getInventoryById);
router.post("/", uploadImage.single("image"), createInventory);
router.put("/:id/image", uploadImage.single("image"), updateInventoryImage);        // P.ID not Inventory ID
router.delete("/:id/image", deleteInventoryImage);
router.put("/:id", updateInventory);
router.delete("/:id", deleteInventory);

module.exports = router;