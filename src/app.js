const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/error.middleware');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.get('/health', (req, res) => res.json({ success: true, message: 'KhataPay API is running', data: {} }));

const routeModules = [
	['users', './routes/user.routes'], ['sessions', './routes/session.routes'],
	['businesses', './routes/business.routes'], ['business-members', './routes/businessMember.routes'],
	['customers', './routes/customer.routes'], ['transactions', './routes/transaction.routes'],
	['payments', './routes/payment.routes'], ['payment-reminders', './routes/paymentReminder.routes'],
	['categories', './routes/category.routes'], ['products', './routes/product.routes'],
	['inventory', './routes/inventory.routes'], ['sales', './routes/sale.routes'],
	['sale-items', './routes/saleItem.routes'], ['purchases', './routes/purchase.routes'],
	['purchase-items', './routes/purchaseItem.routes'], ['invoices', './routes/invoice.routes'],
	['invoice-items', './routes/invoiceItem.routes'], ['expense-categories', './routes/expenseCategory.routes'],
	['expenses', './routes/expense.routes']
];

for (const [path, modulePath] of routeModules) app.use(`/api/${path}`, require(modulePath));
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
