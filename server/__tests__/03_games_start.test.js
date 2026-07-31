const {
  createRoomWithPlayers, createRoomAndStartGame,
  startGame, getGameState, advancePhase, makeUserId
} = require('./helpers/testHelper');

const PLAYER_COUNTS = [5, 6, 7, 8, 9, 10, 11, 12];

describe('03 — Game Start & Role Assignment', () => {
  describe.each(PLAYER_COUNTS)('Player count: %p', (n) => {
    let roomId;
    let gameId;
    let players;

    beforeAll(async () => {
      const result = await createRoomAndStartGame(n);
      roomId = result.roomId;
      gameId = result.gameId;
      players = result.players;
    });

    it(`should start game with ${n} players`, async () => {
      expect(gameId).toBeDefined();
      expect(gameId.length).toBeGreaterThan(10); // UUID
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
      const roles = state.game.players.map(p => p.role);
      expect(new Set(roles).size).toBeGreaterThanOrEqual(1);
      expect(roles.length).toBe(n);
      expect(roles.every(r => typeof r === 'string')).toBe(true);
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

    it('should allow advancePhase from roleReveal to teamSelection', async () => {
      const result = await advancePhase(gameId);
      expect(result.success).toBe(true);
      expect(result.game.currentPhase).toBe('teamSelection');

      // Should reject second advancePhase
      const res2 = await advancePhase(gameId);
      expect(res2.success).toBe(false);
    });

    it('should reject game start with fewer than 5 players', async () => {
      const smallResult = await createRoomWithPlayers(4);
      const res = await startGame(smallResult.roomId);
      expect(res.success).toBe(false);
    });
  });

  it('should reject game start when players are not ready', async () => {
    const { startGame, getRoom, toggleReady } = require('./helpers/testHelper');
    const { roomId, players } = await createRoomWithPlayers(5);
    await toggleReady(roomId, players[0].openId, false);
    const res = await startGame(roomId);
    expect(res.success).toBe(false);
  });

  it('should return 404 for nonexistent game', async () => {
    const state = await getGameState('00000000-0000-0000-0000-000000000000');
    expect(state.success).toBe(false);
  });
});
