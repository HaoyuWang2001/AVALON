const {
  createRoomAndStartGame, getGameState, confirmRevealAll, driveToDiscussion, driveToTeamNomination,
  submitNomination, castVote, buildCustomBoard10, withConfigOverrides
} = require('./helpers/testHelper');

describe('04f — 皇冠（队伍投票孤票者，动态计算不持久化）', () => {
  // public 票型下队伍投票（approve/reject），制造孤票
  async function setupPublicGame() {
    const cfg = withConfigOverrides(buildCustomBoard10(), { rules: { voteVisibility: 'public' } });
    const { gameId, players } = await createRoomAndStartGame(10, cfg);
    await confirmRevealAll(gameId, players);
    return { gameId, players };
  }

  // 全 approve 或全 reject 的投票分布，制造孤票
  async function runTeamVote(gameId, players, approveIds) {
    const st = await getGameState(gameId);
    const leader = players.find(p => p.openId === st.current.teamLeaderOpenId);
    const team = [leader.openId, ...players.map(p => p.openId).filter(id => id !== leader.openId)].slice(0, 3);
    const nom = await submitNomination(gameId, leader.openId, team);
    if (!nom.success) throw new Error('nom failed: ' + JSON.stringify(nom));
    for (const p of players) {
      await castVote(gameId, p.openId, approveIds.includes(p.openId) ? 'approve' : 'reject');
    }
    return getGameState(gameId);
  }

  it('approve 孤票（1 同意）→ 皇冠 = 该同意者', async () => {
    const { gameId, players } = await setupPublicGame();
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const lone = players[3];
    const st = await runTeamVote(gameId, players, [lone.openId]);
    expect(st.current.crownHolderOpenId).toBe(lone.openId);
  });

  it('reject 孤票（1 反对）→ 皇冠 = 该反对者', async () => {
    const { gameId, players } = await setupPublicGame();
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const lone = players[5];
    // 除 lone 全 approve，lone 单独 reject
    const approveIds = players.filter(p => p.openId !== lone.openId).map(p => p.openId);
    const st = await runTeamVote(gameId, players, approveIds);
    expect(st.current.crownHolderOpenId).toBe(lone.openId);
  });

  it('无孤票（同意/反对均 ≥2）→ 无皇冠', async () => {
    const { gameId, players } = await setupPublicGame();
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const approveIds = players.slice(0, 6).map(p => p.openId); // 6 同意 / 4 反对，无孤票
    const st = await runTeamVote(gameId, players, approveIds);
    expect(st.current.crownHolderOpenId).toBeNull();
  });

  it('下一轮队伍投票结算后更新（新孤票者 / 清除）', async () => {
    const { gameId, players } = await setupPublicGame();
    // 第一车：孤票 approve → 皇冠
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const lone1 = players[1];
    let st = await runTeamVote(gameId, players, [lone1.openId]);
    expect(st.current.crownHolderOpenId).toBe(lone1.openId);
    // 第二车：无孤票（6/4）→ 皇冠清除
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const approveIds = players.slice(0, 6).map(p => p.openId);
    st = await runTeamVote(gameId, players, approveIds);
    expect(st.current.crownHolderOpenId).toBeNull();
  });

  it('匿名票型（voteVisibility=anonymous）不判定皇冠', async () => {
    const cfg = withConfigOverrides(buildCustomBoard10(), { rules: { voteVisibility: 'anonymous' } });
    const n = 10;
    const { gameId, players } = await createRoomAndStartGame(n, cfg);
    await confirmRevealAll(gameId, players);
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const st = await runTeamVote(gameId, players, [players[2].openId]); // 1 同意
    expect(st.current.crownHolderOpenId).toBeNull();
  });
});
