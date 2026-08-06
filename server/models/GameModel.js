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
 * 兰斯洛特身份转换抽卡：完成轮次 ∈ [lancelotSwapRound, 4] 时触发。
 * 默认卡组 2 张转换 / 5 张不转（Math.random < 2/7 视为抽中转换）。
 * 测试/确定性控制：rules.lancelotSwapForce = 'switch' | 'keep'（缺省走随机）。
 * 单兰翻转；双兰（初始异侧）同时互换。
 * 每次触发都会写入 lancelot_swap_history（无论是否抽中转换）。
 */
async function maybeLancelotSwap(connection, gameId, completedRound, rules) {
  const swapRound = rules.lancelotSwapRound;
  if (typeof swapRound !== 'number' || completedRound < swapRound || completedRound > 4) return null;

  const [lancelots] = await connection.execute(
    `SELECT open_id, side FROM game_players WHERE game_id = ? AND role IN ('lancelotBlue','lancelotRed')`,
    [gameId]
  );
  if (lancelots.length === 0) return null;

  let switched;
  if (rules.lancelotSwapForce === 'switch') switched = true;
  else if (rules.lancelotSwapForce === 'keep') switched = false;
  else switched = Math.random() < (2 / 7);

  await connection.execute(
    'INSERT INTO lancelot_swap_history (game_id, round, switched, created_at) VALUES (?, ?, ?, NOW())',
    [gameId, completedRound, switched]
  );
  if (switched) {
    for (const l of lancelots) {
      const newSide = l.side === 'good' ? 'evil' : 'good';
      await connection.execute(
        'UPDATE game_players SET side = ? WHERE game_id = ? AND open_id = ?',
        [newSide, gameId, l.open_id]
      );
    }
  }
  return switched;
}

