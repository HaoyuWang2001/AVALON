#!/bin/bash
echo "=== Test pool.getConnection() + SELECT 1 inside container ==="
docker exec avalon-server sh -c "node -e \"
const mysql = require('mysql2/promise');
(async () => {
  // Mirror exact db.js initPool + checkConnection pattern
  const dbConfig = {
    host: 'mysql',
    port: 3306,
    user: 'avalon_user',
    password: 'avalon_pass_2024',
    database: 'avalon_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+08:00',
  };

  // Simulate initPool
  console.log('--- Simulating initPool ---');
  const pool = mysql.createPool(dbConfig);
  const conn1 = await pool.getConnection();
  console.log('got connection 1, threadId:', conn1.threadId);
  await conn1.execute('SELECT 1');
  console.log('SELECT 1 on conn1: OK');
  conn1.release();

  // Simulate checkConnection
  console.log('');
  console.log('--- Simulating checkConnection ---');
  const conn2 = await pool.getConnection();
  console.log('got connection 2, threadId:', conn2.threadId);
  const [rows] = await conn2.execute('SELECT 1 AS connected');
  console.log('SELECT 1 result:', JSON.stringify(rows));
  console.log('connected:', rows[0].connected === 1);
  conn2.release();
  
  // Get another connection to verify pool is healthy
  const conn3 = await pool.getConnection();
  console.log('got connection 3, threadId:', conn3.threadId);
  conn3.release();

  console.log('');
  console.log('ALL OK - pool works correctly');
  await pool.end();
})().catch(e => {
  console.log('ERROR:', e.message);
  console.log('Stack:', e.stack);
});
\"" 2>&1
