// 房间管理API路由（数据库版本）
const express = require('express');
const { RoomModel } = require('../models');
const db = require('../config/db');

function createRouter() {
  const router = express.Router();
  
  // 创建房间
  router.post('/create', async (req, res) => {
    try {
      const { hostOpenId, hostNickName, hostAvatarUrl, hostWxNickName, roomConfig } = req.body;
      
      if (!hostOpenId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房主信息' 
        });
      }

      if (!roomConfig) {
        return res.status(400).json({
          success: false,
          message: '缺少房间配置'
        });
      }

      const existing = await db.query(
        'SELECT current_room_id FROM users WHERE open_id = ?',
        [hostOpenId]
      );
      if (existing.length > 0 && existing[0].current_room_id) {
        return res.status(400).json({
          success: false,
          message: '你已在其他房间中，请先退出'
        });
      }
      
      const room = await RoomModel.create(
        hostOpenId, 
        hostNickName || '房主', 
        hostAvatarUrl || '',
        roomConfig,
        hostWxNickName || ''
      );
      
      res.json({
        success: true,
        roomId: room._id,
        room
      });
    } catch (error) {
      console.error('创建房间API错误:', error);

      if (error.message.includes('缺少') || error.message.includes('未知角色') || error.message.includes('必须是')) {
        return res.status(400).json({ success: false, message: error.message });
      }

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
      
      if (!roomId || !userInfo) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }

      const openId = userInfo.openId;

      const existing = await db.query(
        'SELECT current_room_id FROM users WHERE open_id = ?',
        [openId]
      );
      if (existing.length > 0 && existing[0].current_room_id && existing[0].current_room_id !== roomId) {
        return res.status(400).json({
          success: false,
          message: '你已在其他房间中，请先退出'
        });
      }

      const seat = (seatNumber == null) ? 0 : seatNumber;
      
      const room = await RoomModel.join(
        roomId, 
        userInfo, 
        seat, 
        customNickName || ''
      );
      
      res.json({
        success: true,
        message: '加入房间成功',
        seatNumber: seat,
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
      
      if (!roomId || !openId || newSeatNumber == null) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
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
      const { roomId, playerId, mode } = req.body;
      
      if (!roomId || !playerId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      const room = await RoomModel.kickPlayer(roomId, playerId, mode || 'room');
      
      res.json({ 
        success: true, 
        room,
        message: mode === 'unseat' ? '已踢到未入座区' : '已踢出房间'
      });
    } catch (error) {
      console.error('踢出玩家API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '踢出玩家失败' 
      });
    }
  });
  
  // 修改房间配置（房主操作，仅游戏未开始时可用）
  router.put('/:roomId/config', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { roomConfig } = req.body;

      if (!roomConfig) {
        return res.status(400).json({ success: false, message: '缺少房间配置' });
      }

      const room = await RoomModel.updateConfig(roomId, roomConfig);

      res.json({ success: true, room, message: '配置已更新' });
    } catch (error) {
      console.error('修改配置API错误:', error);

      if (error.message.includes('房间不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message.includes('游戏已开始') || error.message.includes('缺少') || error.message.includes('未知角色') || error.message.includes('必须是')) {
        return res.status(400).json({ success: false, message: error.message });
      }

      res.status(500).json({ success: false, message: error.message || '修改配置失败' });
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

  // 禁止/允许上座（房主操作）
  router.post('/:roomId/banSeat', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { playerId, banned } = req.body;
      const room = await RoomModel.banFromSeating(roomId, playerId, banned);
      res.json({ success: true, room, message: banned ? '已禁止上座' : '已允许上座' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 转让房主（房主操作）
  router.post('/:roomId/transferOwner', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { currentOwnerId, newOwnerId } = req.body;
      const room = await RoomModel.transferOwner(roomId, currentOwnerId, newOwnerId);
      res.json({ success: true, room, message: '房主已转让' });
    } catch (error) {
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 解散房间（房主操作）
  router.post('/:roomId/disband', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { openId } = req.body;
      const result = await RoomModel.disband(roomId, openId);
      res.json(result);
    } catch (error) {
      if (error.message.includes('仅房主')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message.includes('不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 随机座位（房主操作）
  router.post('/:roomId/randomSeats', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { openId } = req.body;
      const room = await RoomModel.getById(roomId);
      if (!room) return res.status(404).json({ success: false, message: '房间不存在' });
      if (room.ownerId !== openId) return res.status(403).json({ success: false, message: '仅房主可操作' });
      const result = await RoomModel.randomSeats(roomId);
      res.json({ success: true, room: result, message: '座位已随机打乱' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
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