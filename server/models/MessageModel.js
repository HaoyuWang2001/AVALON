// 消息数据模型
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class MessageModel {
  /**
   * 发送消息
   * @param {string} roomId 房间ID
   * @param {string} openId 发送者openId
   * @param {string} nickName 发送者昵称
   * @param {string} content 消息内容
   * @param {string} type 消息类型 ('text', 'system', 'action')
   * @returns {Promise<Object>} 发送的消息
   */
  static async send(roomId, openId, nickName, content, type = 'text') {
    try {
      const messageId = uuidv4();
      const now = new Date();
      
      await db.query(
        `INSERT INTO messages (id, room_id, open_id, nick_name, content, type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [messageId, roomId, openId, nickName, content, type, now]
      );
      
      return {
        _id: messageId,
        roomId,
        openId,
        nickName,
        content,
        type,
        createdAt: now
      };
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取房间消息
   * @param {string} roomId 房间ID
   * @param {number} limit 限制数量
   * @param {Date|null} beforeTime 在此之前的时间（用于分页）
   * @returns {Promise<Array>} 消息列表
   */
  static async getByRoom(roomId, limit = 50, beforeTime = null) {
    try {
      let query = `
        SELECT id as _id, room_id as roomId, open_id as openId, 
               nick_name as nickName, content, type, created_at as createdAt
        FROM messages 
        WHERE room_id = ?
      `;
      
      const params = [roomId];
      
      if (beforeTime) {
        query += ' AND created_at < ?';
        params.push(beforeTime);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      
      const [messages] = await db.query(query, params);
      
      // 反转顺序，使最早的消息在前
      return messages.reverse();
    } catch (error) {
      console.error('获取消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取最新消息
   * @param {string} roomId 房间ID
   * @param {number} limit 限制数量
   * @returns {Promise<Array>} 最新消息列表
   */
  static async getLatest(roomId, limit = 20) {
    try {
      const [messages] = await db.query(
        `SELECT id as _id, room_id as roomId, open_id as openId, 
                nick_name as nickName, content, type, created_at as createdAt
         FROM messages 
         WHERE room_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [roomId, limit]
      );
      
      return messages.reverse(); // 反转顺序，使最早的消息在前
    } catch (error) {
      console.error('获取最新消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 清理旧消息
   * @param {string} roomId 房间ID
   * @param {number} keepCount 保留的消息数量
   * @returns {Promise<number>} 删除的消息数量
   */
  static async cleanupOldMessages(roomId, keepCount = 200) {
    try {
      // 获取要删除的消息ID
      const [messagesToDelete] = await db.query(
        `SELECT id FROM messages 
         WHERE room_id = ?
         ORDER BY created_at DESC
         LIMIT 18446744073709551615 OFFSET ?`, -- 使用大数绕过LIMIT限制
        [roomId, keepCount]
      );
      
      if (messagesToDelete.length === 0) {
        return 0;
      }
      
      const messageIds = messagesToDelete.map(msg => msg.id);
      
      // 批量删除
      await db.query(
        `DELETE FROM messages WHERE id IN (?)`,
        [messageIds]
      );
      
      return messageIds.length;
    } catch (error) {
      console.error('清理旧消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取消息统计信息
   * @param {string} roomId 房间ID
   * @returns {Promise<Object>} 消息统计
   */
  static async getStats(roomId) {
    try {
      const [totalCount] = await db.query(
        'SELECT COUNT(*) as count FROM messages WHERE room_id = ?',
        [roomId]
      );
      
      const [todayCount] = await db.query(
        `SELECT COUNT(*) as count FROM messages 
         WHERE room_id = ? AND created_at >= CURDATE()`,
        [roomId]
      );
      
      const [byType] = await db.query(
        `SELECT type, COUNT(*) as count FROM messages 
         WHERE room_id = ? 
         GROUP BY type`,
        [roomId]
      );
      
      const [latestMessage] = await db.query(
        `SELECT created_at as latestTime FROM messages 
         WHERE room_id = ? 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [roomId]
      );
      
      return {
        totalCount: totalCount[0].count,
        todayCount: todayCount[0].count,
        byType: byType.reduce((acc, row) => {
          acc[row.type] = row.count;
          return acc;
        }, {}),
        latestTime: latestMessage.length > 0 ? latestMessage[0].latestTime : null
      };
    } catch (error) {
      console.error('获取消息统计失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取所有房间的消息统计
   * @returns {Promise<Object>} 全局消息统计
   */
  static async getGlobalStats() {
    try {
      const [totalMessages] = await db.query('SELECT COUNT(*) as count FROM messages');
      const [activeRooms] = await db.query(
        `SELECT COUNT(DISTINCT room_id) as count FROM messages 
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`
      );
      const [messagesByHour] = await db.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as hour,
                COUNT(*) as count
         FROM messages 
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         GROUP BY hour
         ORDER BY hour`
      );
      
      return {
        totalMessages: totalMessages[0].count,
        activeRooms: activeRooms[0].count,
        messagesByHour: messagesByHour
      };
    } catch (error) {
      console.error('获取全局消息统计失败:', error);
      throw error;
    }
  }
}

module.exports = MessageModel;