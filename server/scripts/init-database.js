#!/usr/bin/env node

/**
 * 数据库初始化脚本
 * 使用方法：npm run db:init [--env /path/to/.env]
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let envFilePath = null;
  let ifNotExists = false;
  let force = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' || args[i] === '-e') {
      if (i + 1 < args.length) {
        envFilePath = args[i + 1];
        i++;
      }
    } else if (args[i].startsWith('--env=')) {
      envFilePath = args[i].substring(6);
    } else if (args[i] === '--if-not-exists') {
      ifNotExists = true;
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    }
  }
  
  if (!envFilePath) {
    envFilePath = path.resolve(__dirname, '../.env');
    console.log(`ℹ️ 未指定.env文件路径，使用默认路径: ${envFilePath}`);
  } else {
    console.log(`ℹ️ 使用指定的.env文件路径: ${envFilePath}`);
  }
  
  return { envFilePath, ifNotExists, force };
}

// 解析命令行参数获取.env文件路径
function parseEnvFilePath() {
  return parseArgs().envFilePath;
}

// 导出解析结果供main使用
let cliArgs = null;
function getCliArgs() {
  if (!cliArgs) {
    cliArgs = parseArgs();
  }
  return cliArgs;
}

// 加载环境变量
const envFilePath = parseEnvFilePath();
require('dotenv').config({ path: envFilePath });

// 数据库配置（不使用连接池，因为要创建数据库）
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  multipleStatements: true  // 允许执行多条SQL语句
};

// DDL文件路径
const ddlFile = path.resolve(__dirname, '../../mysql/DDL.sql');

/**
 * 读取SQL文件
 * @param {string} filePath SQL文件路径
 * @returns {string} SQL内容
 */
function readSqlFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`读取SQL文件失败: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * 连接数据库
 * @returns {Promise<mysql.Connection>} 数据库连接
 */
async function connectToDatabase() {
  try {
    console.log('正在连接数据库...');
    console.log(`主机: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`用户: ${dbConfig.user}`);
    
    const connection = await mysql.createConnection(dbConfig);
    console.log('数据库连接成功');
    return connection;
  } catch (error) {
    console.error('数据库连接失败:');
    console.error('错误信息:', error.message);
    console.error('请检查:');
    console.error('1. MySQL服务是否运行');
    console.error('2. 数据库配置是否正确');
    console.error('3. 用户名和密码是否正确');
    process.exit(1);
  }
}

/**
 * 检查数据库是否存在
 * @param {mysql.Connection} connection 数据库连接
 * @param {string} databaseName 数据库名
 * @returns {Promise<boolean>} 是否存在
 */
