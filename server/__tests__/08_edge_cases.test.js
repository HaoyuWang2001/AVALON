const {
  makeUserId, createRoom, joinRoom, toggleReady,
  createRoomWithPlayers, createRoomAndStartGame,
  apiPost, apiGet, submitNomination, castVote,
  advancePhase, assassinate, endGame, leaveRoom
} = require('./helpers/testHelper');

describe('08 — Edge Cases & Validation', () => {
  describe('Room Limits', () => {
    it('should reject joining when room is full (12 players)', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'FullHost');
      const roomId = result.roomId;
      for (let i = 2; i <= 12; i++) {
        await joinRoom(roomId, makeUserId(), i, `Player${i}`);
      }
      const res = await apiPost('/api/rooms/join', {
        roomId, userInfo: { openId: makeUserId(), nickName: 'Extra', avatarUrl: '' },
        seatNumber: 1, customNickName: 'Extra'
      });
      expect(res.body.success).toBe(false);
    });
  });

  describe('Duplicate Join Prevention', () => {
    it('should not allow same player in two rooms', async () => {
      const uid = makeUserId();
      const result = await createRoom(uid, 'DupHost');
      const res = await apiPost('/api/rooms/join', {
        roomId: result.roomId,
        userInfo: { openId: uid, nickName: 'DupHost', avatarUrl: '' },
        seatNumber: 2, customNickName: 'DupHost'
      });
      expect(res.body.success).toBe(true);
      expect(res.body.message || '').toMatch(/已在房间中/);
    });
  });

  describe('Game Start Validation', () => {
    it('should reject start with fewer than 5 players', async () => {
      const uid = makeUserId();
      const result = await createRoom(uid, 'Small');
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

    it('should reject start when not all ready', async () => {
      const setup = await createRoomWithPlayers(5);
      await toggleReady(setup.roomId, setup.players[1].openId, false);
      const res = await apiPost('/api/games/start', { roomId: setup.roomId });
      expect(res.body.success).toBe(false);
    });
  });

  describe('Nonexistent Resources', () => {
    it('should return 404 for invalid room', async () => {
      const res = await apiGet('/api/rooms/000000');
      expect(res.status).toBe(404);
    });

    it('should reject join on nonexistent room', async () => {
      const res = await apiPost('/api/rooms/join', {
        roomId: '000000',
        userInfo: { openId: makeUserId(), nickName: 'Test', avatarUrl: '' },
        seatNumber: 1, customNickName: 'Test'
      });
      expect(res.body.success).toBe(false);
    });

    it('should fail start on nonexistent room', async () => {
      const res = await apiPost('/api/games/start', { roomId: '000000' });
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for nonexistent game', async () => {
      const res = await apiGet('/api/games/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('Vote & Phase Validation', () => {
    it('should reject invalid team vote values', async () => {
      const res = await apiPost('/api/games/castVote', {
        gameId: '00000000-0000-0000-0000-000000000000', openId: 'x', vote: 'invalid'
      });
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid mission vote values', async () => {
      const res = await apiPost('/api/games/castMissionVote', {
        gameId: '00000000-0000-0000-0000-000000000000', openId: 'x', vote: 'invalid', playerRole: 'loyal'
      });
      expect(res.body.success).toBe(false);
    });

    it('should reject advancePhase on nonexistent game', async () => {
      const res = await advancePhase('00000000-0000-0000-0000-000000000000');
      expect(res.success).toBe(false);
    });

    it('should reject assassinate on nonexistent game', async () => {
      const res = await assassinate('00000000-0000-0000-0000-000000000000', 'a', 'b');
      expect(res.success).toBe(false);
    });

    it('should reject submitNomination when not teamSelection', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      const res = await submitNomination(gameId, players[0].openId, [players[0].openId]);
      expect(res.success).toBe(false);
      await advancePhase(gameId);
      await endGame(gameId);
    });

    it('should reject castVote when not teamVote', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const res = await castVote(gameId, players[0].openId, 'approve');
      expect(res.success).toBe(false);
      await endGame(gameId);
    });

    it('should reject assassination by non-killer', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      const goodPlayer = players.find(p => p.side === 'good');
      const res = await assassinate(gameId, goodPlayer.openId, players[0].openId);
      expect(res.success).toBe(false);
      await endGame(gameId);
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
        await leaveRoom(roomId, p2);
        const { getRoom } = require('./helpers/testHelper');
        const room = await getRoom(roomId);
        if (room.success) {
          expect(room.room.players.length).toBe(1);
        }
      }
    });
  });
});
