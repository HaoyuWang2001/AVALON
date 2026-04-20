// 游戏逻辑API路由（数据库版本）
const express = require('express');
const { GameModel, RoomModel } = require('../models');

function createRouter() {
  const router = express.Router();
  
  // 开始游戏
  router.post('/start', async (req, res) => {
    try {
      const { roomId } = req.body;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const game = await GameModel.start(roomId);
      
      res.json({
        success: true,
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
  router.get('/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { openId } = req.query;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const result = await GameModel.getState(roomId, openId);
      
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
      const { roomId, openId, nominatedTeam } = req.body;
      
      if (!roomId || !openId || !nominatedTeam || !Array.isArray(nominatedTeam)) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      const result = await GameModel.submitNomination(roomId, openId, nominatedTeam);
      
      res.json({ 
        success: true, 
        game: result.game 
      });
    } catch (error) {
      console.error('提交提名API错误:', error);
      
      if (error.message.includes('游戏不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('当前不是队伍选择阶段') ||
          error.message.includes('只有队长才能提名') ||
          error.message.includes('需要')) {
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
      const { roomId, openId, vote } = req.body;
      
      if (!roomId || !openId || !vote) {
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
      
      const result = await GameModel.castVote(roomId, openId, vote);
      
      res.json({ 
        success: true, 
        game: result.game 
      });
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
      const { roomId, openId, vote, playerRole } = req.body;
      
      if (!roomId || !openId || !vote || !playerRole) {
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
      
      const result = await GameModel.castMissionVote(roomId, openId, vote, playerRole);
      
      res.json({ 
        success: true, 
        game: result.game 
      });
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
  
  // 结束游戏
  router.post('/end', async (req, res) => {
    try {
      const { roomId } = req.body;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const success = await GameModel.end(roomId);
      
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
      const [history] = await db.query(
        `SELECT id, room_id as roomId, game_data as gameData, winner, player_count as playerCount,
                duration_seconds as durationSeconds, created_at as createdAt
         FROM game_history 
         WHERE room_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [roomId, parseInt(limit)]
      );
      
      // 解析JSON数据
      const parsedHistory = history.map(record => ({
        ...record,
        gameData: record.gameData ? JSON.parse(record.gameData) : null
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
      const [recentGames] = await db.query(
        `SELECT gh.id, gh.room_id as roomId, gh.winner, gh.player_count as playerCount,
                gh.duration_seconds as durationSeconds, gh.created_at as gameEndedAt,
                r.host_open_id as hostOpenId
         FROM game_history gh
         LEFT JOIN rooms r ON gh.room_id = r.id
         ORDER BY gh.created_at DESC
         LIMIT ?`,
        [parseInt(limit)]
      );
      
      res.json({ 
        success: true, 
        games: recentGames,
        count: recentGames.length
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