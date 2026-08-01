const {
  makeUserId, createRoom, createRoomWithConfig, buildConfigWithSpectator,
  joinRoom, getRoom, toggleReady, leaveRoom, updateSeatNumber,
  kickPlayer, banSeat, updateRoomConfig, transferOwner, disband,
  randomSeats, roomStats, cleanupRooms, startGame, apiGet, apiPost,
  createRoomWithPlayers
} = require('./helpers/testHelper');

const SPECTATOR_1 = { allow: true, max: 1 };
const SPECTATOR_OFF = { allow: false, max: 0 };

function validConfig() {
  return {
    roles: { good: ['merlin', 'percival', 'loyal'], evil: ['morgana', 'assassin'] },
    rules: {
      evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2,
      ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
      oberonMustFailMission: false, redLancelotMustFailMission: false,
      voteVisibility: 'anonymous', missionFailDetail: 'count'
    },
    limits: { speechTimeout: null, roundTimeout: null, voteTimeout: null },
    meta: { roomName: '', roomDescription: '', tags: [] },
    merlinVision: { canSee: [], canIdentify: [] }
  };
}

// 创建 5 人已开局房间（host 在 1 号座），用于"游戏已开始"相关门禁测试
async function startedRoom() {
  const hostId = makeUserId();
  const result = await createRoom(hostId, 'Host');
  const roomId = result.roomId;
  const players = [{ openId: hostId }];
  for (let i = 2; i <= 5; i++) {
    const uid = makeUserId();
    await joinRoom(roomId, uid, i, `P${i}`);
    players.push({ openId: uid });
  }
  for (const p of players) await toggleReady(roomId, p.openId, true);
  const startResult = await startGame(roomId, hostId);
  if (!startResult.success) throw new Error(`start failed: ${JSON.stringify(startResult)}`);
  return { roomId, hostId, players };
}

