const {
  createRoomAndStartGame, getGameState, advancePhase,
  submitNomination, castVote, castMissionVote,
  buildCustomBoard9, buildCustomBoard10, buildStandardRoomConfig, withConfigOverrides
} = require('./helpers/testHelper');

const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
  11: [3, 4, 5, 6, 6], 12: [3, 4, 5, 6, 6]
};

async function setupGame(config) {
  const n = config.roles.good.length + config.roles.evil.length;
  return createRoomAndStartGame(n, config);
}

// 推进到 missionVote（首轮自动 advancePhase，后续轮次跳过）
async function driveToMissionVote(gameId, players, team) {
  let state = await getGameState(gameId);
  if (state.game.currentPhase === 'roleReveal') {
    await advancePhase(gameId);
    state = await getGameState(gameId);
  }
  const leader = players[state.game.teamLeaderIndex];
  const n = players.length;
  const size = TEAM_SIZES[n][state.game.currentRound - 1];
  if (team.length !== size) throw new Error(`team size ${team.length} != ${size}`);
  const nom = await submitNomination(gameId, leader.openId, team);
  if (!nom.success) throw new Error('nomination failed: ' + JSON.stringify(nom));
  const half = Math.floor(n / 2) + 1;
  for (let i = 0; i < half; i++) await castVote(gameId, players[i].openId, 'approve');
  for (let i = half; i < n; i++) await castVote(gameId, players[i].openId, 'reject');
  const s = await getGameState(gameId);
  if (s.game.currentPhase !== 'missionVote') throw new Error('not missionVote: ' + s.game.currentPhase);
  return s;
}

async function completeMission(gameId, players, voteFn) {
  const state = await getGameState(gameId);
  const team = state.game.nominatedTeam || [];
  for (const openId of team) {
    const p = players.find(x => x.openId === openId);
    const r = await castMissionVote(gameId, openId, voteFn(p), p.role);
    if (!r.success) throw new Error('mission vote failed: ' + JSON.stringify(r));
  }
  return getGameState(gameId);
}

function buildTeam(players, size, mustIncludeId) {
  const others = players.map(p => p.openId).filter(id => id !== mustIncludeId);
  return [mustIncludeId, ...others].slice(0, size);
}

