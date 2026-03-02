// routes/monthly.js
const express = require('express');
const { getMonthlyTopCustomers } = require('../controllers/monthly');

const router = express.Router();

// Just '/' because it will be mounted at /summary/monthly
router.get('/', getMonthlyTopCustomers);

module.exports = router;