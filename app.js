const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const customerRoutes = require('./routes/customer');
const summaryRoutes = require('./routes/summary');

dotenv.config();
const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'OK' }));

// Routes
app.use('/api/customers', customerRoutes);
app.use('/api/customers/summary', summaryRoutes);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));