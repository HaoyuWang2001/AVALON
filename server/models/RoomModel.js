// 房间数据模型
const db = require('../config/db');

const VALID_ROLES = [
  'merlin', 'percival', 'loyal',
  'mordred', 'morgana', 'assassin', 'minion', 'oberon',
  'lancelotBlue', 'lancelotRed'
];

const REQUIRED_RULES = [
  'evilKnowsEachOther', 'lancelotsKnowEachOther', 'lancelotSwapRound',
  'ladyOfTheLake', 'ladyOfTheLakeRound', 'maxFailedNominations',
  'oberonMustFailMission', 'redLancelotMustFailMission',
  'voteVisibility', 'missionFailDetail'
];

class RoomModel {
  /**
   * 校验房间配置结构
   * @param {Object} roomConfig 
   */
  static validateRoomConfig(roomConfig) {
    if (!roomConfig || typeof roomConfig !== 'object') {
      throw new Error('缺少房间配置');
    }

    if (!roomConfig.roles || !Array.isArray(roomConfig.roles.good) || !Array.isArray(roomConfig.roles.evil)) {
      throw new Error('缺少角色配置');
    }

    const allRoles = [...roomConfig.roles.good, ...roomConfig.roles.evil];
    if (allRoles.length === 0) {
      throw new Error('角色配置不能为空');
    }

    for (const role of allRoles) {
      if (!VALID_ROLES.includes(role)) {
        throw new Error(`未知角色: ${role}`);
      }
    }

    if (!roomConfig.rules || typeof roomConfig.rules !== 'object') {
      throw new Error('缺少规则配置');
    }

    for (const key of REQUIRED_RULES) {
      if (!(key in roomConfig.rules)) {
        throw new Error(`规则配置缺少字段: ${key}`);
      }
    }

    if (roomConfig.rules.voteVisibility && !['public', 'anonymous'].includes(roomConfig.rules.voteVisibility)) {
      throw new Error('voteVisibility 必须是 public 或 anonymous');
    }

    if (roomConfig.rules.missionFailDetail && !['count', 'binary'].includes(roomConfig.rules.missionFailDetail)) {
      throw new Error('missionFailDetail 必须是 count 或 binary');
    }

    return true;
  }

