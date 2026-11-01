const mysql = require('mysql2/promise');

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	port: Number(process.env.DB_PORT || 3306),
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
	connectTimeout: 20000
});

async function connectDatabase() {
	const connection = await pool.getConnection();
	try {
		console.log('Database connected successfully');
	} finally {
		connection.release();
	}
}

module.exports = {
	pool,
	connectDatabase
};
