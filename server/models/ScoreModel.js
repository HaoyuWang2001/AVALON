// models/ScoreModel.js —— 计分制（逐局逐人明细，读时聚合）
const db = require('../config/db');
const scoring = require('../utils/scoring');

const NOT_BOT_ROOM = "COALESCE(g.room_number, g.room_id, '') <> '000000'";
const ONLINE_ONLY = "COALESCE(g.source, 'online') <> 'offline'";
const WINNER_EXPR = "JSON_UNQUOTE(JSON_EXTRACT(g.game_result, '$.winner'))";

class ScoreModel {
  /**
   * 按人数分层的阵营战绩：{ [n]: { good: {wins,games}, evil: {wins,games} } }
   */
  static async getFactionStats() {
    const rows = await db.query(
      `SELECT t.n AS n, t.winner AS winner, COUNT(*) AS c
       FROM (
         SELECT g.id AS id, ${WINNER_EXPR} AS winner, COUNT(*) AS n
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id
         WHERE g.status = 'ended' AND ${NOT_BOT_ROOM} AND ${ONLINE_ONLY}
           AND ${WINNER_EXPR} IN ('good', 'evil')
         GROUP BY g.id
       ) t
       GROUP BY t.n, t.winner`
    );
    const stats = {};
    for (const r of rows) {
      const n = Number(r.n);
      if (!stats[n]) stats[n] = { good: { wins: 0, games: 0 }, evil: { wins: 0, games: 0 } };
      const cnt = Number(r.c) || 0;
      if (r.winner === 'good' || r.winner === 'evil') stats[n][r.winner].wins += cnt;
    }
    for (const n of Object.keys(stats)) {
      const total = stats[n].good.wins + stats[n].evil.wins;
      stats[n].good.games = total;
      stats[n].evil.games = total;
    }
    return stats;
  }

  /**
   * 角色战绩：{ [role]: {wins,games} }
   */
  static async getRoleStats() {
    const rows = await db.query(
      `SELECT gp.role AS role,
              COUNT(*) AS games,
              SUM(CASE WHEN ${WINNER_EXPR} = gp.side THEN 1 ELSE 0 END) AS wins
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id
       WHERE g.status = 'ended' AND ${NOT_BOT_ROOM} AND ${ONLINE_ONLY}
         AND ${WINNER_EXPR} IN ('good', 'evil')
       GROUP BY gp.role`
    );
    const map = {};
    for (const r of rows) {
      map[r.role] = { wins: Number(r.wins) || 0, games: Number(r.games) || 0 };
    }
    return map;
  }

