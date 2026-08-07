const path = require('path');
const fs = require('fs');
const { connectClients, disconnectAll, waitForEvent, createClient } = require('./helpers/socketHelper');
const {
  createRoomWithPlayers, startGame, getGameState, driveToDiscussion, driveToTeamNomination,
  submitNomination, castVote, buildCustomBoard10
} = require('./helpers/testHelper');

function getServerPort() {
  const configFile = path.resolve(__dirname, '../node_modules/.tmp/test-server.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return config.port;
}

describe('05 — WebSocket Real-time Communication', () => {
  let port;
  let clients;

  beforeAll(() => {
    port = getServerPort();
  });

  afterAll(() => {
    if (clients) disconnectAll(clients);
  });

  it('should connect 3 clients', async () => {
    clients = await connectClients(port, 3);
    expect(clients.length).toBe(3);
    for (const c of clients) {
      expect(c.connected).toBe(true);
    }
  });

  it('should broadcast playerJoined on joinRoom', async () => {
    const roomId = 'test_join_room';
    // Observer joins first so it receives the actor's playerJoined broadcast
    await joinRoomAndConfirm(clients[1], roomId, 'observer');

    const promise = waitForEvent(clients[1], 'playerJoined');
    clients[0].send('joinRoom', { roomId, playerId: 'player_a' });
    const data = await promise;
    expect(data.playerId).toBe('player_a');
  });

  it('should broadcast roomUpdated on roomUpdate', async () => {
    const roomId = 'test_room_update';
    await joinRoomAndConfirm(clients[1], roomId, 'p2');
    await joinRoomAndConfirm(clients[0], roomId, 'p1');

    const promise = waitForEvent(clients[1], 'roomUpdated');
    clients[0].send('roomUpdate', { roomId, action: 'toggleReady', playerId: 'p1' });
    const data = await promise;
    expect(data.action).toBe('toggleReady');
  });

  it('should broadcast gameUpdated on gameUpdate', async () => {
    const roomId = 'test_game_update';
    await joinRoomAndConfirm(clients[1], roomId, 'p4');
    await joinRoomAndConfirm(clients[0], roomId, 'p3');

    const promise = waitForEvent(clients[1], 'gameUpdated');
    clients[0].send('gameUpdate', { roomId, phase: 'discussion' });
    const data = await promise;
    expect(data.phase).toBe('discussion');
  });

  it('should broadcast playerLeft on leaveRoom', async () => {
    const roomId = 'leave_socket_test';
    await joinRoomAndConfirm(clients[1], roomId, 'observer');
    await joinRoomAndConfirm(clients[0], roomId, 'leaver');

    const promise = waitForEvent(clients[1], 'playerLeft');
    clients[0].send('leaveRoom', { roomId, playerId: 'leaver' });
    const data = await promise;
    expect(data.playerId).toBe('leaver');
  });

  it('should handle disconnect', async () => {
    const extra = await createClient(port);
    expect(extra.connected).toBe(true);
    extra.disconnect();
    expect(extra.connected).toBe(false);
  });

  // ─────────── 房间隔离：事件只到达本房间成员 ───────────
  it('should isolate room broadcasts between different rooms', async () => {
    const roomA = 'iso_room_a';
    const roomB = 'iso_room_b';
    await joinRoomAndConfirm(clients[0], roomA, 'a1');
    await joinRoomAndConfirm(clients[1], roomA, 'a2');
    await joinRoomAndConfirm(clients[2], roomB, 'b1');

    // roomB 的成员不应收到 roomA 的事件（600ms 内无 playerJoined 则判定未泄漏）
    clients[0].send('joinRoom', { roomId: roomA, playerId: 'a3' });
    let leaked = false;
    try {
      await waitForEvent(clients[2], 'playerJoined', 600);
      leaked = true;
    } catch (e) {
      leaked = false;
    }
    expect(leaked).toBe(false);
  });

  // ─────────── 新观众/断线重连：joinRoom 后收到当前游戏状态 ───────────
  it('should deliver current game state to a new spectator on joinRoom', async () => {
    const { roomId, gameId } = await createRoomAndStart10();
    // 推进到 discussion，再让 socket 观战者加入
    const fullPlayers = (await getGameState(gameId)).players;
    await driveToDiscussion(gameId, fullPlayers);
    await joinRoomAndConfirm(clients[1], roomId, 'spectator_s1');
    const state = await waitForEvent(clients[1], 'gameState');
    expect(state.state.basic.gameId).toBe(gameId);
    expect(state.state.current.phase).toBe('discussion');
    expect(state.state.basic.status).toBe('active');
  });

  it('should deliver current game state to a reconnecting player via requestState', async () => {
    const { roomId, gameId, players } = await createRoomAndStart10();
    await driveToDiscussion(gameId, players);
    await driveToTeamNomination(gameId, players);
    const st0 = await getGameState(gameId);
    const leader = players.find(p => p.openId === st0.current.teamLeaderOpenId);
    const team = [leader.openId, ...players.map(p => p.openId).filter(id => id !== leader.openId)].slice(0, 3);
    await submitNomination(gameId, leader.openId, team);
    await castVote(gameId, players[0].openId, 'approve');

    await joinRoomAndConfirm(clients[0], roomId, players[0].openId);
    const state = await waitForEvent(clients[0], 'gameState');
    // 断线重连保障：自己已投的票必含于 current.teamVotes
    expect(state.state.current.teamVotes[players[0].openId]).toBe('approve');
  });

  it('should return fresh state on explicit requestState', async () => {
    const { roomId, gameId } = await createRoomAndStart10();
    await joinRoomAndConfirm(clients[2], roomId, 'spectator_s2');
    clients[2].send('requestState', { roomId, playerId: 'spectator_s2' });
    const state = await waitForEvent(clients[2], 'gameState');
    expect(state.state.basic.gameId).toBe(gameId);
    expect(state.state.basic.status).toBe('active');
  });
});

/**
 * 发送 joinRoom 并等待服务端广播的 playerJoined 确认。
 * 服务端按连接顺序处理消息，等待自身收到的 playerJoined 可保证 join 已处理，
 * 避免跨连接竞态。
 */
function joinRoomAndConfirm(client, roomId, playerId) {
  const joined = waitForEvent(client, 'playerJoined');
  client.send('joinRoom', { roomId, playerId });
  return joined;
}

/** 创建自定义 10 人局并开局，返回 { roomId, gameId, players } */
async function createRoomAndStart10() {
  const { roomId, players, hostId } = await createRoomWithPlayers(10, buildCustomBoard10());
  const start = await startGame(roomId, hostId);
  if (!start.success) throw new Error('start failed: ' + JSON.stringify(start));
  const gameId = start.gameId;
  const st = await getGameState(gameId);
  const enriched = players.map(p => {
    const gp = st.players.find(x => x.openId === p.openId);
    return { ...p, role: gp.role, side: gp.side };
  });
  return { roomId, gameId, players: enriched };
}
