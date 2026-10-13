require('dotenv').config();

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const database = require('../src/config/database');

const suffix = `${Date.now()}`;
const phone = suffix.slice(-10);
const password = `Smoke-${suffix}-Password`;
const cleanupRecords = [];
let server;
let token;
let businessId;
let customerId;
let productId;
let saleId;
let purchaseId;
let invoiceId;
let userId;

const routeTables = {
	'/api/users': 'users',
	'/api/sessions': 'user_sessions',
	'/api/businesses': 'businesses',
	'/api/business-members': 'business_members',
	'/api/customers': 'customers',
	'/api/transactions': 'transactions',
	'/api/payments': 'payments',
	'/api/payment-reminders': 'payment_reminders',
	'/api/notifications': 'payment_reminders',
	'/api/categories': 'categories',
	'/api/products': 'products',
	'/api/inventory': 'inventory_transactions',
	'/api/sales': 'sales',
	'/api/sale-items': 'sale_items',
	'/api/purchases': 'purchases',
	'/api/purchase-items': 'purchase_items',
	'/api/invoices': 'invoices',
	'/api/invoice-items': 'invoice_items',
	'/api/expense-categories': 'expense_categories',
	'/api/expenses': 'expenses',
	'/api/staff': 'staff'
};

async function request(path, { method = 'GET', body, authenticated = true } = {}) {
	const headers = {};
	if (body !== undefined) headers['content-type'] = 'application/json';
	if (authenticated && token) headers.authorization = `Bearer ${token}`;
	const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
		method,
		headers,
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
	const result = await response.json();
	assert.equal(response.ok, true, `${method} ${path} returned ${response.status}: ${result.message || 'request failed'}`);
	assert.equal(result.success, true, `${method} ${path} returned success=false`);
	return result.data;
}

function track(path, record) {
	assert.ok(record && record.id, `${path} did not return a saved record id`);
	cleanupRecords.push({ path, table: routeTables[path], id: record.id, deleted: false });
	return record;
}

async function testCrud(path, payload, field, updatedValue) {
	const table = routeTables[path];
	const listBefore = await request(path);
	assert.ok(Array.isArray(listBefore), `GET ${path} did not return a list`);
	const created = track(path, await request(path, { method: 'POST', body: payload }));
	const fetched = await request(`${path}/${created.id}`);
	assert.equal(String(fetched.id), String(created.id), `GET ${path}/${created.id} returned a different record`);
	const updated = await request(`${path}/${created.id}`, {
		method: 'PUT',
		body: { [field]: updatedValue }
	});
	const actualValue = typeof updatedValue === 'number' ? Number(updated[field]) : String(updated[field]);
	assert.equal(actualValue, updatedValue, `PUT ${path}/${created.id} did not persist ${field}`);
	const listAfter = await request(path);
	assert.ok(listAfter.some((record) => String(record.id) === String(created.id)), `GET ${path} omitted the saved ${table} record`);
	return created;
}

async function cleanup() {
	for (const record of cleanupRecords.slice().reverse()) {
		if (record.deleted) continue;
		try {
			await request(`${record.path}/${record.id}`, { method: 'DELETE' });
			record.deleted = true;
		} catch {
			await database.pool.query(`DELETE FROM \`${record.table}\` WHERE id = ?`, [record.id]).catch(() => {});
		}
	}
}

