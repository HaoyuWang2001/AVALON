const {
  createRoomAndStartGame, getGameState, advancePhase,
  submitNomination, castVote, castMissionVote,
  assassinate, endGame
} = require('./helpers/testHelper');

const EVIL_WIN_COUNTS = [5, 10];

describe('05 — Evil Win Paths', () => {
  describe.each(EVIL_WIN_COUNTS)('Player count: %p', (n) => {
    describe('Path 1: 3 mission failures', () => {
      let gameId;
      let players;

      beforeAll(async () => {
        const result = await createRoomAndStartGame(n);
        gameId = result.gameId;
        players = result.players;
        await advancePhase(gameId);
      });

      it(`should result in evil win by 3 failed missions (${n} players)`, async () => {
        let failMissionCount = 0;
        let round = 0;
        const maxRounds = 20;

        while (failMissionCount < 3 && round < maxRounds) {
          round++;
          let state = await getGameState(gameId);
          const gs = state.game;

          if (gs.currentPhase === 'gameEnd') break;

          if (gs.currentPhase === 'teamSelection') {
            const leader = players[gs.teamLeaderIndex];
            const teamSize = getTeamSize(n, gs.currentRound);
            // Ensure at least 1 evil in team
            const evilP = players.filter(p => p.side === 'evil');
            const goodP = players.filter(p => p.side === 'good');
            const team = [evilP[0].openId, ...goodP.slice(0, teamSize - 1).map(p => p.openId)];
            const result = await submitNomination(gameId, leader.openId, team.slice(0, teamSize));
            if (!result.success) continue;
          }

          state = await getGameState(gameId);
          if (state.game.currentPhase === 'teamVote') {
            const half = Math.floor(n / 2) + 1;
            for (let i = 0; i < half; i++) {
              await castVote(gameId, players[i].openId, 'approve');
            }
            for (let i = half; i < n; i++) {
              await castVote(gameId, players[i].openId, 'reject');
            }
          }

          state = await getGameState(gameId);
          if (state.game.currentPhase === 'teamSelection') continue;
          if (state.game.currentPhase === 'gameEnd') break;

          if (state.game.currentPhase === 'missionVote') {
            const missionTeam = state.game.nominatedTeam || [];
            for (const openId of missionTeam) {
              const p = players.find(pp => pp.openId === openId);
              if (p) {
                const vote = p.side === 'evil' ? 'fail' : 'success';
                await castMissionVote(gameId, openId, vote, p.role);
              }
            }

            state = await getGameState(gameId);
            if (state.game.missionResults) {
              failMissionCount = state.game.missionResults.filter(r => !r.success).length;
            }
          }
        }

        const finalState = await getGameState(gameId);
        expect(finalState.game.currentPhase).toBe('gameEnd');
        if (finalState.game.gameResult) {
          expect(finalState.game.gameResult.winner).toBe('evil');
        }

        await endGame(gameId);
      });
    });

    describe('Path 2: Assassination hits Merlin', () => {
      it('should result in evil win by assassinating Merlin at any phase', async () => {
        const result = await createRoomAndStartGame(n);
        const gId = result.gameId;
        const ps = result.players;

        const assassin = ps.find(p => p.role === 'assassin');
        const morgana = ps.find(p => p.role === 'morgana');
        const killer = assassin || morgana;
        const merlin = ps.find(p => p.role === 'merlin');

        const assResult = await assassinate(gId, killer.openId, merlin.openId);
        expect(assResult.success).toBe(true);

        const state = await getGameState(gId);
        expect(state.game.currentPhase).toBe('gameEnd');
        expect(state.game.gameResult.winner).toBe('evil');
        expect(state.game.gameResult.reason).toContain('梅林');

        await endGame(gId);
      });

      it('should reject assassination by non-assassin evil player', async () => {
        const result = await createRoomAndStartGame(n);
        const gId = result.gameId;
        const ps = result.players;

        // Find a non-assassin evil player (not the killer)
        const assassin = ps.find(p => p.role === 'assassin');
        const morgana = ps.find(p => p.role === 'morgana');
        const killerRole = assassin ? 'assassin' : 'morgana';
        const nonKiller = ps.find(p => p.side === 'evil' && p.role !== killerRole);

        if (nonKiller) {
          const res = await assassinate(gId, nonKiller.openId, ps[0].openId);
          expect(res.success).toBe(false);
        }

        await endGame(gId);
      });

      it('should reject assassination by good player', async () => {
        const result = await createRoomAndStartGame(n);
        const gId = result.gameId;
        const goodPlayer = result.players.find(p => p.side === 'good');

        const res = await assassinate(gId, goodPlayer.openId, result.players[0].openId);
        expect(res.success).toBe(false);

        await endGame(gId);
      });

      it('should reject assassination after game ends', async () => {
        const result = await createRoomAndStartGame(n);
        const gId = result.gameId;
        const ps = result.players;
        const assassin = ps.find(p => p.role === 'assassin');
        const morgana = ps.find(p => p.role === 'morgana');
        const killer = assassin || morgana;
        const merlin = ps.find(p => p.role === 'merlin');

        await assassinate(gId, killer.openId, merlin.openId);
        // Game is now ended
        const second = await assassinate(gId, killer.openId, merlin.openId);
        expect(second.success).toBe(false);

        await endGame(gId);
      });
    });
  });

  describe('11-player: Morgana as assassin', () => {
    it('should allow morgana to assassinate in 11p game', async () => {
      const result = await createRoomAndStartGame(11);
      const gId = result.gameId;
      const ps = result.players;

      const assassin = ps.find(p => p.role === 'assassin');
      expect(assassin).toBeUndefined();

      const morgana = ps.find(p => p.role === 'morgana');
      expect(morgana).toBeDefined();

      const merlin = ps.find(p => p.role === 'merlin');
      const assResult = await assassinate(gId, morgana.openId, merlin.openId);
      expect(assResult.success).toBe(true);

      const state = await getGameState(gId);
      expect(state.game.gameResult.winner).toBe('evil');

      await endGame(gId);
    });
  });
});

function getTeamSize(playerCount, round) {
  const sizes = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
    11: [3, 4, 5, 6, 6],
    12: [3, 4, 5, 6, 6]
  };
  return (sizes[playerCount] || sizes[5])[round - 1] || 3;
}
