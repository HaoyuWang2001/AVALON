const {
  createRoomAndStartGame, getGameState,
  buildStandardRoomConfig, buildMinimalRoomConfig, withConfigOverrides,
  cleanupRooms
} = require('./helpers/testHelper');

// 与 server/utils/boardType.js 同构的构造工具
function boardConfig(good, evil, rules = {}) {
  const cfg = buildMinimalRoomConfig();
  cfg.roles = { good, evil };
  cfg.rules = { ...cfg.rules, ...rules };
  return cfg;
}

// 无派板（6人）：梅林 + 3忠臣；刺客/莫甘娜
function noPercivalConfig() {
  return boardConfig(
    ['merlin', 'loyal', 'loyal', 'loyal'],
    ['morgana', 'assassin']
  );
}

// 专家板（8人）：梅林/派西 + 3忠臣；莫甘娜/刺客/莫德雷德；湖仙第2轮；流车4；红方互知关
function expertConfig() {
  return boardConfig(
    ['merlin', 'percival', 'loyal', 'loyal', 'loyal'],
    ['morgana', 'assassin', 'mordred'],
    { ladyOfTheLake: true, ladyOfTheLakeRound: 2, maxFailedNominations: 4, evilKnowsEachOther: false }
  );
}

describe('14 — Board Type', () => {
  afterAll(async () => { await cleanupRooms(0); });

  it('标准配置开局 → board_type=standard', async () => {
    const { gameId } = await createRoomAndStartGame(6, buildStandardRoomConfig(6));
    const state = await getGameState(gameId, 'u0');
    expect(state.basic.boardType).toBe('standard');
    expect(state.basic.source).toBe('online');
  });

  it('6人无派板 → board_type=noPercival', async () => {
    const { gameId } = await createRoomAndStartGame(6, noPercivalConfig());
    const state = await getGameState(gameId, 'u0');
    expect(state.basic.boardType).toBe('noPercival');
  });

  it('8人专家板（红方互知关） → board_type=expert', async () => {
    const { gameId } = await createRoomAndStartGame(8, expertConfig());
    const state = await getGameState(gameId, 'u0');
    expect(state.basic.boardType).toBe('expert');
  });

  it('8人专家角色但红方互知开 → board_type=custom', async () => {
    const cfg = expertConfig();
    cfg.rules.evilKnowsEachOther = true;
    const { gameId } = await createRoomAndStartGame(8, cfg);
    const state = await getGameState(gameId, 'u0');
    expect(state.basic.boardType).toBe('custom');
  });

  it('7人自定义板（无派西） → board_type=custom', async () => {
    const cfg = boardConfig(
      ['merlin', 'loyal', 'loyal', 'loyal'],
      ['morgana', 'assassin', 'oberon']
    );
    const { gameId } = await createRoomAndStartGame(7, cfg);
    const state = await getGameState(gameId, 'u0');
    expect(state.basic.boardType).toBe('custom');
  });

  it('标准角色但改动规则（湖仙开） → 仍为 standard（规则改动不降级）', async () => {
    const cfg = withConfigOverrides(buildStandardRoomConfig(5), {
      rules: { ladyOfTheLake: true, ladyOfTheLakeRound: 2 }
    });
    const { gameId } = await createRoomAndStartGame(5, cfg);
    const state = await getGameState(gameId, 'u0');
    expect(state.basic.boardType).toBe('standard');
  });

  it('分类器单元行为（utils/boardType.js）', () => {
    const { classifyBoard } = require('../utils/boardType');
    expect(classifyBoard(
      { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal'], evil: ['morgana', 'assassin', 'mordred'] },
      { ladyOfTheLake: true, maxFailedNominations: 4, evilKnowsEachOther: false }, 8
    )).toBe('expert');
    expect(classifyBoard(
      { good: ['merlin', 'loyal', 'loyal', 'loyal'], evil: ['morgana', 'assassin'] }, {}, 6
    )).toBe('noPercival');
    expect(classifyBoard(
      { good: ['merlin', 'percival'], evil: ['morgana', 'assassin'] }, {}, 5
    )).toBe('standard');
    expect(classifyBoard(
      { good: ['merlin', 'percival'], evil: ['morgana', 'assassin', 'minion'] }, {}, 8
    )).toBe('standard');
    expect(classifyBoard(
      { good: ['merlin'], evil: ['morgana', 'assassin'] }, {}, 5
    )).toBe('custom');
  });
});
