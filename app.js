const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const customerRoutes = require('./routes/customer');
const servicesRoute = require('./routes/service');
const transactionRoute = require('./routes/transaction');
const inventoryRoute = require('./routes/inventory');
const invoiceRoute = require('./routes/invoice');

dotenv.config();
const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'OK' }));

// Routes
app.use('/api/customers', customerRoutes);
app.use('/api/services', servicesRoute);
app.use('/api/transactions', transactionRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/invoices', invoiceRoute);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err);

    // Multer file type error
    if (err.message === "INVALID_FILE_TYPE") {
        return res.status(400).json({
            error: "Only PNG, JPEG, JPG, and WEBP images are allowed",
        });
    }

    // Multer file size error
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
            error: "File too large. Max size is 5MB",
        });
    }

    return res.status(500).json({
        error: "Internal server error",
        details: err.message,
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));