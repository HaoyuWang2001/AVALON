const {
  createRoomWithPlayers, createRoomAndStartGame,
  startGame, getGameState, advancePhase
} = require('./helpers/testHelper');

const PLAYER_COUNTS = [5, 6, 7, 8, 9, 10, 11, 12];

describe('03 — Game Start & Role Assignment', () => {
  describe.each(PLAYER_COUNTS)('Player count: %p', (n) => {
    let gameId;
    let players;

    beforeAll(async () => {
      const result = await createRoomAndStartGame(n);
      gameId = result.gameId;
      players = result.players;
    });

    it(`should start game with ${n} players`, async () => {
      expect(gameId).toBeDefined();
      expect(gameId.length).toBeGreaterThan(10);
    });

    it('should return correct game state', async () => {
      const state = await getGameState(gameId);
      expect(state.success).toBe(true);
      expect(state.game.players.length).toBe(n);
    });

    it('should start in roleReveal phase', async () => {
      const state = await getGameState(gameId);
      expect(state.game.currentPhase).toBe('roleReveal');
      expect(state.game.currentRound).toBe(1);
      expect(state.game.teamLeaderIndex).toBe(0);
    });

    it('should assign a unique role to every player', async () => {
      const state = await getGameState(gameId);
      expect(state.game.players.length).toBe(n);
      expect(state.game.players.every(p => typeof p.role === 'string')).toBe(true);
    });

    it('should assign a side (good/evil) to every player', async () => {
      const state = await getGameState(gameId);
      const sides = state.game.players.map(p => p.side);
      expect(sides.every(s => s === 'good' || s === 'evil')).toBe(true);
    });

    it('should have at least 2 evil players', async () => {
      const state = await getGameState(gameId);
      const evilCount = state.game.players.filter(p => p.side === 'evil').length;
      expect(evilCount).toBeGreaterThanOrEqual(2);
    });

    it('should return playerRole when openId is provided', async () => {
      const state = await getGameState(gameId, players[0].openId);
      expect(state.playerRole).toBeDefined();
      expect(state.playerRole).toBe(players[0].role);
    });

    it('should advance from roleReveal to teamSelection', async () => {
      const result = await advancePhase(gameId);
      expect(result.success).toBe(true);
      expect(result.game.currentPhase).toBe('teamSelection');

      const res2 = await advancePhase(gameId);
      expect(res2.success).toBe(false);
    });

    it('should reject start with fewer than 5 players', async () => {
      const setup = await createRoomWithPlayers(4);
      const res = await startGame(setup.roomId, setup.hostId);
      expect(res.success).toBe(false);
    });
  });

  it('should reject start when not all ready', async () => {
    const { roomId, players } = await createRoomWithPlayers(5);
    const { toggleReady } = require('./helpers/testHelper');
    await toggleReady(roomId, players[0].openId, false);
    const res = await startGame(roomId, players[0].openId);
    expect(res.success).toBe(false);
  });

  it('should return 404 for nonexistent game', async () => {
    const state = await getGameState('00000000-0000-0000-0000-000000000000');
    expect(state.success).toBe(false);
  });
});
