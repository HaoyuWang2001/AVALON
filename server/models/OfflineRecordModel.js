// 线下对局记录数据模型
// 草稿态存 offline_records / offline_record_players；「记录完成」时物化为 games + 子表
// （status='ended'、source='offline'），自动并入历史/统计/游戏页只读回放。
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { classifyBoard } = require('../utils/boardType');
const GameModel = require('./GameModel');
const RoomModel = require('./RoomModel');

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (e) { return null; }
  }
  return value;
}

class OfflineRecordModel {
  /**
   * 创建线下记录（给定配置，进入记录模式）
   * @param {string} openId 创建者（房主）
   * @param {Object} roomConfig 与房间 roomConfig 同构（含 roles/rules）
   */
  static async create(openId, roomConfig) {
    RoomModel.validateRoomConfig(roomConfig);

    const roles = [...roomConfig.roles.good, ...roomConfig.roles.evil];
    const playerCount = roles.length;
    if (![5, 6, 7, 8, 9, 10, 11, 12].includes(playerCount)) {
      throw new Error('玩家总数需在 5-12 之间');
    }

    const recordId = uuidv4();
    const boardType = classifyBoard(roomConfig.roles, roomConfig.rules || {}, playerCount);
    await db.query(
      `INSERT INTO offline_records (id, owner_open_id, room_config, board_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'recording', NOW(), NOW())`,
      [recordId, openId, JSON.stringify(roomConfig), boardType]
    );
    return this.getDetail(recordId, openId);
  }

  /**
   * 我的记录列表（我创建的 + 我参与的）
   */
  static async list(openId) {
    const rows = await db.query(
      `SELECT r.id, r.owner_open_id AS ownerOpenId, r.board_type AS boardType, r.status,
              r.game_id AS gameId, r.created_at AS createdAt, r.completed_at AS completedAt,
              r.room_config AS roomConfig,
              (SELECT seat_number FROM offline_record_players p WHERE p.record_id = r.id AND p.open_id = ?) AS mySeat,
              (SELECT seat_status FROM offline_record_players p WHERE p.record_id = r.id AND p.open_id = ?) AS mySeatStatus
       FROM offline_records r
       WHERE r.owner_open_id = ?
          OR EXISTS (SELECT 1 FROM offline_record_players p WHERE p.record_id = r.id AND p.open_id = ?)
       ORDER BY r.created_at DESC`,
      [openId, openId, openId, openId]
    );

    const seatRows = await db.query(
      `SELECT record_id, seat_status FROM offline_record_players
       WHERE record_id IN (${rows.map(() => '?').join(',') || "''"})`,
      rows.map(r => r.id)
    );
    const seatMap = {};
    seatRows.forEach(s => {
      if (!seatMap[s.record_id]) seatMap[s.record_id] = { approved: 0, pending: 0 };
      if (s.seat_status === 'approved') seatMap[s.record_id].approved++;
      else seatMap[s.record_id].pending++;
    });

    return rows.map(r => {
      const cfg = parseJson(r.roomConfig) || {};
      return {
        id: r.id,
        isOwner: r.ownerOpenId === openId,
        ownerOpenId: r.ownerOpenId,
        status: r.status,
        boardType: r.boardType,
        playerCount: (cfg.roles && cfg.roles.good.length + cfg.roles.evil.length) || 0,
        gameId: r.gameId,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        mySeat: r.mySeat,
        mySeatStatus: r.mySeatStatus,
        seats: seatMap[r.id] || { approved: 0, pending: 0 }
      };
    });
  }

  /** 载入记录（含解析），不存在抛错 */
  static async _load(recordId) {
    const [row] = await db.query('SELECT * FROM offline_records WHERE id = ?', [recordId]);
    if (!row) throw new Error('记录不存在');
    const record = {
      id: row.id,
      ownerOpenId: row.owner_open_id,
      roomConfig: parseJson(row.room_config),
      boardType: row.board_type,
      status: row.status,
      rounds: parseJson(row.rounds),
      gameId: row.game_id,
      createdAt: row.created_at,
      completedAt: row.completed_at
    };
    record.playerCount = (record.roomConfig && record.roomConfig.roles)
      ? record.roomConfig.roles.good.length + record.roomConfig.roles.evil.length : 0;
    return record;
  }

