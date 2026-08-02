const {
  makeUserId, createRoom, joinRoom, toggleReady,
  createRoomWithPlayers, createRoomAndStartGame, buildConfigWithSpectator,
  apiPost, apiGet, submitNomination, castVote, castMissionVote,
  advancePhase, assassinate, endGame, leaveRoom, disband, getRoom,
  setDiscussion, abandonGame, getGameState
} = require('./helpers/testHelper');

describe('06 — Edge Cases & Validation', () => {
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
      const res = await apiPost('/api/games/start', { roomId, openId: uid });
      expect(res.body.success).toBe(false);
    });

    it('should reject start when not all ready', async () => {
      const setup = await createRoomWithPlayers(5);
      await toggleReady(setup.roomId, setup.players[1].openId, false);
      const res = await apiPost('/api/games/start', { roomId: setup.roomId, openId: setup.players[0].openId });
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
      const res = await apiPost('/api/games/start', { roomId: '000000', openId: makeUserId() });
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

    it('should reject submitNomination when not discussion', async () => {
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

  describe('setDiscussion', () => {
    it('should reject setDiscussion when not discussion phase', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      const res = await setDiscussion(gameId, players[0].openId, 'asc');
      expect(res.success).toBe(false);
      await endGame(gameId);
    });

    it('should reject invalid speakingOrder', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const res = await setDiscussion(gameId, players[0].openId, 'sideways');
      expect(res.success).toBe(false);
      await endGame(gameId);
    });

    it('should reject when non-leader tries to set discussion', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const nonLeader = players.find(p => p.openId !== players[0].openId);
      const res = await setDiscussion(gameId, nonLeader.openId, 'asc');
      expect(res.success).toBe(false);
      await endGame(gameId);
    });

    it('should accept leader setDiscussion once, reject second change', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const st = await getGameState(gameId);
      const leader = players.find(p => p.openId === st.current.teamLeaderOpenId);
      const ok = await setDiscussion(gameId, leader.openId, 'desc');
      expect(ok.success).toBe(true);
      expect(ok.current.speakingOrder).toBe('desc');
      const again = await setDiscussion(gameId, leader.openId, 'asc');
      expect(again.success).toBe(false);
      await endGame(gameId);
    });

    it('should reject preNominatedTeam with wrong size', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const st = await getGameState(gameId);
      const leader = players.find(p => p.openId === st.current.teamLeaderOpenId);
      const res = await setDiscussion(gameId, leader.openId, 'asc', [players[0].openId]);
      expect(res.success).toBe(false);
      await endGame(gameId);
    });
  });

  describe('abandon', () => {
    it('should reject abandon by non-host', async () => {
      const { roomId, gameId, players } = await createRoomAndStartGame(5);
      const nonHost = players.find(p => p.openId !== players[0].openId);
      const res = await abandonGame(gameId, nonHost.openId);
      expect(res.success).toBe(false);
      await endGame(gameId);
    });

    it('should allow host to abandon game and reset room', async () => {
      const { roomId, gameId, players } = await createRoomAndStartGame(5);
      const res = await abandonGame(gameId, players[0].openId);
      expect(res.success).toBe(true);
      const st = await getGameState(gameId);
      expect(st.basic.status).toBe('abandoned');
      const room = await apiGet(`/api/rooms/${roomId}`);
      expect(room.body.room.gameStarted).toBeFalsy();
    });

    it('should reject abandon after game ended', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await endGame(gameId);
      const res = await abandonGame(gameId, players[0].openId);
      expect(res.success).toBe(false);
    });
  });

  describe('Concurrency & Phase Locks', () => {
    it('should reject duplicate concurrent team votes (unique car_index)', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const st = await getGameState(gameId);
      const leader = players.find(p => p.openId === st.current.teamLeaderOpenId);
      const team = [leader.openId, ...players.map(p => p.openId).filter(id => id !== leader.openId)].slice(0, 2);
      await submitNomination(gameId, leader.openId, team);
      await Promise.all([
        castVote(gameId, players[0].openId, 'approve'),
        castVote(gameId, players[0].openId, 'reject')
      ]);
      const s = await getGameState(gameId, players[0].openId);
      expect(Object.keys(s.current.teamVotes || {}).length).toBeLessThanOrEqual(1);
      await endGame(gameId);
    });

    it('should reject duplicate castVote by same player', async () => {
      const { gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const st = await getGameState(gameId);
      const leader = players.find(p => p.openId === st.current.teamLeaderOpenId);
      const team = [leader.openId, ...players.map(p => p.openId).filter(id => id !== leader.openId)].slice(0, 2);
      await submitNomination(gameId, leader.openId, team);
      // 第3名玩家不是队长也没到投票阶段后重复投
      const res = await castVote(gameId, players[3].openId, 'approve');
      expect(res.success).toBe(true);
      const dup = await castVote(gameId, players[3].openId, 'approve');
      expect(dup.success).toBe(false);
      await endGame(gameId);
    });
  });

  describe('Spectator & Game Start', () => {
    it('开局前观战者存在不影响开局（人数排除 seat -1）', async () => {
      const { roomId } = await createRoomWithPlayers(5, buildConfigWithSpectator({ allow: true, max: 3 }));
      // 加入观战者（seat -1）
      await joinRoom(roomId, makeUserId(), -1, 'Observer');
      await joinRoom(roomId, makeUserId(), -1, 'Observer2');
      // 5 名坐席玩家均已 ready（createRoomWithPlayers 已处理），房主开局
      const { getRoom } = require('./helpers/testHelper');
      const room = await getRoom(roomId);
      const start = await apiPost('/api/games/start', { roomId, openId: room.room.ownerId });
      expect(start.body.success).toBe(true);
      const st = await getGameState(start.body.gameId);
      expect(st.players.length).toBe(5);
      await endGame(start.body.gameId);
    });

    it('游戏中：新观战者可加入观战区（seat -1）', async () => {
      const { createRoomAndStartGame: crsg } = require('./helpers/testHelper');
      const cfg = buildConfigWithSpectator({ allow: true, max: 2 });
      const { roomId, gameId } = await crsg(5, cfg);
      const res = await apiPost('/api/rooms/join', {
        roomId, userInfo: { openId: makeUserId(), nickName: 'LateObs', avatarUrl: '' }, seatNumber: -1, customNickName: 'LateObs'
      });
      expect(res.body.success).toBe(true);
      await endGame(gameId);
    });

    it('游戏中：观战区满时提示"游戏已开始且观战区已满"', async () => {
      const cfg = buildConfigWithSpectator({ allow: true, max: 1 });
      const { roomId, gameId } = await createRoomAndStartGame(5, cfg);
      // 已有一个观战者占满（max=1）
      await apiPost('/api/rooms/join', { roomId, userInfo: { openId: makeUserId(), nickName: 'O1', avatarUrl: '' }, seatNumber: -1, customNickName: 'O1' });
      const res = await apiPost('/api/rooms/join', { roomId, userInfo: { openId: makeUserId(), nickName: 'O2', avatarUrl: '' }, seatNumber: -1, customNickName: 'O2' });
      expect(res.body.success).toBe(false);
      expect(res.body.message || '').toMatch(/游戏已开始且观战区已满/);
      await endGame(gameId);
    });

    it('游戏中：非观战身份加入被拒（游戏已开始）', async () => {
      const { roomId, gameId } = await createRoomAndStartGame(5);
      const res = await apiPost('/api/rooms/join', { roomId, userInfo: { openId: makeUserId(), nickName: 'Late', avatarUrl: '' }, seatNumber: 2, customNickName: 'Late' });
      expect(res.body.success).toBe(false);
      expect(res.body.message || '').toMatch(/游戏已开始/);
      await endGame(gameId);
    });
  });

  describe('confirmReveal (全员确认后进入讨论)', () => {
    async function startFreshGame() {
      const { roomId, gameId, players } = await createRoomAndStartGame(5);
      return { roomId, gameId, players };
    }

    it('未全员确认前停留在 roleReveal；全员确认后自动进入 discussion', async () => {
      const { gameId, players } = await startFreshGame();
      // 前 4 人确认，仍在 roleReveal
      for (let i = 0; i < 4; i++) {
        const res = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: players[i].openId });
        expect(res.body.success).toBe(true);
        expect(res.body.current.phase).toBe('roleReveal');
      }
      const st = await getGameState(gameId);
      expect(st.current.phase).toBe('roleReveal');
      expect(st.current.revealConfirmedCount).toBe(4);
      // 第 5 人确认 → 自动进入 discussion
      const last = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: players[4].openId });
      expect(last.body.success).toBe(true);
      expect(last.body.current.phase).toBe('discussion');
      await endGame(gameId);
    });

    it('confirmReveal 幂等：重复确认不报错', async () => {
      const { gameId, players } = await startFreshGame();
      const r1 = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: players[0].openId });
      expect(r1.body.success).toBe(true);
      const r2 = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: players[0].openId });
      expect(r2.body.success).toBe(true);
      const st = await getGameState(gameId);
      expect(st.current.revealConfirmedCount).toBe(1);
      await endGame(gameId);
    });

    it('非游戏内玩家 confirmReveal 被拒', async () => {
      const { gameId } = await startFreshGame();
      const outsider = makeUserId();
      const res = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: outsider });
      expect(res.body.success).toBe(false);
      expect(res.body.message || '').toMatch(/你不在本局游戏中/);
      await endGame(gameId);
    });

    it('已进入 discussion 后 confirmReveal 被拒', async () => {
      const { gameId, players } = await startFreshGame();
      for (const p of players) {
        await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: p.openId });
      }
      const st = await getGameState(gameId);
      expect(st.current.phase).toBe('discussion');
      const res = await apiPost(`/api/games/${gameId}/confirmReveal`, { openId: players[0].openId });
      expect(res.body.success).toBe(false);
      expect(res.body.message || '').toMatch(/当前不是角色揭示阶段/);
      await endGame(gameId);
    });

    it('advancePhase 不再被玩家用于推进（保留但校验阶段）', async () => {
      const { gameId } = await startFreshGame();
      // roleReveal 阶段 advancePhase 仍可被调用（保留）；验证 confirmReveal 才是入口
      const res = await advancePhase(gameId);
      expect(res.success).toBe(true);
      const st = await getGameState(gameId);
      expect(st.current.phase).toBe('discussion');
      await endGame(gameId);
    });
  });

  describe('Room & Game Lifecycle', () => {
    // 打到自然结束（坏人 3 胜）
    async function driveToNaturalEnd(gameId, players) {
      await advancePhase(gameId);
      const sizes = { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3 };
      let fails = 0;
      let guard = 0;
      while (fails < 3 && guard < 20) {
        guard++;
        let st = await getGameState(gameId);
        if (st.current.phase === 'gameEnd') break;
        if (st.current.phase === 'discussion') {
          const leader = players.find(p => p.openId === st.current.teamLeaderOpenId);
          const size = sizes[st.current.round] || 2;
          const evils = players.filter(p => p.side === 'evil');
          const team = [...evils, ...players.filter(p => p.side === 'good')].slice(0, size).map(p => p.openId);
          await submitNomination(gameId, leader.openId, team);
        }
        st = await getGameState(gameId);
        if (st.current.phase === 'teamVote') {
          for (const p of players) await castVote(gameId, p.openId, 'approve');
        }
        st = await getGameState(gameId);
        if (st.current.phase === 'missionVote') {
          const team = st.current.nominatedTeam || [];
          for (const oid of team) {
            const p = players.find(x => x.openId === oid);
            await castMissionVote(gameId, oid, p.side === 'evil' ? 'fail' : 'success', p.role);
          }
          st = await getGameState(gameId);
          if (st.history.missions) fails = st.history.missions.filter(r => !r.success).length;
        }
      }
      return getGameState(gameId);
    }

    it('游戏自然结束后：房间 game_started 重置为 false（玩家留在房间）', async () => {
      const { roomId, gameId, players } = await createRoomAndStartGame(5);
      await driveToNaturalEnd(gameId, players);
      const st = await getGameState(gameId);
      expect(st.current.phase).toBe('gameEnd');
      expect(st.basic.status).toBe('ended');
      const room = await getRoom(roomId);
      expect(room.room.gameStarted).toBeFalsy();
      expect(room.room.players.length).toBe(5);
    });

    it('游戏结束后：房主可解散房间', async () => {
      const { roomId, gameId, players } = await createRoomAndStartGame(5);
      await driveToNaturalEnd(gameId, players);
      const res = await disband(roomId, players[0].openId);
      expect(res.success).toBe(true);
    });

    it('游戏进行中：房主可解散房间', async () => {
      const { roomId, gameId, players } = await createRoomAndStartGame(5);
      await advancePhase(gameId);
      const res = await disband(roomId, players[0].openId);
      expect(res.success).toBe(true);
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
