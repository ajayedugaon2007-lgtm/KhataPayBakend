require('dotenv').config();

const app = require('./src/app');
const pool = require('./src/config/database');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await pool.connectDatabase();

    console.log('Database connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
})();