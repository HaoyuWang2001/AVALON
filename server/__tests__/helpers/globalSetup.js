// Global setup — starts the Express server once before all tests.
// Communicates the port via a temp file (since globalSetup env changes don't propagate to workers).

const path = require('path');
const fs = require('fs');

module.exports = async function globalSetup() {
  const tmpDir = path.resolve(__dirname, '../../node_modules/.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';

  if (!process.env.DB_HOST) process.env.DB_HOST = '127.0.0.1';
  if (!process.env.DB_PORT) process.env.DB_PORT = '3307';
  if (!process.env.DB_USER) process.env.DB_USER = 'avalon_user';
  if (!process.env.DB_PASS) process.env.DB_PASS = 'test_dummy';
  if (!process.env.DB_NAME) process.env.DB_NAME = 'avalon_db';

  const serverDir = path.resolve(__dirname, '../..');
  const { server, dbInitialized } = require(serverDir);

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
    setTimeout(() => reject(new Error('Server startup timed out after 20s')), 20000);
  });

  const port = server.address().port;
  const mode = dbInitialized ? 'db' : 'memory';

  // Write port to temp file for test workers to read
  const configFile = path.join(tmpDir, 'test-server.json');
  fs.writeFileSync(configFile, JSON.stringify({ port, mode }));

  console.log(`\nTest server started on port ${port} (mode: ${mode})\n`);
};
