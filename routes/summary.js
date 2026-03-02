const express = require('express');
const { getTopCustomers } = require('../controllers/summary'); // make sure path is correct
const monthlyRoutes = require('./monthly');

const router = express.Router();

// Top 5 customers by turnover
router.get('/top', getTopCustomers);

// Example summary route
router.get('/', (req, res) => {
    res.json({ message: 'Customer summary' });
});

// Mount monthly routes
router.use('/monthly', monthlyRoutes);

module.exports = router;