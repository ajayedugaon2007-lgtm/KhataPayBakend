require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const app = require('./src/app');
const { connectDatabase, pool } = require('./src/config/db');

const PORT = Number(process.env.PORT || 5000);
let startupStage = 'database connection';

async function start() {
  await connectDatabase();
  console.log('Database connected successfully');
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