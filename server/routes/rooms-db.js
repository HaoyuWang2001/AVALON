// 房间管理API路由（数据库版本）
const express = require('express');
const { RoomModel } = require('../models');

function createRouter() {
  const router = express.Router();
  
  // 创建房间
  router.post('/create', async (req, res) => {
    try {
      const { hostOpenId, hostNickName, hostAvatarUrl } = req.body;
      
      if (!hostOpenId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房主信息' 
        });
      }
      
      const room = await RoomModel.create(
        hostOpenId, 
        hostNickName || '房主', 
        hostAvatarUrl || ''
      );
      
      res.json({
        success: true,
        roomId: room._id,
        room
      });
    } catch (error) {
      console.error('创建房间API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '创建房间失败' 
      });
    }
  });
  
  // 获取房间信息
  router.get('/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const room = await RoomModel.getById(roomId);
      
      if (!room) {
        return res.status(404).json({ 
          success: false, 
          message: '房间不存在' 
        });
      }
      
      res.json({ success: true, room });
    } catch (error) {
      console.error('获取房间信息API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取房间信息失败' 
      });
    }
  });
  
  // 加入房间
  router.post('/join', async (req, res) => {
    try {
      const { roomId, userInfo, seatNumber, customNickName } = req.body;
      
      if (!roomId || !userInfo || !seatNumber) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      if (seatNumber < 1 || seatNumber > 12) {
        return res.status(400).json({ 
          success: false, 
          message: '座位号无效，请选择1-12号' 
        });
      }
      
      const room = await RoomModel.join(
        roomId, 
        userInfo, 
        seatNumber, 
        customNickName || ''
      );
      
      res.json({
        success: true,
        message: '加入房间成功',
        seatNumber,
        room
      });
    } catch (error) {
      console.error('加入房间API错误:', error);
      
      // 根据错误类型返回不同的状态码
      if (error.message.includes('房间不存在')) {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('游戏已开始') || 
          error.message.includes('房间已满') || 
          error.message.includes('座位已被占用')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      if (error.message.includes('已在房间中')) {
        return res.json({ 
          success: true, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '加入房间失败' 
      });
    }
  });
  
  // 离开房间
  router.post('/leave', async (req, res) => {
    try {
      const { roomId, openId } = req.body;
      
      if (!roomId || !openId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      const room = await RoomModel.leave(roomId, openId);
      
      res.json({ 
        success: true, 
        room,
        message: room ? '离开房间成功' : '玩家不在房间中'
      });
    } catch (error) {
      console.error('离开房间API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '离开房间失败' 
      });
    }
  });
  
  // 切换准备状态
  router.post('/toggleReady', async (req, res) => {
    try {
      const { roomId, openId, isReady } = req.body;
      
      if (!roomId || !openId || typeof isReady !== 'boolean') {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      const room = await RoomModel.toggleReady(roomId, openId, isReady);
      
      res.json({ 
        success: true, 
        room,
        message: isReady ? '已准备' : '已取消准备'
      });
    } catch (error) {
      console.error('切换准备状态API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '切换准备状态失败' 
      });
    }
  });
  
  // 更新座位号
  router.post('/updateSeatNumber', async (req, res) => {
    try {
      const { roomId, openId, newSeatNumber } = req.body;
      
      if (!roomId || !openId || !newSeatNumber) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      if (newSeatNumber < 1 || newSeatNumber > 12) {
        return res.status(400).json({ 
          success: false, 
          message: '座位号无效，请选择1-12号' 
        });
      }
      
      const room = await RoomModel.updateSeatNumber(roomId, openId, newSeatNumber);
      
      res.json({ 
        success: true, 
        room,
        message: `已更换到${newSeatNumber}号座位`
      });
    } catch (error) {
      console.error('更新座位号API错误:', error);
      
      if (error.message.includes('座位已被占用')) {
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || '更新座位号失败' 
      });
    }
  });
  
  // 踢出玩家（房主操作）
  router.post('/kickPlayer', async (req, res) => {
    try {
      const { roomId, playerId } = req.body;
      
      if (!roomId || !playerId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      const room = await RoomModel.kickPlayer(roomId, playerId);
      
      res.json({ 
        success: true, 
        room,
        message: '已踢出玩家'
      });
    } catch (error) {
      console.error('踢出玩家API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '踢出玩家失败' 
      });
    }
  });
  
  // 获取活跃房间列表（管理接口）
  router.get('/', async (req, res) => {
    try {
      const { limit = 50 } = req.query;
      const rooms = await RoomModel.getActiveRooms(parseInt(limit));
      
      res.json({ 
        success: true, 
        rooms,
        count: rooms.length
      });
    } catch (error) {
      console.error('获取房间列表API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取房间列表失败' 
      });
    }
  });
  
  // 房间统计信息（管理接口）
  router.get('/stats/summary', async (req, res) => {
    try {
      const stats = await RoomModel.getStats();
      
      res.json({ 
        success: true, 
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取房间统计API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取房间统计失败' 
      });
    }
  });
  
  // 清理过期房间（管理接口）
  router.post('/cleanup', async (req, res) => {
    try {
      const { hours = 24 } = req.body;
      const cleanedCount = await RoomModel.cleanupOldRooms(parseInt(hours));
      
      res.json({ 
        success: true, 
        cleanedCount,
        message: `已清理${cleanedCount}个过期房间`
      });
    } catch (error) {
      console.error('清理房间API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '清理房间失败' 
      });
    }
  });
  
  return router;
}

module.exports = createRouter;