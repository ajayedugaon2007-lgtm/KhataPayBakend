require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
const { connectDatabase, pool } = require('./config/db');

app.use(cors());
app.use(express.json({
	limit: '2mb',
	verify(req, res, buffer) {
		if (req.originalUrl.split('?')[0] === '/api/webhooks/payment') {
			req.rawBody = Buffer.from(buffer);
		}
	}
}));
app.get('/', (req, res) => res.json({
	status: 'OK',
	message: 'KhataPay Backend Connected to MySQL Database!'
}));
app.get('/health', (req, res) => res.json({ success: true, message: 'KhataPay API is running', data: {} }));

const routeModules = [
	['auth', './routes/auth.routes'],
	['bank', './routes/bank.routes'],
	['upi', './routes/upi.routes'],
	['qr', './routes/qr.routes'],
	['webhooks', './routes/webhooks.routes'],
	['dashboard', './routes/dashboard.routes'],
	['businesses', './routes/business.routes'],
	['customers', './routes/customer.routes'],
	['transactions', './routes/transaction.routes'],
	['products', './routes/product.routes'],
	['invoices', './routes/invoice.routes'],
	['payments', './routes/payment.routes'],
	['expenses', './routes/expense.routes'],
	['staff', './routes/staff.routes'],
	['notifications', './routes/notification.routes'],
	['reports', './routes/report.routes']
];

for (const [path, modulePath] of routeModules) app.use(`/api/${path}`, require(modulePath));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((error, req, res, next) => {
	if (res.headersSent) return next(error);
	const status = error.statusCode || error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
	if (status >= 500) console.error(error);
	return res.status(status).json({
		success: false,
		message: status >= 500 ? 'Internal server error' : error.message
	});
});

const PORT = Number(process.env.PORT || 5013);
let startupStage = 'database connection';

async function start() {
  await connectDatabase();
  startupStage = 'HTTP server';
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(PORT, '0.0.0.0', () => resolve(instance));
    instance.once('error', reject);
  });
  console.log(`KhataPay API listening on port ${PORT}`);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => {
      await pool.end();
      process.exit(0);
    }));
  }
}

start().catch(async (error) => {
  console.error('Server startup failed:', {
    stage: startupStage,
    name: error?.name,
    code: error?.code,
    errno: error?.errno,
    syscall: error?.syscall,
    causeCode: error?.cause?.code
  });
  await pool.end();
  process.exitCode = 1;
});