  // 读取对局并判断是否可计分（线上、正常结束、有胜方、非 000000）
  static async _loadEligibleGame(gameId) {
    const [game] = await db.query(
      `SELECT id, status, source, room_number, room_id, game_result FROM games WHERE id = ?`,
      [gameId]
    );
    if (!game) return null;
    let result = game.game_result;
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch (e) { result = null; }
    }
    const eligible = game.status === 'ended'
      && (game.source || 'online') !== 'offline'
      && String(game.room_number || game.room_id || '') !== '000000'
      && !!(result && result.winner && !result.abandoned);
    return { game, result, eligible };
  }

  static async _loadPlayersAndVotes(gameId) {
    const players = await db.query(
      `SELECT open_id AS openId, side, role FROM game_players WHERE game_id = ?`,
      [gameId]
    );
    const voteRows = await db.query(
      `SELECT award, target_open_id AS target, COUNT(*) AS cnt
       FROM game_award_votes
       WHERE game_id = ? AND state = 'voted' AND target_open_id IS NOT NULL
       GROUP BY award, target_open_id`,
      [gameId]
    );
    const mvpVotes = {};
    const svpVotes = {};
    for (const r of voteRows) {
      const bucket = r.award === 'mvp' ? mvpVotes : svpVotes;
      bucket[r.target] = Number(r.cnt) || 0;
    }
    return { players, mvpVotes, svpVotes };
  }

  /**
   * 计算并写入单局分数（幂等：先删后插）。不可计分时清空该局历史行。
   */
  static async computeAndSave(gameId) {
    const loaded = await this._loadEligibleGame(gameId);
    if (!loaded || !loaded.eligible) {
      await db.query('DELETE FROM game_player_scores WHERE game_id = ?', [gameId]);
      return { skipped: true, count: 0 };
    }
    const { players, mvpVotes, svpVotes } = await this._loadPlayersAndVotes(gameId);
    if (players.length < 2) {
      await db.query('DELETE FROM game_player_scores WHERE game_id = ?', [gameId]);
      return { skipped: true, count: 0 };
    }
    const [factionStats, roleStats] = await Promise.all([
      this.getFactionStats(),
      this.getRoleStats()
    ]);
    const rows = scoring.scoreGame({
      n: players.length,
      winner: loaded.result.winner,
      players,
      factionStats,
      roleStats,
      mvpVotes,
      svpVotes
    });
    await this._writeRows(gameId, rows);
    return { skipped: false, count: rows.length };
  }

  static async _writeRows(gameId, rows) {
    await db.transaction(async (connection) => {
      await connection.execute('DELETE FROM game_player_scores WHERE game_id = ?', [gameId]);
      for (const r of rows) {
        await connection.execute(
          `INSERT INTO game_player_scores
             (game_id, open_id, side, role, base, win_score, role_score, award_score, total, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [gameId, r.openId, r.side, r.role, r.base, r.winScore, r.roleScore, r.awardScore, r.total]
        );
      }
    });
  }

  /**
   * 全量回填：用当前全量统计一次性重算所有符合条件的线上历史局。
   * 批量读取玩家/票型，单事务写入（先清空再插入），幂等。
   */
  static async backfillAll() {
    const games = await db.query(
      `SELECT g.id AS id, ${WINNER_EXPR} AS winner
       FROM games g
       WHERE g.status = 'ended' AND ${NOT_BOT_ROOM} AND ${ONLINE_ONLY}
         AND ${WINNER_EXPR} IN ('good', 'evil')`
    );
    const ids = games.map(g => g.id);
    if (ids.length === 0) {
      await db.query('DELETE FROM game_player_scores');
      return { games: 0, total: 0 };
    }

    const playersByGame = new Map();
    const votesByGame = new Map();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const ph = chunk.map(() => '?').join(',');
      const prows = await db.query(
        `SELECT game_id AS gameId, open_id AS openId, side, role FROM game_players WHERE game_id IN (${ph})`,
        chunk
      );
      prows.forEach(r => {
        if (!playersByGame.has(r.gameId)) playersByGame.set(r.gameId, []);
        playersByGame.get(r.gameId).push({ openId: r.openId, side: r.side, role: r.role });
      });
      const vrows = await db.query(
        `SELECT game_id AS gameId, award, target_open_id AS target, COUNT(*) AS cnt
         FROM game_award_votes
         WHERE game_id IN (${ph}) AND state = 'voted' AND target_open_id IS NOT NULL
         GROUP BY game_id, award, target_open_id`,
        chunk
      );
      vrows.forEach(r => {
        if (!votesByGame.has(r.gameId)) votesByGame.set(r.gameId, { mvpVotes: {}, svpVotes: {} });
        const bucket = votesByGame.get(r.gameId);
        const map = r.award === 'mvp' ? bucket.mvpVotes : bucket.svpVotes;
        map[r.target] = Number(r.cnt) || 0;
      });
    }

    const [factionStats, roleStats] = await Promise.all([
      this.getFactionStats(),
      this.getRoleStats()
    ]);

    const allRows = [];
    for (const g of games) {
      const players = playersByGame.get(g.id) || [];
      if (players.length < 2) continue;
      const votes = votesByGame.get(g.id) || { mvpVotes: {}, svpVotes: {} };
      const rows = scoring.scoreGame({
        n: players.length,
        winner: g.winner,
        players,
        factionStats,
        roleStats,
        mvpVotes: votes.mvpVotes,
        svpVotes: votes.svpVotes
      });
      rows.forEach(r => allRows.push({ gameId: g.id, ...r }));
    }

    await db.transaction(async (connection) => {
      await connection.execute('DELETE FROM game_player_scores');
      for (const r of allRows) {
        await connection.execute(
          `INSERT INTO game_player_scores
             (game_id, open_id, side, role, base, win_score, role_score, award_score, total, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [r.gameId, r.openId, r.side, r.role, r.base, r.winScore, r.roleScore, r.awardScore, r.total]
        );
      }
    });
    return { games: games.length, total: games.length };
  }
}

module.exports = ScoreModel;
