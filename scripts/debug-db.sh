#!/bin/bash
echo "=== 在 avalon-server 容器内测试 MySQL 连接 ==="
docker exec avalon-server sh -c "
echo '--- ping mysql host ---';
ping -c 1 mysql 2>&1 || echo 'no ping';
echo '';
echo '--- test MySQL with node ---';
node -e \"
const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'mysql',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'avalon_user',
      password: process.env.DB_PASS || 'avalon_pass_2024',
      database: process.env.DB_NAME || 'avalon_db'
    });
    const [rows] = await conn.execute('SELECT 1 AS test');
    console.log('SUCCESS:', JSON.stringify(rows));
    const [tables] = await conn.execute('SHOW TABLES');
    console.log('Tables:', tables.length);
    tables.forEach(t => console.log(' -', Object.values(t)[0]));
    await conn.end();
  } catch (e) {
    console.log('FAILED:', e.message);
  }
})();
\"
"

echo ""
echo "=== Environment vars in container ==="
docker exec avalon-server sh -c 'env | grep -E "DB_|MYSQL"'
