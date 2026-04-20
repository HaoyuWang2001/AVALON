// 房间数据模型
const db = require('../config/db');

class RoomModel {
  /**
   * 创建房间
   * @param {string} hostOpenId 房主openId
   * @param {string} hostNickName 房主昵称
   * @param {string} hostAvatarUrl 房主头像URL
   * @returns {Promise<Object>} 创建的房间信息
   */
  static async create(hostOpenId, hostNickName = '房主', hostAvatarUrl = '') {
    // 生成6位房间号
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
      await db.transaction(async (connection) => {
        // 创建房间记录
        await connection.execute(
          `INSERT INTO rooms (id, host_open_id, game_started, created_at, updated_at) 
           VALUES (?, ?, FALSE, NOW(), NOW())`,
          [roomId, hostOpenId]
        );
        
        // 创建房主玩家记录
        await connection.execute(
          `INSERT INTO players (room_id, open_id, nick_name, avatar_url, seat_number, is_host, is_ready, created_at) 
           VALUES (?, ?, ?, ?, 1, TRUE, FALSE, NOW())`,
          [roomId, hostOpenId, hostNickName, hostAvatarUrl]
        );
      });
      
      // 返回完整的房间信息
      return await this.getById(roomId);
    } catch (error) {
      console.error('创建房间失败:', error);
      throw error;
    }
  }
  
  /**
   * 根据ID获取房间
   * @param {string} roomId 房间ID
   * @returns {Promise<Object|null>} 房间信息或null
   */
  static async getById(roomId) {
    try {
      // 获取房间基本信息
      const [rooms] = await db.query(
        `SELECT id as _id, host_open_id as hostOpenId, game_started as gameStarted, 
                created_at as createdAt, updated_at as updatedAt 
         FROM rooms WHERE id = ?`,
        [roomId]
      );
      
      if (rooms.length === 0) {
        return null;
      }
      
      const room = rooms[0];
      
      // 获取房间内的玩家
      const [players] = await db.query(
        `SELECT open_id as openId, nick_name as nickName, avatar_url as avatarUrl, 
                seat_number as seatNumber, is_host as isHost, is_ready as isReady
         FROM players WHERE room_id = ? ORDER BY seat_number`,
        [roomId]
      );
      
      // 获取准备玩家列表
      const [readyPlayersResult] = await db.query(
        `SELECT open_id FROM players WHERE room_id = ? AND is_ready = TRUE`,
        [roomId]
      );
      
      const readyPlayers = readyPlayersResult.map(row => row.open_id);
      
      // 组装完整房间对象
      return {
        ...room,
        players,
        readyPlayers,
        players: players.map(player => ({
          ...player,
          isHost: player.isHost === 1 || player.isHost === true
        }))
      };
    } catch (error) {
      console.error('获取房间信息失败:', error);
      throw error;
    }
  }
  
  /**
   * 加入房间
   * @param {string} roomId 房间ID
   * @param {Object} userInfo 用户信息
   * @param {string} userInfo.openId 用户openId
   * @param {string} userInfo.nickName 用户昵称
   * @param {string} userInfo.avatarUrl 用户头像URL
   * @param {number} seatNumber 座位号(1-12)
   * @param {string} customNickName 自定义昵称
   * @returns {Promise<Object>} 加入结果
   */
  static async join(roomId, userInfo, seatNumber, customNickName = '') {
    const openId = userInfo.openId;
    const nickName = customNickName || userInfo.nickName || '匿名玩家';
    
    try {
      await db.transaction(async (connection) => {
        // 检查房间是否存在且未开始游戏
        const [rooms] = await connection.execute(
          'SELECT game_started FROM rooms WHERE id = ? FOR UPDATE',
          [roomId]
        );
        
        if (rooms.length === 0) {
          throw new Error('房间不存在');
        }
        
        if (rooms[0].game_started) {
          throw new Error('游戏已开始');
        }
        
        // 检查房间是否已满
        const [playerCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM players WHERE room_id = ?',
          [roomId]
        );
        
        if (playerCount[0].count >= 12) {
          throw new Error('房间已满');
        }
        
        // 检查座位是否被占用
        const [occupiedSeats] = await connection.execute(
          'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND seat_number = ?',
          [roomId, seatNumber]
        );
        
        if (occupiedSeats[0].count > 0) {
          throw new Error(`${seatNumber}号座位已被占用`);
        }
        
        // 检查是否已加入房间
        const [alreadyJoined] = await connection.execute(
          'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND open_id = ?',
          [roomId, openId]
        );
        
        if (alreadyJoined[0].count > 0) {
          throw new Error('已在房间中');
        }
        
        // 添加玩家
        await connection.execute(
          `INSERT INTO players (room_id, open_id, nick_name, avatar_url, seat_number, is_host, is_ready, created_at) 
           VALUES (?, ?, ?, ?, ?, FALSE, FALSE, NOW())`,
          [roomId, openId, nickName, userInfo.avatarUrl || '', seatNumber]
        );
        
        // 更新房间更新时间
        await connection.execute(
          'UPDATE rooms SET updated_at = NOW() WHERE id = ?',
          [roomId]
        );
      });
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('加入房间失败:', error);
      throw error;
    }
  }
  
  /**
   * 离开房间
   * @param {string} roomId 房间ID
   * @param {string} openId 用户openId
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async leave(roomId, openId) {
    try {
      await db.transaction(async (connection) => {
        // 获取玩家信息
        const [players] = await connection.execute(
          'SELECT is_host FROM players WHERE room_id = ? AND open_id = ?',
          [roomId, openId]
        );
        
        if (players.length === 0) {
          return; // 玩家不在房间中
        }
        
        const isHost = players[0].is_host;
        
        // 删除玩家
        await connection.execute(
          'DELETE FROM players WHERE room_id = ? AND open_id = ?',
          [roomId, openId]
        );
        
        // 检查房间是否为空
        const [remainingPlayers] = await connection.execute(
          'SELECT COUNT(*) as count FROM players WHERE room_id = ?',
          [roomId]
        );
        
        if (remainingPlayers[0].count === 0) {
          // 删除空房间
          await connection.execute('DELETE FROM rooms WHERE id = ?', [roomId]);
        } else if (isHost) {
          // 房主离开，转让房主给第一个玩家
          const [nextHost] = await connection.execute(
            'SELECT open_id FROM players WHERE room_id = ? ORDER BY created_at LIMIT 1',
            [roomId]
          );
          
          if (nextHost.length > 0) {
            // 更新新房主
            await connection.execute(
              'UPDATE players SET is_host = TRUE WHERE room_id = ? AND open_id = ?',
              [roomId, nextHost[0].open_id]
            );
            
            // 更新房间房主信息
            await connection.execute(
              'UPDATE rooms SET host_open_id = ?, updated_at = NOW() WHERE id = ?',
              [nextHost[0].open_id, roomId]
            );
          }
        }
        
        // 更新房间更新时间
        await connection.execute(
          'UPDATE rooms SET updated_at = NOW() WHERE id = ?',
          [roomId]
        );
      });
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('离开房间失败:', error);
      throw error;
    }
  }
  
  /**
   * 切换准备状态
   * @param {string} roomId 房间ID
   * @param {string} openId 用户openId
   * @param {boolean} isReady 是否准备
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async toggleReady(roomId, openId, isReady) {
    try {
      await db.query(
        'UPDATE players SET is_ready = ? WHERE room_id = ? AND open_id = ?',
        [isReady, roomId, openId]
      );
      
      // 更新房间更新时间
      await db.query(
        'UPDATE rooms SET updated_at = NOW() WHERE id = ?',
        [roomId]
      );
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('切换准备状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 更新座位号
   * @param {string} roomId 房间ID
   * @param {string} openId 用户openId
   * @param {number} newSeatNumber 新座位号
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async updateSeatNumber(roomId, openId, newSeatNumber) {
    try {
      await db.transaction(async (connection) => {
        // 检查座位是否被占用
        const [occupiedSeats] = await connection.execute(
          'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND seat_number = ? AND open_id != ?',
          [roomId, newSeatNumber, openId]
        );
        
        if (occupiedSeats[0].count > 0) {
          throw new Error('座位已被占用');
        }
        
        // 更新座位号
        await connection.execute(
          'UPDATE players SET seat_number = ? WHERE room_id = ? AND open_id = ?',
          [newSeatNumber, roomId, openId]
        );
        
        // 更新房间更新时间
        await connection.execute(
          'UPDATE rooms SET updated_at = NOW() WHERE id = ?',
          [roomId]
        );
      });
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('更新座位号失败:', error);
      throw error;
    }
  }
  
  /**
   * 踢出玩家
   * @param {string} roomId 房间ID
   * @param {string} playerId 被踢玩家openId
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async kickPlayer(roomId, playerId) {
    try {
      await db.query(
        'DELETE FROM players WHERE room_id = ? AND open_id = ?',
        [roomId, playerId]
      );
      
      // 更新房间更新时间
      await db.query(
        'UPDATE rooms SET updated_at = NOW() WHERE id = ?',
        [roomId]
      );
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('踢出玩家失败:', error);
      throw error;
    }
  }
  
  /**
   * 设置游戏开始状态
   * @param {string} roomId 房间ID
   * @param {boolean} gameStarted 游戏是否开始
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async setGameStarted(roomId, gameStarted) {
    try {
      await db.query(
        'UPDATE rooms SET game_started = ?, updated_at = NOW() WHERE id = ?',
        [gameStarted, roomId]
      );
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('设置游戏开始状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 清理过期房间
   * @param {number} hours 小时数，超过此时间的未开始游戏的房间将被清理
   * @returns {Promise<number>} 清理的房间数量
   */
  static async cleanupOldRooms(hours = 24) {
    try {
      const [result] = await db.query(
        `DELETE FROM rooms 
         WHERE game_started = FALSE 
         AND updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [hours]
      );
      
      return result.affectedRows;
    } catch (error) {
      console.error('清理过期房间失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取活跃房间列表
   * @param {number} limit 限制数量
   * @returns {Promise<Array>} 房间列表
   */
  static async getActiveRooms(limit = 50) {
    try {
      const [rooms] = await db.query(
        `SELECT r.id as roomId, r.host_open_id as hostOpenId, r.game_started as gameStarted,
                r.created_at as createdAt, r.updated_at as updatedAt,
                COUNT(p.id) as playerCount,
                SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) as readyCount
         FROM rooms r
         LEFT JOIN players p ON r.id = p.room_id
         WHERE r.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
         GROUP BY r.id, r.host_open_id, r.game_started, r.created_at, r.updated_at
         ORDER BY r.updated_at DESC
         LIMIT ?`,
        [limit]
      );
      
      return rooms;
    } catch (error) {
      console.error('获取活跃房间列表失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取房间统计信息
   * @returns {Promise<Object>} 统计信息
   */
  static async getStats() {
    try {
      const [totalRooms] = await db.query('SELECT COUNT(*) as count FROM rooms');
      const [activeRooms] = await db.query(
        'SELECT COUNT(*) as count FROM rooms WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)'
      );
      const [totalPlayers] = await db.query('SELECT COUNT(*) as count FROM players');
      const [roomsByStatus] = await db.query(
        'SELECT game_started, COUNT(*) as count FROM rooms GROUP BY game_started'
      );
      
      return {
        totalRooms: totalRooms[0].count,
        activeRooms: activeRooms[0].count,
        totalPlayers: totalPlayers[0].count,
        roomsByStatus: roomsByStatus.reduce((acc, row) => {
          acc[row.game_started ? 'gameStarted' : 'waiting'] = row.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('获取房间统计失败:', error);
      throw error;
    }
  }
}

module.exports = RoomModel;