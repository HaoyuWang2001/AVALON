const http = require('http');

const TEST_SERVER_URL = process.env.TEST_SERVER_URL || null;

let _request = null;

function setRequest(req) {
  _request = req;
}

function request() {
  if (_request) return _request;
  if (TEST_SERVER_URL) {
    const supertest = require('supertest');
    _request = supertest(TEST_SERVER_URL);
    return _request;
  }
  throw new Error('Request not initialized. Call setRequest() with supertest agent.');
}

// ---- Unique test ID generation ----

const TEST_PREFIX = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let userCounter = 0;

function makeUserId() {
  return `${TEST_PREFIX}_u${++userCounter}`;
}

function makeNickName(userId) {
  return `Tester_${(userId || '').slice(-4)}`;
}

// ---- API helpers ----

async function apiGet(path) {
  const res = await request().get(path);
  return res;
}

async function apiPost(path, body) {
  const res = await request().post(path).send(body);
  return res;
}

async function apiPut(path, body) {
  const res = await request().put(path).send(body);
  return res;
}

// ---- Room workflow helpers ----

function buildMinimalRoomConfig() {
  return {
    roles: {
      good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'loyal'],
      evil: ['morgana', 'assassin', 'mordred', 'oberon']
    },
    rules: {
      evilKnowsEachOther: true,
      lancelotsKnowEachOther: false,
      lancelotSwapRound: 2,
      ladyOfTheLake: false,
      ladyOfTheLakeRound: 2,
      maxFailedNominations: 3,
      oberonMustFailMission: false,
      lancelotMustFail: false,
      voteVisibility: 'anonymous',
      missionFailDetail: 'count',
      evilsKnowRedLancelot: true,
      oberonKnowsRedLancelot: true,
      merlinKnowsLancelotSide: true
    },
    limits: { speechTimeout: null, roundTimeout: null, voteTimeout: null },
    meta: { roomName: 'Test Room', roomDescription: '', tags: [] },
    merlinVision: {
      canSee: ['assassin', 'morgana', 'minion', 'oberon'],
      canIdentify: []
    }
  };
}

// 标准角色配置（与 role_configurations / GameModel.getRoleConfiguration 一致）
function buildStandardRoomConfig(playerCount) {
  const config = buildMinimalRoomConfig();
  const roles = {
    5:  { good: ['merlin', 'percival', 'loyal'], evil: ['morgana', 'assassin'] },
    6:  { good: ['merlin', 'percival', 'loyal', 'loyal'], evil: ['morgana', 'assassin'] },
    7:  { good: ['merlin', 'percival', 'loyal', 'loyal'], evil: ['morgana', 'assassin', 'oberon'] },
    8:  { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal'], evil: ['morgana', 'assassin', 'minion'] },
    9:  { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal'], evil: ['morgana', 'assassin', 'mordred'] },
    10: { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal'], evil: ['morgana', 'assassin', 'mordred', 'oberon'] },
    11: { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'lancelotBlue'], evil: ['morgana', 'mordred', 'oberon', 'lancelotRed'] },
    12: { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'lancelotBlue'], evil: ['morgana', 'assassin', 'mordred', 'oberon', 'lancelotRed'] }
  };
  config.roles = roles[playerCount] || config.roles;
  return config;
}

// 自定义 10 人板（单红兰斯洛特）：merlin, percival, loyal×4, morgana, assassin, mordred, lancelotRed
function buildCustomBoard10() {
  const config = buildMinimalRoomConfig();
  config.roles = {
    good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal'],
    evil: ['morgana', 'assassin', 'mordred', 'lancelotRed']
  };
  return config;
}

// 自定义 9 人板（单蓝兰斯洛特）：merlin, percival, loyal×3, lancelotBlue, morgana, assassin, mordred
function buildCustomBoard9() {
  const config = buildMinimalRoomConfig();
  config.roles = {
    good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'lancelotBlue'],
    evil: ['morgana', 'assassin', 'mordred']
  };
  return config;
}