  /** 记录内玩家（按座位排序） */
  static async _players(recordId) {
    const rows = await db.query(
      `SELECT open_id AS openId, nick_name AS nickName, avatar_url AS avatarUrl,
              seat_number AS seatNumber, seat_status AS seatStatus, role, role_source AS roleSource
       FROM offline_record_players WHERE record_id = ? ORDER BY seat_number`,
      [recordId]
    );
    return rows.map(r => ({ ...r, avatarUrl: parseJson(r.avatarUrl) || r.avatarUrl }));
  }

  /**
   * 记录详情（防剧透门控）：
   * - recording：房主仅见 role_source='host' 的身份；玩家仅见自己；rounds 仅房主可见
   * - completed：全部可见
   */
  static async getDetail(recordId, openId) {
    const record = await this._load(recordId);
    const players = await this._players(recordId);
    const isOwner = record.ownerOpenId === openId;
    const isParticipant = players.some(p => p.openId === openId);
    if (!isOwner && !isParticipant) throw new Error('无权查看该记录');

    const completed = record.status === 'completed';
    const gated = players.map(p => {
      const canSee = completed || (isOwner && p.roleSource === 'host') || p.openId === openId;
      return {
        openId: p.openId,
        nickName: p.nickName,
        avatarUrl: p.avatarUrl,
        seatNumber: p.seatNumber,
        seatStatus: p.seatStatus,
        role: canSee ? p.role : null,
        roleSource: canSee ? p.roleSource : null
      };
    });

    const me = players.find(p => p.openId === openId) || null;

    // 已完成：附带对局结果（所有参与者可见的摘要）
    let result = null;
    if (record.status === 'completed' && record.gameId) {
      const [g] = await db.query(
        'SELECT game_result AS result FROM games WHERE id = ?',
        [record.gameId]
      );
      if (g && g.result) {
        const parsed = typeof g.result === 'string' ? parseJson(g.result) : g.result;
        result = parsed ? { winner: parsed.winner || null, reason: parsed.reason || '' } : null;
      }
    }

    return {
      id: record.id,
      isOwner,
      ownerOpenId: record.ownerOpenId,
      status: record.status,
      boardType: record.boardType,
      roomConfig: record.roomConfig,
      playerCount: record.playerCount,
      gameId: record.gameId,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      result,
      me: me ? { seatNumber: me.seatNumber, seatStatus: me.seatStatus, role: me.role, roleSource: me.roleSource } : null,
      players: gated,
      rounds: (isOwner || completed) ? record.rounds : null
    };
  }

