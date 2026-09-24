const { createRoomAndStartGame, endGame, apiGet } = require('./helpers/testHelper');

// 胜率冠军接口：/games/stats/champions 全局按总胜率排名（最少场次门槛）
describe('11 — 胜率冠军', () => {
  it('11-1 返回冠军列表（含 winRate/games），按胜率降序，门槛生效', async () => {
    // 造一局产生玩家对局数据
    const g = await createRoomAndStartGame(5);
    await endGame(g.gameId);

    const res = await apiGet('/api/games/stats/champions?minGames=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.champions)).toBe(true);
    expect(res.body.champions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.champions.length).toBeLessThanOrEqual(5);

    const c = res.body.champions[0];
    expect(c).toHaveProperty('openId');
    expect(c).toHaveProperty('nickName');
    expect(c).toHaveProperty('games');
    expect(c).toHaveProperty('wins');
    expect(c).toHaveProperty('winRate');
    expect(typeof c.winRate).toBe('number');
    expect(c.games).toBeGreaterThanOrEqual(1);

    // 胜率降序
    for (let i = 1; i < res.body.champions.length; i++) {
      expect(res.body.champions[i - 1].winRate).toBeGreaterThanOrEqual(res.body.champions[i].winRate);
    }
  });

  it('11-2 门槛过高时无结果', async () => {
    const res = await apiGet('/api/games/stats/champions?minGames=999999');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.champions.length).toBe(0);
  });
});