// 在基础配置上覆盖 rules / merlinVision 等（浅合并 rules 与 merlinVision）
function withConfigOverrides(baseConfig, overrides) {
  const config = JSON.parse(JSON.stringify(baseConfig));
  if (overrides.rules) {
    config.rules = { ...config.rules, ...overrides.rules };
  }
  if (overrides.merlinVision) {
    config.merlinVision = { ...config.merlinVision, ...overrides.merlinVision };
  }
  if (overrides.roles) config.roles = overrides.roles;
  if (overrides.ladyOfTheLake !== undefined) config.rules.ladyOfTheLake = overrides.ladyOfTheLake;
  if (overrides.ladyOfTheLakeRound !== undefined) config.rules.ladyOfTheLakeRound = overrides.ladyOfTheLakeRound;
  return config;
}

async function createRoom(hostId, hostNick) {
  const res = await apiPost('/api/rooms/create', {
    hostOpenId: hostId,
    hostNickName: hostNick || makeNickName(hostId),
    hostAvatarUrl: '',
    roomConfig: buildMinimalRoomConfig()
  });
  return res.body;
}

async function createRoomWithConfig(hostId, hostNick, roomConfig) {
  const res = await apiPost('/api/rooms/create', {
    hostOpenId: hostId,
    hostNickName: hostNick || makeNickName(hostId),
    hostAvatarUrl: '',
    roomConfig
  });
  return res.body;
}

async function joinRoom(roomId, userId, seatNumber, nick) {
  const res = await apiPost('/api/rooms/join', {
    roomId,
    userInfo: {
      openId: userId,
      nickName: nick || makeNickName(userId),
      avatarUrl: ''
    },
    seatNumber,
    customNickName: nick || makeNickName(userId)
  });
  return res.body;
}

async function getRoom(roomId) {
  const res = await apiGet(`/api/rooms/${roomId}`);
  return res.body;
}

async function toggleReady(roomId, userId, isReady) {
  const res = await apiPost('/api/rooms/toggleReady', { roomId, openId: userId, isReady });
  return res.body;
}

async function leaveRoom(roomId, userId) {
  const res = await apiPost('/api/rooms/leave', { roomId, openId: userId });
  return res.body;
}

async function updateSeatNumber(roomId, userId, newSeatNumber) {
  const res = await apiPost('/api/rooms/updateSeatNumber', { roomId, openId: userId, newSeatNumber });
  return res.body;
}

async function kickPlayer(roomId, playerId, mode, openId) {
  const res = await apiPost('/api/rooms/kickPlayer', { roomId, playerId, mode: mode || 'room', openId });
  return res.body;
}

async function banSeat(roomId, playerId, banned, openId) {
  const res = await apiPost(`/api/rooms/${roomId}/banSeat`, { playerId, banned, openId });
  return res.body;
}

async function updateRoomConfig(roomId, roomConfig, openId) {
  const res = await apiPut(`/api/rooms/${roomId}/config`, { roomConfig, openId });
  return res.body;
}

async function transferOwner(roomId, currentOwnerId, newOwnerId) {
  const res = await apiPost(`/api/rooms/${roomId}/transferOwner`, { currentOwnerId, newOwnerId });
  return res.body;
}

async function disband(roomId, openId) {
  const res = await apiPost(`/api/rooms/${roomId}/disband`, { openId });
  return res.body;
}

async function randomSeats(roomId, openId) {
  const res = await apiPost(`/api/rooms/${roomId}/randomSeats`, { openId });
  return res.body;
}

async function roomStats() {
  const res = await apiGet('/api/rooms/stats/summary');
  return res.body;
}

async function cleanupRooms(hours) {
  const res = await apiPost('/api/rooms/cleanup', { hours: hours == null ? 24 : hours });
  return res.body;
}

// 在最小配置基础上附加观战配置
function buildConfigWithSpectator(spectator) {
  const config = buildMinimalRoomConfig();
  config.spectator = spectator;
  return config;
}

// ---- Game workflow helpers (all use gameId, not roomId) ----

async function startGame(roomId, openId) {
  const res = await apiPost('/api/games/start', { roomId, openId });
  return res.body;
}

async function getGameState(gameId, openId) {
  const path = openId ? `/api/games/${gameId}?openId=${openId}` : `/api/games/${gameId}`;
  const res = await apiGet(path);
  return res.body;
}

async function confirmReveal(gameId, openId) {
  const res = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId });
  return res.body;
}

