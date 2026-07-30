const GameModel = require('../models/GameModel');

describe('06 — Game Logic Unit Tests (no server needed)', () => {
  describe('getRoleConfiguration', () => {
    it('should return correct roles for 5 players', () => {
      const roles = GameModel.getRoleConfiguration(5);
      expect(roles).toEqual(['merlin', 'percival', 'loyal', 'mordred', 'assassin']);
    });

    it('should return correct roles for 6 players', () => {
      const roles = GameModel.getRoleConfiguration(6);
      expect(roles).toContain('merlin');
      expect(roles).toContain('mordred');
      expect(roles.length).toBe(6);
    });

    it('should return correct roles for 7 players', () => {
      const roles = GameModel.getRoleConfiguration(7);
      expect(roles).toContain('morgana');
      expect(roles.length).toBe(7);
    });

    it('should return correct roles for 10 players', () => {
      const roles = GameModel.getRoleConfiguration(10);
      expect(roles).toContain('minion');
      expect(roles.length).toBe(10);
    });

    it('should default to 5-player config for invalid player count', () => {
      const roles = GameModel.getRoleConfiguration(99);
      expect(roles.length).toBe(5);
    });

    it('should return configs for all supported sizes (5-12)', () => {
      for (let n = 5; n <= 12; n++) {
        const roles = GameModel.getRoleConfiguration(n);
        expect(roles.length).toBe(n);
      }
    });

    it('should have at least 2 evil roles for 5+ players', () => {
      for (let n = 5; n <= 12; n++) {
        const roles = GameModel.getRoleConfiguration(n);
        const evilCount = roles.filter(r => GameModel.getRoleSide(r) === 'evil').length;
        expect(evilCount).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('getRoleSide', () => {
    it('should classify merlin as good', () => {
      expect(GameModel.getRoleSide('merlin')).toBe('good');
    });

    it('should classify percival as good', () => {
      expect(GameModel.getRoleSide('percival')).toBe('good');
    });

    it('should classify loyal as good', () => {
      expect(GameModel.getRoleSide('loyal')).toBe('good');
    });

    it('should classify lancelot as good', () => {
      expect(GameModel.getRoleSide('lancelot')).toBe('good');
    });

    it('should classify ladyOfTheLake as good', () => {
      expect(GameModel.getRoleSide('ladyOfTheLake')).toBe('good');
    });

    it('should classify mordred as evil', () => {
      expect(GameModel.getRoleSide('mordred')).toBe('evil');
    });

    it('should classify morgana as evil', () => {
      expect(GameModel.getRoleSide('morgana')).toBe('evil');
    });

    it('should classify assassin as evil', () => {
      expect(GameModel.getRoleSide('assassin')).toBe('evil');
    });

    it('should classify minion as evil', () => {
      expect(GameModel.getRoleSide('minion')).toBe('evil');
    });

    it('should classify oberon as evil', () => {
      expect(GameModel.getRoleSide('oberon')).toBe('evil');
    });

    it('should default unknown role to good', () => {
      expect(GameModel.getRoleSide('unknown_role')).toBe('good');
    });
  });

  describe('getTeamSize', () => {
    it('should return correct team sizes for 5 players', () => {
      expect(GameModel.getTeamSize(5, 1)).toBe(2);
      expect(GameModel.getTeamSize(5, 2)).toBe(3);
      expect(GameModel.getTeamSize(5, 3)).toBe(2);
      expect(GameModel.getTeamSize(5, 4)).toBe(3);
      expect(GameModel.getTeamSize(5, 5)).toBe(3);
    });

    it('should return correct team sizes for 8 players', () => {
      expect(GameModel.getTeamSize(8, 1)).toBe(3);
      expect(GameModel.getTeamSize(8, 2)).toBe(4);
      expect(GameModel.getTeamSize(8, 3)).toBe(4);
      expect(GameModel.getTeamSize(8, 4)).toBe(5);
      expect(GameModel.getTeamSize(8, 5)).toBe(5);
    });

    it('should return correct team sizes for 12 players', () => {
      expect(GameModel.getTeamSize(12, 1)).toBe(4);
      expect(GameModel.getTeamSize(12, 2)).toBe(5);
      expect(GameModel.getTeamSize(12, 3)).toBe(5);
      expect(GameModel.getTeamSize(12, 4)).toBe(6);
      expect(GameModel.getTeamSize(12, 5)).toBe(6);
    });

    it('should default to 5-player config for invalid player count (round 1 = 2)', () => {
      expect(GameModel.getTeamSize(99, 1)).toBe(2);
    });

    it('should default to 3 for invalid round', () => {
      expect(GameModel.getTeamSize(5, 99)).toBe(3);
    });

    it('should return values between 2 and 6 for all valid inputs (5-12 players, 1-5 rounds)', () => {
      for (let n = 5; n <= 12; n++) {
        for (let r = 1; r <= 5; r++) {
          const size = GameModel.getTeamSize(n, r);
          expect(size).toBeGreaterThanOrEqual(2);
          expect(size).toBeLessThanOrEqual(6);
        }
      }
    });
  });

  describe('shuffleArray', () => {
    it('should return array of same length', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = GameModel.shuffleArray(arr);
      expect(shuffled.length).toBe(5);
    });

    it('should contain the same elements', () => {
      const arr = ['a', 'b', 'c', 'd'];
      const shuffled = GameModel.shuffleArray(arr);
      expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('should not mutate original array', () => {
      const arr = [1, 2, 3, 4, 5];
      const original = [...arr];
      GameModel.shuffleArray(arr);
      expect(arr).toEqual(original);
    });
  });
});
