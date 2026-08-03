const {
  createRoomAndStartGame, getGameState, confirmRevealAll, confirmLancelot,
  submitNomination, castVote, castMissionVote, submitPreNomination, selectSpeakingOrder,
  assassinate, endGame,
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

describe('04a — Good Win Full Game Flow', () => {
  describe.each(BOARDS)('Board: $name', ({ n, config }) => {
    let gameId;
    let players;

    beforeAll(async () => {
      const result = await createRoomAndStartGame(n, boardConfig({ config }));
      gameId = result.gameId;
      players = result.players;
      await confirmRevealAll(gameId, players);
    });

    it('should complete good win flow (3 successes → assassin miss → good)', async () => {
      let goodMissionCount = 0;
      let round = 0;
      const maxRounds = 15;

      while (goodMissionCount < 3 && round < maxRounds) {
        round++;
        let state = await getGameState(gameId);
        if (state.current.phase === 'gameEnd') break;

        // 兰斯抽卡阶段：全员确认
        if (state.current.phase === 'lancelot') {
          for (const p of players) await confirmLancelot(gameId, p.openId);
          continue;
        }
        // 湖仙验人：标准板未启用，理论上不进入
        if (state.current.phase === 'lake') break;

        // 车主预选车型
        if (state.current.phase === 'preNominate') {
          const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
          await submitPreNomination(gameId, leader.openId, []);
          continue;
        }
        // 车主确定发言顺序
        if (state.current.phase === 'speakingOrder') {
          const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
          await selectSpeakingOrder(gameId, leader.openId, 'asc');
          continue;
        }

        if (state.current.phase === 'discussion') {
          const leader = players.find(p => p.openId === state.current.teamLeaderOpenId);
          const teamSize = getTeamSize(players.length, state.current.round);
          const team = players.slice(0, teamSize).map(p => p.openId);
          const nomResult = await submitNomination(gameId, leader.openId, team);
          expect(nomResult.success).toBe(true);
          state = await getGameState(gameId);
        }

        if (state.current.phase === 'teamVote') {
          const half = Math.floor(players.length / 2) + 1;
          for (let i = 0; i < half; i++) await castVote(gameId, players[i].openId, 'approve');
          for (let i = half; i < players.length; i++) await castVote(gameId, players[i].openId, 'reject');
        }

        state = await getGameState(gameId);
        if (state.current.phase === 'preNominate' || state.current.phase === 'discussion') continue;
        if (state.current.phase === 'gameEnd') break;
        if (state.current.phase === 'assassination') { goodMissionCount = 3; break; }

        if (state.current.phase === 'missionVote') {
          const missionTeam = state.current.nominatedTeam || [];
          for (const openId of missionTeam) {
            const p = players.find(pp => pp.openId === openId);
            if (p) await castMissionVote(gameId, openId, 'success', p.role);
          }
          state = await getGameState(gameId);
          if (state.current.phase === 'gameEnd') break;
          if (state.current.phase === 'assassination') { goodMissionCount = 3; break; }
          if (state.history.missions) {
            goodMissionCount = state.history.missions.filter(r => r.success).length;
          }
        }
      }

      let state = await getGameState(gameId);
      if (state.current.phase === 'assassination') {
        const assassinPlayer = players.find(p => p.role === 'assassin');
        const morganaPlayer = players.find(p => p.role === 'morgana');
        const killer = assassinPlayer || morganaPlayer;
        expect(killer).toBeDefined();
        const merlin = players.find(p => p.role === 'merlin');
        const nonMerlin = players.find(p => p.role !== 'merlin' && p.openId !== killer.openId);
        const target = nonMerlin || merlin;
        const assResult = await assassinate(gameId, killer.openId, target.openId);
        expect(assResult.success).toBe(true);
      }

      state = await getGameState(gameId);
      expect(state.current.phase).toBe('gameEnd');
      expect(state.basic.result.winner).toBe('good');

      await endGame(gameId);
    });
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
