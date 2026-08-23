// 解析命令行参数获取.env文件路径
function parseEnvFilePath() {
  const args = process.argv.slice(2);
  let envFilePath = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' || args[i] === '-e') {
      if (i + 1 < args.length) {
        envFilePath = args[i + 1];
        break;
      }
    } else if (args[i].startsWith('--env=')) {
      envFilePath = args[i].substring(6);
      break;
    }
  }
  
  if (!envFilePath) {
    // 默认路径
    envFilePath = require('path').resolve(__dirname, '../.env');
    console.log(`ℹ️ 未指定.env文件路径，使用默认路径: ${envFilePath}`);
  } else {
    console.log(`ℹ️ 使用指定的.env文件路径: ${envFilePath}`);
  }
  
  return envFilePath;
}

// 加载环境变量
const envFilePath = parseEnvFilePath();
try {
  require('dotenv').config({ path: envFilePath });
} catch (e) {
  console.log(`ℹ️ 未找到.env文件 (${envFilePath})，使用系统环境变量`);
}

const express = require('express');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const fs = require('fs');

// 数据库配置
const db = require('./config/db');

const app = express();

const useHttps = process.env.HTTPS === 'true';
let server;

if (useHttps) {
  const certPath = process.env.SSL_CERT_PATH;
  const keyPath = process.env.SSL_KEY_PATH;
  if (!certPath || !keyPath) {
    console.error('❌ HTTPS=true 但 SSL_CERT_PATH 或 SSL_KEY_PATH 未设置，回退到 HTTP');
    server = http.createServer(app);
  } else if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error(`❌ SSL 证书文件不存在: ${certPath} 或 ${keyPath}，回退到 HTTP`);
    server = http.createServer(app);
  } else {
    const sslOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
    server = https.createServer(sslOptions, app);
    console.log('✅ HTTPS 模式已启用');
  }
} else {
  server = http.createServer(app);
}

const wss = new WebSocketServer({ server });

const socket = require('./config/socket');
socket.setWSS(wss);

// 发言计时器内存缓存（不进 DB）：roomId → { running, endAt, gameId }；
// 房主广播 endAt，各端本地倒计时；仅用于新加入者/观众 join 时恢复
const timerCache = new Map();

app.use(cors());
app.use(express.json());

// 活跃时间（last_seen_at）节流刷新：从 param/query/body 提取 openId，每 openId 60s 最多写一次
const lastSeenThrottle = new Map();
app.use('/api', (req, res, next) => {
  const openId = (req.params && req.params.openId) ||
    (req.query && req.query.openId) ||
    (req.body && req.body.openId) ||
    (req.body && req.body.hostOpenId) ||
    (req.body && req.body.userInfo && req.body.userInfo.openId);
  if (openId) {
    const now = Date.now();
    const last = lastSeenThrottle.get(openId) || 0;
    if (now - last > 60000) {
      lastSeenThrottle.set(openId, now);
      const UserModel = require('./models/UserModel');
      UserModel.touchLastSeen(openId);
    }
    if (lastSeenThrottle.size > 5000) lastSeenThrottle.clear();
  }
  next();
});

// 上传文件静态服务（头像等）：/uploads/* → 服务器存储目录
const { UPLOAD_DIR, AVATAR_DIR } = require('./config/uploads');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

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
    console.error('数据库模式必须可用，服务无法启动');
    process.exit(1);
  }
}

// 导入模型管理器
const { modelManager } = require('./models');

