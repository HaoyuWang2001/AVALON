// 游戏数据模型
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

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

// 睁眼狼（互相睁眼互知身份的坏人）；lancelotRed 不属于睁眼狼
const EVIL_OPEN_EYES = ['morgana', 'assassin', 'minion', 'mordred'];
const OBERON = 'oberon';
const LANCELOT_RED = 'lancelotRed';
const LANCELOT_BLUE = 'lancelotBlue';

/**
 * 计算某玩家的视野（角色揭示阶段固化）。
 * @param {Object} requester 请求者 {openId, role, side}
 * @param {Array} players 全部玩家 [{openId, role, side, ...}]
 * @param {Object|null} roomConfig 房间配置
 * @returns {Array<{openId, role?, side?}>} seen 列表
 */
/**
 * 兰斯洛特身份转换抽卡：完成轮次 ∈ [lancelotSwapRound, 4] 时触发。
 * 默认卡组 2 张转换 / 5 张不转（Math.random < 2/7 视为抽中转换）。
 * 测试/确定性控制：rules.lancelotSwapForce = 'switch' | 'keep'（缺省走随机）。
 * 单兰翻转；双兰（初始异侧）同时互换。
 */
async function maybeLancelotSwap(connection, gameId, completedRound, rules) {
  const swapRound = rules.lancelotSwapRound;
  if (typeof swapRound !== 'number' || completedRound < swapRound || completedRound > 4) return;

  const [lancelots] = await connection.execute(
    `SELECT open_id, side FROM game_players WHERE game_id = ? AND role IN ('lancelotBlue','lancelotRed')`,
    [gameId]
  );
  if (lancelots.length === 0) return;

  let switched;
  if (rules.lancelotSwapForce === 'switch') switched = true;
  else if (rules.lancelotSwapForce === 'keep') switched = false;
  else switched = Math.random() < (2 / 7);
  if (!switched) return;

  for (const l of lancelots) {
    const newSide = l.side === 'good' ? 'evil' : 'good';
    await connection.execute(
      'UPDATE game_players SET side = ? WHERE game_id = ? AND open_id = ?',
      [newSide, gameId, l.open_id]
    );
  }
}

function buildVision(requester, players, roomConfig) {
  const rules = (roomConfig && roomConfig.rules) || {};
  const merlinVision = (roomConfig && roomConfig.merlinVision) || {};
  const canSee = (merlinVision.canSee && merlinVision.canSee.length) ? merlinVision.canSee : ['assassin', 'morgana', 'minion', 'oberon'];
  const canIdentify = merlinVision.canIdentify || [];

  const seen = [];
  const add = (p, mode) => {
    if (seen.some(s => s.openId === p.openId)) return;
    const entry = { openId: p.openId };
    if (mode === 'role') {
      entry.role = p.role;
      entry.side = p.side;
    } else if (mode === 'side') {
      entry.side = p.side;
    }
    seen.push(entry);
  };

  // 自己恒可见
  add(requester, 'role');
  const role = requester.role;

  if (EVIL_OPEN_EYES.includes(role)) {
    // 睁眼狼互知（evilKnowsEachOther）；oberon 互隐；lancelotRed 视 evilsKnowRedLancelot（默认 true）
    if (rules.evilKnowsEachOther) {
      for (const p of players) {
        if (p.openId === requester.openId) continue;
        if (EVIL_OPEN_EYES.includes(p.role)) {
          add(p, 'role');
        } else if (p.role === LANCELOT_RED && rules.evilsKnowRedLancelot !== false) {
          add(p, 'role');
        }
      }
    }
  } else if (role === OBERON) {
    // 奥伯伦闭眼：仅当配置允许时可见红兰（默认 true）
    if (rules.oberonKnowsRedLancelot !== false) {
      for (const p of players) {
        if (p.openId !== requester.openId && p.role === LANCELOT_RED) add(p, 'role');
      }
    }
  } else if (role === LANCELOT_RED || role === LANCELOT_BLUE) {
    // 兰斯洛特互知（初始角色，reveal 固化）
    if (rules.lancelotsKnowEachOther) {
      const otherRole = role === LANCELOT_RED ? LANCELOT_BLUE : LANCELOT_RED;
      const p = players.find(x => x.role === otherRole);
      if (p) add(p, 'role');
    }
  } else if (role === 'percival') {
    // 派西维尔：见梅林+莫甘娜，不区分谁是谁（不显示身份/阵营）
    for (const p of players) {
      if (p.role === 'merlin' || p.role === 'morgana') add(p, 'none');
    }
  } else if (role === 'merlin') {
    // 梅林：见 canSee 内的坏人角色（莫德雷德不在 canSee 默认），身份按 canIdentify
    for (const p of players) {
      if (p.openId === requester.openId) continue;
      if (p.role === LANCELOT_BLUE || p.role === LANCELOT_RED) continue;
      if (canSee.includes(p.role)) {
        add(p, canIdentify.includes(p.role) ? 'role' : 'side');
      }
    }
    // 兰斯洛特恒可见；merlinKnowsLancelotSide 控制是否分辨具体阵营（默认 true）
    const knowsLancelotSide = rules.merlinKnowsLancelotSide !== false;
    for (const p of players) {
      if (p.role === LANCELOT_BLUE || p.role === LANCELOT_RED) {
        add(p, knowsLancelotSide ? 'role' : 'none');
      }
    }
  }

  return seen;
}

