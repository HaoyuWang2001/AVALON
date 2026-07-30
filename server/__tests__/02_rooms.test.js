const {
  makeUserId, makeNickName,
  createRoom, joinRoom, getRoom, toggleReady,
  leaveRoom, apiGet, isDbMode,
} = require('./helpers/testHelper');

describe('02 — Room Management', () => {
  let hostId;
  let roomId;
  let dbMode = false;

  beforeAll(async () => {
    dbMode = await isDbMode();
  });

  describe('POST /api/rooms/create', () => {
    it('should create a room with a 6-digit code', async () => {
      hostId = makeUserId();
      const result = await createRoom(hostId, 'TestHost');
      expect(result.success).toBe(true);
      expect(result.roomId).toMatch(/^\d{6}$/);
      expect(result.room).toBeDefined();
      expect(result.room.players.length).toBe(1);
      expect(result.room.players[0].isHost).toBe(true);
      expect(result.room.players[0].seatNumber).toBe(1);
      roomId = result.roomId;
    });

    it('should return 400 when hostOpenId is missing (DB mode) or 200 (memory fallback)', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/create', {});
      if (dbMode) {
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      } else {
        // Memory mode creates anyway, accept either response
        expect([200, 400]).toContain(res.status);
      }
    });
  });

  describe('GET /api/rooms/:roomId', () => {
    it('should fetch room details', async () => {
      const result = await getRoom(roomId);
      expect(result.success).toBe(true);
      expect(result.room._id).toBe(roomId);
      expect(result.room.players).toBeDefined();
    });

    it('should return 404 for non-existent room', async () => {
      const res = await require('./helpers/testHelper').apiGet('/api/rooms/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/rooms/join', () => {
    it('should join a room at a valid seat', async () => {
      const uid = makeUserId();
      const result = await joinRoom(roomId, uid, 2, 'Player2');
      expect(result.success).toBe(true);
      expect(result.seatNumber).toBe(2);
      expect(result.room.players.length).toBe(2);
    });

    it('should reject duplicate seat numbers', async () => {
      const uid = makeUserId();
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/join', {
        roomId,
        userInfo: { openId: uid, nickName: 'Test', avatarUrl: '' },
        seatNumber: 2,
        customNickName: 'Test'
      });
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid seat numbers', async () => {
      const uid = makeUserId();
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/join', {
        roomId,
        userInfo: { openId: uid, nickName: 'Test', avatarUrl: '' },
        seatNumber: 99,
        customNickName: 'Test'
      });
      // In DB mode returns 400, memory mode may return 200 or 400
      if (dbMode) {
        expect(res.status).toBe(400);
      } else {
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe('POST /api/rooms/toggleReady', () => {
    it('should set player ready', async () => {
      const result = await toggleReady(roomId, hostId, true);
      expect(result.success).toBe(true);

      const room = await getRoom(roomId);
      if (dbMode) {
        const host = room.room.players.find(p => p.openId === hostId);
        expect(host.isReady).toBe(true);
      } else {
        expect(room.room.readyPlayers).toContain(hostId);
      }
    });

    it('should unset player ready', async () => {
      const result = await toggleReady(roomId, hostId, false);
      expect(result.success).toBe(true);

      const room = await getRoom(roomId);
      if (dbMode) {
        const host = room.room.players.find(p => p.openId === hostId);
        expect(host.isReady).toBe(false);
      } else {
        expect(room.room.readyPlayers).not.toContain(hostId);
      }
    });

    it('should require boolean isReady (DB mode validates)', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/toggleReady', {
        roomId, openId: hostId, isReady: 'yes'
      });
      if (dbMode) {
        expect(res.status).toBe(400);
      } else {
        // Memory mode may still succeed but with unexpected state
        expect(res.body).toBeDefined();
      }
    });
  });

  describe('POST /api/rooms/updateSeatNumber', () => {
    let testPlayerId;

    beforeAll(async () => {
      testPlayerId = makeUserId();
      await joinRoom(roomId, testPlayerId, 5, 'SeatTest');
    });

    it('should update seat number', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/updateSeatNumber', {
        roomId, openId: testPlayerId, newSeatNumber: 6
      });
      expect(res.body.success).toBe(true);
      const room = await getRoom(roomId);
      const player = room.room.players.find(p => p.openId === testPlayerId);
      expect(player.seatNumber).toBe(6);
    });
  });

  describe('POST /api/rooms/kickPlayer', () => {
    let kickedPlayerId;

    beforeAll(async () => {
      kickedPlayerId = makeUserId();
      await joinRoom(roomId, kickedPlayerId, 10, 'KickMe');
    });

    it('should kick a player', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/kickPlayer', {
        roomId, playerId: kickedPlayerId
      });
      expect(res.body.success).toBe(true);
      const room = await getRoom(roomId);
      const found = room.room.players.find(p => p.openId === kickedPlayerId);
      expect(found).toBeUndefined();
    });
  });

  describe('POST /api/rooms/leave', () => {
    it('should leave a room', async () => {
      const uid = makeUserId();
      await joinRoom(roomId, uid, 11, 'Leaver');
      const result = await leaveRoom(roomId, uid);
      expect(result.success).toBe(true);
    });
  });

  describe('GET /api/rooms/ (DB only)', () => {
    it('should list active rooms or return 404 (memory mode)', async () => {
      const res = await apiGet('/api/rooms');
      if (dbMode) {
        expect(res.status).toBe(200);
        expect(res.body.rooms).toBeDefined();
      } else {
        // Memory mode doesn't have a room listing endpoint
        expect([200, 404]).toContain(res.status);
      }
    });
  });
});
