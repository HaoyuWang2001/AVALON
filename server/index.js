// 加载环境变量
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// 数据库配置
const db = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// 初始化数据库连接池
let dbInitialized = false;

async function initializeDatabase() {
  try {
    console.log('正在初始化数据库连接...');
    await db.initPool();
    console.log('数据库连接池初始化成功');
    
    // 检查数据库连接
    const isConnected = await db.checkConnection();
    if (!isConnected) {
      console.warn('⚠️ 数据库连接检查失败，但服务将继续启动');
      return false;
    } else {
      console.log('✅ 数据库连接正常');
      return true;
    }
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    console.log('⚠️ 服务将以内存模式启动（数据不会持久化）');
    return false;
  }
}

// 内存存储（兼容模式，用于WebSocket事件等）
const rooms = new Map();
const games = new Map();
const messages = new Map();

// 导入模型管理器
const { modelManager } = require('./models');

// 路由设置函数（在数据库初始化后调用）
function setupRoutes(dbInitialized) {
  let roomRoutes, gameRoutes, messageRoutes;
  
  if (dbInitialized) {
    console.log('📊 使用数据库路由');
    // 使用数据库路由
    roomRoutes = require('./routes/rooms-db')();
    gameRoutes = require('./routes/games-db')();
    messageRoutes = require('./routes/messages-db')();
    
    // 更新模型管理器状态
    modelManager.setDbInitialized(true);
  } else {
    console.log('💾 使用内存路由');
    // 使用内存路由
    roomRoutes = require('./routes/rooms')(rooms);
    gameRoutes = require('./routes/games')(rooms, games);
    messageRoutes = require('./routes/messages')(messages);
    
    modelManager.setDbInitialized(false);
  }
  
  // 注册路由
  app.use('/api/rooms', roomRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/messages', messageRoutes);
  
  return { roomRoutes, gameRoutes, messageRoutes };
}

// 健康检查端点（包含数据库状态）
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: Date.now(),
    server: 'avalon-server',
    version: '1.0.0',
    database: {
      connected: false,
      initialized: dbInitialized
    }
  };
  
  if (dbInitialized) {
    try {
      const isConnected = await db.checkConnection();
      health.database.connected = isConnected;
      
      if (isConnected) {
        const stats = await db.getStats();
        health.database.stats = stats;
      }
    } catch (error) {
      health.database.error = error.message;
    }
  }
  
  res.json(health);
});

// 简单的hello测试接口
app.get('/hello', (req, res) => {
  res.send('hello');
});

// 数据库管理端点（仅开发环境）
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/db/stats', async (req, res) => {
    try {
      if (!dbInitialized) {
        return res.status(503).json({ error: '数据库未初始化' });
      }
      
      const stats = await db.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/debug/db/tables', async (req, res) => {
    try {
      if (!dbInitialized) {
        return res.status(503).json({ error: '数据库未初始化' });
      }
      
      const tables = await db.query(`
        SELECT 
          TABLE_NAME,
          TABLE_ROWS,
          DATA_LENGTH,
          INDEX_LENGTH,
          CREATE_TIME,
          UPDATE_TIME
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
      `, [process.env.DB_NAME || 'avalon_db']);
      
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinRoom', (data) => {
    const { roomId, playerId } = data;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerId = playerId;
    io.to(roomId).emit('playerJoined', { playerId });
  });

  socket.on('leaveRoom', (data) => {
    const { roomId, playerId } = data;
    socket.leave(roomId);
    io.to(roomId).emit('playerLeft', { playerId });
  });

  socket.on('roomUpdate', (data) => {
    io.to(data.roomId).emit('roomUpdated', data);
  });

  socket.on('gameUpdate', (data) => {
    io.to(data.roomId).emit('gameUpdated', data);
  });

  socket.on('message', (data) => {
    io.to(data.roomId).emit('newMessage', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT;

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    dbInitialized = await initializeDatabase();
    
    // 设置路由（根据数据库初始化状态）
    setupRoutes(dbInitialized);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log('================================');
      console.log('🚀 AVALON 游戏服务器启动成功');
      console.log(`📡 端口: ${PORT}`);
      console.log(`🌐 环境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 数据库: ${dbInitialized ? '已连接' : '内存模式'}`);
      console.log('================================');
      console.log('健康检查: http://localhost:' + PORT + '/api/health');
      if (process.env.NODE_ENV !== 'production') {
        console.log('数据库状态: http://localhost:' + PORT + '/api/debug/db/stats');
      }
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  
  if (dbInitialized) {
    try {
      await db.closePool();
      console.log('数据库连接池已关闭');
    } catch (error) {
      console.error('关闭数据库连接池失败:', error.message);
    }
  }
  
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// 启动服务器
startServer();

module.exports = { 
  app, 
  io, 
  rooms, 
  games, 
  messages,
  db,
  dbInitialized
};
