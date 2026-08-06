const {
  createRoomAndStartGame, getGameState, confirmRevealAll, driveToDiscussion,
  submitNomination, castVote, buildCustomBoard10, withConfigOverrides
} = require('./helpers/testHelper');

describe('04d — 队伍投票结果 teamVoteResult（后端权威票型，座位升序）', () => {
  it('流车后 current.teamVoteResult.rejectSeats 完整且升序', async () => {
    const n = 10;
    const { gameId, players } = await createRoomAndStartGame(n, buildCustomBoard10());
    await confirmRevealAll(gameId, players);

    let state = await getGameState(gameId);
    if (state.current.phase !== 'discussion') {
      await driveToDiscussion(gameId, players);
      state = await getGameState(gameId);
    }
    const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
    const team = players.slice(0, 3).map(p => p.openId);
    const nom = await submitNomination(gameId, leader.openId, team);
    expect(nom.success).toBe(true);

    for (const p of players) {
      const r = await castVote(gameId, p.openId, 'reject');
      expect(r.success).toBe(true);
    }
    state = await getGameState(gameId);

    // 流车后：teamVoteResult 应含全部 10 人反对座位（升序 1-10），同意为空
    const tvr = state.current.teamVoteResult;
    expect(tvr).toBeDefined();
    expect(tvr.approveSeats).toBe('');
    const rejectSeats = tvr.rejectSeats.split(' ').filter(Boolean).map(Number);
    expect(rejectSeats).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('队伍投票通过后 current.teamVoteResult.approveSeats 完整且升序', async () => {
    const n = 10;
    const { gameId, players } = await createRoomAndStartGame(n, buildCustomBoard10());
    await confirmRevealAll(gameId, players);

    let state = await getGameState(gameId);
    if (state.current.phase !== 'discussion') {
      await driveToDiscussion(gameId, players);
      state = await getGameState(gameId);
    }
    const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
    const team = players.slice(0, 3).map(p => p.openId);
    const nom = await submitNomination(gameId, leader.openId, team);
    expect(nom.success).toBe(true);

    for (const p of players) {
      const r = await castVote(gameId, p.openId, 'approve');
      expect(r.success).toBe(true);
    }
    state = await getGameState(gameId);
    expect(state.current.phase).toBe('missionVote');

    const tvr = state.current.teamVoteResult;
    expect(tvr).toBeDefined();
    expect(tvr.rejectSeats).toBe('');
    const approveSeats = tvr.approveSeats.split(' ').filter(Boolean).map(Number);
    expect(approveSeats).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('voteRevealDuration>0：全投后进入 teamVoteReveal，endAt 存在且 teamVoteResult 正确', async () => {
    const n = 10;
    const cfg = buildCustomBoard10();
    cfg.limits = { ...cfg.limits, voteRevealDuration: 5 };
    const { gameId, players } = await createRoomAndStartGame(n, cfg);
    await confirmRevealAll(gameId, players);

    let state = await getGameState(gameId);
    if (state.current.phase !== 'discussion') {
      await driveToDiscussion(gameId, players);
      state = await getGameState(gameId);
    }
    const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
    const team = players.slice(0, 3).map(p => p.openId);
    const nom = await submitNomination(gameId, leader.openId, team);
    expect(nom.success).toBe(true);

    for (const p of players) {
      const r = await castVote(gameId, p.openId, 'approve');
      expect(r.success).toBe(true);
    }
    state = await getGameState(gameId);

    // 展示阶段：phase=teamVoteReveal、endAt 为毫秒时间戳、teamVoteResult 完整
    expect(state.current.phase).toBe('teamVoteReveal');
    expect(typeof state.current.voteRevealEndAt).toBe('number');
    expect(state.current.voteRevealEndAt).toBeGreaterThan(0);
    expect(state.current.teamVoteResult.approveSeats.split(' ').filter(Boolean).length).toBe(10);
  });

  it('强制车：isForcedCar=true、teamVoteResult 空、history.cars.details isForcedCar=true', async () => {
    const n = 10;
    const cfg = withConfigOverrides(buildCustomBoard10(), { rules: { maxFailedNominations: 1 } });
    const { gameId, players } = await createRoomAndStartGame(n, cfg);
    await confirmRevealAll(gameId, players);

    let state = await getGameState(gameId);
    if (state.current.phase !== 'discussion') {
      await driveToDiscussion(gameId, players);
      state = await getGameState(gameId);
    }
    // 第一车：组车 + 全反对 → 流车 → 强制车（maxFailed=1）
    let leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
    const team = players.slice(0, 3).map(p => p.openId);
    const nom = await submitNomination(gameId, leader.openId, team);
    expect(nom.success).toBe(true);
    for (const p of players) {
      await castVote(gameId, p.openId, 'reject');
    }
    state = await getGameState(gameId);
    expect(state.current.phase).toBe('discussion');
    expect(state.current.forcedSend).toBe(true);

    // 强制发车
    leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
    const forcedTeam = players.slice(0, 3).map(p => p.openId);
    const fNom = await submitNomination(gameId, leader.openId, forcedTeam, true);
    expect(fNom.success).toBe(true);
    state = await getGameState(gameId);

    expect(state.current.phase).toBe('missionVote');
    expect(state.current.isForcedCar).toBe(true);
    // teamVoteResult 空（强制车无队伍投票）
    expect(state.current.teamVoteResult.approveSeats).toBe('');
    expect(state.current.teamVoteResult.rejectSeats).toBe('');
    // history.cars.details 含 isForcedCar=true
    const cars = state.history.cars;
    const lastCar = cars[cars.length - 1];
    const lastDetail = lastCar.details[lastCar.details.length - 1];
    expect(lastDetail.isForcedCar).toBe(true);
  });
});
