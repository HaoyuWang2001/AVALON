const {
  createRoomAndStartGame, getGameState, confirmRevealAll, driveToDiscussion,
  submitNomination, castVote, buildCustomBoard10
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
});
