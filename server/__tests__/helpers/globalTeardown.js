// Global teardown — drops test database, stops test server.

module.exports = async function globalTeardown() {
  const path = require('path');
  const fs = require('fs');
  const mysql = require('mysql2/promise');

  const configFile = path.resolve(__dirname, '../../node_modules/.tmp/test-server.json');

  // 1. Stop the test server
  const serverDir = path.resolve(__dirname, '../..');
  try {
    const { server } = require(serverDir);
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[globalTeardown] Test server stopped.');
    }
  } catch (e) {
    console.log('[globalTeardown] Server shutdown error (non-fatal):', e.message);
  }

  // 2. Drop the test database using root credentials
  try {
    const dbHost = process.env.DB_HOST || '127.0.0.1';
    const dbPort = process.env.DB_PORT || '3306';
    const rootUser = process.env.DB_ROOT_USER || 'root';
    const rootPass = process.env.DB_ROOT_PASS || 'avalon_root_2024';
    const testDbName = process.env.DB_NAME || 'avalon_db_test';

    console.log(`[globalTeardown] Dropping test database '${testDbName}'...`);
    const rootConn = await mysql.createConnection({
      host: dbHost,
      port: parseInt(dbPort),
      user: rootUser,
      password: rootPass,
      charset: 'utf8mb4'
    });

    await rootConn.execute(`DROP DATABASE IF EXISTS \`${testDbName}\``);
    await rootConn.end();
    console.log('[globalTeardown] Test database dropped.');
  } catch (e) {
    console.log('[globalTeardown] Database cleanup error (non-fatal):', e.message);
  }

  // 3. Clean up temp file
  try {
    fs.unlinkSync(configFile);
  } catch (e) {
    // ignore
  }
};
