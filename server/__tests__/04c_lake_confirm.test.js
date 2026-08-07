const {
  createRoomAndStartGame, getGameState, confirmRevealAll, driveToDiscussion, driveToTeamNomination,
  submitNomination, castVote, castMissionVote, lakeInspect, confirmLake, confirmLancelot,
  buildCustomBoard10, withConfigOverrides
} = require('./helpers/testHelper');

const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
  11: [3, 4, 5, 6, 6], 12: [3, 4, 5, 6, 6]
};

// 湖仙启用 + 无兰斯洛特角色（lancelot 永不触发）的纯湖仙配置
function pureLakeConfig() {
  const cfg = buildCustomBoard10();
  cfg.roles = {
    good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal'],
    evil: ['morgana', 'assassin', 'mordred', 'oberon']
  };
  return withConfigOverrides(cfg, {
    rules: { ladyOfTheLake: true, ladyOfTheLakeRound: 1 }
  });
}

// 湖仙 + 兰斯链（第 1 轮即抽卡）配置
function lakeLancelotConfig() {
  return withConfigOverrides(buildCustomBoard10(), {
    rules: { ladyOfTheLake: true, ladyOfTheLakeRound: 1, lancelotSwapRound: 1, lancelotSwapForce: 'switch' }
  });
}

// 从任务投票推进：驱动第 1 轮任务完成并进入 lake 阶段
async function driveToLake(gameId, players) {
  let state = await getGameState(gameId);
  if (state.current.phase === 'roleReveal' || state.current.phase === 'preNominate'
      || state.current.phase === 'speakingOrder' || state.current.phase === 'discussion') {
    await driveToDiscussion(gameId, players);
    state = await getGameState(gameId);
  }
  if (state.current.phase === 'discussion') {
    state = await driveToTeamNomination(gameId, players);
  }
  const n = players.length;
  const size = TEAM_SIZES[n][state.current.round - 1];
  const goods = players.filter(p => p.side === 'good');
  const team = goods.map(p => p.openId).slice(0, size);
  if (team.length !== size) throw new Error(`not enough good players for team size ${size}`);

  const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
  const nom = await submitNomination(gameId, leader.openId, team);
  if (!nom.success) throw new Error('nomination failed: ' + JSON.stringify(nom));

  for (const p of players) {
    const r = await castVote(gameId, p.openId, 'approve');
    if (!r.success) throw new Error('team vote failed: ' + JSON.stringify(r));
  }
  state = await getGameState(gameId);
  if (state.current.phase !== 'missionVote') throw new Error('not missionVote: ' + state.current.phase);

  for (const oid of team) {
    const p = players.find(x => x.openId === oid);
    const r = await castMissionVote(gameId, oid, 'success', p.role);
    if (!r.success) throw new Error('mission vote failed: ' + JSON.stringify(r));
  }
  state = await getGameState(gameId);
  if (state.current.phase !== 'lake') throw new Error('not lake: ' + state.current.phase);
  return state;
}

async function confirmAll(gameId, players, fn) {
  let last;
  for (const p of players) {
    last = await fn(gameId, p.openId);
  }
  return last;
}

