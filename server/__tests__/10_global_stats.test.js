const { makeUserId, createRoom, joinRoom, toggleReady, startGame, endGame, disband, apiGet } = require('./helpers/testHelper');

// 全局统计接口：/games/stats/global 返回基础计数 + 阵营 + 角色 + 全量已结束对局
describe('10 — 全局统计', () => {
  // 造 1 局 5 人已结束游戏
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
    return start.gameId;
  }

  it('10-1 返回基础计数/阵营/角色/对局列表，含新造对局', async () => {
    const gameIds = [];
    for (let i = 0; i < 2; i++) {
      gameIds.push(await createEndedGame());
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
    expect(Array.isArray(s.roles)).toBe(true);
    // 角色聚合含本次造局的角色（5 人板必含 merlin/morgana/assassin）
    const roleKeys = s.roles.map(r => r.role);
    expect(roleKeys).toContain('merlin');
    expect(roleKeys).toContain('morgana');

    // 全量对局列表包含本次造的对局
    expect(Array.isArray(res.body.games)).toBe(true);
    const ids = res.body.games.map(g => g.id);
    for (const id of gameIds) {
      expect(ids).toContain(id);
    }
    const sample = res.body.games.find(g => g.id === gameIds[0]);
    expect(sample).toHaveProperty('roomId');
    expect(sample).toHaveProperty('playerCount');
    expect(sample).toHaveProperty('durationSeconds');
  });
});