// 路由设置函数（仅数据库模式）
function setupRoutes() {
  console.log('📊 使用数据库路由');
  const roomRoutes = require('./routes/rooms-db')();
  const gameRoutes = require('./routes/games-db')();
  const userRoutes = require('./routes/users-db')();
  const authRoutes = require('./routes/auth-db')();
  const playerRoutes = require('./routes/players-db')();
  const friendRoutes = require('./routes/friends-db')();

  modelManager.setDbInitialized(true);

  app.use('/api/rooms', roomRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/friends', friendRoutes);
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

wss.on('connection', (ws) => {
  console.log('Client connected:', ws._socket ? ws._socket.remoteAddress : 'unknown');
  ws.roomId = null;
  ws.playerId = null;
  // 心跳保活标记：收到 pong 置 true；未响应则定时 terminate（清理半开连接）
  ws.isAlive = true;
  ws.missedPongs = 0;
  ws._pongLogged = false;
  ws.on('pong', () => {
    ws.isAlive = true;
    ws.missedPongs = 0;
    if (!ws._pongLogged) {
      console.log('[ws] pong ok', ws.playerId || 'unknown');
      ws._pongLogged = true;
    }
  });

  // 发送 JSON 帧 {type, ...}
  function send(msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  // 新观众/断线重连：拉取当前游戏状态推送（恢复 current/history/投票可见性）
  async function pushCurrentGameState(roomId, playerId) {
    try {
      const gameRows = await db.query(
        `SELECT id FROM games WHERE room_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [roomId]
      );
      if (gameRows.length === 0) return;
      const GameModel = require('./models/GameModel');
      const state = await GameModel.getState(gameRows[0].id, playerId);
      // 附加发言计时器状态（内存缓存，不进 DB；供新加入者/观众恢复倒计时）
      state.timer = timerCache.get(roomId) || { running: false, endAt: null };
      send({ type: 'gameState', roomId, gameId: gameRows[0].id, state });
    } catch (error) {
      console.error('推送游戏状态失败:', error);
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'joinRoom': {
        const { roomId, playerId } = msg;
        ws.roomId = roomId;
        ws.playerId = playerId;
        if (playerId) {
          const UserModel = require('./models/UserModel');
          UserModel.touchLastSeen(playerId);
        }
        socket.broadcastToRoom(roomId, { type: 'playerJoined', playerId });
        pushCurrentGameState(roomId, playerId);
        break;
      }
      case 'requestState': {
        const { roomId, playerId } = msg;
        pushCurrentGameState(roomId || ws.roomId, playerId || ws.playerId);
        break;
      }
      case 'leaveRoom': {
        const { roomId, playerId } = msg;
        socket.broadcastToRoom(roomId, { type: 'playerLeft', playerId });
        break;
      }
      case 'roomUpdate': {
        const { type, ...payload } = msg;
        socket.broadcastToRoom(msg.roomId, { ...payload, type: 'roomUpdated' });
        break;
      }
      case 'gameUpdate': {
        const { type, ...payload } = msg;
        socket.broadcastToRoom(msg.roomId, { ...payload, type: 'gameUpdated' });
        break;
      }
      case 'timerUpdate': {
        // 房主广播发言计时器状态（running/endAt/remaining），中转并缓存供新加入者恢复
        const { roomId, running, endAt, remaining } = msg;
        if (roomId) timerCache.set(roomId, { running, endAt, remaining, gameId: msg.gameId });
        socket.broadcastToRoom(roomId, { type: 'timerUpdate', running, endAt, remaining });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected:', ws.playerId || 'unknown');
  });

  ws.on('error', (err) => {
    console.error('WebSocket 错误:', err.message);
  });
});

const PORT = process.env.PORT || 8082;

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    dbInitialized = await initializeDatabase();
    
    // 设置路由
    setupRoutes();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log('================================');
      console.log('🚀 AVALON 游戏服务器启动成功');
      console.log(`📡 端口: ${PORT}`);
      console.log(`🌐 环境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 数据库: 已连接`);
      console.log('================================');
      console.log('健康检查: http://localhost:' + PORT + '/api/health');
      if (process.env.NODE_ENV !== 'production') {
        console.log('数据库状态: http://localhost:' + PORT + '/api/debug/db/stats');
      }
    });

    // 队伍投票票型展示阶段（teamVoteReveal）定时推进：每秒扫描超时游戏并广播
    setInterval(async () => {
      try {
        const GameModel = require('./models/GameModel');
        const advanced = await GameModel.maybeAdvanceTeamVoteReveal();
        for (const { gameId, roomId } of advanced) {
          socket.broadcastToRoom(roomId, { type: 'gameUpdated', roomId, gameId });
        }
      } catch (e) {
        console.error('teamVoteReveal 定时推进失败:', e.message);
      }
    }, 1000);

    // WebSocket 心跳保活：
    // 1) 应用层心跳：每 30s 广播 {type:'heartbeat'}，客户端 onMessage 会刷新其半开看门狗，
    //    避免"健康但安静"的对局被前端误判为断线（协议层 ping 不触发客户端 onMessage）。
    // 2) 协议层 ping/pong：连续 2 次未回 pong（≈90s）才 terminate，容忍单次丢失。
    //    healthy 计数用于确认微信端是否自动回 pong（clients vs healthy 对比）。
    setInterval(() => {
      const text = JSON.stringify({ type: 'heartbeat', ts: Date.now() });
      let healthy = 0;
      wss.clients.forEach((ws) => {
        if (ws.readyState === 1) {
          ws.send(text);
          if (ws.isAlive) healthy++;
        }
      });
      console.log(`[ws] clients=${wss.clients.size} healthy=${healthy}`);

      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          ws.missedPongs = (ws.missedPongs || 0) + 1;
          if (ws.missedPongs >= 2) {
            console.log('[ws] terminate', ws.playerId || 'unknown', '连续未pong');
            return ws.terminate();
          }
        } else {
          ws.missedPongs = 0;
        }
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
      });
    }, 30000);
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
  server,
  wss, 
  db,
  dbInitialized
};
