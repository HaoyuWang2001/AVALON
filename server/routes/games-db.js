// 游戏逻辑API路由（数据库版本）
const express = require('express');
const { GameModel, RoomModel } = require('../models');
const socket = require('../config/socket');

// mysql2 默认会把 JSON 列解析为 JS 对象，因此读取时需兼容 string 与 object
function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

function emitGame(roomId, gameId) {
  socket.emitToRoom(roomId, 'gameUpdated', { roomId, gameId });
}

function createRouter() {
  const router = express.Router();
  
  // 按用户查历史对局（个人战绩）——必须注册在 /:gameId 之前，避免被参数路由吞掉
  router.get('/history/user', async (req, res) => {
    try {
      const { openId } = req.query;
      const limit = parseInt(req.query.limit) || 10;

      if (!openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const db = require('../config/db');
      const history = await db.query(
        `SELECT g.id as gameId, g.room_id as roomId, g.game_result as gameResult,
                gp.role, gp.side,
                (SELECT COUNT(*) FROM game_players WHERE game_id = g.id) as playerCount,
                TIMESTAMPDIFF(SECOND, g.created_at, g.ended_at) as durationSeconds,
                g.created_at as createdAt
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id AND gp.open_id = ?
         WHERE g.status = 'ended'
         ORDER BY g.created_at DESC
         LIMIT ?`,
        [openId, limit]
      );

      const parsedHistory = history.map(record => ({
        ...record,
        gameResult: record.gameResult ? parseJson(record.gameResult) : null
      }));

      res.json({
        success: true,
        history: parsedHistory,
        count: parsedHistory.length
      });
    } catch (error) {
      console.error('获取用户历史对局API错误:', error);
      res.status(500).json({
        success: false,
        message: error.message || '获取用户历史对局失败'
      });
    }
  });

  // 个人胜率统计——必须注册在 /:gameId 之前
  router.get('/stats', async (req, res) => {
    try {
      const { openId } = req.query;

      if (!openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const db = require('../config/db');
      const rows = await db.query(
        `SELECT gp.role, gp.side,
                CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(g.game_result, '$.winner')) = gp.side THEN 1 ELSE 0 END as isWin
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id AND gp.open_id = ?
         WHERE g.status = 'ended'`,
        [openId]
      );

      const stats = {
        totalGames: rows.length,
        totalWins: 0,
        goodGames: 0,
        goodWins: 0,
        evilGames: 0,
        evilWins: 0,
        roles: {}
      };
      const roleMap = {};
      for (const row of rows) {
        const isWin = row.isWin === 1 || row.isWin === true;
        if (isWin) stats.totalWins++;
        if (row.side === 'good') { stats.goodGames++; if (isWin) stats.goodWins++; }
        if (row.side === 'evil') { stats.evilGames++; if (isWin) stats.evilWins++; }
        if (!roleMap[row.role]) roleMap[row.role] = { role: row.role, games: 0, wins: 0 };
        roleMap[row.role].games++;
        if (isWin) roleMap[row.role].wins++;
      }
      stats.totalWinRate = stats.totalGames > 0 ? Math.round(stats.totalWins / stats.totalGames * 1000) / 10 : 0;
      stats.goodWinRate = stats.goodGames > 0 ? Math.round(stats.goodWins / stats.goodGames * 1000) / 10 : 0;
      stats.evilWinRate = stats.evilGames > 0 ? Math.round(stats.evilWins / stats.evilGames * 1000) / 10 : 0;
      stats.roles = Object.values(roleMap).map(r => ({
        ...r,
        winRate: r.games > 0 ? Math.round(r.wins / r.games * 1000) / 10 : 0
      }));

      res.json({ success: true, stats });
    } catch (error) {
      console.error('获取个人胜率API错误:', error);
      res.status(500).json({
        success: false,
        message: error.message || '获取个人胜率失败'
      });
    }
  });
  
  // 开始游戏（仅房主）
  router.post('/start', async (req, res) => {
    try {
      const { roomId, openId } = req.body;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      if (!openId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }

      const room = await RoomModel.getById(roomId);
      if (!room) {
        return res.status(404).json({ success: false, message: '房间不存在' });
      }
      if (room.ownerId !== openId) {
        return res.status(403).json({ success: false, message: '仅房主可开始游戏' });
      }
      
      const game = await GameModel.start(roomId);
      
      // GameModel.start() now returns { gameId, ... }; fallback for old style
      const gameId = game.gameId || game.roomId;
      
      emitGame(roomId, gameId);

      res.json({
        success: true,
        gameId,
        game
      });
    } catch (error) {
      console.error('开始游戏API错误:', error);
      
      // 根据错误类型返回不同的状态码
      if (error.message.includes('房间不存在') || 
          error.message.includes('游戏已开始')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('至少需要') || 
          error.message.includes('还有玩家未准备')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '开始游戏失败' 
      });
    }
  });
  
  // 获取游戏状态
  router.get('/:gameId', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { openId } = req.query;
      
      if (!gameId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少游戏ID' 
        });
      }
      
      const result = await GameModel.getState(gameId, openId);
      
      res.json(result);
    } catch (error) {
      console.error('获取游戏状态API错误:', error);
      
      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取游戏状态失败' 
      });
    }
  });
  
  // 提交提名队伍
  router.post('/submitNomination', async (req, res) => {
    try {
      const { gameId, openId, nominatedTeam, forcedCar } = req.body;
      
      if (!gameId || !openId || !nominatedTeam || !Array.isArray(nominatedTeam)) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      const result = await GameModel.submitNomination(gameId, openId, nominatedTeam, forcedCar === true);
      
      emitGame(req.body.roomId || null, req.body.gameId);

      res.json(result);
    } catch (error) {
      console.error('提交提名API错误:', error);
      
      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('当前不是发车阶段') ||
          error.message.includes('只有队长才能提名') ||
          error.message.includes('需要') ||
          error.message.includes('强制车')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '提交提名失败' 
      });
    }
  });
  
  // 队伍投票
  router.post('/castVote', async (req, res) => {
    try {
      const { gameId, openId, vote } = req.body;
      
      if (!gameId || !openId || !vote) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      if (vote !== 'approve' && vote !== 'reject') {
        return res.status(400).json({ 
          success: false, 
          message: '投票值无效，必须是 approve 或 reject' 
        });
      }
      
      const result = await GameModel.castVote(gameId, openId, vote);
      
      emitGame(req.body.roomId || null, req.body.gameId);

      res.json(result);
    } catch (error) {
      console.error('队伍投票API错误:', error);
      
      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('当前不是投票阶段') ||
          error.message.includes('已投票')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '投票失败' 
      });
    }
  });
  
  // 任务投票
  router.post('/castMissionVote', async (req, res) => {
    try {
      const { gameId, openId, vote, playerRole } = req.body;
      
      if (!gameId || !openId || !vote || !playerRole) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      if (vote !== 'success' && vote !== 'fail') {
        return res.status(400).json({ 
          success: false, 
          message: '投票值无效，必须是 success 或 fail' 
        });
      }
      
      const result = await GameModel.castMissionVote(gameId, openId, vote, playerRole);
      
      emitGame(req.body.roomId || null, req.body.gameId);

      res.json(result);
    } catch (error) {
      console.error('任务投票API错误:', error);
      
      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('当前不是任务投票阶段') ||
          error.message.includes('只有坏人才能破坏任务') ||
          error.message.includes('只有任务队成员才能投票') ||
          error.message.includes('已投票')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '任务投票失败' 
      });
    }
  });
  
  // 推进游戏阶段
  // 确认角色揭示（全员确认后自动进入 preNominate）
  router.post('/:gameId/confirmReveal', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { openId } = req.body;

      if (!gameId || !openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const result = await GameModel.confirmReveal(gameId, openId);

      const db = require('../config/db');
      const [gameRecord] = await db.query('SELECT room_id FROM games WHERE id = ?', [gameId]);
      if (gameRecord && gameRecord.room_id) {
        emitGame(gameRecord.room_id, gameId);
      }

      res.json(result);
    } catch (error) {
      console.error('确认角色揭示API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('当前不是角色揭示阶段') ||
          error.message.includes('你不在本局游戏中')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '确认角色揭示失败' });
    }
  });

  // 车主提交预选车型（preNominate → speakingOrder）
  router.post('/preNominate', async (req, res) => {
    try {
      const { gameId, openId, preNominatedTeam } = req.body;

      if (!gameId || !openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const result = await GameModel.submitPreNomination(gameId, openId, preNominatedTeam);

      emitGame(req.body.roomId || null, req.body.gameId);

      res.json(result);
    } catch (error) {
      console.error('提交预选API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('当前不是车主预选车型阶段') ||
          error.message.includes('只有队长才能提交预选') ||
          error.message.includes('预提名队伍')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '提交预选失败' });
    }
  });

  // 车主确定发言顺序（speakingOrder → discussion）
  router.post('/speakingOrder', async (req, res) => {
    try {
      const { gameId, openId, speakingOrder } = req.body;

      if (!gameId || !openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }
      if (!['asc', 'desc'].includes(speakingOrder)) {
        return res.status(400).json({ success: false, message: 'speakingOrder 必须是 asc 或 desc' });
      }

      const result = await GameModel.setSpeakingOrder(gameId, openId, speakingOrder);

      emitGame(req.body.roomId || null, req.body.gameId);

      res.json(result);
    } catch (error) {
      console.error('设置发言顺序API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('当前不是车主确定发言顺序阶段') ||
          error.message.includes('只有队长才能设置发言顺序') ||
          error.message.includes('speakingOrder')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '设置发言顺序失败' });
    }
  });

  // 放弃游戏（仅房主，无胜负结果）
  router.post('/:gameId/abandon', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { openId } = req.body;

      if (!gameId || !openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const db = require('../config/db');
      const [gameRecord] = await db.query('SELECT room_id FROM games WHERE id = ?', [gameId]);
      if (gameRecord && gameRecord.room_id) {
        emitGame(gameRecord.room_id, gameId);
      }

      await GameModel.abandon(gameId, openId);

      res.json({ success: true, message: '游戏已放弃' });
    } catch (error) {
      console.error('放弃游戏API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('仅房主可放弃游戏') ||
          error.message.includes('游戏已结束')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '放弃游戏失败' });
    }
  });

  // 刺客刺杀梅林
  // 开始刺杀（进入刺杀阶段，任意阶段可由刺客/莫甘娜发起；幂等）
  router.post('/:gameId/startAssassination', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { killerOpenId } = req.body;

      if (!gameId || !killerOpenId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const result = await GameModel.startAssassination(gameId, killerOpenId);

      const db = require('../config/db');
      const [gameRecord] = await db.query('SELECT room_id FROM games WHERE id = ?', [gameId]);
      if (gameRecord && gameRecord.room_id) {
        emitGame(gameRecord.room_id, gameId);
      }

      res.json(result);
    } catch (error) {
      console.error('开始刺杀API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('游戏已结束') ||
          error.message.includes('本局无刺杀者角色') ||
          error.message.includes('只有刺杀者才能发起刺杀')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '开始刺杀失败' });
    }
  });

  router.post('/:gameId/assassinate', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { killerOpenId, targetOpenId } = req.body;

      if (!gameId || !killerOpenId || !targetOpenId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }

      const result = await GameModel.assassinate(gameId, killerOpenId, targetOpenId);

      res.json(result);
    } catch (error) {
      console.error('刺杀API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }

      if (error.message.includes('游戏已结束') ||
          error.message.includes('当前不是刺杀阶段') ||
          error.message.includes('本局无刺杀者角色') ||
          error.message.includes('只有刺杀者才能发起刺杀') ||
          error.message.includes('目标不在此游戏中')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: error.message || '刺杀失败' 
      });
    }
  });

  // 湖仙验人（lake → 下一阶段）
  router.post('/:gameId/lakeInspect', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { openId, targetOpenId } = req.body;

      if (!gameId || !openId || !targetOpenId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const result = await GameModel.lakeInspect(gameId, openId, targetOpenId);

      const db = require('../config/db');
      const [gameRecord] = await db.query('SELECT room_id FROM games WHERE id = ?', [gameId]);
      if (gameRecord && gameRecord.room_id) {
        emitGame(gameRecord.room_id, gameId);
      }

      res.json(result);
    } catch (error) {
      console.error('湖仙验人API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('当前不是湖仙验人阶段') ||
          error.message.includes('只有湖仙持有者才能验人') ||
          error.message.includes('不在本局') ||
          error.message.includes('不可重复查验')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '湖仙验人失败' });
    }
  });

  // 确认兰斯抽卡（lancelot → preNominate，全员确认后自动进入下一轮）
  router.post('/:gameId/confirmLancelot', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { openId } = req.body;

      if (!gameId || !openId) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }

      const result = await GameModel.confirmLancelot(gameId, openId);

      const db = require('../config/db');
      const [gameRecord] = await db.query('SELECT room_id FROM games WHERE id = ?', [gameId]);
      if (gameRecord && gameRecord.room_id) {
        emitGame(gameRecord.room_id, gameId);
      }

      res.json(result);
    } catch (error) {
      console.error('确认兰斯抽卡API错误:', error);

      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }

      if (error.message.includes('当前不是兰斯抽卡阶段') ||
          error.message.includes('你不在本局游戏中')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '确认兰斯抽卡失败' });
    }
  });

  // 结束游戏
  router.post('/end', async (req, res) => {
    try {
      const { gameId } = req.body;
      
      if (!gameId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少游戏ID' 
        });
      }
      
      const db = require('../config/db');
      const [gameRecord] = await db.query('SELECT room_id FROM games WHERE id = ?', [gameId]);
      if (gameRecord) {
        emitGame(gameRecord.room_id, gameId);
      }
      
      const success = await GameModel.end(gameId);
      
      res.json({ 
        success: true,
        message: '游戏已结束'
      });
    } catch (error) {
      console.error('结束游戏API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '结束游戏失败' 
      });
    }
  });
  
  // 获取游戏统计信息（管理接口）
  router.get('/stats/summary', async (req, res) => {
    try {
      const stats = await GameModel.getStats();
      
      res.json({ 
        success: true, 
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取游戏统计API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取游戏统计失败' 
      });
    }
  });
  
  // 获取游戏历史记录（管理接口）
  router.get('/history/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { limit = 10 } = req.query;

      const db = require('../config/db');
      const history = await db.query(
        `SELECT g.id, g.room_id as roomId, g.current_phase as currentPhase, g.game_result as gameResult,
                (SELECT COUNT(*) FROM game_players WHERE game_id = g.id) as playerCount,
                g.created_at as createdAt, g.ended_at as endedAt,
                TIMESTAMPDIFF(SECOND, g.created_at, g.ended_at) as durationSeconds
         FROM games g
         WHERE g.room_id = ? AND g.status = 'ended'
         ORDER BY g.created_at DESC
         LIMIT ?`,
        [roomId, parseInt(limit)]
      );

      const parsedHistory = history.map(record => ({
        ...record,
        gameResult: record.gameResult ? parseJson(record.gameResult) : null
      }));

      res.json({ 
        success: true, 
        history: parsedHistory,
        count: parsedHistory.length
      });
    } catch (error) {
      console.error('获取游戏历史API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取游戏历史失败' 
      });
    }
  });
  
  // 获取最近游戏（管理接口）
  router.get('/recent/games', async (req, res) => {
    try {
      const { limit = 20 } = req.query;

      const db = require('../config/db');
      const recentGames = await db.query(
        `SELECT g.id, g.room_id as roomId, g.game_result as gameResult,
                (SELECT COUNT(*) FROM game_players WHERE game_id = g.id) as playerCount,
                TIMESTAMPDIFF(SECOND, g.created_at, g.ended_at) as durationSeconds,
                g.created_at as createdAt, g.ended_at as endedAt,
                r.owner_id as hostOpenId
         FROM games g
         LEFT JOIN rooms r ON g.room_id = r.id
         WHERE g.status = 'ended'
         ORDER BY g.created_at DESC
         LIMIT ?`,
        [parseInt(limit)]
      );

      const parsed = recentGames.map(g => ({
        ...g,
        gameResult: g.gameResult ? parseJson(g.gameResult) : null
      }));

      res.json({ 
        success: true, 
        games: parsed,
        count: parsed.length
      });
    } catch (error) {
      console.error('获取最近游戏API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取最近游戏失败' 
      });
    }
  });
  
  return router;
}

module.exports = createRouter;
