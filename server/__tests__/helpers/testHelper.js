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

let _isDbMode = null;

async function isDbMode() {
  if (_isDbMode !== null) return _isDbMode;
  try {
    const res = await apiGet('/api/health');
    _isDbMode = res.body.database.initialized === true && res.body.database.connected === true;
  } catch (e) {
    _isDbMode = false;
  }
  return _isDbMode;
}

function getServerMode() {
  if (TEST_SERVER_URL) return 'remote';
  try {
    const fs = require('fs');
    const path = require('path');
    const configFile = path.resolve(__dirname, '../../node_modules/.tmp/test-server.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return config.mode || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

async function apiGet(path) {
  const res = await request().get(path);
  return res;
}

async function apiPost(path, body) {
  const res = await request().post(path).send(body);
  return res;
}

// ---- Room workflow helpers ----

async function createRoom(hostId, hostNick) {
  const res = await apiPost('/api/rooms/create', {
    hostOpenId: hostId,
    hostNickName: hostNick || makeNickName(hostId),
    hostAvatarUrl: ''
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

async function startGame(roomId) {
  const res = await apiPost('/api/games/start', { roomId });
  return res.body;
}

async function getGameState(roomId, openId) {
  const path = openId ? `/api/games/${roomId}?openId=${openId}` : `/api/games/${roomId}`;
  const res = await apiGet(path);
  return res.body;
}

async function submitNomination(roomId, openId, nominatedTeam) {
  const res = await apiPost('/api/games/submitNomination', { roomId, openId, nominatedTeam });
  return res.body;
}

async function castVote(roomId, openId, vote) {
  const res = await apiPost('/api/games/castVote', { roomId, openId, vote });
  return res.body;
}

async function castMissionVote(roomId, openId, vote, playerRole) {
  const res = await apiPost('/api/games/castMissionVote', { roomId, openId, vote, playerRole });
  return res.body;
}

async function endGame(roomId) {
  const res = await apiPost('/api/games/end', { roomId });
  return res.body;
}

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
 * Create a room with N players, all ready to start.
 * Returns { roomId, players: [{openId, nickName, seatNumber}] }
 */
async function createRoomWithPlayers(playerCount, hostIndex) {
  const hostId = makeUserId();
  const hostNick = makeNickName(hostId);
  const createResult = await createRoom(hostId, hostNick);
  if (!createResult.success) throw new Error(`Failed to create room: ${JSON.stringify(createResult)}`);
  const roomId = createResult.roomId;
  const players = [{ openId: hostId, nickName: hostNick, seatNumber: 1 }];

  const otherPlayers = [];
  for (let i = 1; i < playerCount; i++) {
    const uid = makeUserId();
    otherPlayers.push({ openId: uid, nickName: makeNickName(uid), seatNumber: i + 1 });
  }

  for (const p of otherPlayers) {
    const result = await joinRoom(roomId, p.openId, p.seatNumber, p.nickName);
    if (!result.success) throw new Error(`Failed to join room: ${JSON.stringify(result)}`);
    players.push(p);
  }

  for (const p of players) {
    await toggleReady(roomId, p.openId, true);
  }

  return { roomId, players, hostId };
}

module.exports = {
  setRequest,
  request,
  TEST_SERVER_URL,
  TEST_PREFIX,
  makeUserId,
  makeNickName,
  isDbMode,
  getServerMode,
  apiGet,
  apiPost,
  createRoom,
  joinRoom,
  getRoom,
  toggleReady,
  leaveRoom,
  startGame,
  getGameState,
  submitNomination,
  castVote,
  castMissionVote,
  endGame,
  sendMessage,
  getMessages,
  getLatestMessages,
  createRoomWithPlayers,
};
