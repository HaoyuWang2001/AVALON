// 模型管理器
const RoomModel = require('./RoomModel');
const GameModel = require('./GameModel');
const MessageModel = require('./MessageModel');

// 数据库状态管理器
class ModelManager {
  constructor() {
    this.dbInitialized = false;
    this.models = {
      room: RoomModel,
      game: GameModel,
      message: MessageModel
    };
  }
  
  /**
   * 检查数据库是否已初始化
   * @returns {boolean}
   */
  isDbInitialized() {
    return this.dbInitialized;
  }
  
  /**
   * 设置数据库初始化状态
   * @param {boolean} initialized 
   */
  setDbInitialized(initialized) {
    this.dbInitialized = initialized;
  }
  
  /**
   * 获取模型
   * @param {string} modelName 模型名称 ('room', 'game', 'message')
   * @returns {Object} 模型类
   */
  getModel(modelName) {
    if (!this.models[modelName]) {
      throw new Error(`模型 ${modelName} 不存在`);
    }
    return this.models[modelName];
  }
  
  /**
   * 获取所有模型统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getAllStats() {
    try {
      const [roomStats, gameStats, messageStats] = await Promise.all([
        RoomModel.getStats(),
        GameModel.getStats(),
        MessageModel.getGlobalStats()
      ]);
      
      return {
        rooms: roomStats,
        games: gameStats,
        messages: messageStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('获取模型统计失败:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * 清理过期数据
   * @returns {Promise<Object>} 清理结果
   */
  async cleanup() {
    try {
      const [roomsCleaned, messagesCleaned] = await Promise.all([
        RoomModel.cleanupOldRooms(24), // 清理24小时未更新的房间
        // MessageModel.cleanupOldMessages() 可以根据需要实现
      ]);
      
      return {
        roomsCleaned,
        messagesCleaned: 0, // 暂时不清理消息
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('数据清理失败:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async healthCheck() {
    try {
      // 测试数据库连接
      const db = require('../config/db');
      const isConnected = await db.checkConnection();
      
      // 获取基本统计
      const [roomCountResult, gameCountResult] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM rooms'),
        db.query('SELECT COUNT(*) as count FROM games WHERE current_phase != "gameEnd"')
      ]);
      
      return {
        database: {
          connected: isConnected,
          rooms: roomCountResult[0].count,
          activeGames: gameCountResult[0].count
        },
        models: {
          room: 'ready',
          game: 'ready',
          message: 'ready'
        },
        timestamp: new Date().toISOString(),
        status: isConnected ? 'healthy' : 'degraded'
      };
    } catch (error) {
      console.error('健康检查失败:', error);
      return {
        database: {
          connected: false,
          error: error.message
        },
        models: {
          room: 'error',
          game: 'error',
          message: 'error'
        },
        timestamp: new Date().toISOString(),
        status: 'unhealthy'
      };
    }
  }
}

// 创建单例实例
const modelManager = new ModelManager();

module.exports = {
  RoomModel,
  GameModel,
  MessageModel,
  modelManager,
  ModelManager
};