describe('04c — 湖仙验人两阶段（lake → lakeConfirm → 全员确认 → 推进）', () => {

  it('04c-1 纯湖仙：查验后进入 lakeConfirm，逐人确认后推进到下一轮', async () => {
    const n = 10;
    const { gameId, players } = await createRoomAndStartGame(n, pureLakeConfig());
    await confirmRevealAll(gameId, players);
    let state = await driveToLake(gameId, players);
    const holder = players.find(p => p.openId === state.current.lakeHolderOpenId);

    // 非持有者验人被拒
    const nonHolder = players.find(p => p.openId !== holder.openId);
    const denied = await lakeInspect(gameId, nonHolder.openId, players.find(p => p.openId !== nonHolder.openId).openId);
    expect(denied.success).toBe(false);

    // 持有者验人 → lakeConfirm，令牌转移，计数为 0
    const inspectorOpenId = holder.openId;
    const inspectedOpenId = nonHolder.openId;
    const inspectRes = await lakeInspect(gameId, inspectorOpenId, inspectedOpenId);
    expect(inspectRes.success).toBe(true);
    expect(inspectRes.current.phase).toBe('lakeConfirm');
    expect(inspectRes.current.round).toBe(1);
    expect(inspectRes.current.lakeHolderOpenId).toBe(inspectedOpenId);
    expect(inspectRes.current.lakeConfirmedCount).toBe(0);

    // 结果保密：验人者可见 result，非验人者不可见
    const asInspector = await getGameState(gameId, inspectorOpenId);
    const asOther = await getGameState(gameId, players.find(p => p.openId !== inspectorOpenId && p.openId !== inspectedOpenId).openId);
    const lastLakeInspector = asInspector.history.lake[asInspector.history.lake.length - 1];
    const lastLakeOther = asOther.history.lake[asOther.history.lake.length - 1];
    expect(lastLakeInspector.result).toBeDefined();
    expect(['good', 'evil']).toContain(lastLakeInspector.result);
    expect(lastLakeOther.result).toBeUndefined();

    // 非玩家 confirm 被拒
    const outsider = 'outsider_open_id';
    const outsiderRes = await confirmLake(gameId, outsider);
    expect(outsiderRes.success).toBe(false);

    // 部分确认：阶段停留，player.lakeConfirmed 逐人翻转，publicPlayers 公开确认状态
    const half = players.slice(0, Math.floor(n / 2));
    for (const p of half) {
      const r = await confirmLake(gameId, p.openId);
      expect(r.success).toBe(true);
      expect(r.current.phase).toBe('lakeConfirm');
    }
    state = await getGameState(gameId, half[0].openId);
    expect(state.current.lakeConfirmedCount).toBe(half.length);
    const confirmedPub = state.players.find(x => x.openId === half[0].openId);
    const unconfirmedPub = state.players.find(x => x.openId === players[Math.floor(n / 2)].openId);
    expect(confirmedPub.lakeConfirmed).toBe(true);
    expect(unconfirmedPub.lakeConfirmed).toBe(false);
    expect(state.player.lakeConfirmed).toBe(true);

    // 其余玩家确认 → 全员确认后推进到下一轮 preNominate，计数与标记归零
    const rest = players.slice(Math.floor(n / 2));
    for (const p of rest) {
      const r = await confirmLake(gameId, p.openId);
      expect(r.success).toBe(true);
    }
    state = await getGameState(gameId, players[0].openId);
    expect(state.current.phase).toBe('preNominate');
    expect(state.current.round).toBe(2);
    expect(state.current.lakeConfirmedCount).toBe(0);
    expect(state.player.lakeConfirmed).toBe(false);
    // 队伍投票阶段的已投渐变数据同步公开（publicPlayers 已带确认字段）
    expect(state.players[0]).toHaveProperty('lakeConfirmed');
    expect(state.players[0]).toHaveProperty('lancelotConfirmed');
  });

  it('04c-2 湖仙 + 兰斯链：全员湖仙确认后进入 lancelot 抽卡，再全员确认后推进', async () => {
    const n = 10;
    const { gameId, players } = await createRoomAndStartGame(n, lakeLancelotConfig());
    await confirmRevealAll(gameId, players);

    let state = await driveToLake(gameId, players);
    const holder = players.find(p => p.openId === state.current.lakeHolderOpenId);
    const target = players.find(p => p.openId !== holder.openId);

    await lakeInspect(gameId, holder.openId, target.openId);
    state = await confirmAll(gameId, players, confirmLake);
    expect(state.success).toBe(true);
    expect(state.current.phase).toBe('lancelot');
    expect(state.current.round).toBe(2);
    expect(state.current.lancelotResult).toBeDefined();
    expect(state.current.lancelotResult.switched).toBe(true);
    // 进入 lancelot 后 lake_confirmed 已重置
    expect(state.current.lakeConfirmedCount).toBe(0);

    state = await confirmAll(gameId, players, confirmLancelot);
    expect(state.current.phase).toBe('preNominate');
    expect(state.current.round).toBe(2);
  });
});