describe('04 — 通用游戏机制（与胜负路径无关）', () => {
  // ─────────── 好人必须投成功（固定规则，按当前阵营 side） ───────────
  it('好人投 fail 被拒（按当前阵营 side，不看身份）', async () => {
    const config = buildCustomBoard10();
    const { gameId, players } = await setupGame(config);
    const good = players.find(p => p.side === 'good');
    const n = players.length;
    const size = TEAM_SIZES[n][0];
    await driveToMissionVote(gameId, players, buildTeam(players, size, good.openId));

    const res = await castMissionVote(gameId, good.openId, 'fail', good.role);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/坏人/);
  });

  // ─────────── 必败强制：redLancelotMustFailMission ───────────
  it('redLancelotMustFailMission=true：红兰投 success 被拒', async () => {
    const config = withConfigOverrides(buildCustomBoard10(), { rules: { redLancelotMustFailMission: true } });
    const { gameId, players } = await setupGame(config);
    const red = players.find(p => p.role === 'lancelotRed');
    const n = players.length;
    const size = TEAM_SIZES[n][0];
    await driveToMissionVote(gameId, players, buildTeam(players, size, red.openId));

    const bad = await castMissionVote(gameId, red.openId, 'success', red.role);
    expect(bad.success).toBe(false);
    expect(bad.message).toMatch(/必须投失败/);
    const ok = await castMissionVote(gameId, red.openId, 'fail', red.role);
    expect(ok.success).toBe(true);
  });

  // ─────────── 必败强制：oberonMustFailMission ───────────
  it('oberonMustFailMission=true：奥伯伦投 success 被拒', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(12), { rules: { oberonMustFailMission: true } });
    const { gameId, players } = await setupGame(config);
    const oberon = players.find(p => p.role === 'oberon');
    const n = players.length;
    const size = TEAM_SIZES[n][0];
    await driveToMissionVote(gameId, players, buildTeam(players, size, oberon.openId));

    const bad = await castMissionVote(gameId, oberon.openId, 'success', oberon.role);
    expect(bad.success).toBe(false);
    expect(bad.message).toMatch(/必须投失败/);
  });

  // ─────────── 兰斯洛特身份转换：单兰翻转 ───────────
  it('单兰斯洛特抽中转换卡 → 阵营翻转', async () => {
    const config = withConfigOverrides(buildCustomBoard9(), { rules: { lancelotSwapRound: 1 } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    expect(blue.side).toBe('good');
    const n = players.length;
    const size = TEAM_SIZES[n][0];
    await driveToMissionVote(gameId, players, buildTeam(players, size, blue.openId));

    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1); // 抽中转换卡
    await completeMission(gameId, players, () => 'success');
    spy.mockRestore();

    const state = await getGameState(gameId);
    expect(state.game.currentRound).toBe(2);
    expect(state.game.players.find(p => p.role === 'lancelotBlue').side).toBe('evil');
  });

  // ─────────── 兰斯洛特身份转换：双兰互换 ───────────
  it('双兰斯洛特抽中转换卡 → 同时互换', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1 } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    const red = players.find(p => p.role === 'lancelotRed');
    expect(blue.side).toBe('good');
    expect(red.side).toBe('evil');
    const n = players.length;
    const size = TEAM_SIZES[n][0];
    await driveToMissionVote(gameId, players, buildTeam(players, size, blue.openId));

    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
    await completeMission(gameId, players, () => 'success');
    spy.mockRestore();

    const state = await getGameState(gameId);
    expect(state.game.players.find(p => p.role === 'lancelotBlue').side).toBe('evil');
    expect(state.game.players.find(p => p.role === 'lancelotRed').side).toBe('good');
  });

  // ─────────── 未抽中转换卡：阵营不变 ───────────
  it('未抽中转换卡 → 阵营不变', async () => {
    const config = withConfigOverrides(buildCustomBoard9(), { rules: { lancelotSwapRound: 1 } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    const n = players.length;
    const size = TEAM_SIZES[n][0];
    await driveToMissionVote(gameId, players, buildTeam(players, size, blue.openId));

    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9); // 未抽中
    await completeMission(gameId, players, () => 'success');
    spy.mockRestore();

    const state = await getGameState(gameId);
    expect(state.game.players.find(p => p.role === 'lancelotBlue').side).toBe('good');
  });

  // ─────────── fail 权限按当前阵营（转换后） ───────────
  it('转换后蓝兰变坏可投 fail；红兰变好不能投 fail', async () => {
    // 单兰：蓝兰变坏 → 可 fail
    const cfg = withConfigOverrides(buildCustomBoard9(), { rules: { lancelotSwapRound: 1 } });
    const g1 = await setupGame(cfg);
    const blue = g1.players.find(p => p.role === 'lancelotBlue');
    const n = g1.players.length;
    await driveToMissionVote(g1.gameId, g1.players, buildTeam(g1.players, TEAM_SIZES[n][0], blue.openId));
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
    await completeMission(g1.gameId, g1.players, () => 'success');
    spy.mockRestore();
    expect((await getGameState(g1.gameId)).game.players.find(p => p.role === 'lancelotBlue').side).toBe('evil');

    // 第 2 轮把变坏的蓝兰放上车 → 可投 fail
    await driveToMissionVote(g1.gameId, g1.players, buildTeam(g1.players, TEAM_SIZES[n][1], blue.openId));
    const failOk = await castMissionVote(g1.gameId, blue.openId, 'fail', blue.role);
    expect(failOk.success).toBe(true);

    // 双兰：红兰变好 → 不能投 fail
    const cfg2 = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1 } });
    const g2 = await setupGame(cfg2);
    const blue2 = g2.players.find(p => p.role === 'lancelotBlue');
    const red2 = g2.players.find(p => p.role === 'lancelotRed');
    const n2 = g2.players.length;
    await driveToMissionVote(g2.gameId, g2.players, buildTeam(g2.players, TEAM_SIZES[n2][0], blue2.openId));
    const spy2 = jest.spyOn(Math, 'random').mockReturnValue(0.1);
    await completeMission(g2.gameId, g2.players, () => 'success');
    spy2.mockRestore();
    expect((await getGameState(g2.gameId)).game.players.find(p => p.role === 'lancelotRed').side).toBe('good');

    // 第 2 轮把变好的红兰放上车 → 投 fail 被拒
    await driveToMissionVote(g2.gameId, g2.players, buildTeam(g2.players, TEAM_SIZES[n2][1], red2.openId));
    const failBad = await castMissionVote(g2.gameId, red2.openId, 'fail', red2.role);
    expect(failBad.success).toBe(false);
  });
});
