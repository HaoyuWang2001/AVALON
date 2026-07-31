const {
  createRoomAndStartGame, getGameState, advancePhase,
  submitNomination, castVote, castMissionVote,
  assassinate, endGame
} = require('./helpers/testHelper');

const EVIL_WIN_COUNTS = [5, 10];

describe('05 — Evil Win Paths', () => {
  describe.each(EVIL_WIN_COUNTS)('Player count: %p', (n) => {
    let gameId;
    let players;
    let evilPlayers;
    let currentState;

    const getState = async () => {
      const state = await getGameState(gameId);
      currentState = state.game;
      return state;
    };

    describe('Path 1: 3 mission failures', () => {
      beforeAll(async () => {
        const result = await createRoomAndStartGame(n);
        gameId = result.gameId;
        players = result.players;
        evilPlayers = players.filter(p => p.side === 'evil');
        await advancePhase(gameId);
      });

      it(`should result in evil win by 3 failed missions (${n} players)`, async () => {
        let failMissionCount = 0;
        let round = 0;
        const maxRounds = 15;

        while (failMissionCount < 3 && round < maxRounds) {
          round++;
          await getState();

          if (currentState.currentPhase === 'gameEnd') break;

          const leader = players[currentState.teamLeaderIndex];
          const teamSize = getTeamSize(n, currentState.currentRound);
          const teamSlots = [];

          // Ensure at least 1 evil is in the team (to cause fail)
          let evilAdded = false;
          for (const p of players) {
            if (teamSlots.length >= teamSize) break;
            if (!evilAdded && p.side === 'evil') {
              teamSlots.push(p.openId);
              evilAdded = true;
            } else if (p.side === 'good' && teamSlots.length < teamSize) {
              teamSlots.push(p.openId);
            }
          }
          // Fill remaining with good players
          for (const p of players) {
            if (teamSlots.length >= teamSize) break;
            if (!teamSlots.includes(p.openId)) {
              teamSlots.push(p.openId);
            }
          }

          await submitNomination(gameId, leader.openId, teamSlots);
          await getState();

          if (currentState.currentPhase !== 'teamVote') continue;

          // Majority approve
          const approveCount = Math.floor(n / 2) + 1;
          for (let i = 0; i < approveCount; i++) {
            await castVote(gameId, players[i].openId, 'approve');
          }
          for (let i = approveCount; i < n; i++) {
            await castVote(gameId, players[i].openId, 'reject');
          }

          await getState();
          if (currentState.currentPhase !== 'missionVote') continue;

          // Mission vote: evil members vote fail
          for (const openId of teamSlots) {
            const p = players.find(pp => pp.openId === openId);
            const vote = p.side === 'evil' ? 'fail' : 'success';
            await castMissionVote(gameId, openId, vote, p.role);
          }

          await getState();
          if (currentState.missionResults) {
            failMissionCount = currentState.missionResults.filter(r => !r.success).length;
          }
        }

        await getState();
        expect(currentState.currentPhase).toBe('gameEnd');
        expect(currentState.gameResult.winner).toBe('evil');

        await endGame(gameId);
      });
    });

    describe('Path 2: Successful assassination', () => {
      beforeAll(async () => {
        const result = await createRoomAndStartGame(n);
        gameId = result.gameId;
        players = result.players;
        evilPlayers = players.filter(p => p.side === 'evil');
        await advancePhase(gameId);
      });

      it(`should result in evil win by assassinating Merlin (${n} players)`, async () => {
        const merlinPlayer = players.find(p => p.role === 'merlin');
        const evilKiller = evilPlayers[0];

        const assResult = await assassinate(gameId, evilKiller.openId, merlinPlayer.openId);
        expect(assResult.success).toBe(true);

        await getState();
        expect(currentState.currentPhase).toBe('gameEnd');
        expect(currentState.gameResult.winner).toBe('evil');
        expect(currentState.gameResult.reason).toContain('梅林');

        await endGame(gameId);
      });

      it('should reject second assassination attempt', async () => {
        const result = await createRoomAndStartGame(n);
        const gId = result.gameId;
        const eps = result.players.filter(p => p.side === 'evil');
        const merlin = result.players.find(p => p.role === 'merlin');

        await assassinate(gId, eps[0].openId, merlin.openId);
        const second = await assassinate(gId, eps[0].openId, merlin.openId);
        expect(second.success).toBe(false);

        await endGame(gId);
      });

      it('should reject assassination by good player', async () => {
        const result = await createRoomAndStartGame(n);
        const gId = result.gameId;
        const goodPlayer = result.players.find(p => p.side === 'good');
        const target = result.players[0];

        const res = await assassinate(gId, goodPlayer.openId, target.openId);
        expect(res.success).toBe(false);

        await endGame(gId);
      });
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
