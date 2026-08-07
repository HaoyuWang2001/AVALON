const {
  createRoomAndStartGame, getGameState, confirmRevealAll,
  setIdentityMark, clearIdentityMark,
  buildCustomBoard10
} = require('./helpers/testHelper');

describe('04e — 身份标记（长按卡片记录阵营/角色，仅本人可见）', () => {
  async function setupStartedGame() {
    const n = 10;
    const { gameId, players } = await createRoomAndStartGame(n, buildCustomBoard10());
    await confirmRevealAll(gameId, players);
    return { gameId, players };
  }

  it('设置 side / role / 同时设置 → player.identityMarks 正确', async () => {
    const { gameId, players } = await setupStartedGame();
    const me = players[0], target = players[1];
    await setIdentityMark(gameId, me.openId, target.openId, { side: 'evil' });
    let st = await getGameState(gameId, me.openId);
    expect(st.player.identityMarks[target.openId]).toEqual(expect.objectContaining({ side: 'evil', role: null }));

    await setIdentityMark(gameId, me.openId, target.openId, { role: 'morgana' });
    st = await getGameState(gameId, me.openId);
    expect(st.player.identityMarks[target.openId].side).toBe('evil');
    expect(st.player.identityMarks[target.openId].role).toBe('morgana');
  });

  it('仅设 side 时 role 保留原值（独立字段，COALESCE 语义）', async () => {
    const { gameId, players } = await setupStartedGame();
    const me = players[0], target = players[1];
    await setIdentityMark(gameId, me.openId, target.openId, { role: 'assassin' });
    await setIdentityMark(gameId, me.openId, target.openId, { side: 'good' });
    const st = await getGameState(gameId, me.openId);
    expect(st.player.identityMarks[target.openId].side).toBe('good');
    expect(st.player.identityMarks[target.openId].role).toBe('assassin');
  });

  it('clearIdentityMark：清 side / 清 role / 全清删除整条', async () => {
    const { gameId, players } = await setupStartedGame();
    const me = players[0], target = players[1];
    await setIdentityMark(gameId, me.openId, target.openId, { side: 'evil', role: 'morgana' });
    await clearIdentityMark(gameId, me.openId, target.openId, { side: true });
    let st = await getGameState(gameId, me.openId);
    expect(st.player.identityMarks[target.openId].side).toBeNull();
    expect(st.player.identityMarks[target.openId].role).toBe('morgana');

    await clearIdentityMark(gameId, me.openId, target.openId, { side: true, role: true });
    st = await getGameState(gameId, me.openId);
    expect(st.player.identityMarks[target.openId]).toBeUndefined();
  });

  it('仅本人可见：他人视角 identityMarks 为空', async () => {
    const { gameId, players } = await setupStartedGame();
    const me = players[0], target = players[1], other = players[2];
    await setIdentityMark(gameId, me.openId, target.openId, { side: 'evil' });
    const mySt = await getGameState(gameId, me.openId);
    const otherSt = await getGameState(gameId, other.openId);
    expect(mySt.player.identityMarks[target.openId].side).toBe('evil');
    expect(otherSt.player.identityMarks).toEqual({});
  });

  it('非游戏内玩家标记被拒（你不在本局游戏中）', async () => {
    const { gameId, players } = await setupStartedGame();
    const outsider = 'outsider_test_not_in_game';
    const res = await setIdentityMark(gameId, outsider, players[1].openId, { side: 'evil' });
    expect(res.success).toBe(false);
    expect(res.message).toContain('你不在本局游戏中');
  });
});