  /**
   * 玩家入座：
   * - invited=true（房主分享带座位邀请）：确认即 approved，无需房主再同意
   * - 自选座位：pending 待房主同意；房主本人入座直接 approved
   */
  static async joinSeat(recordId, openId, seat, userInfo, invited) {
    const record = await this._load(recordId);
    if (record.status !== 'recording') throw new Error('记录已完成');
    if (!Number.isInteger(seat) || seat < 1 || seat > record.playerCount) throw new Error('座位号无效');

    const players = await this._players(recordId);
    const mine = players.find(p => p.openId === openId);
    if (mine) {
      if (mine.seatNumber === seat) return this.getDetail(recordId, openId);
      throw new Error('你已在该记录的其他座位上');
    }
    if (players.some(p => p.seatNumber === seat)) throw new Error(`${seat}号座位已被占用`);

    // 昵称/头像：优先请求携带，回退 users 表
    let nickName = userInfo && userInfo.nickName;
    let avatarUrl = userInfo && userInfo.avatarUrl;
    if (!nickName || !avatarUrl) {
      const [u] = await db.query(
        'SELECT COALESCE(NULLIF(custom_nick_name, \'\'), NULLIF(wx_nick_name, \'\')) AS nick, avatar_url FROM users WHERE open_id = ?',
        [openId]
      );
      if (u) {
        nickName = nickName || u.nick;
        avatarUrl = avatarUrl || u.avatar_url;
      }
    }

    const seatStatus = (invited || record.ownerOpenId === openId) ? 'approved' : 'pending';
    await db.query(
      `INSERT INTO offline_record_players (record_id, open_id, nick_name, avatar_url, seat_number, seat_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [recordId, openId, nickName || '匿名玩家', avatarUrl || null, seat, seatStatus]
    );
    return this.getDetail(recordId, openId);
  }

  /** 房主审批自选座位 */
  static async respondSeat(recordId, ownerOpenId, targetOpenId, approve) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    if (record.status !== 'recording') throw new Error('记录已完成');

    if (approve) {
      const result = await db.query(
        'UPDATE offline_record_players SET seat_status = ? WHERE record_id = ? AND open_id = ? AND seat_status = ?',
        ['approved', recordId, targetOpenId, 'pending']
      );
      if (!result.affectedRows) throw new Error('该玩家没有待审批的入座申请');
    } else {
      const result = await db.query(
        'DELETE FROM offline_record_players WHERE record_id = ? AND open_id = ? AND seat_status = ?',
        [recordId, targetOpenId, 'pending']
      );
      if (!result.affectedRows) throw new Error('该玩家没有待审批的入座申请');
    }
    return this.getDetail(recordId, ownerOpenId);
  }

  /** 房主直接指定玩家入座（好友/搜索，直接 approved） */
  static async assignPlayer(recordId, ownerOpenId, targetOpenId, seat) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    if (record.status !== 'recording') throw new Error('记录已完成');
    if (!Number.isInteger(seat) || seat < 1 || seat > record.playerCount) throw new Error('座位号无效');

    const players = await this._players(recordId);
    const mine = players.find(p => p.openId === targetOpenId);
    if (mine && mine.seatNumber === seat) return this.getDetail(recordId, ownerOpenId);
    if (mine) throw new Error('该玩家已在其他座位上');
    if (players.some(p => p.seatNumber === seat)) throw new Error(`${seat}号座位已被占用`);

    const [u] = await db.query(
      'SELECT COALESCE(NULLIF(custom_nick_name, \'\'), NULLIF(wx_nick_name, \'\')) AS nick, avatar_url FROM users WHERE open_id = ?',
      [targetOpenId]
    );
    if (!u) throw new Error('玩家不存在');

    await db.query(
      `INSERT INTO offline_record_players (record_id, open_id, nick_name, avatar_url, seat_number, seat_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'approved', NOW())`,
      [recordId, targetOpenId, u.nick || '匿名玩家', u.avatar_url, seat]
    );
    return this.getDetail(recordId, ownerOpenId);
  }

  /** 房主移除玩家（腾出座位与身份） */
  static async removePlayer(recordId, ownerOpenId, targetOpenId) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    if (targetOpenId === ownerOpenId) throw new Error('房主不能移除自己，可删除整条记录');
    const result = await db.query(
      'DELETE FROM offline_record_players WHERE record_id = ? AND open_id = ?',
      [recordId, targetOpenId]
    );
    if (!result.affectedRows) throw new Error('玩家不在此记录中');
    return this.getDetail(recordId, ownerOpenId);
  }

  /** 玩家自行退出（仅 recording） */
  static async leave(recordId, openId) {
    const record = await this._load(recordId);
    if (record.ownerOpenId === openId) throw new Error('房主不能退出，可删除整条记录');
    if (record.status !== 'recording') throw new Error('记录已完成');
    const result = await db.query(
      'DELETE FROM offline_record_players WHERE record_id = ? AND open_id = ?',
      [recordId, openId]
    );
    if (!result.affectedRows) throw new Error('你不在此记录中');
    return { success: true };
  }

  /**
   * 设置身份：
   * - 无 targetOpenId：玩家自选自己的身份（无需房主同意）
   * - 房主可为任意已入座玩家指定/改派；role=null 表示清除
   */
  static async setRole(recordId, openId, targetOpenId, role) {
    const record = await this._load(recordId);
    if (record.status !== 'recording') throw new Error('记录已完成');

    const target = targetOpenId || openId;
    if (target !== openId) this._assertOwner(record, openId);

    const players = await this._players(recordId);
    const p = players.find(x => x.openId === target);
    if (!p) throw new Error('玩家不在此记录中');
    if (p.seatStatus !== 'approved') throw new Error('玩家尚未入座（待房主同意）');

    if (role === null || role === undefined || role === '') {
      await db.query('UPDATE offline_record_players SET role = NULL, role_source = NULL WHERE record_id = ? AND open_id = ?',
        [recordId, target]);
      return this.getDetail(recordId, openId);
    }

    const allRoles = [...record.roomConfig.roles.good, ...record.roomConfig.roles.evil];
    if (!allRoles.includes(role)) throw new Error('该身份不在本板配置中');
    const taken = players.find(x => x.role === role && x.openId !== target);
    if (taken) throw new Error('该身份已被分配');

    const roleSource = (target === openId && record.ownerOpenId !== openId) ? 'self' : 'host';
    // 房主给自己设置也记 host（视角上无差别）
    await db.query(
      'UPDATE offline_record_players SET role = ?, role_source = ? WHERE record_id = ? AND open_id = ?',
      [role, roleSource, recordId, target]
    );
    return this.getDetail(recordId, openId);
  }

  /**
   * 保存轮次记录（仅房主，仅 recording）。结构：
   * { firstLeaderOpenId, firstLakeHolderOpenId?,
   *   cars: [{round, carIndex, leaderOpenId, team:[], forced, votes:{}|null, mission:{votes:{}}|null}],
   *   lake: [{round, inspectorOpenId, targetOpenId, result}],
   *   lancelot: [{round, switched}],
   *   assassination: {killerOpenId, targetOpenId}|null }
   */
  static async saveRounds(recordId, ownerOpenId, rounds) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    if (record.status !== 'recording') throw new Error('记录已完成');

    await db.query('UPDATE offline_records SET rounds = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(rounds || null), recordId]);
    return this.getDetail(recordId, ownerOpenId);
  }

  /**
   * 校验轮次并推导结果（内部公共校验：finish 与测试复用）
   * @returns {{winner, reason, assassination, missions:[{round,success,failCount,team}], cars, lastRound}}
   */
  static _resolveOutcome(record, players) {
    const rounds = record.rounds;
    if (!rounds || !Array.isArray(rounds.cars) || rounds.cars.length === 0) {
      throw new Error('轮次记录为空');
    }
    const approved = players.filter(p => p.seatStatus === 'approved');
    const approvedIds = new Set(approved.map(p => p.openId));
    const N = record.playerCount;
    const isPlayer = id => approvedIds.has(id);

    if (!isPlayer(rounds.firstLeaderOpenId)) throw new Error('首车主无效');

    // 按轮分组校验车队
    const byRound = {};
    for (const car of rounds.cars) {
      if (!Number.isInteger(car.round) || car.round < 1 || car.round > 5) throw new Error('发车轮次无效');
      if (!byRound[car.round]) byRound[car.round] = [];
      byRound[car.round].push(car);
    }
    const sortedRounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    if (sortedRounds[0] !== 1) throw new Error('轮次需从第1轮开始');
    for (let i = 0; i < sortedRounds.length; i++) {
      if (sortedRounds[i] !== i + 1) throw new Error('轮次不连续');
    }

    const missions = [];
    for (const r of sortedRounds) {
      const cars = byRound[r].slice().sort((a, b) => (a.carIndex || 1) - (b.carIndex || 1));
      for (let i = 0; i < cars.length; i++) {
        if ((cars[i].carIndex || 1) !== i + 1) throw new Error(`第${r}轮车次编号不连续`);
        const car = cars[i];
        if (!isPlayer(car.leaderOpenId)) throw new Error(`第${r}轮第${i + 1}车车主无效`);
        const teamSize = GameModel.getTeamSize(N, r);
        const team = car.team || [];
        if (team.length !== teamSize) throw new Error(`第${r}轮车队人数应为${teamSize}人`);
        if (!team.every(isPlayer) || new Set(team).size !== team.length) throw new Error(`第${r}轮车队成员无效`);

        if (car.forced) {
          // 强制车：直接发车，无票型
          if (!car.mission || !car.mission.votes) throw new Error(`第${r}轮强制车缺少任务票`);
        } else {
          const votes = car.votes || {};
          const voterIds = Object.keys(votes);
          if (voterIds.length !== approved.length || !voterIds.every(isPlayer)) {
            throw new Error(`第${r}轮第${i + 1}车票型不完整（需全员投票）`);
          }
          if (!voterIds.every(v => votes[v] === 'approve' || votes[v] === 'reject')) throw new Error('票型取值无效');
          const approve = voterIds.filter(v => votes[v] === 'approve').length;
          const sent = approve > voterIds.length - approve;
          if (!sent && car.mission) throw new Error(`第${r}轮流车的任务票不应存在`);
          if (sent && (!car.mission || !car.mission.votes)) throw new Error(`第${r}轮第${i + 1}车缺少任务票`);
        }

        if (car.mission && car.mission.votes) {
          const mv = car.mission.votes;
          const mvIds = Object.keys(mv);
          if (mvIds.length !== team.length || !mvIds.every(t => team.includes(t))) throw new Error('任务票应覆盖且仅覆盖车队成员');
          if (!mvIds.every(v => mv[v] === 'success' || mv[v] === 'fail')) throw new Error('任务票取值无效');
          const failCount = mvIds.filter(v => mv[v] === 'fail').length;
          const threshold = (r === 4 && N >= 7) ? 2 : 1;
          const success = failCount < threshold;
          missions.push({ round: r, success, failCount, team });
        }
      }
      // 每轮最多一个任务结果；发车后该轮不再有后续车
      if (missions.filter(m => m.round === r).length > 1) throw new Error(`第${r}轮出现多个任务结果`);
    }

    const failMissions = missions.filter(m => !m.success).length;
    const successMissions = missions.filter(m => m.success).length;
    const lastRound = missions.length ? missions[missions.length - 1].round : sortedRounds[sortedRounds.length - 1];

    // 湖仙/兰斯（若填写则做基础校验）
    const rules = (record.roomConfig && record.roomConfig.rules) || {};
    if (Array.isArray(rounds.lake)) {
      for (const l of rounds.lake) {
        if (!isPlayer(l.inspectorOpenId) || !isPlayer(l.targetOpenId)) throw new Error('湖仙验人记录无效');
        if (l.result !== 'good' && l.result !== 'evil') throw new Error('湖仙验人结果无效');
      }
    }
    const hasLancelot = [...record.roomConfig.roles.good, ...record.roomConfig.roles.evil].some(x => x === 'lancelotBlue' || x === 'lancelotRed');
    if (Array.isArray(rounds.lancelot) && !hasLancelot && rounds.lancelot.length > 0) {
      throw new Error('本板无兰斯洛特，不应记录转换');
    }

    // 胜负推导
    if (failMissions >= 3) {
      return { winner: 'evil', reason: '红方完成3个任务', missions, lastRound };
    }
    if (successMissions >= 3) {
      const allRoles = [...record.roomConfig.roles.good, ...record.roomConfig.roles.evil];
      const hasKiller = allRoles.includes('assassin') || allRoles.includes('morgana');
      if (!hasKiller) {
        return { winner: 'good', reason: '蓝方完成3个任务', missions, lastRound };
      }
      const asn = rounds.assassination;
      if (!asn || !isPlayer(asn.killerOpenId) || !isPlayer(asn.targetOpenId)) throw new Error('缺少刺杀记录');
      const targetRole = (approved.find(p => p.openId === asn.targetOpenId) || {}).role;
      const correct = targetRole === 'merlin';
      const assassination = {
        killer: asn.killerOpenId, target: asn.targetOpenId, correct,
        phase: 'assassination', round: lastRound, index: 1
      };
      return correct
        ? { winner: 'evil', reason: '刺杀命中梅林', missions, lastRound, assassination }
        : { winner: 'good', reason: '刺杀未命中梅林', missions, lastRound, assassination };
    }
    throw new Error('对局尚未分出胜负（需3次任务失败或3次任务成功）');
  }

  /** 记录完成：物化进 games（幂等：gameId 稳定，子表删重建） */
  static async finish(recordId, ownerOpenId) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    if (record.status !== 'recording') throw new Error('记录已完成');

    const players = await this._players(recordId);
    const approved = players.filter(p => p.seatStatus === 'approved');
    if (approved.length !== record.playerCount) {
      throw new Error(`座位未满（${approved.length}/${record.playerCount}）`);
    }
    const configRoles = [...record.roomConfig.roles.good, ...record.roomConfig.roles.evil].sort();
    const assignedRoles = approved.map(p => p.role).filter(Boolean).sort();
    if (configRoles.join(',') !== assignedRoles.join(',')) throw new Error('身份未全部分配');

    const outcome = this._resolveOutcome(record, players);

    const gameId = record.gameId || uuidv4();
    await db.transaction(async (connection) => {
      // 重建 games 行（编辑后再完成：保留原 id 与 created_at）
      await connection.execute('DELETE FROM games WHERE id = ?', [gameId]);
      await connection.execute(
        `INSERT INTO games (id, room_id, room_number, room_config_snapshot, board_type, source, owner_id,
                            current_phase, current_round, team_leader_index, failed_nominations,
                            speaking_order, assassination, game_result, status, created_at, ended_at, updated_at)
         VALUES (?, NULL, NULL, ?, ?, 'offline', ?, 'gameEnd', ?, 0, 0, 'asc', ?, ?, 'ended', NOW(), NOW(), NOW())`,
        [gameId, JSON.stringify(record.roomConfig), record.boardType, record.ownerOpenId,
         outcome.lastRound,
         outcome.assassination ? JSON.stringify(outcome.assassination) : null,
         JSON.stringify(Object.assign({ winner: outcome.winner, reason: outcome.reason },
           outcome.assassination ? { assassination: outcome.assassination } : {}))]
      );

      // game_players（座位/昵称/身份快照）
      for (const p of approved) {
        await connection.execute(
          `INSERT INTO game_players (game_id, open_id, role, side, nick_name, avatar_url, seat_number, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [gameId, p.openId, p.role, GameModel.getRoleSide(p.role), p.nickName || null, p.avatarUrl || null, p.seatNumber]
        );
      }

      // game_cars + mission_results
      for (const car of record.rounds.cars) {
        const votes = car.forced ? {} : (car.votes || {});
        const approve = Object.values(votes).filter(v => v === 'approve').length;
        const reject = Object.values(votes).filter(v => v === 'reject').length;
        const outcome_ = car.forced ? 'send' : (approve > reject ? 'send' : 'reject');
        const missionVotes = (outcome_ === 'send' && car.mission && car.mission.votes) ? car.mission.votes : null;
        const failCount = missionVotes ? Object.values(missionVotes).filter(v => v === 'fail').length : 0;
        await connection.execute(
          `INSERT INTO game_cars (game_id, round, car_index, team_leader_open_id, nominated_team, team_votes,
                                  outcome, is_forced_car, mission_votes, mission_success, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [gameId, car.round, car.carIndex || 1, car.leaderOpenId,
           JSON.stringify(car.team || []), JSON.stringify(votes),
           outcome_, car.forced ? 1 : 0,
           missionVotes ? JSON.stringify(missionVotes) : null,
           missionVotes ? (failCount < ((car.round === 4 && record.playerCount >= 7) ? 2 : 1) ? 1 : 0) : null]
        );
      }
      for (const m of outcome.missions) {
        await connection.execute(
          `INSERT INTO mission_results (game_id, round, success, fail_count, team, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [gameId, m.round, m.success ? 1 : 0, m.failCount, JSON.stringify(m.team)]
        );
      }

      // 湖仙 / 兰斯
      for (const l of (record.rounds.lake || [])) {
        await connection.execute(
          `INSERT INTO lake_history (game_id, round, inspector_open_id, target_open_id, result, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [gameId, l.round, l.inspectorOpenId, l.targetOpenId, l.result]
        );
      }
      for (const s of (record.rounds.lancelot || [])) {
        await connection.execute(
          `INSERT INTO lancelot_swap_history (game_id, round, switched, created_at)
           VALUES (?, ?, ?, NOW())`,
          [gameId, s.round, s.switched ? 1 : 0]
        );
      }

      await connection.execute(
        `UPDATE offline_records SET status = 'completed', game_id = ?, completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [gameId, recordId]
      );
    });

    return { success: true, gameId };
  }

