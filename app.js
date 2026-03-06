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
app.use('/api/transaction', transactionRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/invoice', invoiceRoute);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));