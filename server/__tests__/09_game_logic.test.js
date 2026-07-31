const GameModel = require('../models/GameModel');

describe('09 — Game Logic Unit Tests', () => {
  describe('getRoleConfiguration', () => {
    it('should return exactly N roles for each player count', () => {
      for (let n = 5; n <= 12; n++) {
        const roles = GameModel.getRoleConfiguration(n);
        expect(roles.length).toBe(n);
      }
    });

    it('should include merlin and percival for all configs', () => {
      for (let n = 5; n <= 12; n++) {
        const roles = GameModel.getRoleConfiguration(n);
        expect(roles).toContain('merlin');
        expect(roles).toContain('percival');
      }
    });

    it('should have at least 2 evil roles for all configs', () => {
      for (let n = 5; n <= 12; n++) {
        const roles = GameModel.getRoleConfiguration(n);
        const evilCount = roles.filter(r => GameModel.getRoleSide(r) === 'evil').length;
        expect(evilCount).toBeGreaterThanOrEqual(2);
      }
    });

    it('should return correct 5-player config', () => {
      const roles = GameModel.getRoleConfiguration(5);
      expect(roles.sort()).toEqual(['merlin', 'percival', 'loyal', 'morgana', 'assassin'].sort());
    });

    it('should include lancelot pair for 11-12 players', () => {
      expect(GameModel.getRoleConfiguration(11)).toContain('lancelotBlue');
      expect(GameModel.getRoleConfiguration(11)).toContain('lancelotRed');
      expect(GameModel.getRoleConfiguration(12)).toContain('lancelotBlue');
      expect(GameModel.getRoleConfiguration(12)).toContain('lancelotRed');
    });

    it('should include assassin for 10 and 12 players', () => {
      expect(GameModel.getRoleConfiguration(10)).toContain('assassin');
      expect(GameModel.getRoleConfiguration(12)).toContain('assassin');
    });

    it('should NOT include assassin for 11 players', () => {
      expect(GameModel.getRoleConfiguration(11)).not.toContain('assassin');
    });

    it('should default to 5-player config for invalid count', () => {
      const roles = GameModel.getRoleConfiguration(99);
      expect(roles.length).toBe(5);
    });
  });

  describe('getRoleSide', () => {
    const cases = [
      ['merlin', 'good'], ['percival', 'good'], ['loyal', 'good'],
      ['lancelotBlue', 'good'], ['mordred', 'evil'], ['morgana', 'evil'],
      ['assassin', 'evil'], ['minion', 'evil'], ['oberon', 'evil'],
      ['lancelotRed', 'evil']
    ];
    it.each(cases)('%s should be %s', (role, expected) => {
      expect(GameModel.getRoleSide(role)).toBe(expected);
    });

    it('should default unknown to good', () => {
      expect(GameModel.getRoleSide('unknown_role')).toBe('good');
    });
  });

  describe('getTeamSize', () => {
    it('should return correct sizes for 5 players', () => {
      expect(GameModel.getTeamSize(5, 1)).toBe(2);
      expect(GameModel.getTeamSize(5, 2)).toBe(3);
      expect(GameModel.getTeamSize(5, 3)).toBe(2);
      expect(GameModel.getTeamSize(5, 4)).toBe(3);
      expect(GameModel.getTeamSize(5, 5)).toBe(3);
    });

    it('should return correct sizes for 8 players', () => {
      expect(GameModel.getTeamSize(8, 1)).toBe(3);
      expect(GameModel.getTeamSize(8, 5)).toBe(5);
    });

    it('should return correct sizes for 12 players', () => {
      expect(GameModel.getTeamSize(12, 1)).toBe(3);
      expect(GameModel.getTeamSize(12, 4)).toBe(6);
    });

    it('should return values between 2 and 6 for all valid inputs', () => {
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
      expect(GameModel.shuffleArray([1, 2, 3, 4, 5]).length).toBe(5);
    });

    it('should contain the same elements', () => {
      const arr = ['a', 'b', 'c', 'd'];
      const shuffled = GameModel.shuffleArray(arr);
      expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('should not mutate original', () => {
      const arr = [1, 2, 3, 4, 5];
      const original = [...arr];
      GameModel.shuffleArray(arr);
      expect(arr).toEqual(original);
    });
  });
});
