const path = require('path');
const fs = require('fs');
const { connectClients, disconnectAll, waitForEvent, createClient } = require('./helpers/socketHelper');

function getServerPort() {
  const configFile = path.resolve(__dirname, '../node_modules/.tmp/test-server.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return config.port;
}

describe('07 — Socket.io Real-time Communication', () => {
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
    const promise = waitForEvent(clients[1], 'playerJoined');
    clients[0].emit('joinRoom', { roomId, playerId: 'player_a' });
    const data = await promise;
    expect(data.playerId).toBe('player_a');
  });

  it('should broadcast roomUpdated on roomUpdate', async () => {
    const roomId = 'test_room_update';
    clients[0].emit('joinRoom', { roomId, playerId: 'p1' });
    clients[1].emit('joinRoom', { roomId, playerId: 'p2' });

    const promise = waitForEvent(clients[1], 'roomUpdated');
    clients[0].emit('roomUpdate', { roomId, action: 'toggleReady', playerId: 'p1' });
    const data = await promise;
    expect(data.action).toBe('toggleReady');
  });

  it('should broadcast gameUpdated on gameUpdate', async () => {
    const roomId = 'test_game_update';
    clients[0].emit('joinRoom', { roomId, playerId: 'p3' });
    clients[1].emit('joinRoom', { roomId, playerId: 'p4' });

    const promise = waitForEvent(clients[1], 'gameUpdated');
    clients[0].emit('gameUpdate', { roomId, phase: 'teamSelection' });
    const data = await promise;
    expect(data.phase).toBe('teamSelection');
  });

  it('should broadcast newMessage on message', async () => {
    const roomId = 'test_message';
    clients[0].emit('joinRoom', { roomId, playerId: 'p5' });
    clients[2].emit('joinRoom', { roomId, playerId: 'p6' });

    const promise = waitForEvent(clients[2], 'newMessage');
    clients[0].emit('message', { roomId, content: 'Hello Socket', type: 'text' });
    const data = await promise;
    expect(data.content).toBe('Hello Socket');
  });

  it('should broadcast playerLeft on leaveRoom', async () => {
    const roomId = 'leave_socket_test';
    clients[0].emit('joinRoom', { roomId, playerId: 'leaver' });
    clients[1].emit('joinRoom', { roomId, playerId: 'observer' });

    const promise = waitForEvent(clients[1], 'playerLeft');
    clients[0].emit('leaveRoom', { roomId, playerId: 'leaver' });
    const data = await promise;
    expect(data.playerId).toBe('leaver');
  });

  it('should handle disconnect', async () => {
    const extra = await createClient(port);
    expect(extra.connected).toBe(true);
    extra.disconnect();
    expect(extra.connected).toBe(false);
  });
});
