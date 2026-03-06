const express = require('express');
const {
    getService,
    getServiceById,
    createService,
    updateService,
    deleteService,
    getTopService,
    getMonthlyService,
} = require('../controllers/service');

const router = express.Router();

// GET all services
router.get('/', getService);

// Top 5 services by turnover
router.get('/summary', getTopService);

// Monthly top services
router.get('/summary/monthly', getMonthlyService);

// GET single service
router.get('/:id', getServiceById);

// CREATE service
router.post('/', createService);

// UPDATE service
router.put('/:id', updateService);

// SOFT DELETE service
router.delete('/:id', deleteService);


module.exports = router;