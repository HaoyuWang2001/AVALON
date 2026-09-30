const {
  createRoomAndStartGame, getGameState, confirmRevealAll,
  startAssassination, merlinFlip,
  buildStandardRoomConfig
} = require('./helpers/testHelper');

describe('04g — Merlin Flip', () => {
  it('梅林翻牌：直接结束对局，红方获胜，原因为「梅林翻牌」', async () => {
    const { gameId, players } = await createRoomAndStartGame(5, buildStandardRoomConfig(5));
    await confirmRevealAll(gameId, players);

    const merlin = players.find(p => p.role === 'merlin');
    expect(merlin).toBeTruthy();

    const before = await getGameState(gameId);
    expect(before.current.phase).not.toBe('gameEnd');
    expect(before.current.phase).not.toBe('assassination');

    const result = await merlinFlip(gameId, merlin.openId);
    expect(result.success).toBe(true);
    expect(result.current.phase).toBe('gameEnd');
    expect(result.basic.result.winner).toBe('evil');
    expect(result.basic.result.reason).toBe('梅林翻牌');
    expect(result.basic.result.merlinFlip).toBeTruthy();
    expect(result.basic.result.merlinFlip.by).toBe(merlin.openId);
  });

  it('非梅林翻牌：返回错误，对局不结束', async () => {
    const { gameId, players } = await createRoomAndStartGame(5, buildStandardRoomConfig(5));
    await confirmRevealAll(gameId, players);

    const notMerlin = players.find(p => p.role !== 'merlin');
    const result = await merlinFlip(gameId, notMerlin.openId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('只有梅林');

    const after = await getGameState(gameId);
    expect(after.current.phase).not.toBe('gameEnd');
  });

  it('刺杀阶段翻牌：返回错误', async () => {
    const { gameId, players } = await createRoomAndStartGame(5, buildStandardRoomConfig(5));
    await confirmRevealAll(gameId, players);

    const assassin = players.find(p => p.role === 'assassin');
    const merlin = players.find(p => p.role === 'merlin');

    const started = await startAssassination(gameId, assassin.openId);
    expect(started.success).toBe(true);

    const result = await merlinFlip(gameId, merlin.openId);
    expect(result.success).toBe(false);
    expect(result.message).toContain('当前阶段不可翻牌');
  });

  it('对局已结束后再次翻牌：返回错误', async () => {
    const { gameId, players } = await createRoomAndStartGame(5, buildStandardRoomConfig(5));
    await confirmRevealAll(gameId, players);

    const merlin = players.find(p => p.role === 'merlin');

    const first = await merlinFlip(gameId, merlin.openId);
    expect(first.success).toBe(true);

    const second = await merlinFlip(gameId, merlin.openId);
    expect(second.success).toBe(false);
    expect(second.message).toContain('游戏已结束');
  });
});
