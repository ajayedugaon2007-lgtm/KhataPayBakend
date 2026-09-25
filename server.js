const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const pool = require('./src/config/database');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await pool.connectDatabase();

    console.log('Database connected successfully');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error(
      'Database connection failed:',
      error.message || error
    );

    process.exitCode = 1;
  }
})();