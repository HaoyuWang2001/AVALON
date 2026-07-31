// Global setup — creates test database, starts test server.
// Uses root credentials to create/drop the test database.
// Communicates the port via a temp file.

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

module.exports = async function globalSetup() {
  const tmpDir = path.resolve(__dirname, '../../node_modules/.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';

  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = process.env.DB_PORT || '3306';
  const rootUser = process.env.DB_ROOT_USER || 'root';
  const rootPass = process.env.DB_ROOT_PASS || 'avalon_root_2024';
  const testDbName = process.env.DB_NAME || 'avalon_db_test';
  const testUser = process.env.DB_USER || 'avalon_test_user';
  const testPass = process.env.DB_PASS || 'avalon_test_pass_2024';

  // 1. Connect as root and create test database
  console.log(`\n[globalSetup] Creating test database '${testDbName}'...`);
  const rootConn = await mysql.createConnection({
    host: dbHost,
    port: parseInt(dbPort),
    user: rootUser,
    password: rootPass,
    charset: 'utf8mb4'
  });

  await rootConn.execute(`DROP DATABASE IF EXISTS \`${testDbName}\``);
  await rootConn.execute(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await rootConn.execute(`GRANT ALL PRIVILEGES ON \`${testDbName}\`.* TO '${testUser}'@'%'`);
  await rootConn.execute('FLUSH PRIVILEGES');
  await rootConn.end();

  // 2. Connect as test user to run DDL
  console.log('[globalSetup] Running DDL...');
  const testConn = await mysql.createConnection({
    host: dbHost,
    port: parseInt(dbPort),
    user: testUser,
    password: testPass,
    database: testDbName,
    charset: 'utf8mb4',
    multipleStatements: true
  });

  // Read DDL.sql, skip DROP/CREATE DATABASE and USE lines
  const ddlPath = path.resolve(__dirname, '../../../mysql/DDL.sql');
  let ddl = fs.readFileSync(ddlPath, 'utf8');
  // Remove DROP/CREATE DATABASE lines and USE line
  ddl = ddl
    .replace(/DROP DATABASE IF EXISTS .+?;\s*/g, '')
    .replace(/CREATE DATABASE .+?;\s*/g, '')
    .replace(/USE\s+\S+;\s*/g, '');

  await testConn.query(ddl);
  await testConn.end();

  console.log('[globalSetup] DDL executed successfully.');

  // 3. Start the test server
  process.env.DB_NAME = testDbName;
  const serverDir = path.resolve(__dirname, '../..');
  const { server, dbInitialized } = require(serverDir);

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
    setTimeout(() => reject(new Error('Server startup timed out after 30s')), 30000);
  });

  const port = server.address().port;

  // Write port to temp file for test workers
  const configFile = path.join(tmpDir, 'test-server.json');
  fs.writeFileSync(configFile, JSON.stringify({ port, dbInitialized }));

  console.log(`\n[globalSetup] Test server started on port ${port} (DB: ${testDbName})\n`);
};
