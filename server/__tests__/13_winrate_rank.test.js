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
});