async function main() {
	assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be configured');
	server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));

	const health = await request('/health', { authenticated: false });
	assert.deepEqual(health, {});

	const registered = await request('/api/auth/register', {
		method: 'POST',
		authenticated: false,
		body: { name: 'API smoke user', phone, password }
	});
	userId = registered.id;
	track('/api/users', registered);
	const login = await request('/api/auth/login', {
		method: 'POST',
		authenticated: false,
		body: { phone, password }
	});
	token = login.token;
	assert.ok(token, 'Login did not return a JWT');

	const business = await testCrud('/api/businesses', {
		owner_id: userId,
		name: `API smoke business ${suffix}`
	}, 'name', `Updated business ${suffix}`);
	businessId = business.id;
	await testCrud('/api/business-members', { business_id: businessId, user_id: userId, role: 'owner' }, 'role', 'member');

	const customer = await testCrud('/api/customers', {
		business_id: businessId,
		name: 'API smoke customer',
		phone: String((Number(phone) + 1) % 10000000000).padStart(10, '0')
	}, 'name', 'Updated smoke customer');
	customerId = customer.id;
	const product = await testCrud('/api/products', {
		business_id: businessId,
		name: 'API smoke product',
		purchase_price: 1,
		selling_price: 2,
		stock: 3
	}, 'name', 'Updated smoke product');
	productId = product.id;

	await testCrud('/api/users', {
		name: 'API smoke second user',
		phone: String((Number(phone) + 2) % 10000000000).padStart(10, '0'),
		password
	}, 'name', 'Updated smoke user');
	await testCrud('/api/sessions', { user_id: userId, token: `smoke-${suffix}` }, 'token', `updated-${suffix}`);
	await testCrud('/api/categories', { business_id: businessId, name: 'API smoke category' }, 'name', 'Updated smoke category');
	await testCrud('/api/transactions', { business_id: businessId, customer_id: customerId, type: 'GIVEN', amount: 1 }, 'amount', 2);
	await testCrud('/api/payments', { business_id: businessId, customer_id: customerId, amount: 1, method: 'CASH' }, 'amount', 2);
	await testCrud('/api/payment-reminders', { business_id: businessId, customer_id: customerId, status: 'pending' }, 'status', 'sent');
	await testCrud('/api/notifications', { business_id: businessId, customer_id: customerId, status: 'pending' }, 'status', 'sent');
	await testCrud('/api/inventory', { business_id: businessId, product_id: productId, type: 'IN', quantity: 1 }, 'type', 'OUT');

	const sale = await testCrud('/api/sales', {
		business_id: businessId,
		customer_id: customerId,
		total: 1,
		payment_method: 'CASH'
	}, 'total', 2);
	saleId = sale.id;
	await testCrud('/api/sale-items', { sale_id: saleId, product_id: productId, quantity: 1, price: 1, total: 1 }, 'quantity', 2);
	const purchase = await testCrud('/api/purchases', { business_id: businessId, supplier_name: 'Smoke supplier', total: 1 }, 'total', 2);
	purchaseId = purchase.id;
	await testCrud('/api/purchase-items', { purchase_id: purchaseId, product_id: productId, quantity: 1, price: 1, total: 1 }, 'quantity', 2);
	const invoice = await testCrud('/api/invoices', { business_id: businessId, customer_id: customerId, total: 1, status: 'unpaid' }, 'status', 'paid');
	invoiceId = invoice.id;
	await testCrud('/api/invoice-items', { invoice_id: invoiceId, product_id: productId, quantity: 1, price: 1, total: 1 }, 'quantity', 2);
	await testCrud('/api/expense-categories', { business_id: businessId, name: 'API smoke expense category' }, 'name', 'Updated smoke expense category');
	await testCrud('/api/expenses', {
		business_id: businessId,
		title: 'API smoke expense',
		amount: 1,
		date: new Date().toISOString().slice(0, 10),
		payment_method: 'CASH'
	}, 'title', 'Updated smoke expense');
	await testCrud('/api/staff', { business_id: businessId, name: 'API smoke staff', salary: 1 }, 'name', 'Updated smoke staff');

	const dashboard = await request(`/api/dashboard?business_id=${businessId}`);
	assert.equal(String(dashboard.business_id), String(businessId));
	const report = await request(`/api/reports/summary?business_id=${businessId}`);
	assert.equal(String(report.business_id), String(businessId));

	const registeredOwner = await request('/api/auth/register-owner', {
		method: 'POST',
		authenticated: false,
		body: {
			user: { name: 'API smoke owner', phone: String((Number(phone) + 3) % 10000000000).padStart(10, '0'), password },
			business: { owner_id: userId, name: `API smoke owner business ${suffix}` }
		}
	});
	track('/api/users', registeredOwner.user);
	track('/api/businesses', registeredOwner.business);
	track('/api/business-members', registeredOwner.membership);

	for (const record of cleanupRecords.slice().reverse()) {
		await request(`${record.path}/${record.id}`, { method: 'DELETE' });
		record.deleted = true;
	}

	console.log(`API_SMOKE_PASSED: auth, dashboard, reports, and ${Object.keys(routeTables).length} CRUD routes`);
}

main()
	.catch((error) => {
		console.error('API_SMOKE_FAILED:', error.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await cleanup();
		if (server) await new Promise((resolve) => server.close(resolve));
		await database.pool.end();
	});