// 全员确认角色揭示（替代原 advancePhase 快速推进；每个玩家调用一次）
async function confirmRevealAll(gameId, players) {
  let state = null;
  for (const p of players) {
    state = await confirmReveal(gameId, p.openId);
  }
  return state;
}

// 推进到 discussion 阶段：confirmRevealAll → (若 preNominate) submitPreNomination → selectSpeakingOrder
// 用于测试快速进入发车前的讨论阶段；若已处于 discussion 则不做任何事
async function driveToDiscussion(gameId, players) {
  let state = await getGameState(gameId);
  if (state.current.phase === 'roleReveal') {
    state = await confirmRevealAll(gameId, players);
  }
  if (state.current.phase === 'preNominate') {
    const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
    const preRes = await submitPreNomination(gameId, leader.openId, []);
    if (!preRes.success) throw new Error('submitPreNomination failed: ' + JSON.stringify(preRes));
    const orderRes = await selectSpeakingOrder(gameId, leader.openId, 'asc');
    if (!orderRes.success) throw new Error('selectSpeakingOrder failed: ' + JSON.stringify(orderRes));
    state = await getGameState(gameId);
  }
  if (state.current.phase !== 'discussion') {
    throw new Error('driveToDiscussion: unexpected phase ' + state.current.phase);
  }
  return state;
}

async function submitNomination(gameId, openId, nominatedTeam, forcedCar) {
  const body = { gameId, openId, nominatedTeam };
  if (forcedCar !== undefined) body.forcedCar = forcedCar;
  const res = await apiPost('/api/games/submitNomination', body);
  return res.body;
}

async function castVote(gameId, openId, vote) {
  const res = await apiPost('/api/games/castVote', { gameId, openId, vote });
  return res.body;
}

async function castMissionVote(gameId, openId, vote, playerRole) {
  const res = await apiPost('/api/games/castMissionVote', { gameId, openId, vote, playerRole });
  return res.body;
}

async function assassinate(gameId, killerOpenId, targetOpenId) {
  const res = await apiPost(`/api/games/${gameId}/assassinate`, { killerOpenId, targetOpenId });
  return res.body;
}

async function endGame(gameId) {
  const res = await apiPost('/api/games/end', { gameId });
  return res.body;
}

async function submitPreNomination(gameId, openId, preNominatedTeam) {
  const res = await apiPost('/api/games/preNominate', { gameId, openId, preNominatedTeam });
  return res.body;
}

async function selectSpeakingOrder(gameId, openId, speakingOrder) {
  const res = await apiPost('/api/games/speakingOrder', { gameId, openId, speakingOrder });
  return res.body;
}

async function lakeInspect(gameId, openId, targetOpenId) {
  const res = await apiPost(`/api/games/${gameId}/lakeInspect`, { openId, targetOpenId });
  return res.body;
}

async function confirmLancelot(gameId, openId) {
  const res = await apiPost(`/api/games/${gameId}/confirmLancelot`, { openId });
  return res.body;
}

async function abandonGame(gameId, openId) {
  const res = await apiPost(`/api/games/${gameId}/abandon`, { openId });
  return res.body;
}

/**
 * Create a room with N players, all joined and ready.
 * Returns { roomId, players: [{openId, nickName, seatNumber}], hostId }
 */
async function createRoomWithPlayers(playerCount, roomConfig) {
  const hostId = makeUserId();
  const hostNick = makeNickName(hostId);
  const createResult = roomConfig
    ? await createRoomWithConfig(hostId, hostNick, roomConfig)
    : await createRoom(hostId, hostNick);
  if (!createResult.success) throw new Error(`Failed to create room: ${JSON.stringify(createResult)}`);
  const roomId = createResult.roomId;
  const players = [{ openId: hostId, nickName: hostNick, seatNumber: 1 }];

  for (let i = 1; i < playerCount; i++) {
    const uid = makeUserId();
    const result = await joinRoom(roomId, uid, i + 1, makeNickName(uid));
    if (!result.success) throw new Error(`Failed to join room: ${JSON.stringify(result)}`);
    players.push({ openId: uid, nickName: makeNickName(uid), seatNumber: i + 1 });
  }

  for (const p of players) {
    await toggleReady(roomId, p.openId, true);
  }

  return { roomId, players, hostId };
}

