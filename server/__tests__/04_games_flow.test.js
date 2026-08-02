const {
  createRoomAndStartGame, getGameState, advancePhase,
  submitNomination, castVote, castMissionVote,
  buildCustomBoard9, buildCustomBoard10, buildStandardRoomConfig, withConfigOverrides
} = require('./helpers/testHelper');

const EVIL_OPEN_EYES = ['morgana', 'assassin', 'minion', 'mordred'];
const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
  11: [3, 4, 5, 6, 6], 12: [3, 4, 5, 6, 6]
};

const BOARDS = [
  ...[5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ name: `std${n}`, config: () => buildStandardRoomConfig(n) })),
  { name: 'custom10', config: buildCustomBoard10 },
  { name: 'custom9', config: buildCustomBoard9 }
];

async function setupGame(config) {
  const n = config.roles.good.length + config.roles.evil.length;
  return createRoomAndStartGame(n, config);
}

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

// 打完当前一轮：按 failCount 个坏票
async function playRound(gameId, players, failCount) {
  const state = await getGameState(gameId);
  const round = state.game.currentRound;
  const n = players.length;
  const size = TEAM_SIZES[n][round - 1];
  const evils = players.filter(p => p.side === 'evil');
  const mustInclude = evils.slice(0, Math.max(failCount, 1)).map(p => p.openId);
  const team = [...mustInclude, ...players.map(p => p.openId).filter(id => !mustInclude.includes(id))].slice(0, size);
  await driveToMissionVote(gameId, players, team);
  const st = await getGameState(gameId);
  const missionTeam = st.game.nominatedTeam || [];
  let failsCast = 0;
  for (const oid of missionTeam) {
    const p = players.find(x => x.openId === oid);
    const vote = failsCast < failCount && p.side === 'evil' ? 'fail' : 'success';
    if (vote === 'fail') failsCast++;
    const r = await castMissionVote(gameId, oid, vote, p.role);
    if (!r.success) throw new Error('vote failed: ' + JSON.stringify(r));
  }
  return getGameState(gameId);
}

// 推进到第 4 轮（2 成功 1 失败）
async function advanceToRound4(gameId, players) {
  await playRound(gameId, players, 0);
  await playRound(gameId, players, 1);
  await playRound(gameId, players, 0);
  const state = await getGameState(gameId);
  if (state.game.currentRound !== 4) throw new Error('not round 4: ' + state.game.currentRound);
  return state;
}

// 流车一轮（reject 多数）
async function rejectRound(gameId, players) {
  const st = await getGameState(gameId);
  const leader = players[st.game.teamLeaderIndex];
  const n = players.length;
  const size = TEAM_SIZES[n][st.game.currentRound - 1];
  const team = buildTeam(players, size, leader.openId);
  const nom = await submitNomination(gameId, leader.openId, team);
  if (!nom.success) throw new Error('nom failed: ' + JSON.stringify(nom));
  const rejectCount = Math.floor(n / 2) + 1;
  for (let i = 0; i < rejectCount; i++) await castVote(gameId, players[i].openId, 'reject');
  for (let i = rejectCount; i < n; i++) await castVote(gameId, players[i].openId, 'approve');
  return getGameState(gameId);
}

async function visionOf(gameId, openId) {
  const state = await getGameState(gameId, openId);
  return state.game.vision ? state.game.vision.players : [];
}

function lancelotSide(state, role) {
  return state.game.players.find(p => p.role === role).side;
}

