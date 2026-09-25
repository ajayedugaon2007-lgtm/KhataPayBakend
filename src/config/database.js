const mysql = require('mysql2/promise');

const requiredDatabaseName = process.env.DB_NAME;

if (!requiredDatabaseName) {
  throw new Error('DB_NAME is required in the .env file');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: requiredDatabaseName,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.connectDatabase = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
    console.log('MySQL connection successful');
  } finally {
    connection.release();
  }
};

module.exports = pool;