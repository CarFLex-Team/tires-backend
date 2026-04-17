const express = require('express');
const {
    getServices,
    //  getServiceById,
    createService,
    //  updateService,
    deleteService,
    //  getTopServices,
    getMonthlyServices,
} = require('../controllers/service');

const router = express.Router();

// GET all services
router.get('/', getServices);

// Top 5 services by turnover
//router.get('/summary', getTopService);

// Monthly top services
router.get('/summary/monthly', getMonthlyServices);

// GET single service
//router.get('/:id', getServiceById);

// CREATE service
router.post('/', createService);

// UPDATE service
//router.put('/:id', updateService);

// SOFT DELETE service
router.delete('/:id', deleteService);


module.exports = router;