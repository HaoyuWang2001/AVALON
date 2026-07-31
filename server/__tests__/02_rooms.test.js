const {
  makeUserId, makeNickName,
  createRoom, joinRoom, getRoom, toggleReady,
  leaveRoom, apiGet
} = require('./helpers/testHelper');

describe('02 — Room Management', () => {
  let hostId;
  let roomId;

  describe('POST /api/rooms/create', () => {
    it('should create a room with a 6-digit code', async () => {
      hostId = makeUserId();
      const result = await createRoom(hostId, 'TestHost');
      expect(result.success).toBe(true);
      expect(result.roomId).toMatch(/^\d{6}$/);
      expect(result.room).toBeDefined();
      roomId = result.roomId;
    });

    it('should return 400 when roomConfig is missing', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/create', {
        hostOpenId: makeUserId(),
        hostNickName: 'Test'
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when roomConfig has invalid role name', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/rooms/create', {
        hostOpenId: makeUserId(),
        hostNickName: 'Test',
        roomConfig: {
          roles: { good: ['merlin'], evil: ['invalid_role'] },
          rules: {
            evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2,
            ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
            oberonMustFailMission: false, redLancelotMustFailMission: false,
            voteVisibility: 'anonymous', missionFailDetail: 'count'
          }
        }
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/rooms/:roomId', () => {
    it('should fetch room details', async () => {
      const result = await getRoom(roomId);
      expect(result.success).toBe(true);
      expect(result.room._id).toBe(roomId);
    });

    it('should return 404 for non-existent room', async () => {
      const res = await apiGet('/api/rooms/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/rooms/join', () => {
    it('should join a room at a valid seat', async () => {
      const uid = makeUserId();
      const result = await joinRoom(roomId, uid, 2, 'Player2');
      expect(result.success).toBe(true);
      expect(result.seatNumber).toBe(2);
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
  });

  describe('POST /api/rooms/toggleReady', () => {
    it('should set player ready', async () => {
      const result = await toggleReady(roomId, hostId, true);
      expect(result.success).toBe(true);

      const room = await getRoom(roomId);
      const host = room.room.players.find(p => p.openId === hostId);
      expect(host.isReady).toBe(true);
    });

    it('should unset player ready', async () => {
      const result = await toggleReady(roomId, hostId, false);
      expect(result.success).toBe(true);

      const room = await getRoom(roomId);
      const host = room.room.players.find(p => p.openId === hostId);
      expect(host.isReady).toBe(false);
    });
  });

  describe('POST /api/rooms/leave', () => {
    it('should leave a room', async () => {
      const uid = makeUserId();
      await joinRoom(roomId, uid, 3, 'Leaver');
      const result = await leaveRoom(roomId, uid);
      expect(result.success).toBe(true);
    });
  });

  describe('GET /api/rooms/ (room listing)', () => {
    it('should list active rooms', async () => {
      const res = await apiGet('/api/rooms');
      expect(res.status).toBe(200);
      expect(res.body.rooms).toBeDefined();
    });
  });
});
