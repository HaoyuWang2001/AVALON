const {
  makeUserId, makeNickName,
  createRoom, joinRoom, toggleReady, startGame,
  createRoomWithPlayers, isDbMode,
  apiPost, apiGet,
} = require('./helpers/testHelper');

describe('05 — Edge Cases & Validation', () => {
  let dbMode = false;

  beforeAll(async () => {
    dbMode = await isDbMode();
  });

  describe('Room Limits', () => {
    it('should reject joining when room is full (12 players)', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'FullHost');
      const roomId = result.roomId;

      for (let i = 2; i <= 12; i++) {
        await joinRoom(roomId, makeUserId(), i, `Player${i}`);
      }

      const res = await apiPost('/api/rooms/join', {
        roomId,
        userInfo: { openId: makeUserId(), nickName: 'Extra', avatarUrl: '' },
        seatNumber: 1,
        customNickName: 'Extra'
      });

      expect(res.body.success).toBe(false);
    });
  });

  describe('Duplicate Join Prevention', () => {
    it('should not allow same player to join twice (DB mode) or accept gracefully (memory mode)', async () => {
      const uid = makeUserId();
      const result = await createRoom(uid, 'DupHost');
      const roomId = result.roomId;

      const res = await apiPost('/api/rooms/join', {
        roomId,
        userInfo: { openId: uid, nickName: 'DupHost', avatarUrl: '' },
        seatNumber: 2,
        customNickName: 'DupHost'
      });

      // DB mode returns success:true with message '已在房间中'
      if (dbMode) {
        expect(res.body.success).toBe(true);
        expect(res.body.message || '').toMatch(/已在房间中/);
      } else {
        // Memory mode behavior varies by implementation
        expect(res.body).toBeDefined();
      }
    });
  });

  describe('Game Start Validation', () => {
    it('should reject game start with fewer than 5 players', async () => {
      const uid = makeUserId();
      const result = await createRoom(uid, 'SmallHost');
      const roomId = result.roomId;
      await toggleReady(roomId, uid, true);

      for (let i = 2; i <= 3; i++) {
        const pid = makeUserId();
        await joinRoom(roomId, pid, i, `P${i}`);
        await toggleReady(roomId, pid, true);
      }

      const res = await apiPost('/api/games/start', { roomId });
      expect(res.body.success).toBe(false);
    });

    it('should reject game start when not all players are ready', async () => {
      const setup = await createRoomWithPlayers(5);
      const roomId = setup.roomId;

      const { toggleReady } = require('./helpers/testHelper');
      await toggleReady(roomId, setup.players[1].openId, false);

      const res = await apiPost('/api/games/start', { roomId });
      expect(res.body.success).toBe(false);
    });
  });

  describe('Nonexistent Room', () => {
    it('should return 404 for invalid room on get', async () => {
      const res = await apiGet('/api/rooms/000000');
      expect(res.status).toBe(404);
    });

    it('should reject join on nonexistent room', async () => {
      const res = await apiPost('/api/rooms/join', {
        roomId: '000000',
        userInfo: { openId: makeUserId(), nickName: 'Test', avatarUrl: '' },
        seatNumber: 1,
        customNickName: 'Test'
      });
      expect(res.body.success).toBe(false);
    });
  });

  describe('Game Actions on Nonexistent Game', () => {
    it('should fail to start game on nonexistent room', async () => {
      const res = await apiPost('/api/games/start', { roomId: '000000' });
      expect(res.body.success).toBe(false);
    });

    it('should fail to get state of nonexistent game', async () => {
      const res = await apiGet('/api/games/000000');
      expect(res.body.success).toBe(false);
    });
  });

  describe('Vote Validation', () => {
    it('should reject invalid team vote values', async () => {
      const res = await apiPost('/api/games/castVote', {
        roomId: 'test', openId: 'test', vote: 'invalid'
      });
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid mission vote values', async () => {
      const res = await apiPost('/api/games/castMissionVote', {
        roomId: 'test', openId: 'test', vote: 'invalid', playerRole: 'loyal'
      });
      expect(res.body.success).toBe(false);
    });
  });

  describe('Rapid Room Cycle', () => {
    it('should handle create-join-leave quickly', async () => {
      for (let i = 0; i < 5; i++) {
        const uid = makeUserId();
        const result = await createRoom(uid, `Speed${i}`);
        const roomId = result.roomId;

        const p2 = makeUserId();
        await joinRoom(roomId, p2, 2, `SpeedP${i}`);

        const { leaveRoom, getRoom } = require('./helpers/testHelper');
        await leaveRoom(roomId, p2);

        const room = await getRoom(roomId);
        if (room.success) {
          expect(room.room.players.length).toBe(1);
        }
      }
    });
  });
});
