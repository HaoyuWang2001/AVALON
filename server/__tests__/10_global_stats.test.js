const { makeUserId, createRoom, joinRoom, toggleReady, startGame, endGame, disband, createRoomAndStartGame, apiGet } = require('./helpers/testHelper');

// 全局统计接口：/games/stats/global 返回基础计数 + 阵营 + 角色 + 全量已结束对局
describe('10 — 全局统计', () => {
  // 造 1 局 5 人已结束游戏（并解散房间，验证 room_number 快照不随房间删除变化）
  async function createEndedGame() {
    const hostId = makeUserId();
    const createResult = await createRoom(hostId, 'GH' + hostId.slice(-6));
    expect(createResult.success).toBe(true);
    const roomId = createResult.roomId;

    for (let i = 2; i <= 5; i++) {
      const r = await joinRoom(roomId, makeUserId(), i, 'P' + i);
      expect(r.success).toBe(true);
    }
    // 房主也需 ready（joinRoom 时房主 seat=1 已存在）
    const room = (await apiGet(`/api/rooms/${roomId}`)).body.room;
    for (const p of room.players) {
      await toggleReady(roomId, p.openId, true);
    }
    const start = await startGame(roomId, hostId);
    expect(start.success).toBe(true);
    const end = await endGame(start.gameId);
    expect(end.success).toBe(true);
    const dis = await disband(roomId, hostId);
    expect(dis.success).toBe(true);
    return { gameId: start.gameId, roomId };
  }

  it('10-1 返回基础计数/阵营/角色/对局列表，含新造对局', async () => {
    const created = [];
    for (let i = 0; i < 2; i++) {
      created.push(await createEndedGame());
    }

    const res = await apiGet('/api/games/stats/global');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const s = res.body.stats;
    expect(s).toBeTruthy();
    expect(s.games.completed).toBeGreaterThanOrEqual(2);
    expect(s.games.total).toBeGreaterThanOrEqual(s.games.completed);
    expect(typeof s.rooms.total).toBe('number');
    expect(typeof s.players.total).toBe('number');
    expect(typeof s.users.total).toBe('number');
    expect(typeof s.faction.goodWinRate).toBe('number');
    expect(typeof s.faction.evilWinRate).toBe('number');
    // 计数必须为数值（防止 MySQL 返回字符串导致胜率算错）
    expect(typeof s.faction.goodGames).toBe('number');
    expect(typeof s.faction.evilGames).toBe('number');
    const decided = s.faction.goodGames + s.faction.evilGames;
    if (decided > 0) {
      expect(Math.abs(s.faction.goodWinRate - s.faction.goodGames / decided * 100)).toBeLessThan(0.2);
      expect(Math.abs(s.faction.evilWinRate - s.faction.evilGames / decided * 100)).toBeLessThan(0.2);
    }
    expect(Array.isArray(s.roles)).toBe(true);
    // 角色聚合含本次造局的角色（5 人板必含 merlin/morgana/assassin）
    const roleKeys = s.roles.map(r => r.role);
    expect(roleKeys).toContain('merlin');
    expect(roleKeys).toContain('morgana');

    // 全量对局列表包含本次造的对局
    expect(Array.isArray(res.body.games)).toBe(true);
    const ids = res.body.games.map(g => g.id);
    for (const c of created) {
      expect(ids).toContain(c.gameId);
    }
    const sample = res.body.games.find(g => g.id === created[0].gameId);
    expect(sample).toHaveProperty('playerCount');
    expect(sample).toHaveProperty('durationSeconds');
    // room_number 快照：房间已解散（room_id 置 NULL），但 room_number 仍保留原房间号
    expect(sample.roomId).toBeNull();
    expect(sample.roomNumber).toBe(created[0].roomId);
  });

  it('10-2 忠臣(平民)按局去重：一局多个忠臣只计 1 次', async () => {
    const loyalGamesBefore = await getRoleGamesCount('loyal');

    // 8 人标准板含 3 个忠臣
    const g = await createRoomAndStartGame(8);
    expect(g.players.filter(p => p.role === 'loyal').length).toBe(3);
    await endGame(g.gameId);
    await disband(g.roomId, g.hostId);

    const loyalGamesAfter = await getRoleGamesCount('loyal');
    // 该局仅让忠臣出场次数 +1（而非 +3）
    expect(loyalGamesAfter - loyalGamesBefore).toBe(1);
  });

  it('10-3 角色对局接口：返回含该角色的全部已结束对局', async () => {
    const g = await createRoomAndStartGame(8);
    await endGame(g.gameId);
    await disband(g.roomId, g.hostId);

    const res = await apiGet('/api/games/stats/role-games?role=loyal');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.role).toBe('loyal');
    expect(Array.isArray(res.body.games)).toBe(true);
    const ids = res.body.games.map(x => x.id);
    expect(ids).toContain(g.gameId);
    const sample = res.body.games.find(x => x.id === g.gameId);
    expect(sample.playerCount).toBe(8);
    // 去重：同一局只出现一次
    expect(ids.filter(id => id === g.gameId).length).toBe(1);

    // 非法角色 → 400
    const bad = await apiGet('/api/games/stats/role-games?role=bogus');
    expect(bad.status).toBe(400);
  });
});

async function getRoleGamesCount(role) {
  const res = await apiGet('/api/games/stats/global');
  const r = (res.body.stats.roles || []).find(x => x.role === role);
  return r ? r.games : 0;
}