describe('04 — 通用游戏机制（与胜负路径无关）', () => {
  // ─────────── 好人必须投成功（固定规则，按当前阵营 side） ───────────
  describe.each(BOARDS)('04-1 好人必成 $name', ({ config }) => {
    it('全部 good 玩家投 fail 被拒', async () => {
      const { gameId, players } = await setupGame(config());
      const n = players.length;
      const size = TEAM_SIZES[n][0];
      const goods = players.filter(p => p.side === 'good').slice(0, size).map(p => p.openId);
      await driveToMissionVote(gameId, players, goods);
      for (const oid of goods) {
        const p = players.find(x => x.openId === oid);
        const res = await castMissionVote(gameId, oid, 'fail', p.role);
        expect(res.success).toBe(false);
      }
    });
  });

  // ─────────── 必败强制：lancelotMustFail ───────────
  it('04-2 lancelotMustFail=true：evil 兰投 success 被拒、fail 可投', async () => {
    const config = withConfigOverrides(buildCustomBoard10(), { rules: { lancelotMustFail: true } });
    const { gameId, players } = await setupGame(config);
    const red = players.find(p => p.role === 'lancelotRed');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], red.openId));
    const bad = await castMissionVote(gameId, red.openId, 'success', red.role);
    expect(bad.success).toBe(false);
    const ok = await castMissionVote(gameId, red.openId, 'fail', red.role);
    expect(ok.success).toBe(true);
  });

  // ─────────── 必败强制：oberonMustFailMission ───────────
  it('04-3 oberonMustFailMission=true：奥伯伦投 success 被拒、fail 可投', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(12), { rules: { oberonMustFailMission: true } });
    const { gameId, players } = await setupGame(config);
    const oberon = players.find(p => p.role === 'oberon');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], oberon.openId));
    const bad = await castMissionVote(gameId, oberon.openId, 'success', oberon.role);
    expect(bad.success).toBe(false);
    const ok = await castMissionVote(gameId, oberon.openId, 'fail', oberon.role);
    expect(ok.success).toBe(true);
  });

  // ─────────── 兰斯洛特身份转换 ───────────
  it('04-4 单兰翻转（switch）→ 蓝兰 good→evil', async () => {
    const config = withConfigOverrides(buildCustomBoard9(), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    expect(blue.side).toBe('good');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], blue.openId));
    await completeMission(gameId, players, () => 'success');
    expect(lancelotSide(await getGameState(gameId), 'lancelotBlue')).toBe('evil');
  });

  it('04-5 双兰互换（switch）→ 蓝→evil、红→good', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], blue.openId));
    await completeMission(gameId, players, () => 'success');
    const st = await getGameState(gameId);
    expect(lancelotSide(st, 'lancelotBlue')).toBe('evil');
    expect(lancelotSide(st, 'lancelotRed')).toBe('good');
  });

  it('04-6 未抽中（keep）→ 阵营不变（单兰+双兰）', async () => {
    for (const board of [buildCustomBoard9(), buildStandardRoomConfig(11)]) {
      const config = withConfigOverrides(board, { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'keep' } });
      const { gameId, players } = await setupGame(config);
      const role = players.some(p => p.role === 'lancelotBlue') ? 'lancelotBlue' : 'lancelotRed';
      const before = players.find(p => p.role === role).side;
      const n = players.length;
      const target = players.find(p => p.role === 'lancelotBlue' || p.role === 'lancelotRed');
      await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], target.openId));
      await completeMission(gameId, players, () => 'success');
      expect(lancelotSide(await getGameState(gameId), role)).toBe(before);
    }
  });

  it('04-7 转换后：蓝兰可 fail、红兰只能 success', async () => {
    // 单局：蓝兰变坏后可投 fail
    const cfgA = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const gA = await setupGame(cfgA);
    const blueA = gA.players.find(p => p.role === 'lancelotBlue');
    const nA = gA.players.length;
    await driveToMissionVote(gA.gameId, gA.players, buildTeam(gA.players, TEAM_SIZES[nA][0], blueA.openId));
    await completeMission(gA.gameId, gA.players, () => 'success');
    expect(lancelotSide(await getGameState(gA.gameId), 'lancelotBlue')).toBe('evil');
    await driveToMissionVote(gA.gameId, gA.players, buildTeam(gA.players, TEAM_SIZES[nA][1], blueA.openId));
    const failOk = await castMissionVote(gA.gameId, blueA.openId, 'fail', blueA.role);
    expect(failOk.success).toBe(true);

    // 双兰：红兰变好后不能投 fail
    const cfgB = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const gB = await setupGame(cfgB);
    const blueB = gB.players.find(p => p.role === 'lancelotBlue');
    const redB = gB.players.find(p => p.role === 'lancelotRed');
    const nB = gB.players.length;
    await driveToMissionVote(gB.gameId, gB.players, buildTeam(gB.players, TEAM_SIZES[nB][0], blueB.openId));
    await completeMission(gB.gameId, gB.players, () => 'success');
    expect(lancelotSide(await getGameState(gB.gameId), 'lancelotRed')).toBe('good');
    await driveToMissionVote(gB.gameId, gB.players, buildTeam(gB.players, TEAM_SIZES[nB][1], redB.openId));
    const failBad = await castMissionVote(gB.gameId, redB.openId, 'fail', redB.role);
    expect(failBad.success).toBe(false);
  });

  // ─────────── 任务判定规则 ───────────
  it('04-8 0 坏票 → 任务成功', async () => {
    const { gameId, players } = await setupGame(buildCustomBoard10());
    const after = await playRound(gameId, players, 0);
    expect(after.game.missionResults[0].success).toBe(true);
  });

  it('04-9 普通轮 ≥1 坏票失败（1 与 2 均验）', async () => {
    for (const fails of [1, 2]) {
      const { gameId, players } = await setupGame(buildCustomBoard10());
      const after = await playRound(gameId, players, fails);
      expect(after.game.missionResults[0].success).toBe(false);
    }
  });

  it('04-10 7+ R4 保护轮：1 坏票成功', async () => {
    const { gameId, players } = await setupGame(buildStandardRoomConfig(7));
    await advanceToRound4(gameId, players);
    const after = await playRound(gameId, players, 1);
    const r4 = after.game.missionResults.find(r => r.round === 4);
    expect(r4.success).toBe(true);
  });

  it('04-11 7+ R4 保护轮：≥2 坏票失败（2 与 3 均验）', async () => {
    for (const fails of [2, 3]) {
      const { gameId, players } = await setupGame(buildStandardRoomConfig(7));
      await advanceToRound4(gameId, players);
      const after = await playRound(gameId, players, fails);
      const r4 = after.game.missionResults.find(r => r.round === 4);
      expect(r4.success).toBe(false);
    }
  });

  it('04-12 5-6 人 R4：≥1 坏票失败（无保护轮）', async () => {
    const { gameId, players } = await setupGame(buildStandardRoomConfig(5));
    await advanceToRound4(gameId, players);
    const after = await playRound(gameId, players, 1);
    const r4 = after.game.missionResults.find(r => r.round === 4);
    expect(r4.success).toBe(false);
  });

  // ─────────── 流车/发车状态机 ───────────
  it('04-13 流车：leader+1、round 不变、流车数+1、回 discussion', async () => {
    const { gameId, players } = await setupGame(buildCustomBoard10());
    await advancePhase(gameId);
    const before = await getGameState(gameId);
    const n = players.length;
    const after = await rejectRound(gameId, players);
    expect(after.game.currentPhase).toBe('discussion');
    expect(after.game.currentRound).toBe(1);
    expect(after.game.teamLeaderIndex).toBe((before.game.teamLeaderIndex + 1) % n);
    expect(after.game.failedNominations).toBe(1);
  });

  it('04-14 发车成功：round+1、leader+1、流车数=0', async () => {
    const { gameId, players } = await setupGame(buildCustomBoard10());
    await advancePhase(gameId);
    await rejectRound(gameId, players); // 先制造流车数 1
    const n = players.length;
    const st = await getGameState(gameId);
    const leader = players[st.game.teamLeaderIndex];
    const size = TEAM_SIZES[n][st.game.currentRound - 1];
    await driveToMissionVote(gameId, players, buildTeam(players, size, leader.openId));
    const before = await getGameState(gameId);
    await completeMission(gameId, players, () => 'success');
    const after = await getGameState(gameId);
    expect(after.game.currentRound).toBe(before.game.currentRound + 1);
    expect(after.game.teamLeaderIndex).toBe((before.game.teamLeaderIndex + 1) % n);
    expect(after.game.failedNominations).toBe(0);
  });

  // ─────────── 强制发车 ───────────
  it('04-15 强制发车：达阈值→forcedCar=true 直接 missionVote→下一轮、流车数0', async () => {
    const { gameId, players } = await setupGame(buildCustomBoard10());
    await advancePhase(gameId);
    for (let k = 0; k < 3; k++) await rejectRound(gameId, players);
    const forced = await getGameState(gameId);
    expect(forced.game.failedNominations).toBe(3);
    expect(forced.game.forcedSend).toBe(true);

    const n = players.length;
    const leader = players[forced.game.teamLeaderIndex];
    const size = TEAM_SIZES[n][forced.game.currentRound - 1];
    const team = buildTeam(players, size, leader.openId);

    const withoutFlag = await submitNomination(gameId, leader.openId, team);
    expect(withoutFlag.success).toBe(false);

    const ok = await submitNomination(gameId, leader.openId, team, true);
    expect(ok.success).toBe(true);
    const st2 = await getGameState(gameId);
    expect(st2.game.currentPhase).toBe('missionVote');

    await completeMission(gameId, players, () => 'success');
    const st3 = await getGameState(gameId);
    expect(st3.game.failedNominations).toBe(0);
  });

  // ─────────── 转换轮次边界 ───────────
  it.each([[2, [0, 0]], [3, [0, 1, 0]], [4, [0, 1, 0, 2]]])('04-16 swapRound=%i：第%i轮结束才触发', async (swapRound, pattern) => {
    const config = withConfigOverrides(buildCustomBoard9(), { rules: { lancelotSwapRound: swapRound, lancelotSwapForce: 'switch' } });
    const { gameId, players } = await setupGame(config);
    let prev = lancelotSide(await getGameState(gameId), 'lancelotBlue');
    for (let i = 0; i < pattern.length; i++) {
      const after = await playRound(gameId, players, pattern[i]);
      const cur = lancelotSide(after, 'lancelotBlue');
      if (i + 1 === swapRound) expect(cur).not.toBe(prev);
      else expect(cur).toBe(prev);
      prev = cur;
    }
  });

  it('04-18 流车（round 不变）不触发转换', async () => {
    const config = withConfigOverrides(buildCustomBoard9(), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const { gameId, players } = await setupGame(config);
    await advancePhase(gameId);
    await rejectRound(gameId, players);
    expect(lancelotSide(await getGameState(gameId), 'lancelotBlue')).toBe('good');
  });

  // ─────────── 必败拆分 ───────────
  it('04-19a lancelotMustFail=true：evil 兰必须 fail', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotMustFail: true } });
    const { gameId, players } = await setupGame(config);
    const red = players.find(p => p.role === 'lancelotRed');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], red.openId));
    const bad = await castMissionVote(gameId, red.openId, 'success', red.role);
    expect(bad.success).toBe(false);
  });

  it('04-19b lancelotMustFail=false：evil 兰可自选 success/fail', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotMustFail: false } });
    const { gameId, players } = await setupGame(config);
    const red = players.find(p => p.role === 'lancelotRed');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], red.openId));
    const success = await castMissionVote(gameId, red.openId, 'success', red.role);
    expect(success.success).toBe(true);
  });

  it('04-19c 兰变好后必须 success（fail 被拒）', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], blue.openId));
    await completeMission(gameId, players, () => 'success');
    expect(lancelotSide(await getGameState(gameId), 'lancelotRed')).toBe('good');
    const red = players.find(p => p.role === 'lancelotRed');
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][1], red.openId));
    const bad = await castMissionVote(gameId, red.openId, 'fail', red.role);
    expect(bad.success).toBe(false);
  });

  // ─────────── 视野固化 ───────────
  it('04-20 视野固化：转换后视野不变', async () => {
    const config = withConfigOverrides(buildStandardRoomConfig(11), { rules: { lancelotSwapRound: 1, lancelotSwapForce: 'switch' } });
    const { gameId, players } = await setupGame(config);
    const blue = players.find(p => p.role === 'lancelotBlue');
    const merlin = players.find(p => p.role === 'merlin');
    const openEye = players.find(p => EVIL_OPEN_EYES.includes(p.role));
    const n = players.length;

    const merlinBefore = await visionOf(gameId, merlin.openId);
    const blueEntryBefore = merlinBefore.find(s => s.openId === blue.openId);
    expect(blueEntryBefore.side).toBe('good');

    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], blue.openId));
    await completeMission(gameId, players, () => 'success');
    const st = await getGameState(gameId);
    expect(lancelotSide(st, 'lancelotBlue')).toBe('evil');

    const merlinAfter = await visionOf(gameId, merlin.openId);
    const blueEntryAfter = merlinAfter.find(s => s.openId === blue.openId);
    expect(blueEntryAfter.side).toBe('good');

    const openEyeAfter = await visionOf(gameId, openEye.openId);
    expect(openEyeAfter.some(s => s.openId === blue.openId)).toBe(false);
  });

  // ─────────── 视野结构 ───────────
  it('04-21 视野结构：平民空、派=梅林+莫甘娜、梅林 canSee、睁眼狼含 role+canIdentity', async () => {
    const { gameId, players } = await setupGame(buildCustomBoard10());
    const loyal = players.find(p => p.role === 'loyal');
    const percival = players.find(p => p.role === 'percival');
    const merlin = players.find(p => p.role === 'merlin');
    const morgana = players.find(p => p.role === 'morgana');
    const assassin = players.find(p => p.role === 'assassin');

    expect(await visionOf(gameId, loyal.openId)).toEqual([]);

    const pv = await visionOf(gameId, percival.openId);
    expect(pv.map(s => s.openId).sort()).toEqual([merlin.openId, morgana.openId].sort());
    for (const s of pv) { expect(s.canIdentity).toBe(false); expect(s.role).toBeUndefined(); }

    const mv = await visionOf(gameId, merlin.openId);
    const ass = mv.find(s => s.openId === assassin.openId);
    expect(ass.side).toBe('evil');
    expect(ass.role).toBeUndefined();
    expect(ass.canIdentity).toBe(false);

    const av = await visionOf(gameId, assassin.openId);
    const mor = av.find(s => s.openId === morgana.openId);
    expect(mor.role).toBe('morgana');
    expect(mor.canIdentity).toBe(true);
  });

  // ─────────── voteVisibility / 投票可见性 ───────────
  it('04-22 voteVisibility=anonymous：结束后仅聚合', async () => {
    const config = withConfigOverrides(buildCustomBoard10(), { rules: { voteVisibility: 'anonymous' } });
    const { gameId, players } = await setupGame(config);
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], players[0].openId));
    const view = await getGameState(gameId, players[0].openId);
    expect(view.game.teamVotes.approve || view.game.teamVotes.reject).toBeDefined();
    expect(view.game.teamVotes[players[0].openId]).toBeUndefined();
  });

  it('04-23 voteVisibility=public：结束后逐人票型', async () => {
    const config = withConfigOverrides(buildCustomBoard10(), { rules: { voteVisibility: 'public' } });
    const { gameId, players } = await setupGame(config);
    const n = players.length;
    await driveToMissionVote(gameId, players, buildTeam(players, TEAM_SIZES[n][0], players[0].openId));
    const view = await getGameState(gameId, players[0].openId);
    expect(view.game.teamVotes[players[0].openId]).toBe('approve');
    expect(view.game.teamVotes[players[1].openId]).toBeDefined();
  });

  it('04-24 投票中：玩家仅见自己票（未投为空、已投可见）', async () => {
    const config = buildCustomBoard10();
    const { gameId, players } = await setupGame(config);
    const n = players.length;
    const leader = players[0];
    const size = TEAM_SIZES[n][0];
    const team = buildTeam(players, size, leader.openId);
    await advancePhase(gameId);
    const st = await getGameState(gameId);
    const gameLeader = players[st.game.teamLeaderIndex];
    await submitNomination(gameId, gameLeader.openId, team);

    const before = await getGameState(gameId, players[3].openId);
    expect(before.game.teamVotes[players[3].openId]).toBeUndefined();

    await castVote(gameId, players[3].openId, 'approve');
    const after = await getGameState(gameId, players[3].openId);
    expect(after.game.teamVotes[players[3].openId]).toBe('approve');
    expect(after.game.teamVotes[players[0].openId]).toBeUndefined();
  });

  // ─────────── missionFailDetail ───────────
  it('04-25 missionFailDetail=binary：missionResults 无 failCount', async () => {
    const config = withConfigOverrides(buildCustomBoard10(), { rules: { missionFailDetail: 'binary' } });
    const { gameId, players } = await setupGame(config);
    await playRound(gameId, players, 1);
    const st = await getGameState(gameId);
    expect(st.game.missionResults[0].failCount).toBeUndefined();
  });

  it('04-26 missionFailDetail=count：含 failCount', async () => {
    const config = withConfigOverrides(buildCustomBoard10(), { rules: { missionFailDetail: 'count' } });
    const { gameId, players } = await setupGame(config);
    await playRound(gameId, players, 1);
    const st = await getGameState(gameId);
    expect(st.game.missionResults[0].failCount).toBeDefined();
  });
});