  /**
   * 创建房间
   * @param {string} hostOpenId 房主openId
   * @param {string} hostNickName 房主昵称
   * @param {string} hostAvatarUrl 房主头像URL
   * @param {Object} roomConfig 房间配置
   * @returns {Promise<Object>} 创建的房间信息
   */
  static async create(hostOpenId, hostNickName = '房主', hostAvatarUrl = '', roomConfig = null, hostWxNickName = '') {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
      if (roomConfig) this.validateRoomConfig(roomConfig);

      await db.transaction(async (connection) => {
        await connection.execute(
          'INSERT INTO rooms (id, owner_id, game_started, room_config, created_at, updated_at) VALUES (?, ?, FALSE, ?, NOW(), NOW())',
          [roomId, hostOpenId, roomConfig ? JSON.stringify(roomConfig) : null]
        );
        await connection.execute(
          'INSERT INTO players (room_id, open_id, nick_name, wx_nick_name, avatar_url, seat_number, is_ready, created_at) VALUES (?, ?, ?, ?, ?, 1, FALSE, NOW())',
          [roomId, hostOpenId, hostNickName, hostWxNickName, hostAvatarUrl]
        );
        await connection.execute(
          'INSERT INTO users (open_id, current_room_id, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE current_room_id = VALUES(current_room_id), updated_at = NOW()',
          [hostOpenId, roomId]
        );
      });
      
      return await this.getById(roomId);
    } catch (error) {
      console.error('创建房间失败:', error);
      throw error;
    }
  }

  /**
   * 更新房间配置
   * @param {string} roomId 房间ID
   * @param {Object} roomConfig 新配置
   */
  static async updateConfig(roomId, roomConfig) {
    try {
      const room = await this.getById(roomId);
      if (!room) {
        throw new Error('房间不存在');
      }
      if (room.gameStarted) {
        throw new Error('游戏已开始，无法修改配置');
      }

      this.validateRoomConfig(roomConfig);

      await db.query(
        'UPDATE rooms SET room_config = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(roomConfig), roomId]
      );

      return await this.getById(roomId);
    } catch (error) {
      console.error('更新房间配置失败:', error);
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
      const rooms = await db.query(
        `SELECT id as _id, owner_id as ownerId, game_started as gameStarted, 
                room_config as roomConfig,
                created_at as createdAt, updated_at as updatedAt 
         FROM rooms WHERE id = ?`,
        [roomId]
      );
      
      if (rooms.length === 0) {
        return null;
      }
      
      const room = rooms[0];
      if (room.roomConfig && typeof room.roomConfig === 'string') {
        room.roomConfig = JSON.parse(room.roomConfig);
      }

      let activeGameId = null;
      if (room.gameStarted) {
        const [games] = await db.query('SELECT id FROM games WHERE room_id = ? AND status = ? LIMIT 1', [roomId, 'active']);
        if (games.length > 0) activeGameId = games[0].id;
      }

      const players = await db.query(
        `SELECT open_id as openId, nick_name as nickName, wx_nick_name as wxNickName, avatar_url as avatarUrl, 
                seat_number as seatNumber, is_ready as isReady
         FROM players WHERE room_id = ? ORDER BY seat_number`,
        [roomId]
      );
      
      const readyPlayersResult = await db.query(
        'SELECT open_id FROM players WHERE room_id = ? AND is_ready = TRUE',
        [roomId]
      );
      
      const readyPlayers = readyPlayersResult.map(row => row.open_id);
      
      return {
        ...room,
        activeGameId,
        readyPlayers,
        players: players.map(player => ({
          ...player,
          isHost: player.openId === room.ownerId,
          isReady: player.isReady === 1 || player.isReady === true
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
   * @param {number} seatNumber 座位号(0=未入座, -1=观战, 1-n=入座)
   * @param {string} customNickName 自定义昵称
   * @returns {Promise<Object>} 加入结果
   */
  static async join(roomId, userInfo, seatNumber, customNickName = '') {
    const openId = userInfo.openId;
    const nickName = customNickName || userInfo.nickName || '匿名玩家';
    const wxNickName = userInfo.wxNickName || '';
    const seat = (seatNumber == null) ? 0 : seatNumber;
    
    try {
      await db.transaction(async (connection) => {
        const [rooms] = await connection.execute('SELECT game_started FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
        if (rooms.length === 0) throw new Error('房间不存在');
        if (rooms[0].game_started) throw new Error('游戏已开始');
        
        const [alreadyJoined] = await connection.execute('SELECT COUNT(*) as count FROM players WHERE room_id = ? AND open_id = ?', [roomId, openId]);
        if (alreadyJoined[0].count > 0) throw new Error('已在房间中');
        
        if (seat >= 1) {
          const [occupiedSeats] = await connection.execute('SELECT COUNT(*) as count FROM players WHERE room_id = ? AND seat_number = ?', [roomId, seat]);
          if (occupiedSeats[0].count > 0) throw new Error(`${seat}号座位已被占用`);
        }
        
        await connection.execute(
          'INSERT INTO players (room_id, open_id, nick_name, wx_nick_name, avatar_url, seat_number, is_ready, created_at) VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())',
          [roomId, openId, nickName, wxNickName, userInfo.avatarUrl || '', seat]
        );
        await connection.execute(
          'INSERT INTO users (open_id, current_room_id, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE current_room_id = VALUES(current_room_id), updated_at = NOW()',
          [openId, roomId]
        );
        await connection.execute('UPDATE rooms SET updated_at = NOW() WHERE id = ?', [roomId]);
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
        await connection.execute('DELETE FROM players WHERE room_id = ? AND open_id = ?', [roomId, openId]);
        await connection.execute('UPDATE users SET current_room_id = NULL WHERE open_id = ?', [openId]);
        
        const [remainingPlayers] = await connection.execute('SELECT COUNT(*) as count FROM players WHERE room_id = ?', [roomId]);
        if (remainingPlayers[0].count === 0) {
          await connection.execute('DELETE FROM rooms WHERE id = ?', [roomId]);
        } else {
          await connection.execute('UPDATE rooms SET updated_at = NOW() WHERE id = ?', [roomId]);
        }
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
        if (newSeatNumber >= 1) {
          const [occupiedSeats] = await connection.execute(
            'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND seat_number = ? AND open_id != ?',
            [roomId, newSeatNumber, openId]
          );
          if (occupiedSeats[0].count > 0) throw new Error('座位已被占用');
        }
        
        await connection.execute(
          'UPDATE players SET seat_number = ?, is_ready = FALSE WHERE room_id = ? AND open_id = ?',
          [newSeatNumber, roomId, openId]
        );
        
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
   * @param {string} mode 'room'=踢出房间, 'unseat'=踢到未入座区
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async kickPlayer(roomId, playerId, mode = 'room') {
    try {
      if (mode === 'unseat') {
        await db.query(
          'UPDATE players SET seat_number = 0, is_ready = FALSE WHERE room_id = ? AND open_id = ?',
          [roomId, playerId]
        );
      } else {
        await db.query('DELETE FROM players WHERE room_id = ? AND open_id = ?', [roomId, playerId]);
        await db.query('UPDATE users SET current_room_id = NULL WHERE open_id = ?', [playerId]);
      }
      
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

  static async disband(roomId, openId) {
    const room = await this.getById(roomId);
    if (!room) throw new Error('房间不存在');
    if (room.ownerId !== openId) throw new Error('仅房主可解散房间');
    await db.query('UPDATE users SET current_room_id = NULL WHERE current_room_id = ?', [roomId]);
    await db.query('DELETE FROM players WHERE room_id = ?', [roomId]);
    await db.query('DELETE FROM rooms WHERE id = ?', [roomId]);
    return { success: true, message: '房间已解散' };
  }

  static async randomSeats(roomId) {
    const room = await this.getById(roomId);
    if (!room) throw new Error('房间不存在');
    const seated = room.players.filter(p => p.seatNumber >= 1);
    if (seated.length === 0) throw new Error('没有入座玩家');
    const shuffled = [...seated].sort(() => Math.random() - 0.5);
    const seatNumbers = seated.map(p => p.seatNumber).sort((a, b) => a - b);
    for (let i = 0; i < shuffled.length; i++) {
      await db.query(
        'UPDATE players SET seat_number = ? WHERE room_id = ? AND open_id = ?',
        [seatNumbers[i], roomId, shuffled[i].openId]
      );
    }
    await db.query('UPDATE rooms SET updated_at = NOW() WHERE id = ?', [roomId]);
    return await this.getById(roomId);
  }
  
  /**
   * 清理过期房间
   * @param {number} hours 小时数，超过此时间的未开始游戏的房间将被清理
   * @returns {Promise<number>} 清理的房间数量
   */
  static async cleanupOldRooms(hours = 24) {
    try {
      const result = await db.query(
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
      const rooms = await db.query(
        `SELECT r.id as roomId, r.host_open_id as hostOpenId, r.game_started as gameStarted,
                r.created_at as createdAt, r.updated_at as updatedAt,
                COUNT(p.id) as playerCount,
                SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) as readyCount
         FROM rooms r
         LEFT JOIN players p ON r.id = p.room_id
         WHERE r.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
         GROUP BY r.id, r.host_open_id, r.game_started, r.created_at, r.updated_at
          ORDER BY r.updated_at DESC
          LIMIT ${parseInt(limit)}`,
        []
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
      const totalRooms = await db.query('SELECT COUNT(*) as count FROM rooms');
      const activeRooms = await db.query(
        'SELECT COUNT(*) as count FROM rooms WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)'
      );
      const totalPlayers = await db.query('SELECT COUNT(*) as count FROM players');
      const roomsByStatus = await db.query(
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