class GameModel {
  /**
   * 开始游戏
   * @param {string} roomId 房间ID
   * @returns {Promise<Object>} 游戏信息
   */
  static async start(roomId) {
    try {
      let game = null;
      
      await db.transaction(async (connection) => {
        const gameId = uuidv4();
        
        // 1. 获取房间和玩家信息
        const [roomInfo] = await connection.execute(
          `SELECT r.owner_id, r.room_config, COUNT(p.open_id) as player_count,
                  SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) as ready_count
           FROM rooms r
           LEFT JOIN room_players p ON r.id = p.room_id
           WHERE r.id = ? AND r.game_started = FALSE
           GROUP BY r.owner_id, r.room_config
           FOR UPDATE`,
          [roomId]
        );
        
        if (roomInfo.length === 0) {
          throw new Error('房间不存在或游戏已开始');
        }
        
        const playerCount = parseInt(roomInfo[0].player_count);
        const readyCount = parseInt(roomInfo[0].ready_count);
        const roomConfig = roomInfo[0].room_config ? (typeof roomInfo[0].room_config === 'string' ? JSON.parse(roomInfo[0].room_config) : roomInfo[0].room_config) : null;
        const ownerId = roomInfo[0].owner_id;
        
        // 验证游戏开始条件
        if (playerCount < 5) {
          throw new Error('至少需要5人才能开始游戏');
        }
        
        if (readyCount < playerCount) {
          throw new Error('还有玩家未准备');
        }
        
        // 2. 获取已排序的玩家列表
        const [players] = await connection.execute(
          `SELECT open_id as openId, nick_name as nickName, avatar_url as avatarUrl, seat_number as seatNumber
           FROM room_players WHERE room_id = ? ORDER BY seat_number`,
          [roomId]
        );
        
        // 3. 分配角色
        let roles;
        if (roomConfig && roomConfig.roles && roomConfig.roles.good && roomConfig.roles.evil) {
          const customRoles = [...roomConfig.roles.good, ...roomConfig.roles.evil];
          if (customRoles.length === playerCount) {
            roles = customRoles;
          } else {
            roles = this.getRoleConfiguration(playerCount);
          }
        } else {
          roles = this.getRoleConfiguration(playerCount);
        }
        const shuffledRoles = this.shuffleArray(roles);
        
        // 4. 创建游戏记录（首位车长 = 当前时钟分钟 % 玩家人数）
        const firstLeaderIndex = playerCount > 0 ? (new Date().getMinutes() % playerCount) : 0;
        await connection.execute(
          `INSERT INTO games (id, room_id, owner_id, current_phase, current_round, 
                              team_leader_index, failed_nominations, status, created_at, updated_at)
           VALUES (?, ?, ?, 'roleReveal', 1, ?, 0, 'active', NOW(), NOW())`,
          [gameId, roomId, ownerId, firstLeaderIndex]
        );
        
        // 5. 添加游戏玩家角色
        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          const role = shuffledRoles[i];
          const side = this.getRoleSide(role);
          
          await connection.execute(
            `INSERT INTO game_players (game_id, open_id, role, side, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [gameId, player.openId, role, side]
          );
        }
        
        // 6. 更新房间状态
        await connection.execute(
          'UPDATE rooms SET game_started = TRUE, updated_at = NOW() WHERE id = ?',
          [roomId]
        );
        
        // 7. 组装游戏数据
        const playersWithRoles = players.map((player, index) => ({
          ...player,
          role: shuffledRoles[index],
          side: this.getRoleSide(shuffledRoles[index])
        }));
        
        game = {
          gameId,
          roomId,
          players: playersWithRoles,
          currentPhase: 'roleReveal',
          currentRound: 1,
          teamLeaderIndex: firstLeaderIndex,
          nominatedTeam: [],
          teamVotes: {},
          missionVotes: {},
          missionResults: [],
          failedNominations: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });
      
      return game;
    } catch (error) {
      console.error('开始游戏失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取游戏状态
   * @param {string} gameId 游戏ID
   * @param {string} openId 玩家openId（可选）
   * @returns {Promise<Object>} 游戏状态
   */
  static async getState(gameId, openId = null) {
    try {
      // 获取游戏基本信息
      const games = await db.query(
        `SELECT id as gameId, room_id as roomId, owner_id as ownerId, current_phase as currentPhase, current_round as currentRound,
                team_leader_index as teamLeaderIndex, nominated_team as nominatedTeam,
                failed_nominations as failedNominations, assassination,
                game_result as gameResult,
                created_at as createdAt, updated_at as updatedAt
         FROM games WHERE id = ?`,
        [gameId]
      );
      
      if (games.length === 0) {
        throw new Error('游戏不存在');
      }
      
      const game = games[0];
      
      // 解析JSON字段
      if (game.nominatedTeam) {
        game.nominatedTeam = parseJson(game.nominatedTeam);
      }
      if (game.gameResult) {
        game.gameResult = parseJson(game.gameResult);
      }
      if (game.assassination) {
        game.assassination = parseJson(game.assassination);
      }
      
      // 获取游戏玩家
      const players = await db.query(
        `SELECT gp.open_id as openId, gp.role, gp.side,
                p.nick_name as nickName, p.avatar_url as avatarUrl, p.seat_number as seatNumber
         FROM game_players gp
         JOIN room_players p ON gp.open_id = p.open_id AND p.room_id = ?
         WHERE gp.game_id = ?
         ORDER BY p.seat_number`,
        [game.roomId, gameId]
      );
      
      game.players = players.map(p => ({ ...p, isHost: p.openId === game.ownerId }));
      
      // 获取当前回合的投票信息
      const teamVotes = await db.query(
        `SELECT open_id, vote_value 
         FROM votes 
         WHERE game_id = ? AND vote_type = 'team' AND round = ?
         ORDER BY created_at`,
        [gameId, game.currentRound]
      );
      
      const missionVotes = await db.query(
        `SELECT open_id, vote_value 
         FROM votes 
         WHERE game_id = ? AND vote_type = 'mission' AND round = ?
         ORDER BY created_at`,
        [gameId, game.currentRound]
      );
      
      // 转换为对象格式
      game.teamVotes = {};
      game.missionVotes = {};
      
      teamVotes.forEach(vote => {
        game.teamVotes[vote.open_id] = vote.vote_value;
      });
      
      missionVotes.forEach(vote => {
        game.missionVotes[vote.open_id] = vote.vote_value;
      });
      
      // 获取任务结果
      const missionResults = await db.query(
        `SELECT round, success, fail_count as failCount, team
         FROM mission_results 
         WHERE game_id = ? 
         ORDER BY round`,
        [gameId]
      );
      
      game.missionResults = missionResults.map(result => ({
        round: result.round,
        success: result.success === 1,
        failCount: result.failCount,
        team: result.team ? parseJson(result.team) : []
      }));
      
      // 如果指定了玩家，返回玩家角色
      let playerRole = null;
      if (openId) {
        const player = players.find(p => p.openId === openId);
        if (player) {
          playerRole = player.role;
        }
      }

      // 读取房间配置（视野判定 + 湖仙）
      const roomRows = await db.query('SELECT room_config FROM rooms WHERE id = ?', [game.roomId]);
      const roomConfig = roomRows.length ? parseJson(roomRows[0].room_config) : null;
      const rules = (roomConfig && roomConfig.rules) || {};

      // 湖仙落位：首车主 seat-1 取模（确定性）；仅在启用湖仙时有效
      const playerCount = players.length;
      if (rules.ladyOfTheLake && playerCount > 0) {
        const holderIndex = (game.teamLeaderIndex - 1 + playerCount) % playerCount;
        game.lakeHolderOpenId = players[holderIndex] ? players[holderIndex].openId : null;
      } else {
        game.lakeHolderOpenId = null;
      }

      if (openId && playerRole) {
        // 玩家视角：隐藏他人角色/阵营，附 vision
        const requester = players.find(p => p.openId === openId);
        game.vision = { seen: buildVision(requester, players, roomConfig) };
        game.players = players.map(p => {
          const entry = { openId: p.openId, nickName: p.nickName, avatarUrl: p.avatarUrl, seatNumber: p.seatNumber, isHost: p.openId === game.ownerId };
          if (p.openId === openId) {
            entry.role = p.role;
            entry.side = p.side;
          }
          return entry;
        });
      }

      return {
        success: true,
        game,
        playerRole
      };
    } catch (error) {
      console.error('获取游戏状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 提交提名队伍
   * @param {string} gameId 游戏ID
   * @param {string} openId 队长openId
   * @param {Array<string>} nominatedTeam 提名队伍openId数组
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async submitNomination(gameId, openId, nominatedTeam) {
    try {
      await db.transaction(async (connection) => {
        // 验证游戏状态和队长身份
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, team_leader_index, room_id,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (game[0].current_phase !== 'discussion') {
          throw new Error('当前不是队伍选择阶段');
        }
        
        // 验证队长身份（与 startGame 分配队长时使用相同的座位号排序）
        const [players] = await connection.execute(
          `SELECT gp.open_id FROM game_players gp
           LEFT JOIN room_players p ON gp.open_id = p.open_id AND p.room_id = ?
           ORDER BY COALESCE(p.seat_number, 999999), gp.open_id`,
          [game[0].room_id]
        );
        
        const teamLeaderIndex = game[0].team_leader_index;
        if (teamLeaderIndex >= players.length || players[teamLeaderIndex].open_id !== openId) {
          throw new Error('只有队长才能提名');
        }
        
        // 验证队伍大小
        const playerCount = game[0].player_count;
        const requiredSize = this.getTeamSize(playerCount, game[0].current_round);
        if (nominatedTeam.length !== requiredSize) {
          throw new Error(`需要${requiredSize}人`);
        }
        
        // 更新提名队伍和阶段
        await connection.execute(
          `UPDATE games 
           SET current_phase = 'teamVote', 
               nominated_team = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [JSON.stringify(nominatedTeam), gameId]
        );
      });
      
      return await this.getState(gameId);
    } catch (error) {
      console.error('提交提名失败:', error);
      throw error;
    }
  }
  
