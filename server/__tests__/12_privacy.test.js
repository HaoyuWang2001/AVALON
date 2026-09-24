const { makeUserId, apiGet, apiPost, createRoomAndStartGame, endGame } = require('./helpers/testHelper');

// 公开胜率开关 + subjectOpenId + rateVisible + 冠军榜公开过滤
describe('12 — 隐私/公开胜率', () => {
  it('12-1 设置公开胜率开关并读取', async () => {
    const u = makeUserId();
    await apiGet(`/api/users/${u}`); // 创建用户
    const off = await apiPost(`/api/users/${u}/publicWinrate`, { public: false });
    expect(off.status).toBe(200);
    expect(off.body.success).toBe(true);
    expect(off.body.publicWinrate).toBe(0);

    const prof = await apiGet(`/api/users/${u}`);
    expect(prof.body.user.publicWinrate).toBe(0);

    const on = await apiPost(`/api/users/${u}/publicWinrate`, { public: true });
    expect(on.body.publicWinrate).toBe(1);
    const prof2 = await apiGet(`/api/users/${u}`);
    expect(prof2.body.user.publicWinrate).toBe(1);
  });

  it('12-2 /games/stats 支持 subjectOpenId 并返回 rateVisible/publicWinrate', async () => {
    const me = makeUserId();
    const other = makeUserId();
    await apiGet(`/api/users/${me}`);
    await apiPost(`/api/users/${me}/publicWinrate`, { public: false });

    // 本人查看自己 → rateVisible true
    const self = await apiGet(`/api/games/stats?subjectOpenId=${me}&viewerOpenId=${me}`);
    expect(self.body.success).toBe(true);
    expect(self.body.stats.rateVisible).toBe(true);

    // 他人查看未公开者 → rateVisible false
    const otherView = await apiGet(`/api/games/stats?subjectOpenId=${me}&viewerOpenId=${other}`);
    expect(otherView.body.stats.rateVisible).toBe(false);
    expect(otherView.body.stats.publicWinrate).toBe(0);

    // 兼容旧 openId 参数（subjectOpenId 缺省时）
    const legacy = await apiGet(`/api/games/stats?openId=${me}`);
    expect(legacy.body.success).toBe(true);
  });

  it('12-3 冠军榜排除未公开用户', async () => {
    const g = await createRoomAndStartGame(5);
    await endGame(g.gameId);
    const target = g.players[0].openId;
    await apiGet(`/api/users/${target}`);
    await apiPost(`/api/users/${target}/publicWinrate`, { public: false });

    const res = await apiGet('/api/games/stats/champions?minGames=1&limit=20');
    expect(res.body.success).toBe(true);
    const ids = res.body.champions.map(c => c.openId);
    expect(ids).not.toContain(target);
    // 其余公开玩家仍可能出现（列表不必为空）
    for (const c of res.body.champions) {
      expect(c.openId).not.toBe(target);
    }
  });
});
