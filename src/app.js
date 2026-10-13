const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/error.middleware');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ success: true, message: 'KhataPay API is running', data: {} }));

const routeModules = [
	['auth', './routes/auth.routes'],
	['dashboard', './routes/dashboard.routes'],
	['businesses', './routes/business.routes'],
	['customers', './routes/customer.routes'],
	['transactions', './routes/transaction.routes'],
	['products', './routes/product.routes'],
	['invoices', './routes/invoice.routes'],
	['payments', './routes/payment.routes'],
	['expenses', './routes/expense.routes'],
	['staff', './routes/staff.routes'],
	['reports', './routes/report.routes']
];

for (const [path, modulePath] of routeModules) app.use(`/api/${path}`, require(modulePath));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