  /**
   * 投票
   * @param {string} gameId 游戏ID
   * @param {string} openId 投票玩家openId
   * @param {string} vote 投票值 ('approve' 或 'reject')
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async castVote(gameId, openId, vote) {
    try {
      await db.transaction(async (connection) => {
        // 获取游戏状态
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, 
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (game[0].current_phase !== 'teamVote') {
          throw new Error('当前不是投票阶段');
        }
        
        // 检查是否已投票
        const [existingVote] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND open_id = ? AND vote_type = 'team' AND round = ?`,
          [gameId, openId, game[0].current_round]
        );
        
        if (existingVote[0].count > 0) {
          throw new Error('已投票');
        }
        
        // 记录投票
        await connection.execute(
          `INSERT INTO votes (game_id, open_id, vote_type, vote_value, round, created_at)
           VALUES (?, ?, 'team', ?, ?, NOW())`,
          [gameId, openId, vote, game[0].current_round]
        );
        
        // 检查是否所有玩家都已投票
        const [voteCount] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND vote_type = 'team' AND round = ?`,
          [gameId, game[0].current_round]
        );
        
        const playerCount = game[0].player_count;
        
        if (voteCount[0].count >= playerCount) {
          // 统计投票结果
          const [votes] = await connection.execute(
            `SELECT vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'team' AND round = ?`,
            [gameId, game[0].current_round]
          );
          
          const approveCount = votes.filter(v => v.vote_value === 'approve').length;
          const rejectCount = votes.filter(v => v.vote_value === 'reject').length;
          
          if (approveCount > rejectCount) {
            // 投票通过，进入任务投票阶段
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'missionVote',
                   updated_at = NOW()
               WHERE id = ?`,
              [gameId]
            );
          } else {
            // 投票否决
            const failedNominations = game[0].failed_nominations + 1;
            const newTeamLeaderIndex = (game[0].team_leader_index + 1) % playerCount;

            await connection.execute(
              `UPDATE games 
               SET current_phase = 'discussion',
                   team_leader_index = ?,
                   nominated_team = NULL,
                   failed_nominations = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [newTeamLeaderIndex, failedNominations, gameId]
            );
          }
        }
      });
      
      return await this.getState(gameId);
    } catch (error) {
      console.error('投票失败:', error);
      throw error;
    }
  }
  
  /**
   * 任务投票
   * @param {string} gameId 游戏ID
   * @param {string} openId 投票玩家openId
   * @param {string} vote 投票值 ('success' 或 'fail')
   * @param {string} playerRole 玩家角色
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async castMissionVote(gameId, openId, vote, playerRole) {
    try {
      await db.transaction(async (connection) => {
        // 获取游戏状态
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, team_leader_index, nominated_team, room_id,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (game[0].current_phase !== 'missionVote') {
          throw new Error('当前不是任务投票阶段');
        }

        // 验证只有任务队成员才能投票
        const nominatedTeam = game[0].nominated_team ? parseJson(game[0].nominated_team) : [];
        if (!nominatedTeam.includes(openId)) {
          throw new Error('只有任务队成员才能投票');
        }

        // 读取房间规则（必败机制）
        const roomRows = await connection.execute('SELECT room_config FROM rooms WHERE id = ?', [game[0].room_id]);
        const roomConfig = roomRows[0].length ? parseJson(roomRows[0][0].room_config) : null;
        const rules = (roomConfig && roomConfig.rules) || {};

        // 查询投票者当前阵营与角色（按 openId，保证可信度）
        const [gpRows] = await connection.execute(
          'SELECT side, role FROM game_players WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );
        if (gpRows.length === 0) {
          throw new Error('玩家不在此游戏中');
        }
        const currentSide = gpRows[0].side;
        const role = gpRows[0].role;

        // 好人必须投成功（固定规则，按当前阵营 side）
        if (vote === 'fail' && currentSide !== 'evil') {
          throw new Error('只有坏人才能破坏任务');
        }
        // 必败强制：红兰/奥伯伦（当前为 evil 时）必须投失败
        if (vote === 'success' && currentSide === 'evil') {
          const mustFail = (role === 'lancelotRed' && rules.redLancelotMustFailMission) ||
                           (role === 'oberon' && rules.oberonMustFailMission);
          if (mustFail) {
            throw new Error('你当前阵营为坏人，必须投失败票');
          }
        }
        
        // 检查是否已投票
        const [existingVote] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND open_id = ? AND vote_type = 'mission' AND round = ?`,
          [gameId, openId, game[0].current_round]
        );
        
        if (existingVote[0].count > 0) {
          throw new Error('已投票');
        }
        
        // 记录投票
        await connection.execute(
          `INSERT INTO votes (game_id, open_id, vote_type, vote_value, round, created_at)
           VALUES (?, ?, 'mission', ?, ?, NOW())`,
          [gameId, openId, vote, game[0].current_round]
        );
        
        // 检查任务队伍成员是否都已投票
        const [voteCount] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND vote_type = 'mission' AND round = ?`,
          [gameId, game[0].current_round]
        );

        const teamSize = nominatedTeam.length;

        if (voteCount[0].count >= teamSize) {
          // 统计投票结果
          const [votes] = await connection.execute(
            `SELECT vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'mission' AND round = ?`,
            [gameId, game[0].current_round]
          );

          const failCount = votes.filter(v => v.vote_value === 'fail').length;

          // 判断任务是否成功（1 张坏票即失败；仅 7+ 人局第 4 轮保护轮需 2 张坏票）
          const playerCount = game[0].player_count;
          const requiresDoubleFail = playerCount >= 7 && game[0].current_round === 4;
          let success;
          if (requiresDoubleFail) {
            success = failCount < 2;
          } else {
            success = failCount === 0;
          }

          // 保存任务结果
          await connection.execute(
            `INSERT INTO mission_results (game_id, round, success, fail_count, team, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [gameId, game[0].current_round, success, failCount, JSON.stringify(nominatedTeam)]
          );

          // 获取已成功任务数量
          const [successCountResult] = await connection.execute(
            `SELECT COUNT(*) as count FROM mission_results 
             WHERE game_id = ? AND success = TRUE`,
            [gameId]
          );

          const successCount = successCountResult[0].count;

          // 获取已失败任务数量
          const [failCountResult] = await connection.execute(
            `SELECT COUNT(*) as count FROM mission_results 
             WHERE game_id = ? AND success = FALSE`,
            [gameId]
          );

          const failMissionCount = failCountResult[0].count;

          // 检查游戏是否结束
          if (failMissionCount >= 3) {
            // 3次任务失败，坏人胜利
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'gameEnd',
                   game_result = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [JSON.stringify({ winner: 'evil', reason: '坏人完成3个任务' }), gameId]
            );
          } else if (successCount >= 3) {
            // 好人完成3个任务，进入刺杀阶段
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'assassination',
                   updated_at = NOW()
               WHERE id = ?`,
              [gameId]
            );
          } else {
            // 进入下一回合（先触发兰斯洛特转换抽卡，再推进）
            await maybeLancelotSwap(connection, gameId, game[0].current_round, rules);
            const newRound = game[0].current_round + 1;
            const newTeamLeaderIndex = (game[0].team_leader_index + 1) % game[0].player_count;

            await connection.execute(
              `UPDATE games 
               SET current_phase = 'discussion',
                   current_round = ?,
                   team_leader_index = ?,
                   nominated_team = NULL,
                   updated_at = NOW()
               WHERE id = ?`,
              [newRound, newTeamLeaderIndex, gameId]
            );
          }
        }
      });
      
      return await this.getState(gameId);
    } catch (error) {
      console.error('任务投票失败:', error);
      throw error;
    }
  }
  
  /**
   * 结束游戏
   * @param {string} gameId 游戏ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async end(gameId) {
    try {
      await db.transaction(async (connection) => {
        // 标记游戏结束
        await connection.execute(
          'UPDATE games SET status = \'ended\', ended_at = NOW(), updated_at = NOW() WHERE id = ?',
          [gameId]
        );
        
        // 获取room_id用于后续重置
        const [gameRows] = await connection.execute(
          'SELECT room_id FROM games WHERE id = ?',
          [gameId]
        );
        
        const roomId = gameRows[0] ? gameRows[0].room_id : null;
        
        if (roomId) {
          // 重置房间状态
          await connection.execute(
            `UPDATE rooms 
             SET game_started = FALSE, 
                 updated_at = NOW() 
             WHERE id = ?`,
            [roomId]
          );
          
          // 重置玩家准备状态
          await connection.execute(
            `UPDATE room_players 
             SET is_ready = FALSE 
             WHERE room_id = ?`,
            [roomId]
          );
        }
      });
      
      return true;
    } catch (error) {
      console.error('结束游戏失败:', error);
      throw error;
    }
  }
  
  /**
   * 推进游戏阶段
   * @param {string} gameId 游戏ID
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async advancePhase(gameId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, team_leader_index,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'roleReveal') {
          throw new Error('当前阶段无法推进');
        }

        await connection.execute(
          `UPDATE games 
           SET current_phase = 'discussion',
               updated_at = NOW()
           WHERE id = ?`,
          [gameId]
        );
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('推进阶段失败:', error);
      throw error;
    }
  }

  /**
   * 刺客刺杀梅林
   * 仅 assassin 可发起；无 assassin 时 morgana 可发起
   * 强制进入 assassination 阶段，执行后必定 gameEnd
   * @param {string} gameId 游戏ID
   * @param {string} killerOpenId 刺杀者openId
   * @param {string} targetOpenId 目标openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async assassinate(gameId, killerOpenId, targetOpenId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, current_round
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase === 'gameEnd') {
          throw new Error('游戏已结束');
        }

        // 查找刺杀者：assassin 或（无 assassin 时）morgana
        const [assassinPlayers] = await connection.execute(
          `SELECT open_id FROM game_players WHERE game_id = ? AND role = 'assassin'`,
          [gameId]
        );
        const [morganaPlayers] = await connection.execute(
          `SELECT open_id FROM game_players WHERE game_id = ? AND role = 'morgana'`,
          [gameId]
        );

        let validKillerOpenIds = [];
        if (assassinPlayers.length > 0) {
          validKillerOpenIds = assassinPlayers.map(p => p.open_id);
        } else if (morganaPlayers.length > 0) {
          validKillerOpenIds = morganaPlayers.map(p => p.open_id);
        }

        if (validKillerOpenIds.length === 0) {
          throw new Error('本局无刺杀者角色');
        }

        if (!validKillerOpenIds.includes(killerOpenId)) {
          throw new Error('只有刺杀者才能发起刺杀');
        }

        // 查询目标角色
        const [target] = await connection.execute(
          `SELECT role FROM game_players WHERE game_id = ? AND open_id = ?`,
          [gameId, targetOpenId]
        );

        if (target.length === 0) {
          throw new Error('目标不在此游戏中');
        }

        const isMerlin = target[0].role === 'merlin';
        const assassination = {
          killer: killerOpenId,
          target: targetOpenId,
          correct: isMerlin,
          phase: game[0].current_phase,
          round: game[0].current_round
        };

        // 无论命中与否，执行刺杀后必定 gameEnd
        if (isMerlin) {
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'gameEnd',
                 assassination = ?,
                 game_result = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(assassination),
             JSON.stringify({ winner: 'evil', reason: '刺杀命中梅林', assassination }),
             gameId]
          );
        } else {
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'gameEnd',
                 assassination = ?,
                 game_result = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(assassination),
             JSON.stringify({ winner: 'good', reason: '刺杀未命中梅林', assassination }),
             gameId]
          );
        }
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('刺杀失败:', error);
      throw error;
    }
  }

  // =============== 工具方法 ===============
  
  /**
   * 根据玩家数量获取角色配置
   * @param {number} playerCount 玩家数量
   * @returns {Array<string>} 角色数组
   */
  static getRoleConfiguration(playerCount) {
    const configs = {
      5:  ['merlin', 'percival', 'loyal', 'morgana', 'assassin'],
      6:  ['merlin', 'percival', 'loyal', 'loyal', 'morgana', 'assassin'],
      7:  ['merlin', 'percival', 'loyal', 'loyal', 'morgana', 'assassin', 'oberon'],
      8:  ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'morgana', 'assassin', 'minion'],
      9:  ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'morgana', 'assassin', 'mordred'],
      10: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'morgana', 'assassin', 'mordred', 'oberon'],
      11: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'lancelotBlue', 'morgana', 'mordred', 'oberon', 'lancelotRed'],
      12: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'lancelotBlue', 'morgana', 'assassin', 'mordred', 'oberon', 'lancelotRed']
    };
    
    return configs[playerCount] || configs[5];
  }
  
  /**
   * 获取角色阵营
   * @param {string} role 角色
   * @returns {string} 'good' 或 'evil'
   */
  static getRoleSide(role) {
    const goodRoles = ['merlin', 'percival', 'loyal', 'lancelotBlue'];
    const evilRoles = ['mordred', 'morgana', 'assassin', 'minion', 'oberon', 'lancelotRed'];
    
    if (goodRoles.includes(role)) return 'good';
    if (evilRoles.includes(role)) return 'evil';
    return 'good';
  }
  
  /**
   * 获取队伍大小
   * @param {number} playerCount 玩家数量
   * @param {number} round 回合数(1-5)
   * @returns {number} 队伍大小
   */
  static getTeamSize(playerCount, round) {
    const teamSizes = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5],
      11: [3, 4, 5, 6, 6],
      12: [3, 4, 5, 6, 6]
    };
    
    const sizes = teamSizes[playerCount] || teamSizes[5];
    return sizes[round - 1] || 3;
  }
  
  /**
   * 随机打乱数组
   * @param {Array} array 原始数组
   * @returns {Array} 打乱后的数组
   */
  static shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
  
  /**
   * 获取游戏统计信息
   * @returns {Promise<Object>} 统计信息
   */
  static async getStats() {
    try {
      const totalGames = await db.query('SELECT COUNT(*) as count FROM games');
      const activeGames = await db.query(
        'SELECT COUNT(*) as count FROM games WHERE status = \'active\''
      );
      const gamesByPhase = await db.query(
        'SELECT current_phase, COUNT(*) as count FROM games GROUP BY current_phase'
      );
      const completedGames = await db.query(
        'SELECT COUNT(*) as count FROM games WHERE status = \'ended\''
      );
      
      return {
        totalGames: totalGames[0].count,
        activeGames: activeGames[0].count,
        completedGames: completedGames[0].count,
        gamesByPhase: gamesByPhase.reduce((acc, row) => {
          acc[row.current_phase] = row.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('获取游戏统计失败:', error);
      throw error;
    }
  }
}

module.exports = GameModel;