  /** 重开草稿（编辑已完成的记录；games 行保留至下次完成时重建） */
  static async reopen(recordId, ownerOpenId) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    if (record.status !== 'completed') throw new Error('记录尚未完成');
    await db.query(
      `UPDATE offline_records SET status = 'recording', completed_at = NULL, updated_at = NOW() WHERE id = ?`,
      [recordId]
    );
    return this.getDetail(recordId, ownerOpenId);
  }

  /** 删除记录（连同物化对局与子表） */
  static async remove(recordId, ownerOpenId) {
    const record = await this._load(recordId);
    this._assertOwner(record, ownerOpenId);
    await db.transaction(async (connection) => {
      if (record.gameId) {
        await connection.execute('DELETE FROM lancelot_swap_history WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM lake_history WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM mission_results WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM game_cars WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM votes WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM game_identity_marks WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM game_players WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM game_award_votes WHERE game_id = ?', [record.gameId]);
        await connection.execute('DELETE FROM games WHERE id = ?', [record.gameId]);
      }
      await connection.execute('DELETE FROM offline_record_players WHERE record_id = ?', [recordId]);
      await connection.execute('DELETE FROM offline_records WHERE id = ?', [recordId]);
    });
    return { success: true };
  }

  static _assertOwner(record, openId) {
    if (record.ownerOpenId !== openId) throw new Error('仅房主可操作');
  }
}

module.exports = OfflineRecordModel;