async function databaseExists(connection, databaseName) {
  try {
    const [rows] = await connection.execute(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [databaseName]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('检查数据库存在性失败:', error.message);
    return false;
  }
}

/**
 * 备份现有数据库（如果存在）
 * @param {mysql.Connection} connection 数据库连接
 * @param {string} databaseName 数据库名
 * @param {string} backupSuffix 备份后缀
 */
async function backupDatabase(connection, databaseName, backupSuffix = '_backup') {
  const backupName = `${databaseName}${backupSuffix}_${Date.now()}`;
  
  try {
    console.log(`正在备份数据库 ${databaseName} 到 ${backupName}...`);
    
    // 创建备份数据库
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${backupName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    // 获取所有表
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    
    // 复制每张表
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      console.log(`  备份表: ${tableName}`);
      
      // 创建表结构
      const [createTableResult] = await connection.execute(
        `SHOW CREATE TABLE \`${databaseName}\`.\`${tableName}\``
      );
      const createTableSql = createTableResult[0]['Create Table'];
      
      // 在备份数据库中创建表
      await connection.execute(`USE \`${backupName}\``);
      await connection.execute(createTableSql);
      
      // 复制数据
      await connection.execute(
        `INSERT INTO \`${backupName}\`.\`${tableName}\` SELECT * FROM \`${databaseName}\`.\`${tableName}\``
      );
    }
    
    // 切换回原始数据库
    await connection.execute(`USE \`${databaseName}\``);
    
    console.log(`数据库备份完成: ${backupName}`);
    return backupName;
  } catch (error) {
    console.error(`数据库备份失败:`, error.message);
    console.log('继续执行初始化...');
    return null;
  }
}

/**
 * 执行SQL脚本
 * @param {mysql.Connection} connection 数据库连接
 * @param {string} sql SQL脚本
 */
async function executeSqlScript(connection, sql) {
  try {
    console.log('正在执行SQL脚本...');
    
    // 分割SQL语句（以分号加换行分隔）
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // 跳过空语句和注释
      if (statement.trim() === ';' || statement.trim().startsWith('--')) {
        continue;
      }
      
      try {
        await connection.execute(statement);
        successCount++;
        
        // 显示进度
        if (i % 5 === 0 || i === statements.length - 1) {
          console.log(`  进度: ${i + 1}/${statements.length}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`  语句 ${i + 1} 执行失败:`, error.message);
        
        // 如果是CREATE OR REPLACE VIEW失败，可能是权限问题，继续执行
        if (statement.toUpperCase().includes('CREATE OR REPLACE VIEW')) {
          console.log('  视图创建失败，跳过...');
          continue;
        }
        
        // 如果是触发器创建失败，继续执行
        if (statement.toUpperCase().includes('CREATE TRIGGER')) {
          console.log('  触发器创建失败，跳过...');
          continue;
        }
        
        // 询问是否继续
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
          rl.question('是否继续执行? (y/n): ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() !== 'y') {
          console.log('初始化已中止');
          process.exit(1);
        }
      }
    }
    
    console.log(`SQL脚本执行完成: ${successCount} 成功, ${errorCount} 失败`);
    return { successCount, errorCount };
  } catch (error) {
    console.error('执行SQL脚本失败:', error.message);
    throw error;
  }
}

/**
 * 验证数据库初始化结果
 * @param {mysql.Connection} connection 数据库连接
 * @param {string} databaseName 数据库名
 */
async function validateInitialization(connection, databaseName) {
  try {
    console.log('\n验证数据库初始化结果...');
    
    // 检查必要的表是否存在
    const requiredTables = [
      'rooms', 'room_players', 'games', 'game_players', 
      'votes', 'mission_results', 'messages'
    ];
    
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    
    const existingTables = tables.map(t => t.TABLE_NAME.toLowerCase());
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length > 0) {
      console.error(`以下必要表创建失败: ${missingTables.join(', ')}`);
      return false;
    }
    
    console.log('✅ 所有必要表创建成功');
    
    // 检查角色配置数据
    const [roleConfigs] = await connection.execute('SELECT COUNT(*) as count FROM role_configurations');
    console.log(`✅ 角色配置数据: ${roleConfigs[0].count} 条记录`);
    
    // 检查视图
    const [views] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    console.log(`✅ 创建视图: ${views.length} 个`);
    
    return true;
  } catch (error) {
    console.error('验证失败:', error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = getCliArgs();
  
  console.log('=== AVALON 数据库初始化工具 ===');
  console.log('开始时间:', new Date().toLocaleString());
  if (args.ifNotExists) console.log('模式: --if-not-exists (数据存在时跳过)');
  if (args.force) console.log('模式: --force (强制重建)');
  console.log('================================\n');
  
  // 读取DDL文件
  console.log(`读取DDL文件: ${ddlFile}`);
  const sql = readSqlFile(ddlFile);
  console.log(`SQL文件大小: ${Math.round(sql.length / 1024)} KB`);
  
  // 连接数据库
  const connection = await connectToDatabase();
  
  try {
    const databaseName = process.env.DB_NAME || 'avalon_db';
    
    // 检查数据库是否存在
    const exists = await databaseExists(connection, databaseName);
    
    if (exists) {
      console.log(`数据库 ${databaseName} 已存在`);
      
      // 检查核心表是否已存在且有数据
      const tablesWithData = await checkTablesHaveData(connection, databaseName);
      
      if (tablesWithData && (args.ifNotExists || !args.force)) {
        console.log('✅ 检测到数据库已有完整表结构和数据，跳过初始化');
        console.log('   使用 --force 参数强制重建数据库');
        console.log('   使用 --if-not-exists 参数静默跳过（当前模式）');
        
        // 打印现有数据摘要
        await printDataSummary(connection, databaseName);
        
        await connection.end();
        console.log('\n数据库连接已关闭');
        return;
      }
      
      if (!args.force) {
        // 交互模式：询问是否备份和重建
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
          rl.question('是否备份现有数据库? (y/n): ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() === 'y') {
          await backupDatabase(connection, databaseName);
        }
        
        const rl2 = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer2 = await new Promise(resolve => {
          rl2.question(`是否删除并重建数据库 ${databaseName}? (y/n): `, resolve);
        });
        rl2.close();
        
        if (answer2.toLowerCase() === 'y') {
          console.log(`删除数据库 ${databaseName}...`);
          await connection.execute(`DROP DATABASE IF EXISTS \`${databaseName}\``);
          console.log(`创建数据库 ${databaseName}...`);
          await connection.execute(
            `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
          );
        } else {
          console.log(`使用现有数据库 ${databaseName}`);
        }
      } else {
        // --force 模式：直接删除重建
        console.log(`强制删除数据库 ${databaseName}...`);
        await connection.execute(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        console.log(`重建数据库 ${databaseName}...`);
        await connection.execute(
          `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
      }
    } else {
      console.log(`创建数据库 ${databaseName}...`);
      await connection.execute(
        `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    }
    
    // 使用数据库
    await connection.execute(`USE \`${databaseName}\``);
    console.log(`使用数据库: ${databaseName}`);
    
    // 执行SQL脚本
    const result = await executeSqlScript(connection, sql);
    
    // 验证初始化结果
    const valid = await validateInitialization(connection, databaseName);
    
    if (valid && result.errorCount === 0) {
      console.log('\n✅ 数据库初始化成功!');
      console.log('\n下一步:');
      console.log('1. 启动服务器: npm run dev');
      console.log('2. 检查数据库连接状态');
      console.log('3. 开始游戏测试');
    } else {
      console.log('\n⚠️  数据库初始化完成，但有警告');
      console.log('请检查以上错误信息');
    }
    
  } catch (error) {
    console.error('数据库初始化过程出错:', error.message);
    process.exit(1);
  } finally {
    // 关闭连接
    await connection.end();
    console.log('\n数据库连接已关闭');
  }
}

/**
 * 检查核心表是否已存在且包含数据
 * @param {mysql.Connection} connection 数据库连接
 * @param {string} databaseName 数据库名
 * @returns {Promise<boolean>} 表是否存在且有数据
 */
async function checkTablesHaveData(connection, databaseName) {
  try {
    const coreTables = ['rooms', 'room_players', 'games', 'game_players', 'votes', 'mission_results', 'messages', 'role_configurations'];
    
    for (const table of coreTables) {
      const [exists] = await connection.execute(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [databaseName, table]
      );
      
      if (exists.length === 0) {
        return false; // 核心表缺失
      }
      
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM \`${databaseName}\`.\`${table}\``
      );
      
      // 除了 role_configurations 外，其他表有数据说明不是空库
      if (table !== 'role_configurations' && rows[0].count > 0) {
        return true; // 表中有实际数据
      }
    }
    
    // 检查 role_configurations 是否有数据（初始化标志）
    const [configRows] = await connection.execute(
      `SELECT COUNT(*) as count FROM \`${databaseName}\`.role_configurations`
    );
    
    return configRows[0].count > 0;
  } catch (error) {
    console.error('检查表数据失败:', error.message);
    return false;
  }
}

/**
 * 打印现有数据摘要
 * @param {mysql.Connection} connection 数据库连接
 * @param {string} databaseName 数据库名
 */
async function printDataSummary(connection, databaseName) {
  try {
    const tables = ['rooms', 'room_players', 'games', 'game_players', 'votes', 'mission_results', 'messages', 'game_history'];
    console.log('\n📊 当前数据库表数据统计:');
    
    for (const table of tables) {
      try {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) as count FROM \`${databaseName}\`.\`${table}\``
        );
        console.log(`   ${table}: ${rows[0].count} 条记录`);
      } catch (e) {
        console.log(`   ${table}: 表不存在`);
      }
    }
  } catch (error) {
    // 静默处理
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('初始化失败:', error);
    process.exit(1);
  });
}

module.exports = { main };