const {
  createRoomAndStartGame, getGameState, advancePhase,
  submitNomination, castVote, castMissionVote,
  assassinate, endGame, makeUserId
} = require('./helpers/testHelper');

const PLAYER_COUNTS = [5, 6, 7, 8, 9, 10, 11, 12];

describe('04 — Good Win Full Game Flow', () => {
  describe.each(PLAYER_COUNTS)('Player count: %p', (n) => {
    let gameId;
    let players;
    let evilPlayers;
    let currentState;

    beforeAll(async () => {
      const result = await createRoomAndStartGame(n);
      gameId = result.gameId;
      players = result.players;
      evilPlayers = players.filter(p => p.side === 'evil');
      await advancePhase(gameId);
    });

    const getState = async () => {
      const state = await getGameState(gameId);
      currentState = state.game;
      return state;
    };

    it(`should complete full flow with good win (${n} players)`, async () => {
      let goodMissionCount = 0;
      let round = 0;
      const maxRounds = 10; // safety limit

      while (goodMissionCount < 3 && round < maxRounds) {
        round++;
        await getState();

        // Team leader nominates a team
        const leader = players[currentState.teamLeaderIndex];
        const teamSize = getTeamSize(n, currentState.currentRound);
        const team = [];
        // Pick from each side to build a valid team
        for (let i = 0; i < players.length && team.length < teamSize; i++) {
          team.push(players[i].openId);
        }
        const teamSlots = team.slice(0, teamSize);

        const nomResult = await submitNomination(gameId, leader.openId, teamSlots);
        expect(nomResult.success).toBe(true);

        await getState();
        expect(currentState.currentPhase).toBe('teamVote');

        // All players vote: majority approve
        const approveVoters = players.slice(0, Math.floor(n / 2) + 1);
        const rejectVoters = players.slice(Math.floor(n / 2) + 1);

        for (const p of approveVoters) {
          await castVote(gameId, p.openId, 'approve');
        }
        for (const p of rejectVoters) {
          await castVote(gameId, p.openId, 'reject');
        }

        await getState();

        if (currentState.currentPhase === 'teamSelection') {
          // Team was rejected, try again next round
          continue;
        }

        if (currentState.currentPhase === 'gameEnd') {
          // Game ended unexpectedly
          break;
        }

        expect(currentState.currentPhase).toBe('missionVote');

        // Mission team votes: all success for good win path
        for (const openId of teamSlots) {
          const p = players.find(pp => pp.openId === openId);
          await castMissionVote(gameId, openId, 'success', p.role);
        }

        await getState();

        if (currentState.currentPhase === 'teamSelection') {
          // Next round
          continue;
        }

        if (currentState.currentPhase === 'assassination') {
          // Good won 3 missions, now assassination phase
          goodMissionCount = 3;
          break;
        }

        if (currentState.currentPhase === 'gameEnd') {
          if (currentState.gameResult && currentState.gameResult.winner === 'evil') {
            // Evil won via 3 failed missions — shouldn't happen in good-win test
            // but could if random team assignment happened to have evil members who
            // didn't get assigned to the mission team
          }
          break;
        }

        // Count successful missions
        if (currentState.missionResults) {
          goodMissionCount = currentState.missionResults.filter(r => r.success).length;
        }
      }

      // Now handle assassination phase
      if (currentState && currentState.currentPhase === 'assassination') {
        // Evil player (can be any evil role) guesses Merlin — guess wrong for good win
        const assassin = evilPlayers[0];
        // Pick a player known NOT to be Merlin
        const merlinPlayer = players.find(p => p.role === 'merlin');
        const nonMerlin = players.find(p => p.role !== 'merlin' && p.openId !== assassin.openId);
        const targetId = nonMerlin ? nonMerlin.openId : merlinPlayer.openId;

        const assResult = await assassinate(gameId, assassin.openId, targetId);
        expect(assResult.success).toBe(true);

        await getState();
      }

      // Verify final state
      await getState();
      expect(currentState.currentPhase).toBe('gameEnd');
      if (currentState.gameResult) {
        expect(currentState.gameResult.winner).toBe('good');
      }

      // End the game
      const endResult = await endGame(gameId);
      expect(endResult.success).toBe(true);
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
