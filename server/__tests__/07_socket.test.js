const path = require('path');
const fs = require('fs');
const { connectClients, disconnectAll, waitForEvent } = require('./helpers/socketHelper');

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

  describe('Connection', () => {
    it('should connect N clients successfully', async () => {
      clients = await connectClients(port, 3);
      expect(clients.length).toBe(3);
      for (const client of clients) {
        expect(client.connected).toBe(true);
      }
    });
  });

  describe('joinRoom broadcast', () => {
    it('should broadcast playerJoined to other clients', async () => {
      const roomId = 'test123';
      const playerId = 'player_a';

      const promise = waitForEvent(clients[1], 'playerJoined');
      clients[0].emit('joinRoom', { roomId, playerId });

      const data = await promise;
      expect(data.playerId).toBe(playerId);
    });
  });

  describe('roomUpdate broadcast', () => {
    it('should broadcast roomUpdated to room', async () => {
      const roomId = 'test123';
      const updateData = { roomId, action: 'toggleReady', playerId: 'p1' };

      clients[0].emit('joinRoom', { roomId, playerId: 'p1' });
      clients[1].emit('joinRoom', { roomId, playerId: 'p2' });

      const promise = waitForEvent(clients[1], 'roomUpdated');
      clients[0].emit('roomUpdate', updateData);

      const data = await promise;
      expect(data.action).toBe('toggleReady');
    });
  });

  describe('gameUpdate broadcast', () => {
    it('should broadcast gameUpdated to room', async () => {
      const roomId = 'test456';
      const updateData = { roomId, phase: 'teamSelection' };

      clients[0].emit('joinRoom', { roomId, playerId: 'p3' });
      clients[1].emit('joinRoom', { roomId, playerId: 'p4' });

      const promise = waitForEvent(clients[1], 'gameUpdated');
      clients[0].emit('gameUpdate', updateData);

      const data = await promise;
      expect(data.phase).toBe('teamSelection');
    });
  });

  describe('message broadcast', () => {
    it('should broadcast newMessage to room', async () => {
      const roomId = 'test789';
      const msgData = { roomId, content: 'Hello Socket', type: 'text' };

      clients[0].emit('joinRoom', { roomId, playerId: 'p5' });
      clients[2].emit('joinRoom', { roomId, playerId: 'p6' });

      const promise = waitForEvent(clients[2], 'newMessage');
      clients[0].emit('message', msgData);

      const data = await promise;
      expect(data.content).toBe('Hello Socket');
    });
  });

  describe('leaveRoom broadcast', () => {
    it('should broadcast playerLeft on leave', async () => {
      const roomId = 'leave_test';
      const playerId = 'leaver';

      clients[0].emit('joinRoom', { roomId, playerId: 'p7' });
      clients[0].emit('joinRoom', { roomId, playerId });
      clients[1].emit('joinRoom', { roomId, playerId: 'p8' });

      const promise = waitForEvent(clients[1], 'playerLeft');
      clients[0].emit('leaveRoom', { roomId, playerId });

      const data = await promise;
      expect(data.playerId).toBe(playerId);
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect gracefully', async () => {
      const extra = await require('./helpers/socketHelper').createClient(port);
      expect(extra.connected).toBe(true);
      extra.disconnect();
      expect(extra.connected).toBe(false);
    });
  });
});
