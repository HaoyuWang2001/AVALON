const {
  createRoomAndStartGame, getGameState, confirmRevealAll, confirmLancelot,
  driveToTeamNomination, startDiscussion,
  submitNomination, castVote, castMissionVote, submitPreNomination, selectSpeakingOrder,
  assassinate, startAssassination, endGame,
  buildStandardRoomConfig, buildCustomBoard9, buildCustomBoard10, withConfigOverrides
} = require('./helpers/testHelper');

const BOARDS = [
  ...[5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ name: `std${n}`, n, config: () => buildStandardRoomConfig(n) })),
  { name: 'custom10', n: 10, config: buildCustomBoard10 },
  { name: 'custom9', n: 9, config: buildCustomBoard9 }
];

function boardConfig(board) {
  const cfg = board.config();
  const allRoles = [...cfg.roles.good, ...cfg.roles.evil];
  const hasLancelot = allRoles.some(r => r.startsWith('lancelot'));
  return hasLancelot ? withConfigOverrides(cfg, { rules: { lancelotSwapForce: 'keep' } }) : cfg;
}

describe('04b — Evil Win Paths', () => {
  // Path 1: 3 次任务失败
  describe.each(BOARDS)('Path1 3任务失败 $name', ({ n, config }) => {
    it('should result in evil win by 3 failed missions', async () => {
      const result = await createRoomAndStartGame(n, boardConfig({ config }));
      const gameId = result.gameId;
      const players = result.players;
      await confirmRevealAll(gameId, players);

      let failMissionCount = 0;
      let round = 0;
      const maxRounds = 20;

      while (failMissionCount < 3 && round < maxRounds) {
        round++;
        let state = await getGameState(gameId);
        if (state.current.phase === 'gameEnd') break;
        if (state.current.phase === 'assassination') break;

        // 兰斯抽卡阶段：全员确认
        if (state.current.phase === 'lancelot') {
          for (const p of players) await confirmLancelot(gameId, p.openId);
          continue;
        }
        // 湖仙验人：标准板未启用，理论上不进入；若进入则跳过
        if (state.current.phase === 'lake') break;

        // 车主预选车型
        if (state.current.phase === 'preNominate') {
          const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
          await submitPreNomination(gameId, leader.openId, []);
          continue;
        }
        // 车主确定发言顺序 → 开始讨论
        if (state.current.phase === 'speakingOrder') {
          const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
          await selectSpeakingOrder(gameId, leader.openId, 'asc');
          await startDiscussion(gameId, leader.openId);
          continue;
        }

        if (state.current.phase === 'discussion') {
          await driveToTeamNomination(gameId, players);
          const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
          const teamSize = getTeamSize(players.length, state.current.round);
          const evilP = players.filter(p => p.side === 'evil');
          const goodP = players.filter(p => p.side === 'good');
          const team = [...evilP.slice(0, teamSize), ...goodP].slice(0, teamSize).map(p => p.openId);
          const result = await submitNomination(gameId, leader.openId, team);
          expect(result.success).toBe(true);
        }

        state = await getGameState(gameId);
        if (state.current.phase === 'teamVote') {
          const half = Math.floor(players.length / 2) + 1;
          for (let i = 0; i < half; i++) await castVote(gameId, players[i].openId, 'approve');
          for (let i = half; i < players.length; i++) await castVote(gameId, players[i].openId, 'reject');
        }

        state = await getGameState(gameId);
        if (state.current.phase === 'preNominate' || state.current.phase === 'discussion') continue;
        if (state.current.phase === 'gameEnd') break;

        if (state.current.phase === 'missionVote') {
          const missionTeam = state.current.nominatedTeam || [];
          for (const openId of missionTeam) {
            const p = players.find(pp => pp.openId === openId);
            if (p) {
              const vote = p.side === 'evil' ? 'fail' : 'success';
              await castMissionVote(gameId, openId, vote, p.role);
            }
          }
          state = await getGameState(gameId);
          if (state.history.missions) {
            failMissionCount = state.history.missions.filter(r => !r.success).length;
          }
        }
      }

      const finalState = await getGameState(gameId);
      expect(finalState.current.phase).toBe('gameEnd');
      expect(finalState.basic.result.winner).toBe('evil');
      await endGame(gameId);
    });
  });

  // Path 2: 刺杀命中梅林
  describe.each(BOARDS)('Path2 刺杀命中 $name', ({ n, config }) => {
    it('should result in evil win by assassinating Merlin', async () => {
      const result = await createRoomAndStartGame(n, boardConfig({ config }));
      const gId = result.gameId;
      const ps = result.players;

      const assassin = ps.find(p => p.role === 'assassin');
      const morgana = ps.find(p => p.role === 'morgana');
      const killer = assassin || morgana;
      const merlin = ps.find(p => p.role === 'merlin');

      const startRes = await startAssassination(gId, killer.openId);
      expect(startRes.success).toBe(true);
      expect(startRes.current.phase).toBe('assassination');
      const assResult = await assassinate(gId, killer.openId, merlin.openId);
      expect(assResult.success).toBe(true);
      const state = await getGameState(gId);
      expect(state.current.phase).toBe('gameEnd');
      expect(state.basic.result.winner).toBe('evil');
      expect(state.basic.result.reason).toContain('梅林');
      await endGame(gId);
    });

    it('should reject assassination by non-assassin evil player', async () => {
      const result = await createRoomAndStartGame(n, boardConfig({ config }));
      const gId = result.gameId;
      const ps = result.players;
      const assassin = ps.find(p => p.role === 'assassin');
      const morgana = ps.find(p => p.role === 'morgana');
      const killerRole = assassin ? 'assassin' : 'morgana';
      const killer = assassin || morgana;
      const nonKiller = ps.find(p => p.side === 'evil' && p.role !== killerRole);
      // 先由合法刺杀者进入刺杀阶段
      const startRes = await startAssassination(gId, killer.openId);
      expect(startRes.success).toBe(true);
      if (nonKiller) {
        const res = await assassinate(gId, nonKiller.openId, ps[0].openId);
        expect(res.success).toBe(false);
      }
      await endGame(gId);
    });

    it('should reject assassination by good player', async () => {
      const result = await createRoomAndStartGame(n, boardConfig({ config }));
      const gId = result.gameId;
      const goodPlayer = result.players.find(p => p.side === 'good');
      const assassin = result.players.find(p => p.role === 'assassin');
      const morgana = result.players.find(p => p.role === 'morgana');
      const killer = assassin || morgana;
      // 先由合法刺杀者进入刺杀阶段
      const startRes = await startAssassination(gId, killer.openId);
      expect(startRes.success).toBe(true);
      const res = await assassinate(gId, goodPlayer.openId, result.players[0].openId);
      expect(res.success).toBe(false);
      await endGame(gId);
    });

    it('should reject assassination after game ends', async () => {
      const result = await createRoomAndStartGame(n, boardConfig({ config }));
      const gId = result.gameId;
      const ps = result.players;
      const assassin = ps.find(p => p.role === 'assassin');
      const morgana = ps.find(p => p.role === 'morgana');
      const killer = assassin || morgana;
      const merlin = ps.find(p => p.role === 'merlin');
      const startRes = await startAssassination(gId, killer.openId);
      expect(startRes.success).toBe(true);
      await assassinate(gId, killer.openId, merlin.openId);
      const second = await assassinate(gId, killer.openId, merlin.openId);
      expect(second.success).toBe(false);
      await endGame(gId);
    });
  });

  // 无 assassin 时莫甘娜开刀（通用规则；标准 11 人板无 assassin）
  it('无 assassin 时莫甘娜可开刀（11 人板）', async () => {
    const result = await createRoomAndStartGame(11, boardConfig({ config: () => buildStandardRoomConfig(11) }));
    const gId = result.gameId;
    const ps = result.players;
    expect(ps.find(p => p.role === 'assassin')).toBeUndefined();
    const morgana = ps.find(p => p.role === 'morgana');
    const merlin = ps.find(p => p.role === 'merlin');
    const startRes = await startAssassination(gId, morgana.openId);
    expect(startRes.success).toBe(true);
    const assResult = await assassinate(gId, morgana.openId, merlin.openId);
    expect(assResult.success).toBe(true);
    const state = await getGameState(gId);
    expect(state.basic.result.winner).toBe('evil');
    await endGame(gId);
  });
});

function getTeamSize(playerCount, round) {
  const sizes = {
    5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
    11: [3, 4, 5, 6, 6], 12: [3, 4, 5, 6, 6]
  };
  return (sizes[playerCount] || sizes[5])[round - 1] || 3;
}
