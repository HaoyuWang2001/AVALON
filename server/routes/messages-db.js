// 消息API路由（数据库版本）
const express = require('express');
const { MessageModel } = require('../models');

function createRouter() {
  const router = express.Router();
  
  // 发送消息
  router.post('/send', async (req, res) => {
    try {
      const { roomId, openId, nickName, content, type = 'text' } = req.body;
      
      if (!roomId || !openId || !nickName || !content) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }
      
      if (content.length > 1000) {
        return res.status(400).json({ 
          success: false, 
          message: '消息内容过长' 
        });
      }
      
      const validTypes = ['text', 'system', 'action'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          success: false, 
          message: '消息类型无效' 
        });
      }
      
      const message = await MessageModel.send(
        roomId, 
        openId, 
        nickName, 
        content, 
        type
      );
      
      res.json({ 
        success: true, 
        message 
      });
    } catch (error) {
      console.error('发送消息API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '发送消息失败' 
      });
    }
  });
  
  // 获取房间消息
  router.get('/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { limit = 50, beforeTime } = req.query;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const messages = await MessageModel.getByRoom(
        roomId, 
        parseInt(limit), 
        beforeTime ? new Date(beforeTime) : null
      );
      
      res.json({ 
        success: true, 
        messages,
        count: messages.length
      });
    } catch (error) {
      console.error('获取消息API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取消息失败' 
      });
    }
  });
  
  // 获取最新消息
  router.get('/:roomId/latest', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { limit = 20 } = req.query;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const messages = await MessageModel.getLatest(roomId, parseInt(limit));
      
      res.json({ 
        success: true, 
        messages,
        count: messages.length
      });
    } catch (error) {
      console.error('获取最新消息API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取最新消息失败' 
      });
    }
  });
  
  // 获取消息统计（管理接口）
  router.get('/:roomId/stats', async (req, res) => {
    try {
      const { roomId } = req.params;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const stats = await MessageModel.getStats(roomId);
      
      res.json({ 
        success: true, 
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取消息统计API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取消息统计失败' 
      });
    }
  });
  
  // 清理旧消息（管理接口）
  router.post('/:roomId/cleanup', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { keepCount = 200 } = req.body;
      
      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少房间ID' 
        });
      }
      
      const cleanedCount = await MessageModel.cleanupOldMessages(
        roomId, 
        parseInt(keepCount)
      );
      
      res.json({ 
        success: true, 
        cleanedCount,
        message: `已清理${cleanedCount}条旧消息`
      });
    } catch (error) {
      console.error('清理消息API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '清理消息失败' 
      });
    }
  });
  
  // 获取全局消息统计（管理接口）
  router.get('/stats/global', async (req, res) => {
    try {
      const stats = await MessageModel.getGlobalStats();
      
      res.json({ 
        success: true, 
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取全局消息统计API错误:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || '获取全局消息统计失败' 
      });
    }
  });
  
  return router;
}

module.exports = createRouter;