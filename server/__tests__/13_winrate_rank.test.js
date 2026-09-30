const { createRoomAndStartGame, endGame, apiGet } = require('./helpers/testHelper');
const db = require('../config/db');
const GameModel = require('../models/GameModel');

// 总胜率排名：/games/stats 返回 rank（与 champions 同口径；胜率与场次均相同 → 并列同名次；机器人房 000000 排除）
describe('13 — 总胜率排名', () => {
  beforeAll(async () => { await db.initPool(); });
  afterAll(() => { GameModel._winrateThresholdCache = null; });

  it('13-1 无对局玩家 rank 为 null', async () => {
    const ghost = `test_rank_ghost_${Date.now()}`;
    const res = await apiGet(`/api/games/stats?subjectOpenId=${ghost}&viewerOpenId=${ghost}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toHaveProperty('rank');
    expect(res.body.stats.rank).toBeNull();
  });

  it('13-2 冠军榜第一名 rank 为 1（与 champions 同口径）', async () => {
    const ch = await apiGet('/api/games/stats/champions?limit=1');
    expect(ch.status).toBe(200);
    if (!ch.body.champions || ch.body.champions.length === 0) return;
    const top = ch.body.champions[0];
    const res = await apiGet(`/api/games/stats?subjectOpenId=${top.openId}&viewerOpenId=${top.openId}`);
    expect(res.body.stats.rank).toBe(1);
  });

  it('13-3 并列同名次 + 场次多者靠前（纯计算）', () => {
    const list = [
      { openId: 'A', games: 2, wins: 2 }, // 100%
      { openId: 'B', games: 2, wins: 2 }, // 100%（与 A 完全并列）
      { openId: 'C', games: 2, wins: 1 }, // 50%
      { openId: 'D', games: 4, wins: 2 }, // 50%，场次更多 → 优于 C
      { openId: 'E', games: 3, wins: 0 }  // 0%
    ];
    const R = (id) => GameModel._computeWinRateRank(list, id);
    expect(R('A')).toBe(1);
    expect(R('B')).toBe(1);        // 胜率与场次都相同 → 并列同名次
    expect(R('D')).toBe(3);        // 同为 50%，场次多者靠前
    expect(R('C')).toBe(4);
    expect(R('E')).toBe(5);
    expect(R('ZZZ')).toBeNull();   // 不在榜
  });

  it('13-4 机器人房(000000)对局不计入统计与排名', async () => {
    const g = await createRoomAndStartGame(5);
    await db.query(`UPDATE games SET game_result = ?, room_number = '000000' WHERE id = ?`, ['{"winner":"good"}', g.gameId]);
    await endGame(g.gameId);

    const p = g.players[0];
    const res = await apiGet(`/api/games/stats?subjectOpenId=${p.openId}&viewerOpenId=${p.openId}`);
    expect(res.body.stats.totalGames).toBe(0);
    expect(res.body.stats.rank).toBeNull();
  });

  it('13-5 批量接口：字段/排序/隐私/000000排除', async () => {
    const day = Date.now();
    const visibleId = `test_batch_v_${day}`;
    const hiddenId = `test_batch_h_${day}`;
    const botId = `test_batch_b_${day}`;
    const tag = day.toString(36);

    // 可见玩家：55 局全胜（> 阈值上限 50，确保必在榜）
    await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 1) ON DUPLICATE KEY UPDATE public_winrate = 1', [visibleId]);
    await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 0) ON DUPLICATE KEY UPDATE public_winrate = 0', [hiddenId]);
    for (let i = 0; i < 55; i++) {
      const gid = `bt${tag}v${i}`;
      await db.query(
        `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
         VALUES (?, NULL, '111111', ?, 'gameEnd', 'ended', ?, NOW())`,
        [gid, visibleId, JSON.stringify({ winner: 'good' })]
      );
      await db.query(
        `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
         VALUES (?, ?, 'loyal', 'good', 'V', 1)`,
        [gid, visibleId]
      );
    }
    // 未公开玩家：1 局，但 public_winrate=0
    await db.query(
      `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
       VALUES (?, NULL, '111111', ?, 'gameEnd', 'ended', ?, NOW())`,
      [`bt${tag}h0`, hiddenId, JSON.stringify({ winner: 'good' })]
    );
    await db.query(
      `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
       VALUES (?, ?, 'loyal', 'good', 'H', 1)`,
      [`bt${tag}h0`, hiddenId]
    );
    // 机器人房 000000：不计入统计
    await db.query(
      `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
       VALUES (?, NULL, '000000', ?, 'gameEnd', 'ended', ?, NOW())`,
      [`bt${tag}b0`, botId, JSON.stringify({ winner: 'good' })]
    );
    await db.query(
      `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
       VALUES (?, ?, 'loyal', 'good', 'B', 1)`,
      [`bt${tag}b0`, botId]
    );

    const res = await apiGet(`/api/games/stats/batch?openIds=${visibleId},${hiddenId},${botId}&viewerOpenId=${visibleId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const list = res.body.players;
    expect(list.length).toBe(3);
    const byId = Object.fromEntries(list.map(p => [p.openId, p]));

    for (const k of ['totalGames', 'totalWins', 'totalWinRate', 'goodGames', 'goodWins', 'goodWinRate', 'evilGames', 'evilWins', 'evilWinRate', 'rank', 'rateVisible', 'publicWinrate', 'threshold']) {
      expect(byId[visibleId]).toHaveProperty(k);
    }
    expect(byId[visibleId].totalGames).toBe(55);
    expect(byId[visibleId].totalWins).toBe(55);
    expect(byId[visibleId].totalWinRate).toBe(100);
    expect(byId[visibleId].goodGames).toBe(55);
    expect(byId[visibleId].goodWinRate).toBe(100);
    expect(byId[visibleId].evilGames).toBe(0);
    expect(byId[visibleId].rateVisible).toBe(true);
    expect(typeof byId[visibleId].rank).toBe('number');
    expect(byId[visibleId].rank).toBeGreaterThanOrEqual(1);

    expect(byId[hiddenId].rateVisible).toBe(false);
    expect(byId[hiddenId].rank).toBeNull();
    expect(byId[hiddenId].totalGames).toBe(1);

    expect(byId[botId].totalGames).toBe(0);

    // 排序：可见者在前
    expect(list[0].openId).toBe(visibleId);
    expect(list.findIndex(p => p.openId === visibleId)).toBeLessThan(list.findIndex(p => p.openId === hiddenId));
  });

  it('13-6 批量接口：无 openIds 返回空数组', async () => {
    const res = await apiGet('/api/games/stats/batch');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, players: [] });
  });
});