describe('02 — Room Management', () => {
  // ─────────────── 1. 创建房间 ───────────────
  describe('创建房间', () => {
    it('02.1 创建房间：6位码、房主入座1号、isHost', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      expect(result.success).toBe(true);
      expect(result.roomId).toMatch(/^\d{6}$/);
      expect(result.room.ownerId).toBe(hostId);
      const host = result.room.players.find(p => p.openId === hostId);
      expect(host.seatNumber).toBe(1);
      expect(host.isHost).toBe(true);
    });

    it('02.2 缺少 roomConfig 返回 400', async () => {
      const res = await apiPost('/api/rooms/create', { hostOpenId: makeUserId(), hostNickName: 'T' });
      expect(res.status).toBe(400);
    });

    it('02.3 无效角色名返回 400', async () => {
      const res = await apiPost('/api/rooms/create', {
        hostOpenId: makeUserId(), hostNickName: 'T',
        roomConfig: { roles: { good: ['merlin'], evil: ['invalid_role'] }, rules: { evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2, ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3, oberonMustFailMission: false, redLancelotMustFailMission: false, voteVisibility: 'anonymous', missionFailDetail: 'count' } }
      });
      expect(res.status).toBe(400);
    });

    it('02.4 已在其他房间再创建 → 400', async () => {
      const hostId = makeUserId();
      await createRoom(hostId, 'H');
      const res = await apiPost('/api/rooms/create', { hostOpenId: hostId, hostNickName: 'H', roomConfig: validConfig() });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/其他房间/);
    });
  });

  // ─────────────── 2. 加入房间 ───────────────
  describe('加入房间', () => {
    let hostId;
    let roomId;

    beforeAll(async () => {
      hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      roomId = result.roomId;
    });

    it('02.5 指定座位加入', async () => {
      const uid = makeUserId();
      const result = await joinRoom(roomId, uid, 2, 'P2');
      expect(result.success).toBe(true);
      expect(result.seatNumber).toBe(2);
    });

    it('02.6 未指定座位 → 默认 0（等待区）', async () => {
      const uid = makeUserId();
      const res = await apiPost('/api/rooms/join', { roomId, userInfo: { openId: uid, nickName: 'Wait', avatarUrl: '' } });
      expect(res.body.success).toBe(true);
      expect(res.body.seatNumber).toBe(0);
      const room = await getRoom(roomId);
      const p = room.room.players.find(x => x.openId === uid);
      expect(p.seatNumber).toBe(0);
    });

    it('02.7 观战座位 -1（允许观战时）', async () => {
      const r = await createRoomWithConfig(makeUserId(), 'OHost', buildConfigWithSpectator(SPECTATOR_1));
      const uid = makeUserId();
      const result = await joinRoom(r.roomId, uid, -1, 'OB');
      expect(result.success).toBe(true);
      expect(result.seatNumber).toBe(-1);
    });

    it('02.8 重复座位被拒', async () => {
      const uid = makeUserId();
      const res = await apiPost('/api/rooms/join', { roomId, userInfo: { openId: uid, nickName: 'T', avatarUrl: '' }, seatNumber: 2, customNickName: 'T' });
      expect(res.body.success).toBe(false);
    });

    it('02.9 已在本房间 → success:true + 消息', async () => {
      const res = await apiPost('/api/rooms/join', { roomId, userInfo: { openId: hostId, nickName: 'H', avatarUrl: '' }, seatNumber: 3, customNickName: 'H' });
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/已在房间中/);
    });

    it('02.10 已在其他房间 → 400', async () => {
      const other = await createRoom(makeUserId(), 'OH');
      const uid = makeUserId();
      await joinRoom(other.roomId, uid, 2, 'P');
      const res = await apiPost('/api/rooms/join', { roomId, userInfo: { openId: uid, nickName: 'P', avatarUrl: '' }, seatNumber: 4, customNickName: 'P' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/其他房间/);
    });

    it('02.11 不存在的房间 → 404', async () => {
      const res = await apiPost('/api/rooms/join', { roomId: '000000', userInfo: { openId: makeUserId(), nickName: 'T', avatarUrl: '' }, seatNumber: 1, customNickName: 'T' });
      expect(res.status).toBe(404);
    });

    it('02.12 游戏已开始后加入 → 400', async () => {
      const { roomId: rid } = await startedRoom();
      const res = await apiPost('/api/rooms/join', { roomId: rid, userInfo: { openId: makeUserId(), nickName: 'Late', avatarUrl: '' }, seatNumber: 1, customNickName: 'Late' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/游戏已开始/);
    });
  });

  // ─────────────── 3. 获取房间详情 ───────────────
  describe('获取房间详情', () => {
    let hostId;
    let roomId;

    beforeAll(async () => {
      hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      roomId = result.roomId;
      await joinRoom(roomId, makeUserId(), 2, 'P2');
      await toggleReady(roomId, hostId, true);
    });

    it('02.13 详情：roomConfig往返、players结构、readyPlayers、activeGameId=null', async () => {
      const result = await getRoom(roomId);
      expect(result.success).toBe(true);
      const room = result.room;
      expect(room._id).toBe(roomId);
      expect(room.roomConfig.roles.good).toBeDefined();
      expect(room.players.length).toBe(2);
      expect(room.players.every(p => typeof p.openId === 'string' && typeof p.isHost === 'boolean')).toBe(true);
      expect(room.readyPlayers).toContain(hostId);
      expect(room.activeGameId).toBeNull();
    });

    it('02.14 不存在的房间 → 404', async () => {
      const res = await apiGet('/api/rooms/999999');
      expect(res.status).toBe(404);
    });
  });

  // ─────────────── 4. 离开房间 ───────────────
  describe('离开房间', () => {
    it('02.15 非房主可离开，玩家移除', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const leave = await leaveRoom(roomId, uid);
      expect(leave.success).toBe(true);
      const room = await getRoom(roomId);
      expect(room.room.players.find(p => p.openId === uid)).toBeUndefined();
    });

    it('02.16 房主离开 → 400 拒绝', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const res = await apiPost('/api/rooms/leave', { roomId: result.roomId, openId: hostId });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/房主不能离开/);
    });

    it('02.17 房主仍在，房间保留', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      await leaveRoom(roomId, uid);
      const room = await getRoom(roomId);
      expect(room.success).toBe(true);
      expect(room.room.ownerId).toBe(hostId);
      expect(room.room.players.find(p => p.openId === uid)).toBeUndefined();
    });
  });

  // ─────────────── 5. 解散房间 ───────────────
  describe('解散房间', () => {
    it('02.18 房主解散 → 房间删除', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      await joinRoom(roomId, makeUserId(), 2, 'P2');
      const res = await disband(roomId, hostId);
      expect(res.success).toBe(true);
      const room = await getRoom(roomId);
      expect(room.success).toBe(false);
    });

    it('02.19 非房主解散 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const res = await apiPost(`/api/rooms/${roomId}/disband`, { openId: uid });
      expect(res.status).toBe(403);
    });
  });

  // ─────────────── 6/7. 入座与换座 ───────────────
  describe('入座/换座', () => {
    it('02.20 等待区 0 → 入座 1..n', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 0, 'P2');
      const res = await updateSeatNumber(roomId, uid, 2);
      expect(res.success).toBe(true);
      expect(res.room.players.find(p => p.openId === uid).seatNumber).toBe(2);
    });

    it('02.21 等待区 0 → 观战区 -1', async () => {
      const result = await createRoomWithConfig(makeUserId(), 'OHost', buildConfigWithSpectator(SPECTATOR_1));
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 0, 'P');
      const res = await updateSeatNumber(roomId, uid, -1);
      expect(res.success).toBe(true);
      expect(res.room.players.find(p => p.openId === uid).seatNumber).toBe(-1);
    });

    it('02.22 观战区 -1 → 等待区 0', async () => {
      const result = await createRoomWithConfig(makeUserId(), 'OHost', buildConfigWithSpectator(SPECTATOR_1));
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, -1, 'P');
      const res = await updateSeatNumber(roomId, uid, 0);
      expect(res.success).toBe(true);
      expect(res.room.players.find(p => p.openId === uid).seatNumber).toBe(0);
    });

    it('02.23 入座 1..n → 等待区 0，且重置 ready', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      await toggleReady(roomId, uid, true);
      const res = await updateSeatNumber(roomId, uid, 0);
      const p = res.room.players.find(x => x.openId === uid);
      expect(p.seatNumber).toBe(0);
      expect(p.isReady).toBe(false);
    });

    it('02.24 换到已占座位 → 400', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const res = await apiPost('/api/rooms/updateSeatNumber', { roomId, openId: uid, newSeatNumber: 1 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/占用/);
    });

    it('02.25 被禁座玩家换座 → 400', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      await banSeat(roomId, uid, true, hostId);
      const res = await apiPost('/api/rooms/updateSeatNumber', { roomId, openId: uid, newSeatNumber: 3 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/禁止上座/);
    });

    it('02.26a 观战区满 → 400', async () => {
      const result = await createRoomWithConfig(makeUserId(), 'OHost', buildConfigWithSpectator(SPECTATOR_1));
      const roomId = result.roomId;
      await joinRoom(roomId, makeUserId(), -1, 'A');
      const res = await joinRoom(roomId, makeUserId(), -1, 'B');
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/观战区已满/);
    });

    it('02.26b 房间不允许观战 → 400', async () => {
      const result = await createRoomWithConfig(makeUserId(), 'OHost', buildConfigWithSpectator(SPECTATOR_OFF));
      const roomId = result.roomId;
      const res = await joinRoom(roomId, makeUserId(), -1, 'O');
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/不允许观战/);
    });
  });

  // ─────────────── 8. 踢人（房主） ───────────────
  describe('踢人', () => {
    it('02.27 房主踢出房间（room）', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const res = await kickPlayer(roomId, uid, 'room', hostId);
      expect(res.success).toBe(true);
      expect(res.room.players.find(p => p.openId === uid)).toBeUndefined();
    });

    it('02.28 房主踢到未入座区（unseat）', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      await toggleReady(roomId, uid, true);
      const res = await kickPlayer(roomId, uid, 'unseat', hostId);
      const p = res.room.players.find(x => x.openId === uid);
      expect(p.seatNumber).toBe(0);
      expect(p.isReady).toBe(false);
    });

    it('02.29 非房主踢人 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const a = makeUserId();
      const b = makeUserId();
      await joinRoom(roomId, a, 2, 'A');
      await joinRoom(roomId, b, 3, 'B');
      const res = await apiPost('/api/rooms/kickPlayer', { roomId, playerId: b, mode: 'room', openId: a });
      expect(res.status).toBe(403);
    });
  });

  // ─────────────── 9. 禁座（房主） ───────────────
  describe('禁座', () => {
    it('02.30 禁座后上座被拒，02.31 解禁后可上座', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');

      const ban = await banSeat(roomId, uid, true, hostId);
      expect(ban.success).toBe(true);
      const p = ban.room.players.find(x => x.openId === uid);
      expect(p.bannedFromSeating).toBeTruthy();
      const rejected = await apiPost('/api/rooms/updateSeatNumber', { roomId, openId: uid, newSeatNumber: 3 });
      expect(rejected.status).toBe(400);

      const unban = await banSeat(roomId, uid, false, hostId);
      expect(unban.room.players.find(x => x.openId === uid).bannedFromSeating).toBe(false);
      const ok = await updateSeatNumber(roomId, uid, 3);
      expect(ok.success).toBe(true);
    });

    it('02.32 非房主禁座 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const a = makeUserId();
      const b = makeUserId();
      await joinRoom(roomId, a, 2, 'A');
      await joinRoom(roomId, b, 3, 'B');
      const res = await apiPost(`/api/rooms/${roomId}/banSeat`, { playerId: b, banned: true, openId: a });
      expect(res.status).toBe(403);
    });
  });

  // ─────────────── 10. 转让房主 ───────────────
  describe('转让房主', () => {
    it('02.33 房主转让生效', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const res = await transferOwner(roomId, hostId, uid);
      expect(res.success).toBe(true);
      const room = await getRoom(roomId);
      expect(room.room.ownerId).toBe(uid);
      expect(room.room.players.find(p => p.openId === uid).isHost).toBe(true);
      expect(room.room.players.find(p => p.openId === hostId).isHost).toBe(false);
    });

    it('02.34 非房主转让 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const a = makeUserId();
      await joinRoom(roomId, a, 2, 'A');
      const res = await apiPost(`/api/rooms/${roomId}/transferOwner`, { currentOwnerId: a, newOwnerId: hostId });
      expect(res.status).toBe(403);
    });
  });

  // ─────────────── 11. 更改房间配置（房主） ───────────────
  describe('更改房间配置', () => {
    it('02.35 房主更新配置生效', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const newConfig = validConfig();
      newConfig.roles.evil = ['morgana', 'mordred'];
      const res = await updateRoomConfig(roomId, newConfig, hostId);
      expect(res.success).toBe(true);
      const room = await getRoom(roomId);
      expect(room.room.roomConfig.roles.evil).toEqual(['morgana', 'mordred']);
    });

    it('02.36 非房主改配置 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const res = await apiPutRaw(roomId, validConfig(), uid);
      expect(res.status).toBe(403);
    });

    it('02.37 游戏开始后改配置 → 400', async () => {
      const { roomId } = await startedRoom();
      const res = await apiPutRaw(roomId, validConfig(), (await getRoom(roomId)).room.ownerId);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/游戏已开始/);
    });

    it('02.38 缩容配置挤出溢出玩家 + 无效配置 400', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const p2 = makeUserId();
      const p3 = makeUserId();
      await joinRoom(roomId, p2, 2, 'P2');
      await joinRoom(roomId, p3, 3, 'P3');
      await toggleReady(roomId, p2, true);

      const shrink = validConfig(); // 5 角色 → 挤掉 seat>5
      shrink.roles = { good: ['merlin'], evil: ['morgana'] }; // 2 角色
      const res = await updateRoomConfig(roomId, shrink, hostId);
      expect(res.success).toBe(true);
      const room = await getRoom(roomId);
      expect(room.room.players.find(p => p.openId === p2).seatNumber).toBe(2);
      expect(room.room.players.find(p => p.openId === p3).seatNumber).toBe(0);

      const bad = validConfig();
      bad.roles.evil = ['nope'];
      const badRes = await apiPutRaw(roomId, bad, hostId);
      expect(badRes.status).toBe(400);
    });
  });

  // ─────────────── 12. 随机座位（房主） ───────────────
  describe('随机座位', () => {
    it('02.39 满座随机：座位集合与玩家集合不变', async () => {
      const hostId = makeUserId();
      const result = await createRoomWithConfig(hostId, 'Host', validConfig());
      const roomId = result.roomId;
      const players = [{ openId: hostId }];
      for (let i = 2; i <= 5; i++) {
        const uid = makeUserId();
        await joinRoom(roomId, uid, i, `P${i}`);
        players.push({ openId: uid });
      }
      const before = await getRoom(roomId);
      const seatSetBefore = before.room.players.map(p => p.seatNumber).sort();
      const playerSetBefore = before.room.players.map(p => p.openId).sort();

      const res = await randomSeats(roomId, hostId);
      expect(res.success).toBe(true);
      const after = await getRoom(roomId);
      expect(after.room.players.map(p => p.seatNumber).sort()).toEqual(seatSetBefore);
      expect(after.room.players.map(p => p.openId).sort()).toEqual(playerSetBefore);
      // 每个入座区座位仍被占用（1..5）
      const seated = after.room.players.filter(p => p.seatNumber >= 1).length;
      expect(seated).toBe(5);
    });

    it('02.40 非房主随机座位 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoomWithConfig(hostId, 'Host', validConfig());
      const roomId = result.roomId;
      const a = makeUserId();
      await joinRoom(roomId, a, 2, 'A');
      const res = await apiPost(`/api/rooms/${roomId}/randomSeats`, { openId: a });
      expect(res.status).toBe(403);
    });

    it('02.41 未满座随机座位 → 400', async () => {
      const hostId = makeUserId();
      const result = await createRoomWithConfig(hostId, 'Host', validConfig());
      const roomId = result.roomId;
      await joinRoom(roomId, makeUserId(), 2, 'P2');
      const res = await randomSeats(roomId, hostId);
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/未坐满/);
    });
  });

  // ─────────────── 13. 开始游戏（房主） ───────────────
  describe('开始游戏', () => {
    it('02.42 房主开局成功', async () => {
      const hostId = makeUserId();
      const result = await createRoomWithConfig(hostId, 'Host', validConfig());
      const roomId = result.roomId;
      const players = [{ openId: hostId }];
      for (let i = 2; i <= 5; i++) {
        const uid = makeUserId();
        await joinRoom(roomId, uid, i, `P${i}`);
        players.push({ openId: uid });
      }
      for (const p of players) await toggleReady(roomId, p.openId, true);
      const res = await startGame(roomId, hostId);
      expect(res.success).toBe(true);
      expect(res.gameId).toBeDefined();
    });

    it('02.43 非房主开局 → 403', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      const uid = makeUserId();
      await joinRoom(roomId, uid, 2, 'P2');
      const res = await apiPost('/api/games/start', { roomId, openId: uid });
      expect(res.status).toBe(403);
    });
  });

  // ─────────────── 管理接口 ───────────────
  describe('列表/统计/清理', () => {
    it('02.44 房间列表含 playerCount/readyCount', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'Host');
      const roomId = result.roomId;
      await joinRoom(roomId, makeUserId(), 2, 'P2');
      await toggleReady(roomId, hostId, true);
      const res = await apiGet('/api/rooms');
      expect(res.status).toBe(200);
      const room = res.body.rooms.find(r => r.roomId === roomId);
      expect(room).toBeDefined();
      expect(Number(room.playerCount)).toBe(2);
      expect(Number(room.readyCount)).toBe(1);
    });

    it('02.45 stats 返回结构', async () => {
      await createRoom(makeUserId(), 'StatsHost');
      const res = await roomStats();
      expect(res.success).toBe(true);
      expect(Number(res.stats.totalRooms)).toBeGreaterThanOrEqual(1);
      expect(Number(res.stats.totalPlayers)).toBeGreaterThanOrEqual(1);
      expect(typeof res.stats.roomsByStatus).toBe('object');
    });

    it('02.46 cleanup hours=0 删除未开始房间', async () => {
      const hostId = makeUserId();
      const result = await createRoom(hostId, 'CleanMe');
      const roomId = result.roomId;
      // 等过秒边界，确保 updated_at < NOW()（TIMESTAMP 秒级精度）
      await new Promise(r => setTimeout(r, 1100));
      const res = await cleanupRooms(0);
      expect(res.success).toBe(true);
      const room = await getRoom(roomId);
      expect(room.success).toBe(false);
    });
  });
});

// PUT /api/rooms/:roomId/config 原始请求（返回 supertest 响应）
async function apiPutRaw(roomId, roomConfig, openId) {
  const { apiPut } = require('./helpers/testHelper');
  const res = await apiPut(`/api/rooms/${roomId}/config`, { roomConfig, openId });
  return res;
}
