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

// ---- Room workflow helpers ----

function buildMinimalRoomConfig() {
  return {
    roles: {
      good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'loyal'],
      evil: ['morgana', 'assassin', 'mordred', 'oberon']
    },
    rules: {
      evilKnowsEachOther: true,
      lancelotsKnowEachOther: true,
      lancelotSwapRound: 2,
      ladyOfTheLake: false,
      ladyOfTheLakeRound: 2,
      maxFailedNominations: 3,
      oberonMustFailMission: false,
      redLancelotMustFailMission: false,
      voteVisibility: 'anonymous',
      missionFailDetail: 'count'
    },
    limits: { speechTimeout: null, roundTimeout: null, voteTimeout: null },
    meta: { roomName: 'Test Room', roomDescription: '', tags: [] },
    merlinVision: {
      canSee: ['assassin', 'morgana', 'minion', 'oberon', 'lancelotRed', 'lancelotBlue'],
      canIdentify: []
    }
  };
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

// ---- Game workflow helpers (all use gameId, not roomId) ----

async function startGame(roomId) {
  const res = await apiPost('/api/games/start', { roomId });
  return res.body;
}

async function getGameState(gameId, openId) {
  const path = openId ? `/api/games/${gameId}?openId=${openId}` : `/api/games/${gameId}`;
  const res = await apiGet(path);
  return res.body;
}

async function advancePhase(gameId) {
  const res = await apiPost(`/api/games/${gameId}/advancePhase`, {});
  return res.body;
}

async function submitNomination(gameId, openId, nominatedTeam) {
  const res = await apiPost('/api/games/submitNomination', { gameId, openId, nominatedTeam });
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

// ---- Message helpers ----

async function sendMessage(roomId, openId, nickName, content, type) {
  const res = await apiPost('/api/messages/send', {
    roomId, openId, nickName: nickName || makeNickName(openId),
    content, type: type || 'text'
  });
  return res.body;
}

async function getMessages(roomId, limit, beforeTime) {
  let path = `/api/messages/${roomId}?limit=${limit || 50}`;
  if (beforeTime) path += `&beforeTime=${encodeURIComponent(beforeTime)}`;
  const res = await apiGet(path);
  return res.body;
}

async function getLatestMessages(roomId, limit) {
  const res = await apiGet(`/api/messages/${roomId}/latest?limit=${limit || 20}`);
  return res.body;
}

/**
 * Create a room with N players, all joined and ready.
 * Returns { roomId, players: [{openId, nickName, seatNumber}], hostId }
 */
async function createRoomWithPlayers(playerCount) {
  const hostId = makeUserId();
  const hostNick = makeNickName(hostId);
  const createResult = await createRoom(hostId, hostNick);
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
async function createRoomAndStartGame(playerCount) {
  const { roomId, players, hostId } = await createRoomWithPlayers(playerCount);
  const startResult = await startGame(roomId);
  if (!startResult.success) throw new Error(`Failed to start game: ${JSON.stringify(startResult)}`);
  const gameId = startResult.gameId;
  const gameState = await getGameState(gameId);
  if (!gameState.success) throw new Error(`Failed to get game state: ${JSON.stringify(gameState)}`);
  const enrichedPlayers = players.map(p => {
    const gp = gameState.game.players.find(gp => gp.openId === p.openId);
    return { ...p, role: gp.role, side: gp.side };
  });
  return { roomId, gameId, players: enrichedPlayers, hostId };
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
  createRoom,
  joinRoom,
  getRoom,
  toggleReady,
  leaveRoom,
  startGame,
  getGameState,
  advancePhase,
  submitNomination,
  castVote,
  castMissionVote,
  assassinate,
  endGame,
  sendMessage,
  getMessages,
  getLatestMessages,
  createRoomWithPlayers,
  createRoomAndStartGame,
};