function buildVision(requester, players, roomConfig) {
  const rules = (roomConfig && roomConfig.rules) || {};
  const merlinVision = (roomConfig && roomConfig.merlinVision) || {};
  const canSee = (merlinVision.canSee && merlinVision.canSee.length) ? merlinVision.canSee : ['assassin', 'morgana', 'minion', 'oberon'];
  const canIdentify = merlinVision.canIdentify || [];

  const seen = [];
  const add = (p, mode) => {
    if (seen.some(s => s.openId === p.openId)) return;
    const entry = { openId: p.openId, canIdentity: false };
    if (mode === 'role') {
      entry.role = p.role;
      entry.side = p.side;
      entry.canIdentity = true;
    } else if (mode === 'side') {
      entry.side = p.side;
    }
    seen.push(entry);
  };

  const role = requester.role;

  if (EVIL_OPEN_EYES.includes(role)) {
    // 睁眼狼互见：始终能看到其他睁眼狼；evilKnowsEachOther 仅决定是否知道对方具体身份
    // oberon 互隐（EVIL_OPEN_EYES 不含 oberon）；红兰按 evilsKnowRedLancelot 独立可见（默认 true）
    for (const p of players) {
      if (p.openId === requester.openId) continue;
      if (EVIL_OPEN_EYES.includes(p.role)) {
        add(p, rules.evilKnowsEachOther ? 'role' : 'side');
      } else if (p.role === LANCELOT_RED && rules.evilsKnowRedLancelot !== false) {
        add(p, 'role');
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
    // 派西维尔：见梅林+莫甘娜，不区分谁是谁（role/side 置空，canIdentity=false）
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
      let kickedObservers = [];   // 被移出的等待区玩家 openId（事务外通知）

      await db.transaction(async (connection) => {
        const gameId = uuidv4();
        
        // 1. 获取房间和玩家信息
        const [roomInfo] = await connection.execute(
          `SELECT r.owner_id, r.room_config,
                  COUNT(p.open_id) as player_count,
                  SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) as ready_count
           FROM rooms r
           LEFT JOIN room_players p ON r.id = p.room_id AND p.seat_number >= 1
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
        
        // 2. 获取已排序的玩家列表（仅入座玩家，排除观战/等待区）
        const [players] = await connection.execute(
          `SELECT open_id as openId, nick_name as nickName, avatar_url as avatarUrl, seat_number as seatNumber
           FROM room_players WHERE room_id = ? AND seat_number >= 1 ORDER BY seat_number`,
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
        
        // 4. 创建游戏记录（首位车长 = 当前时钟分钟 % 玩家人数；湖仙初始持有者 = 首车主 seat-1 取模，仅湖仙启用时）
        const firstLeaderIndex = playerCount > 0 ? (new Date().getMinutes() % playerCount) : 0;
        const firstLakeHolderIndex = (firstLeaderIndex - 1 + playerCount) % playerCount;
        const lakeEnabled = !!(roomConfig && roomConfig.rules && roomConfig.rules.ladyOfTheLake);
        const firstLakeHolderOpenId = lakeEnabled && players[firstLakeHolderIndex] ? players[firstLakeHolderIndex].openId : null;
        await connection.execute(
          `INSERT INTO games (id, room_id, owner_id, current_phase, current_round, 
                              team_leader_index, failed_nominations, lake_holder_open_id,
                              speaking_order, status, created_at, updated_at)
           VALUES (?, ?, ?, 'roleReveal', 1, ?, 0, ?, 'asc', 'active', NOW(), NOW())`,
          [gameId, roomId, ownerId, firstLeaderIndex, firstLakeHolderOpenId]
        );
        
        // 5. 添加游戏玩家角色
        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          const role = shuffledRoles[i];
          const side = this.getRoleSide(role);
          
          await connection.execute(
            `INSERT INTO game_players (game_id, open_id, role, side, nick_name, avatar_url, seat_number, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [gameId, player.openId, role, side, player.nickName || null, player.avatarUrl || null, player.seatNumber || null]
          );
        }

        // 5.5 计算并存储玩家视野（开局冻结，用初始 side；不随兰斯洛特转换变化）
        const playersWithRolesForVision = players.map((player, index) => ({
          openId: player.openId,
          role: shuffledRoles[index],
          side: this.getRoleSide(shuffledRoles[index])
        }));
        for (const p of playersWithRolesForVision) {
          const vision = { players: buildVision(p, playersWithRolesForVision, roomConfig) };
          await connection.execute(
            'INSERT INTO game_visions (game_id, open_id, vision, created_at) VALUES (?, ?, ?, NOW())',
            [gameId, p.openId, JSON.stringify(vision)]
          );
        }
        
        // 6. 更新房间状态
        await connection.execute(
          'UPDATE rooms SET game_started = TRUE, updated_at = NOW() WHERE id = ?',
          [roomId]
        );

        // 6.5 游戏开始：移出等待区（seat=0，未入座）玩家；房主若在等待区则移到观战区(-1)保留（房间不能无主）
        const [waitingRows] = await connection.execute(
          'SELECT open_id FROM room_players WHERE room_id = ? AND seat_number = 0',
          [roomId]
        );
        await connection.execute(
          'DELETE FROM room_players WHERE room_id = ? AND seat_number = 0 AND open_id != ?',
          [roomId, ownerId]
        );
        await connection.execute(
          'UPDATE room_players SET seat_number = -1 WHERE room_id = ? AND open_id = ? AND seat_number = 0',
          [roomId, ownerId]
        );
        kickedObservers = waitingRows.filter(w => w.open_id !== ownerId).map(w => w.open_id);
        
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

      // 通知被移出的等待区玩家（事务外，定向推送）
      const socket = require('../config/socket');
      for (const openId of kickedObservers) {
        socket.sendToPlayer(openId, { type: 'kickedFromRoom', reason: '游戏已开始，您已离开房间' });
      }

      return game;
    } catch (error) {
      console.error('开始游戏失败:', error);
      throw error;
    }
  }

  /**
   * 车主提交预选队伍：preNominate → speakingOrder。
   * 仅当前队长可调用；需处于 preNominate 阶段。预选任意人数，仅校验成员都在本局。
   * @param {string} gameId 游戏ID
   * @param {string} openId 队长openId
   * @param {Array<string>} preNominatedTeam 预提名队伍（可选）
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async submitPreNomination(gameId, openId, preNominatedTeam) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, team_leader_index, room_id
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'preNominate') {
          throw new Error('当前不是车主预选车型阶段');
        }

        // 队长校验（与 startGame 分配队长时使用相同的座位号排序）
        const [players] = await connection.execute(
          `SELECT gp.open_id FROM game_players gp
           WHERE gp.game_id = ?
           ORDER BY COALESCE(gp.seat_number, 999999), gp.open_id`,
          [gameId]
        );

        const teamLeaderIndex = game[0].team_leader_index;
        if (teamLeaderIndex >= players.length || players[teamLeaderIndex].open_id !== openId) {
          throw new Error('只有队长才能提交预选');
        }

        // 预提名队伍校验（若提供）：任意人数，仅校验成员都在本局
        let preTeamJson = null;
        if (Array.isArray(preNominatedTeam) && preNominatedTeam.length > 0) {
          const validIds = new Set(players.map(p => p.open_id));
          if (preNominatedTeam.some(id => !validIds.has(id))) {
            throw new Error('预提名队伍包含不在本局的玩家');
          }
          preTeamJson = JSON.stringify(preNominatedTeam);
        }

        await connection.execute(
          `UPDATE games 
           SET pre_nominated_team = ?, speaking_order = 'asc',
               discussion_set = FALSE,
               lancelot_result = NULL,
               current_phase = 'speakingOrder',
               updated_at = NOW()
           WHERE id = ?`,
          [preTeamJson, gameId]
        );
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('提交预选失败:', error);
      throw error;
    }
  }

  /**
   * 车主确定发言顺序：speakingOrder → discussion。
   * 仅当前队长可调用；需处于 speakingOrder 阶段。
   * @param {string} gameId 游戏ID
   * @param {string} openId 队长openId
   * @param {string} speakingOrder 发言顺序 'asc' | 'desc'
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async setSpeakingOrder(gameId, openId, speakingOrder) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, team_leader_index, room_id
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'speakingOrder') {
          throw new Error('当前不是车主确定发言顺序阶段');
        }

        // 队长校验
        const [players] = await connection.execute(
          `SELECT gp.open_id FROM game_players gp
           WHERE gp.game_id = ?
           ORDER BY COALESCE(gp.seat_number, 999999), gp.open_id`,
          [gameId]
        );

        const teamLeaderIndex = game[0].team_leader_index;
        if (teamLeaderIndex >= players.length || players[teamLeaderIndex].open_id !== openId) {
          throw new Error('只有队长才能设置发言顺序');
        }

        if (!['asc', 'desc'].includes(speakingOrder)) {
          throw new Error('speakingOrder 必须是 asc 或 desc');
        }

        await connection.execute(
          `UPDATE games 
           SET speaking_order = ?, discussion_set = TRUE, current_phase = 'discussion', updated_at = NOW()
           WHERE id = ?`,
          [speakingOrder, gameId]
        );
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('设置发言顺序失败:', error);
      throw error;
    }
  }

  /**
   * 放弃游戏（仅房主）：将游戏标记为 abandoned，无胜负结果。
   * @param {string} gameId 游戏ID
   * @param {string} openId 房主openId
   * @returns {Promise<boolean>} 是否成功
   */
  static async abandon(gameId, openId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT owner_id, room_id, status FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].status === 'ended' || game[0].status === 'abandoned') {
          throw new Error('游戏已结束');
        }

        if (game[0].owner_id !== openId) {
          throw new Error('仅房主可放弃游戏');
        }

        await connection.execute(
          `UPDATE games 
           SET status = 'abandoned', current_phase = 'gameEnd', ended_at = NOW(),
               game_result = ?, updated_at = NOW()
           WHERE id = ?`,
          [JSON.stringify({ winner: null, reason: '房主放弃游戏', abandoned: true }), gameId]
        );

        const roomId = game[0].room_id;
        if (roomId) {
          await connection.execute(
            `UPDATE rooms SET game_started = FALSE, updated_at = NOW() WHERE id = ?`,
            [roomId]
          );
          await connection.execute(
            `UPDATE room_players SET is_ready = FALSE WHERE room_id = ?`,
            [roomId]
          );
        }
      });

      return true;
    } catch (error) {
      console.error('放弃游戏失败:', error);
      throw error;
    }
  }

  /**
   * 获取游戏状态（新结构：basic/players/current/history）。
   * @param {string} gameId 游戏ID
   * @param {string} openId 玩家openId（可选）
   * @returns {Promise<Object>} 游戏状态
   */
  static async getState(gameId, openId = null) {
    try {
      // 惰性推进：teamVoteReveal 超时立即推进（配合定时器，保证 voteRevealDuration=0 时即时进入下一阶段）
      await this.maybeAdvanceTeamVoteReveal();

      // 获取游戏基本信息
      const games = await db.query(
        `SELECT id as gameId, room_id as roomId, owner_id as ownerId, current_phase as currentPhase, current_round as currentRound,
                team_leader_index as teamLeaderIndex, nominated_team as nominatedTeam,
                failed_nominations as failedNominations, lake_holder_open_id as lakeHolderOpenId,
                pre_nominated_team as preNominatedTeam, speaking_order as speakingOrder,
                discussion_set as discussionSet, lancelot_result as lancelotResult,
                vote_reveal_end_at as voteRevealEndAt, forced_car as forcedCar,
                assassination, game_result as gameResult,
                created_at as createdAt, ended_at as endedAt, updated_at as updatedAt,
                status
         FROM games WHERE id = ?`,
        [gameId]
      );
      
      if (games.length === 0) {
        throw new Error('游戏不存在');
      }
      
      const game = games[0];
      
      // 解析JSON字段
      if (game.nominatedTeam) game.nominatedTeam = parseJson(game.nominatedTeam);
      if (game.preNominatedTeam) game.preNominatedTeam = parseJson(game.preNominatedTeam);
      if (game.gameResult) game.gameResult = parseJson(game.gameResult);
      if (game.assassination) game.assassination = parseJson(game.assassination);
      if (game.lancelotResult) game.lancelotResult = parseJson(game.lancelotResult);

      // 房间配置（视野判定 + 湖仙 + 可见性）
      const roomRows = await db.query('SELECT room_config FROM rooms WHERE id = ?', [game.roomId]);
      const roomConfig = roomRows.length ? parseJson(roomRows[0].room_config) : null;
      const rules = (roomConfig && roomConfig.rules) || {};

      // 获取游戏玩家（基于 game_players 快照，不依赖 room_players，房间删除后历史对局仍完整）
      const players = await db.query(
        `SELECT gp.open_id as openId, gp.role, gp.side, gp.reveal_confirmed as revealConfirmed,
                gp.lancelot_confirmed as lancelotConfirmed,
                gp.lake_confirmed as lakeConfirmed,
                gp.nick_name as nickName, gp.avatar_url as avatarUrl, gp.seat_number as seatNumber
         FROM game_players gp
         WHERE gp.game_id = ?
         ORDER BY COALESCE(gp.seat_number, 999999), gp.open_id`,
        [gameId]
      );

      const playerCount = players.length;
      const revealConfirmedCount = players.filter(p => p.revealConfirmed === 1 || p.revealConfirmed === true).length;
      const lancelotConfirmedCount = players.filter(p => p.lancelotConfirmed === 1 || p.lancelotConfirmed === true).length;
      const lakeConfirmedCount = players.filter(p => p.lakeConfirmed === 1 || p.lakeConfirmed === true).length;
      const carIndex = game.failedNominations + 1;

      // 当前车次队伍投票 / 任务投票
      const teamVotes = await db.query(
        `SELECT open_id, vote_value 
         FROM votes 
         WHERE game_id = ? AND vote_type = 'team' AND round = ? AND car_index = ?
         ORDER BY created_at`,
        [gameId, game.currentRound, carIndex]
      );

      const missionVotes = await db.query(
        `SELECT open_id, vote_value 
         FROM votes 
         WHERE game_id = ? AND vote_type = 'mission' AND round = ? AND car_index = ?
         ORDER BY created_at`,
        [gameId, game.currentRound, carIndex]
      );

      const teamVotesObj = {};
      teamVotes.forEach(vote => { teamVotesObj[vote.open_id] = vote.vote_value; });
      const missionVotesObj = {};
      missionVotes.forEach(vote => { missionVotesObj[vote.open_id] = vote.vote_value; });

      // 投票可见性：P14 基础规则 + voteVisibility 配置粒度
      const voteVisibility = rules.voteVisibility || 'public';
      const requesterInfo = openId ? players.find(p => p.openId === openId) : null;
      const isObserver = !!(requesterInfo && requesterInfo.seatNumber === -1);

      const aggregateVotes = (votes) => {
        const agg = {};
        for (const v of Object.values(votes)) agg[v] = (agg[v] || 0) + 1;
        return agg;
      };
      const gateVotes = (votes, inVotePhase) => {
        if (!openId) return votes;
        if (isObserver) {
          if (inVotePhase) return {};
          return voteVisibility === 'anonymous' ? aggregateVotes(votes) : votes;
        }
        if (inVotePhase) {
          // P14：投票中投票者仅见自己（已投才可见），非投票者/观众不可见
          return votes[openId] ? { [openId]: votes[openId] } : {};
        }
        return voteVisibility === 'anonymous' ? aggregateVotes(votes) : votes;
      };

      const gatedTeamVotes = gateVotes(teamVotesObj, game.currentPhase === 'teamVote');
      const gatedMissionVotes = gateVotes(missionVotesObj, game.currentPhase === 'missionVote');

      // 任务结果（history.missions）
      const missionResults = await db.query(
        `SELECT round, success, fail_count as failCount
         FROM mission_results 
         WHERE game_id = ? 
         ORDER BY round`,
        [gameId]
      );

      const missionFailDetail = rules.missionFailDetail || 'count';
      const missions = missionResults.map(result => ({
        round: result.round,
        success: result.success === 1,
        missionFailCount: missionFailDetail === 'binary' ? -1 : result.failCount
      }));

      // 历史车次归档（history.cars，仅已完成：流车/发车）
      const carRows = await db.query(
        `SELECT round, car_index as carIndex, team_leader_open_id as teamLeaderOpenId,
                nominated_team as nominatedTeam, team_votes as teamVotes,
                outcome, is_forced_car as isForcedCar,
                mission_votes as missionVotes, mission_success as missionSuccess
         FROM game_cars 
         WHERE game_id = ? AND outcome != 'pending'
         ORDER BY round, car_index`,
        [gameId]
      );

      const carsMap = {};
      for (const row of carRows) {
        if (!carsMap[row.round]) carsMap[row.round] = [];
        carsMap[row.round].push({
          index: row.carIndex,
          teamLeaderOpenId: row.teamLeaderOpenId,
          nominatedTeam: parseJson(row.nominatedTeam) || [],
          teamVotes: parseJson(row.teamVotes) || {},
          outcome: row.outcome,
          isForcedCar: row.isForcedCar === 1 || row.isForcedCar === true,
          missionVotes: parseJson(row.missionVotes) || null,
          missionSuccess: row.missionSuccess === null ? null : row.missionSuccess === 1
        });
      }

      // 最近一次队伍投票结果（后端权威，来自归档 team_votes；座位升序）：
      // missionVote/teamVoteReveal 时显示；强制车轮次（isForcedCar）→ 空
      const isForcedCarNow = game.forcedCar === 1 || game.forcedCar === true;
      let teamVoteResult = { approveSeats: '', rejectSeats: '' };
      if (!isForcedCarNow && carRows.length > 0) {
        const lastCarRow = carRows[carRows.length - 1];
        const lastTv = parseJson(lastCarRow.teamVotes) || {};
        if (Object.keys(lastTv).length > 0) {
          const seatOfB = (id) => {
            const p = players.find(x => x.openId === id);
            return p && p.seatNumber != null ? p.seatNumber : null;
          };
          const toSeats = (voteVal) => Object.keys(lastTv)
            .filter(id => lastTv[id] === voteVal)
            .map(seatOfB).filter(s => s != null)
            .sort((a, b) => a - b)
            .join(' ');
          teamVoteResult = { approveSeats: toSeats('approve'), rejectSeats: toSeats('reject') };
        }
      }
      const cars = Object.keys(carsMap).map(round => ({
        round: parseInt(round),
        details: carsMap[round]
      })).sort((a, b) => a.round - b.round);

      // 湖仙记录（history.lake）——result 仅验人者本人可见
      const lakeRows = await db.query(
        `SELECT round, inspector_open_id as inspectorOpenId, target_open_id as targetOpenId, result
         FROM lake_history 
         WHERE game_id = ? 
         ORDER BY round`,
        [gameId]
      );
      const lake = lakeRows.map(row => {
        const entry = { round: row.round, inspectorOpenId: row.inspectorOpenId, targetOpenId: row.targetOpenId };
        if (!openId || openId === row.inspectorOpenId) entry.result = row.result;
        return entry;
      });

      // 兰斯洛特转换记录（history.lancelotSwaps）——房间公开
      const swapRows = await db.query(
        `SELECT round, switched
         FROM lancelot_swap_history 
         WHERE game_id = ? 
         ORDER BY round`,
        [gameId]
      );
      const lancelotSwaps = swapRows.map(row => ({ round: row.round, switched: row.switched === 1 }));

      // 玩家列表（带角色/阵营视图控制）
      const fullPlayers = players.map(p => ({ ...p, isHost: p.openId === game.ownerId }));
      let publicPlayers;
      let player = null;
      // 游戏结束后向所有人揭示全部角色/阵营
      const revealAll = game.currentPhase === 'gameEnd' && game.status === 'ended';
      if (openId) {
        // 玩家视角：隐藏他人 role/side，附 vision（开局冻结存储）；游戏结束后全揭示
        const visionRows = await db.query(
          'SELECT vision FROM game_visions WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );
        const vision = visionRows.length ? parseJson(visionRows[0].vision) : { players: [] };
        player = {
          role: requesterInfo ? requesterInfo.role : null,
          side: requesterInfo ? requesterInfo.side : null,
          revealConfirmed: requesterInfo ? (requesterInfo.revealConfirmed === 1 || requesterInfo.revealConfirmed === true) : false,
          lancelotConfirmed: requesterInfo ? (requesterInfo.lancelotConfirmed === 1 || requesterInfo.lancelotConfirmed === true) : false,
          lakeConfirmed: requesterInfo ? (requesterInfo.lakeConfirmed === 1 || requesterInfo.lakeConfirmed === true) : false,
          vision
        };
        if (revealAll) {
          publicPlayers = fullPlayers;
        } else {
          publicPlayers = fullPlayers.map(p => {
            const entry = { openId: p.openId, nickName: p.nickName, avatarUrl: p.avatarUrl, seatNumber: p.seatNumber, isHost: p.isHost, revealConfirmed: p.revealConfirmed === 1 || p.revealConfirmed === true, lancelotConfirmed: p.lancelotConfirmed === 1 || p.lancelotConfirmed === true, lakeConfirmed: p.lakeConfirmed === 1 || p.lakeConfirmed === true };
            if (p.openId === openId) {
              entry.role = p.role;
              entry.side = p.side;
            }
            return entry;
          });
        }
      } else {
        publicPlayers = fullPlayers;
      }

      // 基础信息
      const basic = {
        gameId: game.gameId,
        roomId: game.roomId,
        roomConfig,
        status: game.status,
        createdAt: game.createdAt,
        endedAt: game.endedAt,
        result: game.gameResult || null
      };

      // 投票状态（投票阶段全员可见：已投/未投，不含票型）
      const buildVoteStatus = (votesObj) => {
        const status = {};
        for (const p of players) {
          status[p.openId] = votesObj[p.openId] ? 'voted' : 'pending';
        }
        return status;
      };

      // 当前状态
      const current = {
        round: game.currentRound,
        index: carIndex,
        phase: game.currentPhase,
        teamLeaderOpenId: players[game.teamLeaderIndex] ? players[game.teamLeaderIndex].openId : null,
        failedNominations: game.failedNominations,
        forcedSend: game.failedNominations >= (rules.maxFailedNominations || 3),
        preNominatedTeam: game.preNominatedTeam || null,
        nominatedTeam: game.nominatedTeam || null,
        teamVotes: gatedTeamVotes,
        missionVotes: gatedMissionVotes,
        teamVoteStatus: game.currentPhase === 'teamVote' ? buildVoteStatus(teamVotesObj) : null,
        missionVoteStatus: game.currentPhase === 'missionVote' ? buildVoteStatus(missionVotesObj) : null,
        lakeHolderOpenId: game.lakeHolderOpenId || null,
        teamVoteResult,
        voteRevealEndAt: game.voteRevealEndAt ? new Date(game.voteRevealEndAt).getTime() : null,
        isForcedCar: game.forcedCar === 1 || game.forcedCar === true,
        speakingOrder: game.speakingOrder || 'asc',
        discussionSet: !!(game.discussionSet === 1 || game.discussionSet === true),
        lancelotResult: game.lancelotResult || null,
        lancelotConfirmedCount,
        lancelotTotalCount: playerCount,
        lakeConfirmedCount,
        lakeTotalCount: playerCount,
        revealConfirmedCount,
        revealTotalCount: playerCount,
        evilOpenEyes: game.currentPhase === 'assassination'
          ? fullPlayers
              .filter(p => EVIL_OPEN_EYES.includes(p.role))
              .map(p => ({ openId: p.openId, seatNumber: p.seatNumber, role: p.role }))
          : []
      };

      return {
        success: true,
        player,
        basic,
        players: publicPlayers,
        current,
        history: { cars, missions, lake, lancelotSwaps }
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
   * @param {boolean} forcedCar 是否为强制车
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async submitNomination(gameId, openId, nominatedTeam, forcedCar = false) {
    try {
      await db.transaction(async (connection) => {
        // 验证游戏状态和队长身份
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, team_leader_index, room_id, failed_nominations,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (!['discussion', 'preNominate'].includes(game[0].current_phase)) {
          throw new Error('当前不是发车阶段');
        }

        // 读取房间配置（流车阈值）
        const roomRows = await connection.execute('SELECT room_config FROM rooms WHERE id = ?', [game[0].room_id]);
        const roomConfig = roomRows[0].length ? parseJson(roomRows[0][0].room_config) : null;
        const rules = (roomConfig && roomConfig.rules) || {};
        const maxFailedNominations = rules.maxFailedNominations || 3;
        const isForced = game[0].failed_nominations >= maxFailedNominations;

        // 验证队长身份（与 startGame 分配队长时使用相同的座位号排序）
        const [players] = await connection.execute(
          `SELECT gp.open_id, gp.role FROM game_players gp
           WHERE gp.game_id = ?
           ORDER BY COALESCE(gp.seat_number, 999999), gp.open_id`,
          [gameId]
        );
        
        const teamLeaderIndex = game[0].team_leader_index;
        if (teamLeaderIndex >= players.length || players[teamLeaderIndex].open_id !== openId) {
          throw new Error('只有队长才能提名');
        }
        
        // 验证队伍大小
        const playerCount = parseInt(game[0].player_count, 10);
        const requiredSize = this.getTeamSize(playerCount, game[0].current_round);
        if (nominatedTeam.length !== requiredSize) {
          throw new Error(`需要${requiredSize}人`);
        }

        // 本车次索引 = 失败提名数 + 1
        const carIndex = game[0].failed_nominations + 1;

        // 强制车：跳过 teamVote，直接进入 missionVote
        if (isForced) {
          if (!forcedCar) {
            throw new Error('本局为强制车，车长必须显式携带 forcedCar=true');
          }
          // 记录本车（无队伍投票，outcome=send 直接发车；is_forced_car=TRUE 标识强制车）
          await connection.execute(
            `INSERT INTO game_cars (game_id, round, car_index, team_leader_open_id, nominated_team, team_votes, outcome, is_forced_car, created_at)
             VALUES (?, ?, ?, ?, ?, '{}', 'send', TRUE, NOW())`,
            [gameId, game[0].current_round, carIndex, openId, JSON.stringify(nominatedTeam)]
          );
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'missionVote', 
                 nominated_team = ?,
                 forced_car = TRUE,
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(nominatedTeam), gameId]
          );
        } else {
          if (forcedCar) {
            throw new Error('本局不是强制车，不能携带 forcedCar');
          }
          // 记录本车（队伍投票为空，outcome 待发车/流车填）
          await connection.execute(
            `INSERT INTO game_cars (game_id, round, car_index, team_leader_open_id, nominated_team, team_votes, outcome, created_at)
             VALUES (?, ?, ?, ?, ?, '{}', 'pending', NOW())`,
            [gameId, game[0].current_round, carIndex, openId, JSON.stringify(nominatedTeam)]
          );
          // 更新提名队伍和阶段
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'teamVote', 
                 nominated_team = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(nominatedTeam), gameId]
          );
        }
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
          `SELECT current_phase, current_round, team_leader_index, failed_nominations, nominated_team, room_id,
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

        const carIndex = game[0].failed_nominations + 1;
        
        // 检查是否已投票
        const [existingVote] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND open_id = ? AND vote_type = 'team' AND round = ? AND car_index = ?`,
          [gameId, openId, game[0].current_round, carIndex]
        );
        
        if (existingVote[0].count > 0) {
          throw new Error('已投票');
        }
        
        // 记录投票
        await connection.execute(
          `INSERT INTO votes (game_id, open_id, vote_type, vote_value, round, car_index, created_at)
           VALUES (?, ?, 'team', ?, ?, ?, NOW())`,
          [gameId, openId, vote, game[0].current_round, carIndex]
        );
        
        // 检查是否所有玩家都已投票
        const [voteCount] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND vote_type = 'team' AND round = ? AND car_index = ?`,
          [gameId, game[0].current_round, carIndex]
        );
        
        const playerCount = parseInt(game[0].player_count, 10);
        
        if (voteCount[0].count >= playerCount) {
          // 统计投票结果
          const [votes] = await connection.execute(
            `SELECT vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'team' AND round = ? AND car_index = ?`,
            [gameId, game[0].current_round, carIndex]
          );
          
          const approveCount = votes.filter(v => v.vote_value === 'approve').length;
          const rejectCount = votes.filter(v => v.vote_value === 'reject').length;
          // 从 votes 读取完整 openId→vote 快照
          const [fullVotes] = await connection.execute(
            `SELECT open_id, vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'team' AND round = ? AND car_index = ?`,
            [gameId, game[0].current_round, carIndex]
          );
          const teamVotesObj = {};
          fullVotes.forEach(v => { teamVotesObj[v.open_id] = v.vote_value; });
          
          // 归档队伍投票结果（通过=send / 否决=reject），随后进入 teamVoteReveal 展示阶段
          const outcome = approveCount > rejectCount ? 'send' : 'reject';
          await connection.execute(
            `UPDATE game_cars 
             SET team_votes = ?, outcome = ?, is_forced_car = FALSE
             WHERE game_id = ? AND round = ? AND car_index = ?`,
            [JSON.stringify(teamVotesObj), outcome, gameId, game[0].current_round, carIndex]
          );

          // 读取票型展示时长 voteRevealDuration（必配，位于 limits；无默认）
          const [roomRows] = await connection.execute(
            'SELECT room_config FROM rooms WHERE id = ?',
            [game[0].room_id]
          );
          const roomConfig = roomRows.length ? parseJson(roomRows[0].room_config) : null;
          const limitsCfg = (roomConfig && roomConfig.limits) || {};
          const revealDur = limitsCfg.voteRevealDuration;
          if (typeof revealDur !== 'number' || revealDur < 0) {
            throw new Error('未配置 voteRevealDuration');
          }

          // 进入队伍投票票型展示阶段（保留 nominated_team；通过/流车的推进由 maybeAdvanceTeamVoteReveal 处理）
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'teamVoteReveal',
                 vote_reveal_end_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                 updated_at = NOW()
             WHERE id = ?`,
            [revealDur, gameId]
          );
        }
      });
      
      return await this.getState(gameId);
    } catch (error) {
      console.error('投票失败:', error);
      throw error;
    }
  }

  /**
   * 推进超时的队伍投票票型展示阶段（teamVoteReveal）：
   * 扫描 vote_reveal_end_at 已到期的游戏，按最近归档 outcome 进入 missionVote（通过）或流车（否决）。
   * 供后端定时器（index.js setInterval）+ getState 惰性兜底调用；返回被推进的 [{gameId, roomId}]。
   */
  static async maybeAdvanceTeamVoteReveal() {
    const advanced = [];
    try {
      const rows = await db.query(
        `SELECT id, room_id, current_round, team_leader_index, failed_nominations,
                (SELECT COUNT(*) FROM game_players WHERE game_id = games.id) as player_count
         FROM games
         WHERE status = 'active' AND current_phase = 'teamVoteReveal'
           AND vote_reveal_end_at IS NOT NULL AND vote_reveal_end_at <= NOW()
         LIMIT 50`
      );
      for (const row of rows) {
        try {
          await db.transaction(async (connection) => {
            const [game] = await connection.execute(
              `SELECT id, room_id, current_round, team_leader_index, failed_nominations, nominated_team
               FROM games WHERE id = ? AND status = 'active' AND current_phase = 'teamVoteReveal'
                 AND vote_reveal_end_at IS NOT NULL AND vote_reveal_end_at <= NOW() FOR UPDATE`,
              [row.id]
            );
            if (game.length === 0) return;

            const [carRows] = await connection.execute(
              `SELECT outcome FROM game_cars WHERE game_id = ? ORDER BY round DESC, car_index DESC LIMIT 1`,
              [row.id]
            );
            if (carRows.length === 0) return;
            const outcome = carRows[0].outcome;

            if (outcome === 'send') {
              // 通过：进入任务投票阶段（保留 nominated_team）
              await connection.execute(
                `UPDATE games SET current_phase = 'missionVote', vote_reveal_end_at = NULL, updated_at = NOW() WHERE id = ?`,
                [row.id]
              );
            } else {
              // 否决：流车——队长顺延、流车数+1、进入 preNominate 或 discussion（强制车）
              const roomRows = await connection.execute('SELECT room_config FROM rooms WHERE id = ?', [game[0].room_id]);
              const roomConfig = roomRows[0].length ? parseJson(roomRows[0][0].room_config) : null;
              const rules = (roomConfig && roomConfig.rules) || {};
              const maxFailed = rules.maxFailedNominations;
              const playerCount = parseInt(row.player_count, 10);
              const failedNominations = game[0].failed_nominations + 1;
              const newTeamLeaderIndex = (game[0].team_leader_index + 1) % playerCount;
              const forcedNext = failedNominations >= maxFailed;
              const nextPhase = forcedNext ? 'discussion' : 'preNominate';
              await connection.execute(
                `UPDATE games 
                 SET current_phase = ?,
                     team_leader_index = ?,
                     failed_nominations = ?,
                     nominated_team = NULL,
                     pre_nominated_team = NULL,
                     speaking_order = 'asc',
                     discussion_set = FALSE,
                     lancelot_result = NULL,
                     forced_car = FALSE,
                     vote_reveal_end_at = NULL,
                     updated_at = NOW()
                 WHERE id = ?`,
                [nextPhase, newTeamLeaderIndex, failedNominations, row.id]
              );
            }
          });
          advanced.push({ gameId: row.id, roomId: row.room_id });
        } catch (e) {
          console.error('推进 teamVoteReveal 失败:', e.message);
        }
      }
    } catch (error) {
      console.error('maybeAdvanceTeamVoteReveal 失败:', error);
    }
    return advanced;
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
          `SELECT current_phase, current_round, team_leader_index, nominated_team, room_id, failed_nominations,
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
          throw new Error('只有红方才能破坏任务');
        }
        // 必败强制：兰斯洛特（任意，当前为 evil 时）/奥伯伦 必须投失败
        if (vote === 'success' && currentSide === 'evil') {
          const mustFail = ((role === 'lancelotBlue' || role === 'lancelotRed') && rules.lancelotMustFail) ||
                           (role === 'oberon' && rules.oberonMustFailMission);
          if (mustFail) {
            throw new Error('你当前阵营为红方，必须投失败票');
          }
        }

        const carIndex = game[0].failed_nominations + 1;
        
        // 检查是否已投票
        const [existingVote] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND open_id = ? AND vote_type = 'mission' AND round = ? AND car_index = ?`,
          [gameId, openId, game[0].current_round, carIndex]
        );
        
        if (existingVote[0].count > 0) {
          throw new Error('已投票');
        }
        
        // 记录投票
        await connection.execute(
          `INSERT INTO votes (game_id, open_id, vote_type, vote_value, round, car_index, created_at)
           VALUES (?, ?, 'mission', ?, ?, ?, NOW())`,
          [gameId, openId, vote, game[0].current_round, carIndex]
        );
        
        // 检查任务队伍成员是否都已投票
        const [voteCount] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND vote_type = 'mission' AND round = ? AND car_index = ?`,
          [gameId, game[0].current_round, carIndex]
        );

        const teamSize = nominatedTeam.length;

        if (voteCount[0].count >= teamSize) {
          // 统计投票结果
          const [votes] = await connection.execute(
            `SELECT open_id, vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'mission' AND round = ? AND car_index = ?`,
            [gameId, game[0].current_round, carIndex]
          );

          const missionVotesObj = {};
          votes.forEach(v => { missionVotesObj[v.open_id] = v.vote_value; });
          const failCount = votes.filter(v => v.vote_value === 'fail').length;

          // 判断任务是否成功（1 张坏票即失败；仅 7+ 人局第 4 轮保护轮需 2 张坏票）
          const playerCount = parseInt(game[0].player_count, 10);
          const requiresDoubleFail = playerCount >= 7 && game[0].current_round === 4;
          let success;
          if (requiresDoubleFail) {
            success = failCount < 2;
          } else {
            success = failCount === 0;
          }

          // 归档本车（发车完成）
          await connection.execute(
            `UPDATE game_cars 
             SET mission_votes = ?, mission_success = ?, outcome = 'send'
             WHERE game_id = ? AND round = ? AND car_index = ?`,
            [JSON.stringify(missionVotesObj), success, gameId, game[0].current_round, carIndex]
          );

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
                   status = 'ended',
                   ended_at = NOW(),
                   game_result = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [JSON.stringify({ winner: 'evil', reason: '红方完成3个任务' }), gameId]
            );
            await this._resetRoomAfterEnd(connection, game[0].room_id);
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
            // 进入下一回合触发链：先湖仙验人(lake)，再兰斯抽卡(lancelot)，最后 preNominate
            const newRound = game[0].current_round + 1;
            const newTeamLeaderIndex = (game[0].team_leader_index + 1) % playerCount;

            // 湖仙触发条件：启用且完成轮次在 [ladyOfTheLakeRound, 4] 且仍有未当过湖仙的玩家
            const ladyRound = parseInt(rules.ladyOfTheLakeRound, 10) || 2;
            const lakeEnabled = !!rules.ladyOfTheLake && game[0].current_round >= ladyRound && game[0].current_round <= 4;
            const [lakeUsedRows] = await connection.execute(
              `SELECT COUNT(*) as cnt FROM lake_history WHERE game_id = ? AND target_open_id IN (
                 SELECT open_id FROM game_players WHERE game_id = ?)`,
              [gameId, gameId]
            );
            const lakeUsedCount = parseInt(lakeUsedRows[0].cnt, 10);
            const lakeRemaining = lakeEnabled && lakeUsedCount < playerCount;

            // 兰斯触发条件：配置 lancelotSwapRound 且存在兰斯洛特角色且完成轮次在窗口
            const swapRound = rules.lancelotSwapRound;
            const lancelotEnabled = typeof swapRound === 'number'
              && game[0].current_round >= swapRound && game[0].current_round <= 4;
            const [lancelotPlayers] = await connection.execute(
              `SELECT COUNT(*) as cnt FROM game_players WHERE game_id = ? AND role IN ('lancelotBlue','lancelotRed')`,
              [gameId]
            );
            const hasLancelot = parseInt(lancelotPlayers[0].cnt, 10) > 0;

            // 校验湖仙是否已验完所有玩家（历史记录里的 inspector/target 都不再可查）
            const [lakeInspectorRows] = await connection.execute(
              `SELECT COUNT(*) as cnt FROM (
                 SELECT target_open_id FROM lake_history WHERE game_id = ?
                 UNION
                 SELECT inspector_open_id FROM lake_history WHERE game_id = ?
               ) t`,
              [gameId, gameId]
            );
            const lakeAllExhausted = parseInt(lakeInspectorRows[0].cnt, 10) >= playerCount;

            if (lakeRemaining && !lakeAllExhausted) {
              // 进入湖仙验人阶段（保持当前轮次，验人者=当前持有者，等待 lakeInspect）
              await connection.execute(
                `UPDATE games 
                 SET current_phase = 'lake',
                     nominated_team = NULL,
                     forced_car = FALSE,
                     updated_at = NOW()
                 WHERE id = ?`,
                [gameId]
              );
            } else if (lancelotEnabled && hasLancelot) {
              // 进入兰斯抽卡阶段：抽卡结果写 lancelot_result，等待全员确认
              const switched = await maybeLancelotSwap(connection, gameId, game[0].current_round, rules);
              await connection.execute(
                `UPDATE games 
                 SET current_phase = 'lancelot',
                     current_round = ?,
                     team_leader_index = ?,
                     nominated_team = NULL,
                     failed_nominations = 0,
                     pre_nominated_team = NULL,
                     speaking_order = 'asc',
                     discussion_set = FALSE,
                     lancelot_result = ?,
                     forced_car = FALSE,
                     updated_at = NOW()
                 WHERE id = ?`,
                [newRound, newTeamLeaderIndex, JSON.stringify({ switched: !!switched, round: game[0].current_round }), gameId]
              );
            } else {
              // 无湖仙/兰斯 → 直接进入下一轮 preNominate
              await connection.execute(
                `UPDATE games 
                 SET current_phase = 'preNominate',
                     current_round = ?,
                     team_leader_index = ?,
                     nominated_team = NULL,
                     failed_nominations = 0,
                     pre_nominated_team = NULL,
                     speaking_order = 'asc',
                     discussion_set = FALSE,
                     lancelot_result = NULL,
                     forced_car = FALSE,
                     updated_at = NOW()
                 WHERE id = ?`,
                [newRound, newTeamLeaderIndex, gameId]
              );
            }
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
   * 湖仙验人（lake → lakeConfirm）。
   * 仅当前湖仙持有者可调用；需处于 lake 阶段；必验（不可跳过）。
   * 目标须为未当过湖仙的在局玩家；结果（当前阵营）仅验人者可见（getState 门控）。
   * 记录结果并把令牌传给被查验者；随后进入 lakeConfirm 阶段等待全员确认
   * （兰斯判定与下一轮推进在 confirmLake 中完成，与兰斯洛特确认流程镜像）。
   * @param {string} gameId 游戏ID
   * @param {string} openId 湖仙持有者openId
   * @param {string} targetOpenId 被查验者openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async lakeInspect(gameId, openId, targetOpenId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, team_leader_index, lake_holder_open_id, room_id, failed_nominations,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'lake') {
          throw new Error('当前不是湖仙验人阶段');
        }

        // 校验验人者是当前湖仙持有者
        if (game[0].lake_holder_open_id !== openId) {
          throw new Error('只有湖仙持有者才能验人');
        }

        // 校验目标在局且未当过湖仙
        const [target] = await connection.execute(
          'SELECT open_id, side FROM game_players WHERE game_id = ? AND open_id = ?',
          [gameId, targetOpenId]
        );
        if (target.length === 0) {
          throw new Error('被查验者不在本局游戏中');
        }
        const [used] = await connection.execute(
          'SELECT COUNT(*) as cnt FROM lake_history WHERE game_id = ? AND (target_open_id = ? OR inspector_open_id = ?)',
          [gameId, targetOpenId, targetOpenId]
        );
        if (parseInt(used[0].cnt, 10) > 0) {
          throw new Error('该玩家已当过湖仙，不可重复查验');
        }

        // 写入验人记录（结果=目标当前阵营）
        await connection.execute(
          `INSERT INTO lake_history (game_id, round, inspector_open_id, target_open_id, result, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [gameId, game[0].current_round, openId, targetOpenId, target[0].side]
        );

        // 令牌传给被查验者
        await connection.execute(
          'UPDATE games SET lake_holder_open_id = ?, updated_at = NOW() WHERE id = ?',
          [targetOpenId, gameId]
        );

        // 进入湖仙确认阶段（保持当前轮次，兰斯判定/下一轮推进由 confirmLake 完成）
        await connection.execute(
          `UPDATE games 
           SET current_phase = 'lakeConfirm',
               nominated_team = NULL,
               updated_at = NOW()
           WHERE id = ?`,
          [gameId]
        );
        // 重置全员确认标记，供本次 lakeConfirm 阶段使用
        await connection.execute(
          'UPDATE game_players SET lake_confirmed = FALSE, lancelot_confirmed = FALSE WHERE game_id = ?',
          [gameId]
        );
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('湖仙验人失败:', error);
      throw error;
    }
  }

  /**
   * 确认湖仙查验（lakeConfirm → lancelot/preNominate）。
   * 全员确认（game_players.lake_confirmed）后：若兰斯触发则进入 lancelot（抽卡），
   * 否则进入下一轮 preNominate；幂等。
   * @param {string} gameId 游戏ID
   * @param {string} openId 玩家openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async confirmLake(gameId, openId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, team_leader_index, lake_holder_open_id, room_id, failed_nominations,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId, gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'lakeConfirm') {
          throw new Error('当前不是湖仙确认阶段');
        }

        // 校验 openId 是游戏内玩家
        const [gp] = await connection.execute(
          'SELECT open_id FROM game_players WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );
        if (gp.length === 0) {
          throw new Error('你不在本局游戏中');
        }

        // 幂等标记确认
        await connection.execute(
          'UPDATE game_players SET lake_confirmed = TRUE WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );

        const [counts] = await connection.execute(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN lake_confirmed THEN 1 ELSE 0 END) as confirmed
           FROM game_players WHERE game_id = ?`,
          [gameId]
        );
        const total = parseInt(counts[0].total, 10);
        const confirmed = parseInt(counts[0].confirmed, 10);

        // 全员确认后：判定兰斯是否触发，进入 lancelot 或下一轮 preNominate
        if (total > 0 && confirmed >= total) {
          // 读取房间规则，判定兰斯是否触发（current_round 仍是刚完成的轮次）
          const roomRows = await connection.execute('SELECT room_config FROM rooms WHERE id = ?', [game[0].room_id]);
          const roomConfig = roomRows[0].length ? parseJson(roomRows[0][0].room_config) : null;
          const rules = (roomConfig && roomConfig.rules) || {};
          const swapRound = rules.lancelotSwapRound;
          const lancelotEnabled = typeof swapRound === 'number'
            && game[0].current_round >= swapRound && game[0].current_round <= 4;
          const [lancelotPlayers] = await connection.execute(
            `SELECT COUNT(*) as cnt FROM game_players WHERE game_id = ? AND role IN ('lancelotBlue','lancelotRed')`,
            [gameId]
          );
          const hasLancelot = parseInt(lancelotPlayers[0].cnt, 10) > 0;

          const playerCount = parseInt(game[0].player_count, 10);
          const newRound = game[0].current_round + 1;
          const newTeamLeaderIndex = (game[0].team_leader_index + 1) % playerCount;

          if (lancelotEnabled && hasLancelot) {
            const switched = await maybeLancelotSwap(connection, gameId, game[0].current_round, rules);
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'lancelot',
                   current_round = ?,
                   team_leader_index = ?,
                   nominated_team = NULL,
                   failed_nominations = 0,
                   pre_nominated_team = NULL,
                   speaking_order = 'asc',
                   discussion_set = FALSE,
                   lancelot_result = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [newRound, newTeamLeaderIndex, JSON.stringify({ switched: !!switched, round: game[0].current_round }), gameId]
            );
          } else {
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'preNominate',
                   current_round = ?,
                   team_leader_index = ?,
                   nominated_team = NULL,
                   failed_nominations = 0,
                   pre_nominated_team = NULL,
                   speaking_order = 'asc',
                   discussion_set = FALSE,
                   lancelot_result = NULL,
                   updated_at = NOW()
               WHERE id = ?`,
              [newRound, newTeamLeaderIndex, gameId]
            );
          }
          await connection.execute(
            'UPDATE game_players SET lake_confirmed = FALSE, lancelot_confirmed = FALSE WHERE game_id = ?',
            [gameId]
          );
        }
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('确认湖仙查验失败:', error);
      throw error;
    }
  }

  /**
   * 确认兰斯抽卡：lancelot → preNominate（下一轮）。
   * 全员确认（game_players.lancelot_confirmed）后自动进入下一轮 preNominate；幂等。
   * @param {string} gameId 游戏ID
   * @param {string} openId 玩家openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async confirmLancelot(gameId, openId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, room_id
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'lancelot') {
          throw new Error('当前不是兰斯抽卡阶段');
        }

        // 校验 openId 是游戏内玩家
        const [gp] = await connection.execute(
          'SELECT open_id FROM game_players WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );
        if (gp.length === 0) {
          throw new Error('你不在本局游戏中');
        }

        // 幂等标记确认
        await connection.execute(
          'UPDATE game_players SET lancelot_confirmed = TRUE WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );

        const [counts] = await connection.execute(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN lancelot_confirmed THEN 1 ELSE 0 END) as confirmed
           FROM game_players WHERE game_id = ?`,
          [gameId]
        );
        const total = parseInt(counts[0].total, 10);
        const confirmed = parseInt(counts[0].confirmed, 10);

        // 全员确认后自动进入下一轮 preNominate：重置讨论态与确认标记
        if (total > 0 && confirmed >= total) {
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'preNominate',
                 pre_nominated_team = NULL,
                 speaking_order = 'asc',
                 discussion_set = FALSE,
                 lancelot_result = NULL,
                 updated_at = NOW()
             WHERE id = ?`,
            [gameId]
          );
          await connection.execute(
            'UPDATE game_players SET lake_confirmed = FALSE, lancelot_confirmed = FALSE WHERE game_id = ?',
            [gameId]
          );
        }
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('确认兰斯抽卡失败:', error);
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
   * 确认角色揭示（全员确认后自动进入 preNominate）。
   * 仅 game_players 内的玩家可确认（观战者不计入）；幂等；无强制推进。
   * @param {string} gameId 游戏ID
   * @param {string} openId 玩家openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async confirmReveal(gameId, openId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, room_id
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase !== 'roleReveal') {
          throw new Error('当前不是角色揭示阶段');
        }

        // 校验 openId 是游戏内玩家
        const [gp] = await connection.execute(
          'SELECT open_id FROM game_players WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );
        if (gp.length === 0) {
          throw new Error('你不在本局游戏中');
        }

        // 幂等标记确认
        await connection.execute(
          'UPDATE game_players SET reveal_confirmed = TRUE WHERE game_id = ? AND open_id = ?',
          [gameId, openId]
        );

        // 统计已确认 vs 总玩家数
        const [counts] = await connection.execute(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN reveal_confirmed THEN 1 ELSE 0 END) as confirmed
           FROM game_players WHERE game_id = ?`,
          [gameId]
        );
        const total = parseInt(counts[0].total, 10);
        const confirmed = parseInt(counts[0].confirmed, 10);

        // 全员确认后自动进入 preNominate（车主预选车型）：重置讨论态与确认标记
        if (total > 0 && confirmed >= total) {
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'preNominate',
                 pre_nominated_team = NULL,
                 speaking_order = 'asc',
                 discussion_set = FALSE,
                 lancelot_result = NULL,
                 updated_at = NOW()
             WHERE id = ?`,
            [gameId]
          );
          // 重置全员确认标记，供后续 lancelot 阶段复用
          await connection.execute(
            'UPDATE game_players SET reveal_confirmed = FALSE, lancelot_confirmed = FALSE, lake_confirmed = FALSE WHERE game_id = ?',
            [gameId]
          );
        }
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('确认角色揭示失败:', error);
      throw error;
    }
  }

  /**
   * 开始刺杀（进入刺杀阶段，不判定）。
   * 仅 assassin 可发起；无 assassin 时 morgana 可发起；任意阶段可调用；幂等。
   * @param {string} gameId 游戏ID
   * @param {string} killerOpenId 刺杀者openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async startAssassination(gameId, killerOpenId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, room_id
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

        // 幂等：已处于刺杀阶段则直接返回
        if (game[0].current_phase !== 'assassination') {
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'assassination',
                 updated_at = NOW()
             WHERE id = ?`,
            [gameId]
          );
        }
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('开始刺杀失败:', error);
      throw error;
    }
  }

  /**
   * 刺客刺杀梅林
   * 仅 assassin 可发起；无 assassin 时 morgana 可发起
   * 需处于 assassination 阶段，执行后必定 gameEnd
   * @param {string} gameId 游戏ID
   * @param {string} killerOpenId 刺杀者openId
   * @param {string} targetOpenId 目标openId
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async assassinate(gameId, killerOpenId, targetOpenId) {
    try {
      await db.transaction(async (connection) => {
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, failed_nominations, room_id
           FROM games WHERE id = ? FOR UPDATE`,
          [gameId]
        );

        if (game.length === 0) {
          throw new Error('游戏不存在');
        }

        if (game[0].current_phase === 'gameEnd') {
          throw new Error('游戏已结束');
        }

        if (game[0].current_phase !== 'assassination') {
          throw new Error('当前不是刺杀阶段');
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
          round: game[0].current_round,
          index: game[0].failed_nominations + 1
        };

        // 无论命中与否，执行刺杀后必定 gameEnd
        if (isMerlin) {
          await connection.execute(
            `UPDATE games 
             SET current_phase = 'gameEnd',
                 status = 'ended',
                 ended_at = NOW(),
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
                 status = 'ended',
                 ended_at = NOW(),
                 assassination = ?,
                 game_result = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(assassination),
             JSON.stringify({ winner: 'good', reason: '刺杀未命中梅林', assassination }),
             gameId]
          );
        }
        await this._resetRoomAfterEnd(connection, game[0].room_id);
      });

      return await this.getState(gameId);
    } catch (error) {
      console.error('刺杀失败:', error);
      throw error;
    }
  }

  // =============== 工具方法 ===============

  /**
   * 游戏结束后重置房间状态（自然结束/放弃时调用）。
   * 房间与游戏独立：玩家仍留在房间，可再次开局。
   * @param {Object} connection 事务连接
   * @param {string|null} roomId 房间ID
   */
  static async _resetRoomAfterEnd(connection, roomId) {
    if (!roomId) return;
    await connection.execute(
      `UPDATE rooms SET game_started = FALSE, updated_at = NOW() WHERE id = ?`,
      [roomId]
    );
    await connection.execute(
      `UPDATE room_players SET is_ready = FALSE WHERE room_id = ?`,
      [roomId]
    );
  }

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
module.exports.buildVision = buildVision;
module.exports.parseJson = parseJson;
