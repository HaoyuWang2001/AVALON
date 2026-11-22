// 房间数据模型
const db = require('../config/db');

// users.titles JSON 列 → 字符串数组（空值 → []）
function parseTitles(v) {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  try {
    const arr = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];
  } catch (e) {
    return [];
  }
}

const VALID_ROLES = [
  'merlin', 'percival', 'loyal',
  'mordred', 'morgana', 'assassin', 'minion', 'oberon',
  'lancelotBlue', 'lancelotRed'
];

const REQUIRED_RULES = [
  'evilKnowsEachOther', 'lancelotsKnowEachOther', 'lancelotSwapRound',
  'ladyOfTheLake', 'ladyOfTheLakeRound', 'maxFailedNominations',
  'oberonMustFailMission', 'lancelotMustFail',
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

    // lancelotSwapRound 仅允许 1-4（0/5 拒绝）
    const swapRound = roomConfig.rules.lancelotSwapRound;
    if (typeof swapRound !== 'number' || !Number.isInteger(swapRound) || swapRound < 1 || swapRound > 4) {
      throw new Error('lancelotSwapRound 必须为 1-4 的整数');
    }

    if (roomConfig.spectator !== undefined && roomConfig.spectator !== null) {
      if (typeof roomConfig.spectator !== 'object') {
        throw new Error('spectator 必须是对象');
      }
      if (typeof roomConfig.spectator.allow !== 'boolean') {
        throw new Error('spectator.allow 必须是布尔值');
      }
      // 观战不设人数上限：兼容旧配置里的 max 字段但忽略
    }

    // 可选布尔配置（红兰可见性 / 梅林兰斯洛特阵营）
    for (const key of ['evilsKnowRedLancelot', 'oberonKnowsRedLancelot', 'merlinKnowsLancelotSide']) {
      if (key in roomConfig.rules && typeof roomConfig.rules[key] !== 'boolean') {
        throw new Error(`${key} 必须是布尔值`);
      }
    }

    // 兰斯洛特转换确定性控制（测试/观战用，可选）
    if ('lancelotSwapForce' in roomConfig.rules &&
        !['switch', 'keep'].includes(roomConfig.rules.lancelotSwapForce)) {
      throw new Error('lancelotSwapForce 必须是 switch 或 keep');
    }

    // 兰斯洛特抽卡卡组（可选）：转换卡 / 不转换卡，非负整数且至少一张，避免概率无效
    for (const key of ['lancelotSwitchCards', 'lancelotKeepCards']) {
      if (key in roomConfig.rules) {
        const v = roomConfig.rules[key];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          throw new Error(`${key} 必须是非负整数`);
        }
      }
    }
    const sc = roomConfig.rules.lancelotSwitchCards;
    const kc = roomConfig.rules.lancelotKeepCards;
    if (typeof sc === 'number' && typeof kc === 'number' && sc + kc < 1) {
      throw new Error('lancelotSwitchCards 与 lancelotKeepCards 之和至少为 1');
    }

    // 队伍投票票型展示时长（limits.voteRevealDuration）：必须存在，允许 {0,3,5,8,10}（0 供测试立即推进）
    const limits = roomConfig.limits || {};
    if (![0, 3, 5, 8, 10].includes(limits.voteRevealDuration)) {
      throw new Error('voteRevealDuration 必须为 0/3/5/8/10 秒');
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
          'INSERT INTO room_players (room_id, open_id, nick_name, wx_nick_name, avatar_url, seat_number, is_ready, created_at) VALUES (?, ?, ?, ?, ?, 1, FALSE, NOW())',
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

      const oldRoles = room.roomConfig?.roles || { good: [], evil: [] };
      const newRoles = roomConfig.roles || { good: [], evil: [] };
      const oldCount = (oldRoles.good?.length || 0) + (oldRoles.evil?.length || 0);
      const newCount = (newRoles.good?.length || 0) + (newRoles.evil?.length || 0);

      if (newCount < oldCount) {
        // 缩容：溢出玩家（座位 > 新人数）按座位号升序依次填入 1..newCount 的最小空位；
        // 空位不足的再退回等待区（seat 0）。被移动/退回者均取消准备。
        await db.transaction(async (connection) => {
          const [seatedRows] = await connection.execute(
            `SELECT open_id as openId, seat_number as seatNumber
             FROM room_players
             WHERE room_id = ? AND seat_number >= 1
             ORDER BY seat_number ASC`,
            [roomId]
          );
          const occupied = new Set();
          const overflow = [];
          for (const p of seatedRows) {
            if (p.seatNumber <= newCount) occupied.add(p.seatNumber);
            else overflow.push(p);
          }
          const empties = [];
          for (let s = 1; s <= newCount; s++) {
            if (!occupied.has(s)) empties.push(s);
          }
          for (const p of overflow) {
            if (empties.length > 0) {
              const seat = empties.shift();
              await connection.execute(
                'UPDATE room_players SET seat_number = ?, is_ready = FALSE WHERE room_id = ? AND open_id = ?',
                [seat, roomId, p.openId]
              );
            } else {
              await connection.execute(
                'UPDATE room_players SET seat_number = 0, is_ready = FALSE WHERE room_id = ? AND open_id = ?',
                [roomId, p.openId]
              );
            }
          }
        });
      }

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
        const games = await db.query('SELECT id FROM games WHERE room_id = ? AND status = ? LIMIT 1', [roomId, 'active']);
        if (games.length > 0) activeGameId = games[0].id;
      }

      const players = await db.query(
        `SELECT rp.open_id as openId, rp.nick_name as nickName, rp.wx_nick_name as wxNickName, rp.avatar_url as avatarUrl,
                rp.seat_number as seatNumber, rp.is_ready as isReady, rp.banned_from_seating as bannedFromSeating,
                u.titles
         FROM room_players rp
         LEFT JOIN users u ON u.open_id = rp.open_id
         WHERE rp.room_id = ? ORDER BY rp.seat_number`,
        [roomId]
      );
      
      const readyPlayersResult = await db.query(
        'SELECT open_id FROM room_players WHERE room_id = ? AND is_ready = TRUE',
        [roomId]
      );
      
      const readyPlayers = readyPlayersResult.map(row => row.open_id);
      
      return {
        ...room,
        activeGameId,
        readyPlayers,
        players: players.map(player => ({
          ...player,
          titles: parseTitles(player.titles),
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
   * 校验观战（seat=-1）是否允许：仅判断房间是否允许观战（不设人数上限）
   * @param {Object|null} roomConfig 房间配置
   */
  static _assertSpectatorAllowed(roomConfig) {
    const spectator = roomConfig && roomConfig.spectator;
    if (spectator && spectator.allow === false) {
      throw new Error('该房间不允许观战');
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
    const seat = (seatNumber == null) ? 0 : seatNumber;
    
    try {
      await db.transaction(async (connection) => {
        const [rooms] = await connection.execute('SELECT game_started, room_config, owner_id FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
        if (rooms.length === 0) throw new Error('房间不存在');
        const gameStarted = !!rooms[0].game_started;
        const roomOwnerId = rooms[0].owner_id;
        const isRoomOwner = openId === roomOwnerId;
        
        // 用户已存资料兜底：请求未携带头像/昵称时回查 users 表（头像上传后存于 users.avatar_url）
        // 仅接受 http(s) 头像链接，本机路径(/images、wxfile、USER_DATA_PATH)一律视为无头像
        const [userRows] = await connection.execute(
          'SELECT avatar_url, custom_nick_name, wx_nick_name FROM users WHERE open_id = ?',
          [openId]
        );
        const dbUser = userRows[0] || {};
        const httpUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
        const finalNickName = customNickName || userInfo.nickName || dbUser.custom_nick_name || dbUser.wx_nick_name || '匿名玩家';
        const finalWxNickName = userInfo.wxNickName || dbUser.wx_nick_name || '';
        const finalAvatarUrl = httpUrl(userInfo.avatarUrl) || httpUrl(dbUser.avatar_url) || '';
        
        // 游戏进行中：仅允许以观战者身份加入（自动落座 -1）
        let effectiveSeat = seat;
        if (gameStarted) {
          if (seat >= 1) throw new Error('游戏已开始');
          effectiveSeat = -1;
        }
        
        const [alreadyJoined] = await connection.execute('SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND open_id = ?', [roomId, openId]);
        if (alreadyJoined[0].count > 0) throw new Error('已在房间中');

        const roomConfig = rooms[0].room_config ? (typeof rooms[0].room_config === 'string' ? JSON.parse(rooms[0].room_config) : rooms[0].room_config) : null;
        
        if (effectiveSeat === -1 && !isRoomOwner) {
          // 房主总能进入观战区
          this._assertSpectatorAllowed(roomConfig);
        }
        
        if (effectiveSeat >= 1) {
          const [occupiedSeats] = await connection.execute('SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND seat_number = ?', [roomId, effectiveSeat]);
          if (occupiedSeats[0].count > 0) throw new Error(`${effectiveSeat}号座位已被占用`);
        }
        
        await connection.execute(
          'INSERT INTO room_players (room_id, open_id, nick_name, wx_nick_name, avatar_url, seat_number, is_ready, created_at) VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())',
          [roomId, openId, finalNickName, finalWxNickName, finalAvatarUrl, effectiveSeat]
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
   * 离开房间（仅非房主玩家可离开；房主禁止离开，房间任意时刻必须有房主）
   * @param {string} roomId 房间ID
   * @param {string} openId 用户openId
   * @returns {Promise<Object>} 更新后的房间信息
   */
  static async leave(roomId, openId) {
    try {
      await db.transaction(async (connection) => {
        const [roomRows] = await connection.execute(
          'SELECT owner_id, game_started FROM rooms WHERE id = ? FOR UPDATE',
          [roomId]
        );
        if (roomRows.length === 0) {
          throw new Error('房间不存在');
        }
        if (roomRows[0].owner_id === openId) {
          throw new Error('房主不能离开房间，请转让房主或解散房间');
        }
        // 游戏进行中：仅非入座玩家（等待区0/观战-1）可退出；入座玩家参与对局不可退出
        if (roomRows[0].game_started) {
          const [seatRows] = await connection.execute(
            'SELECT seat_number FROM room_players WHERE room_id = ? AND open_id = ?',
            [roomId, openId]
          );
          if (seatRows.length === 0) {
            throw new Error('你不在该房间中');
          }
          const seat = seatRows[0].seat_number;
          if (seat >= 1) {
            throw new Error('游戏进行中，无法退出房间');
          }
        }
        await connection.execute('DELETE FROM room_players WHERE room_id = ? AND open_id = ?', [roomId, openId]);
        await connection.execute('UPDATE users SET current_room_id = NULL WHERE open_id = ?', [openId]);
        await connection.execute('UPDATE rooms SET updated_at = NOW() WHERE id = ?', [roomId]);
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
        'UPDATE room_players SET is_ready = ? WHERE room_id = ? AND open_id = ?',
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
        const [rooms] = await connection.execute('SELECT room_config FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
        if (rooms.length === 0) throw new Error('房间不存在');
        const roomConfig = rooms[0].room_config ? (typeof rooms[0].room_config === 'string' ? JSON.parse(rooms[0].room_config) : rooms[0].room_config) : null;

        if (newSeatNumber === -1) {
          this._assertSpectatorAllowed(roomConfig);
        }

        if (newSeatNumber >= 1) {
          const [banCheck] = await connection.execute(
            'SELECT banned_from_seating FROM room_players WHERE room_id = ? AND open_id = ?',
            [roomId, openId]
          );
          if (banCheck.length > 0 && banCheck[0].banned_from_seating) {
            throw new Error('你已被禁止上座');
          }
          const [occupiedSeats] = await connection.execute(
            'SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND seat_number = ? AND open_id != ?',
            [roomId, newSeatNumber, openId]
          );
          if (occupiedSeats[0].count > 0) throw new Error('座位已被占用');
        }
        
        await connection.execute(
          'UPDATE room_players SET seat_number = ?, is_ready = FALSE WHERE room_id = ? AND open_id = ?',
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
          'UPDATE room_players SET seat_number = 0, is_ready = FALSE WHERE room_id = ? AND open_id = ?',
          [roomId, playerId]
        );
      } else {
        await db.query('DELETE FROM room_players WHERE room_id = ? AND open_id = ?', [roomId, playerId]);
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

  static async banFromSeating(roomId, playerId, banned) {
    try {
      await db.query(
        banned
          ? 'UPDATE room_players SET is_ready = FALSE, seat_number = IF(seat_number >= 1, 0, seat_number), banned_from_seating = ? WHERE room_id = ? AND open_id = ?'
          : 'UPDATE room_players SET banned_from_seating = ? WHERE room_id = ? AND open_id = ?',
        banned ? [banned, roomId, playerId] : [banned, roomId, playerId]
      );
      await db.query('UPDATE rooms SET updated_at = NOW() WHERE id = ?', [roomId]);
      return await this.getById(roomId);
    } catch (error) {
      console.error('禁止上座操作失败:', error);
      throw error;
    }
  }

  static async transferOwner(roomId, currentOwnerId, newOwnerId) {
    const room = await this.getById(roomId);
    if (!room) throw new Error('房间不存在');
    if (room.ownerId !== currentOwnerId) throw new Error('仅房主可转让');
    await db.query('UPDATE rooms SET owner_id = ?, updated_at = NOW() WHERE id = ? AND owner_id = ?', [newOwnerId, roomId, currentOwnerId]);
    return await this.getById(roomId);
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
    if (room.gameStarted) throw new Error('游戏进行中，无法解散房间');
    await db.query('UPDATE users SET current_room_id = NULL WHERE current_room_id = ?', [roomId]);
    await db.query('DELETE FROM room_players WHERE room_id = ?', [roomId]);
    await db.query('DELETE FROM rooms WHERE id = ?', [roomId]);
    return { success: true, message: '房间已解散' };
  }

  static async randomSeats(roomId) {
    const room = await this.getById(roomId);
    if (!room) throw new Error('房间不存在');
    const seated = room.players.filter(p => p.seatNumber >= 1);
    if (seated.length === 0) throw new Error('没有入座玩家');

    let playerCount = 0;
    if (room.roomConfig && room.roomConfig.roles) {
      playerCount = (room.roomConfig.roles.good || []).length + (room.roomConfig.roles.evil || []).length;
    }
    if (seated.length !== playerCount) throw new Error('上座区未坐满');

    const shuffled = [...seated];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const seatNumbers = seated.map(p => p.seatNumber).sort((a, b) => a - b);

    await db.transaction(async (connection) => {
      for (const p of seated) {
        await connection.execute(
          'UPDATE room_players SET seat_number = 0 WHERE room_id = ? AND open_id = ?',
          [roomId, p.openId]
        );
      }
      for (let i = 0; i < shuffled.length; i++) {
        await connection.execute(
          'UPDATE room_players SET seat_number = ? WHERE room_id = ? AND open_id = ?',
          [seatNumbers[i], roomId, shuffled[i].openId]
        );
      }
    });
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
        `SELECT r.id as roomId, r.owner_id as hostOpenId, r.game_started as gameStarted,
                r.created_at as createdAt, r.updated_at as updatedAt,
                COUNT(p.open_id) as playerCount,
                SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) as readyCount
         FROM rooms r
         LEFT JOIN room_players p ON r.id = p.room_id
         WHERE r.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
         GROUP BY r.id, r.owner_id, r.game_started, r.created_at, r.updated_at
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
   * 生成房间展示标签（仅村规差异项）
   */
  static buildRoomTags(roomConfig) {
    const cfg = roomConfig || {};
    const rules = cfg.rules || {};
    const roles = cfg.roles || {};
    const all = [...(roles.good || []), ...(roles.evil || [])];
    const tags = [];
    if (rules.ladyOfTheLake) tags.push('湖仙');
    if (rules.voteVisibility === 'anonymous') tags.push('匿名投票');
    if (typeof rules.maxFailedNominations === 'number' && rules.maxFailedNominations !== 3) {
      tags.push('强制开车·' + rules.maxFailedNominations + '轮');
    }
    if (rules.missionFailDetail === 'binary') tags.push('失败仅成败');
    if (all.includes('oberon')) tags.push('奥伯伦');
    const hasBlue = all.includes('lancelotBlue');
    const hasRed = all.includes('lancelotRed');
    if (hasBlue && hasRed) tags.push('双兰');
    else if (hasRed) tags.push('红兰');
    else if (hasBlue) tags.push('蓝兰');
    if (typeof rules.lancelotSwapRound === 'number' && rules.lancelotSwapRound !== 2) {
      tags.push('换身·第' + rules.lancelotSwapRound + '轮');
    }
    if (rules.lancelotMustFail) tags.push('兰斯必败');
    if (rules.oberonMustFailMission) tags.push('奥伯伦必败');
    if (rules.evilKnowsEachOther === false) tags.push('红方不互知');
    return tags;
  }

  /**
   * 主页公开房间列表（等待中 + 游戏中）：房间号、人数、村规标签、座上玩家头像
   */
  static async getPublicRoomList(limit = 50) {
    const rows = await db.query(
      `SELECT r.id as roomId, r.owner_id as ownerId, r.game_started as gameStarted,
              r.room_config as roomConfig, r.updated_at as updatedAt,
              p.open_id as openId, p.nick_name as nickName, p.avatar_url as avatarUrl, p.seat_number as seatNumber
       FROM rooms r
       LEFT JOIN room_players p ON p.room_id = r.id AND p.seat_number >= 1
       WHERE r.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AND r.id <> '000000'
       ORDER BY r.updated_at DESC
       LIMIT ${parseInt(limit, 10) || 50}`,
      []
    );
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.roomId)) {
        const cfg = typeof row.roomConfig === 'string' ? JSON.parse(row.roomConfig) : (row.roomConfig || {});
        const good = (cfg.roles && cfg.roles.good) || [];
        const evil = (cfg.roles && cfg.roles.evil) || [];
        map.set(row.roomId, {
          roomId: row.roomId,
          ownerId: row.ownerId,
          gameStarted: row.gameStarted === 1 || row.gameStarted === true,
          updatedAt: row.updatedAt,
          maxPlayers: good.length + evil.length,
          tags: this.buildRoomTags(cfg),
          players: []
        });
      }
      const room = map.get(row.roomId);
      if (row.openId) {
        room.players.push({
          openId: row.openId,
          nickName: row.nickName || '玩家',
          avatarUrl: row.avatarUrl || '',
          seatNumber: row.seatNumber
        });
      }
    }
    const list = Array.from(map.values()).map(r => ({
      ...r,
      players: r.players.sort((a, b) => a.seatNumber - b.seatNumber).slice(0, 12),
      playerCount: r.players.length
    }));
    const startedRoomIds = list.filter(r => r.gameStarted).map(r => r.roomId);
    if (startedRoomIds.length > 0) {
      const placeholders = startedRoomIds.map(() => '?').join(',');
      const gameRows = await db.query(
        `SELECT id, room_id FROM games WHERE status = 'active' AND room_id IN (${placeholders})`,
        startedRoomIds
      );
      const byRoom = new Map(gameRows.map(g => [g.room_id, g.id]));
      list.forEach(r => { if (r.gameStarted) r.activeGameId = byRoom.get(r.roomId) || null; });
    }
    return list;
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
      const totalPlayers = await db.query('SELECT COUNT(*) as count FROM room_players');
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