// 数据库配置模块
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

// 验证必需的环境变量
function validateEnvVars() {
  const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const errorMsg = `缺少必需的数据库环境变量: ${missingVars.join(', ')}。请检查.env文件配置。`;
    console.error('❌ 环境变量验证失败:', errorMsg);
    console.error('当前环境变量状态:');
    requiredVars.forEach(varName => {
      console.error(`  ${varName}: ${process.env[varName] ? '已设置' : '未设置'}`);
    });
    throw new Error(errorMsg);
  }
  
  // 验证端口是否为有效数字
  const port = parseInt(process.env.DB_PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    const errorMsg = `DB_PORT必须为有效端口号 (1-65535)，当前值: ${process.env.DB_PORT}`;
    console.error('❌ 环境变量验证失败:', errorMsg);
    throw new Error(errorMsg);
  }
}

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_MAX) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: '+08:00', // 中国时区
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  multipleStatements: false
};

// 创建连接池
let pool = null;

/**
 * 初始化数据库连接池
 * @returns {Promise<mysql.Pool>} 数据库连接池
 */
async function initPool() {
  try {
    if (!pool) {
      // 验证环境变量
      validateEnvVars();
      
      console.log('正在初始化数据库连接池...');
      pool = mysql.createPool(dbConfig);
      
      // 测试连接
      const connection = await pool.getConnection();
      console.log('数据库连接成功');
      connection.release();
    }
    return pool;
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    console.error('请检查数据库配置:', {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      hasPassword: !!dbConfig.password
    });
    throw error;
  }
}

/**
 * 获取数据库连接池
 * @returns {mysql.Pool} 数据库连接池
 */
function getPool() {
  if (!pool) {
    throw new Error('数据库连接池未初始化，请先调用initPool()');
  }
  return pool;
}

/**
 * 执行SQL查询
 * @param {string} sql SQL语句
 * @param {Array} params 参数数组
 * @returns {Promise<Array>} 查询结果
 */
async function query(sql, params = []) {
  const pool = getPool();
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('SQL执行错误:', error.message);
    console.error('SQL:', sql);
    console.error('参数:', params);
    throw error;
  }
}

/**
 * 执行事务
 * @param {Function} callback 事务回调函数，接收connection参数
 * @returns {Promise<any>} 事务结果
 */
async function transaction(callback) {
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    console.error('事务执行失败:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 获取数据库连接（用于需要手动管理连接的场景）
 * @returns {Promise<mysql.PoolConnection>} 数据库连接
 */
async function getConnection() {
  const pool = getPool();
  return await pool.getConnection();
}

/**
 * 关闭数据库连接池
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('数据库连接池已关闭');
  }
}

/**
 * 检查数据库连接状态
 * @returns {Promise<boolean>} 连接是否正常
 */
async function checkConnection() {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    const [result] = await connection.execute('SELECT 1 AS connected');
    connection.release();
    return result[0].connected === 1;
  } catch (error) {
    console.error('数据库连接检查失败:', error.message);
    return false;
  }
}

/**
 * 获取数据库统计信息
 * @returns {Promise<Object>} 数据库统计信息
 */
async function getStats() {
  try {
    const stats = {
      connections: {
        active: pool ? pool._allConnections.length : 0,
        idle: pool ? pool._freeConnections.length : 0,
        total: pool ? pool._allConnections.length + pool._freeConnections.length : 0
      },
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        connectionLimit: dbConfig.connectionLimit
      },
      tables: {}
    };

    // 获取各表记录数
    const tables = ['rooms', 'players', 'games', 'game_players', 'votes', 'mission_results', 'messages'];
    for (const table of tables) {
      try {
        const [result] = await query(`SELECT COUNT(*) as count FROM ${table}`);
        stats.tables[table] = result[0].count;
      } catch (error) {
        stats.tables[table] = '表不存在';
      }
    }

    return stats;
  } catch (error) {
    console.error('获取数据库统计失败:', error.message);
    return { error: error.message };
  }
}

// 导出模块
module.exports = {
  dbConfig,
  initPool,
  getPool,
  query,
  transaction,
  getConnection,
  closePool,
  checkConnection,
  getStats
};