/**
 * Create room + start game with N players.
 * Returns { roomId, gameId, players, hostId }.
 * players have openId, nickName, seatNumber, role, side resolved from game state.
 */
async function createRoomAndStartGame(playerCount, roomConfig) {
  const { roomId, players, hostId } = await createRoomWithPlayers(playerCount, roomConfig || buildStandardRoomConfig(playerCount));
  const startResult = await startGame(roomId, hostId);
  if (!startResult.success) throw new Error(`Failed to start game: ${JSON.stringify(startResult)}`);
  const gameId = startResult.gameId;
  const gameState = await getGameState(gameId);
  if (!gameState.success) throw new Error(`Failed to get game state: ${JSON.stringify(gameState)}`);
  const enrichedPlayers = players.map(p => {
    const gp = gameState.players.find(gp => gp.openId === p.openId);
    return { ...p, role: gp.role, side: gp.side };
  });
  return { roomId, gameId, players: enrichedPlayers, hostId };
}

/**
 * Build a roomConfig with specific good/evil role arrays for Lancelot variant testing.
 */
function buildLancelotVariantConfig(variant) {
  const baseConfig = buildMinimalRoomConfig();
  if (variant === 'blue') {
    baseConfig.roles = {
      good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'lancelotBlue'],
      evil: ['morgana', 'assassin', 'mordred', 'oberon']
    };
  } else if (variant === 'red') {
    baseConfig.roles = {
      good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal'],
      evil: ['lancelotRed', 'morgana', 'assassin', 'mordred', 'oberon']
    };
  }
  return baseConfig;
}

/**
 * Create a 10-player room with a specific Lancelot variant and start the game.
 */
async function createLancelotGame(variant) {
  const hostId = makeUserId();
  const hostNick = makeNickName(hostId);
  const roomConfig = buildLancelotVariantConfig(variant);
  const createResult = await createRoomWithConfig(hostId, hostNick, roomConfig);
  if (!createResult.success) throw new Error(`Failed to create room: ${JSON.stringify(createResult)}`);
  const roomId = createResult.roomId;
  const players = [{ openId: hostId, nickName: hostNick, seatNumber: 1 }];

  for (let i = 1; i < 10; i++) {
    const uid = makeUserId();
    const result = await joinRoom(roomId, uid, i + 1, makeNickName(uid));
    if (!result.success) throw new Error(`Failed to join: ${JSON.stringify(result)}`);
    players.push({ openId: uid, nickName: makeNickName(uid), seatNumber: i + 1 });
  }

  for (const p of players) {
    await toggleReady(roomId, p.openId, true);
  }

  const startResult = await startGame(roomId, hostId);
  if (!startResult.success) throw new Error(`Failed to start: ${JSON.stringify(startResult)}`);
  const gameId = startResult.gameId;
  const gameState = await getGameState(gameId);
  const enrichedPlayers = players.map(p => {
    const gp = gameState.players.find(gp => gp.openId === p.openId);
    return { ...p, role: gp.role, side: gp.side };
  });
  return { roomId, gameId, players: enrichedPlayers, hostId, variant };
}

module.exports = {
  setRequest,
  request,
  TEST_SERVER_URL,
  TEST_PREFIX,
  makeUserId,
  makeNickName,
  apiGet,
  apiPost,
  apiPut,
  createRoom,
  createRoomWithConfig,
  buildConfigWithSpectator,
  buildStandardRoomConfig,
  buildCustomBoard10,
  buildCustomBoard9,
  withConfigOverrides,
  joinRoom,
  getRoom,
  toggleReady,
  leaveRoom,
  updateSeatNumber,
  kickPlayer,
  banSeat,
  updateRoomConfig,
  transferOwner,
  disband,
  randomSeats,
  roomStats,
  cleanupRooms,
  startGame,
  getGameState,
  confirmReveal,
  confirmRevealAll,
  driveToDiscussion,
  submitNomination,
  castVote,
  castMissionVote,
  assassinate,
  endGame,
  submitPreNomination,
  selectSpeakingOrder,
  lakeInspect,
  confirmLancelot,
  abandonGame,
  createRoomWithPlayers,
  createRoomAndStartGame,
  createLancelotGame,
};
