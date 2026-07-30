const {
  getTeamSize,
  isMissionSuccess,
  isGameOver,
  getRoleVision,
  assignRoles,
  getRoleSide,
  getRoleName
} = require('../utils/gameLogic.js');

describe('gameLogic', () => {
  describe('getTeamSize', () => {
    it('should return correct team sizes for 5 players', () => {
      expect(getTeamSize(5, 1)).toBe(2);
      expect(getTeamSize(5, 2)).toBe(3);
      expect(getTeamSize(5, 3)).toBe(2);
      expect(getTeamSize(5, 4)).toBe(3);
      expect(getTeamSize(5, 5)).toBe(3);
    });

    it('should return correct team sizes for 7 players', () => {
      expect(getTeamSize(7, 1)).toBe(2);
      expect(getTeamSize(7, 2)).toBe(3);
      expect(getTeamSize(7, 3)).toBe(3);
      expect(getTeamSize(7, 4)).toBe(4);
      expect(getTeamSize(7, 5)).toBe(4);
    });

    it('should return correct team sizes for 10 players', () => {
      expect(getTeamSize(10, 1)).toBe(3);
      expect(getTeamSize(10, 2)).toBe(4);
      expect(getTeamSize(10, 3)).toBe(4);
      expect(getTeamSize(10, 4)).toBe(5);
      expect(getTeamSize(10, 5)).toBe(5);
    });

    it('should default to 5-player config for unsupported counts', () => {
      expect(getTeamSize(3, 1)).toBe(2);
      expect(getTeamSize(15, 1)).toBe(2);
    });

    it('should return first round size for out-of-range round', () => {
      expect(getTeamSize(5, 0)).toBe(2);
      expect(getTeamSize(5, 6)).toBe(2);
      expect(getTeamSize(5, -1)).toBe(2);
    });
  });

  describe('isMissionSuccess', () => {
    it('should succeed when all votes are success', () => {
      const votes = { p1: 'success', p2: 'success', p3: 'success' };
      expect(isMissionSuccess(votes, 5, 1)).toBe(true);
    });

    it('should fail when any vote is fail in non-4th round', () => {
      const votes = { p1: 'success', p2: 'fail', p3: 'success' };
      expect(isMissionSuccess(votes, 5, 1)).toBe(false);
      expect(isMissionSuccess(votes, 7, 2)).toBe(false);
    });

    it('should require 2 fail votes to fail in round 4 with 7+ players', () => {
      const oneFail = { p1: 'fail', p2: 'success', p3: 'success', p4: 'success' };
      expect(isMissionSuccess(oneFail, 7, 4)).toBe(true);

      const twoFail = { p1: 'fail', p2: 'fail', p3: 'success', p4: 'success' };
      expect(isMissionSuccess(twoFail, 7, 4)).toBe(false);
    });

    it('should not apply double-fail rule for round 4 with 5-6 players', () => {
      const oneFail = { p1: 'fail', p2: 'success', p3: 'success' };
      expect(isMissionSuccess(oneFail, 5, 4)).toBe(false);
      expect(isMissionSuccess(oneFail, 6, 4)).toBe(false);
    });

    it('should return false for empty votes', () => {
      expect(isMissionSuccess({}, 5, 1)).toBe(false);
      expect(isMissionSuccess(null, 5, 1)).toBe(false);
      expect(isMissionSuccess(undefined, 5, 1)).toBe(false);
    });
  });

  describe('isGameOver', () => {
    it('should return good wins when 3 missions succeed', () => {
      const results = [
        { success: true },
        { success: true },
        { success: true }
      ];
      expect(isGameOver(results, false)).toEqual({
        over: true,
        winner: 'good',
        reason: '完成任务'
      });
    });

    it('should return evil wins when 3 missions fail', () => {
      const results = [
        { success: false },
        { success: false },
        { success: false }
      ];
      expect(isGameOver(results, false)).toEqual({
        over: true,
        winner: 'evil',
        reason: '破坏任务'
      });
    });

    it('should return evil wins when assassin succeeds', () => {
      const results = [
        { success: true },
        { success: false }
      ];
      expect(isGameOver(results, true)).toEqual({
        over: true,
        winner: 'evil',
        reason: '刺杀梅林'
      });
    });

    it('should return not over when fewer than 3 missions on either side', () => {
      const results = [
        { success: true },
        { success: true },
        { success: false },
        { success: false }
      ];
      expect(isGameOver(results, false)).toEqual({ over: false });
    });

    it('should handle empty results', () => {
      expect(isGameOver([], false)).toEqual({ over: false });
    });

    it('should return good wins when both 3 missions succeed and assassin succeeds', () => {
      // Note: current implementation checks missions before assassin,
      // so 3 successful missions override the assassin kill
      const results = [
        { success: true },
        { success: true },
        { success: true }
      ];
      expect(isGameOver(results, true)).toEqual({
        over: true,
        winner: 'good',
        reason: '完成任务'
      });
    });
  });

  describe('assignRoles', () => {
    it('should return correct number of roles', () => {
      expect(assignRoles(5)).toHaveLength(5);
      expect(assignRoles(7)).toHaveLength(7);
      expect(assignRoles(10)).toHaveLength(10);
    });

    it('should always include merlin and assassin', () => {
      for (let i = 5; i <= 10; i++) {
        const roles = assignRoles(i);
        expect(roles).toContain('merlin');
        expect(roles).toContain('assassin');
      }
    });

    it('should default to 5-player config for unsupported counts', () => {
      expect(assignRoles(3)).toHaveLength(5);
      expect(assignRoles(4)).toHaveLength(5);
      expect(assignRoles(20)).toHaveLength(5);
    });

    it('should shuffle roles differently (statistical check)', () => {
      const runs = 10;
      const firstRoles = new Set();
      for (let i = 0; i < runs; i++) {
        const roles = assignRoles(5);
        firstRoles.add(roles[0]);
      }
      // With 10 runs, it's extremely unlikely all get the same first role
      expect(firstRoles.size).toBeGreaterThan(1);
    });

    it('should contain the correct set of roles for 5 players', () => {
      const roles = assignRoles(5);
      const sorted = [...roles].sort();
      expect(sorted).toEqual([
        'assassin',
        'loyal',
        'merlin',
        'mordred',
        'percival'
      ]);
    });
  });

  describe('getRoleVision', () => {
    const createPlayers = (roles) => {
      return roles.map((role, index) => ({
        openId: `player_${index}`,
        role: role,
        side: ['merlin', 'percival', 'loyal'].includes(role) ? 'good' : 'evil'
      }));
    };

    it('merlin should know all evil players except mordred', () => {
      const players = createPlayers([
        'merlin', 'mordred', 'assassin', 'morgana', 'loyal'
      ]);
      const vision = getRoleVision('merlin', players);

      expect(vision.knows).toHaveLength(2);
      const knownIds = vision.knows.map(k => k.openId);
      expect(knownIds).toContain('player_2'); // assassin
      expect(knownIds).toContain('player_3'); // morgana
      expect(knownIds).not.toContain('player_1'); // mordred (hidden from merlin)
      expect(knownIds).not.toContain('player_4'); // loyal

      vision.knows.forEach(k => {
        expect(k.side).toBe('evil');
      });
    });

    it('percival should know merlin and morgana (both appear as merlin)', () => {
      const players = createPlayers([
        'merlin', 'morgana', 'assassin', 'loyal', 'loyal'
      ]);
      const vision = getRoleVision('percival', players);

      expect(vision.knows).toHaveLength(2);
      expect(vision.knows[0].appearsAs).toBe('merlin');
      expect(vision.knows[1].appearsAs).toBe('merlin');
    });

    it('morgana should appear as merlin in vision', () => {
      const players = createPlayers([
        'merlin', 'morgana', 'assassin', 'loyal', 'loyal'
      ]);
      const vision = getRoleVision('morgana', players);

      expect(vision.appearsAs).toBe('merlin');
      expect(vision.knows).toHaveLength(0);
    });

    it('loyal should have empty vision', () => {
      const players = createPlayers([
        'merlin', 'loyal', 'assassin', 'loyal', 'loyal'
      ]);
      const vision = getRoleVision('loyal', players);

      expect(vision.knows).toHaveLength(0);
      expect(vision.appearsAs).toBe('loyal');
      expect(vision.specialAbility).toBeNull();
    });

    it('assassin should have empty vision', () => {
      const players = createPlayers([
        'merlin', 'loyal', 'assassin', 'morgana', 'loyal'
      ]);
      const vision = getRoleVision('assassin', players);

      expect(vision.knows).toHaveLength(0);
    });

    it('mordred should have empty vision', () => {
      const players = createPlayers([
        'merlin', 'mordred', 'assassin', 'morgana', 'loyal'
      ]);
      const vision = getRoleVision('mordred', players);

      expect(vision.knows).toHaveLength(0);
    });
  });

  describe('getRoleSide', () => {
    it('should return good for merlin, percival, loyal', () => {
      expect(getRoleSide('merlin')).toBe('good');
      expect(getRoleSide('percival')).toBe('good');
      expect(getRoleSide('loyal')).toBe('good');
    });

    it('should return evil for mordred, morgana, assassin, minion', () => {
      expect(getRoleSide('mordred')).toBe('evil');
      expect(getRoleSide('morgana')).toBe('evil');
      expect(getRoleSide('assassin')).toBe('evil');
      expect(getRoleSide('minion')).toBe('evil');
    });

    it('should return unknown for unrecognized roles', () => {
      expect(getRoleSide('oberon')).toBe('unknown');
      expect(getRoleSide('lancelot')).toBe('unknown');
      expect(getRoleSide('unknown')).toBe('unknown');
      expect(getRoleSide(undefined)).toBe('unknown');
    });

    it('should have different pattern than constants.js getRoleSide', () => {
      // gameLogic.js considers oberon and lancelot as 'unknown'
      // while constants.js considers them as 'good'
      expect(getRoleSide('oberon')).toBe('unknown');
      expect(getRoleSide('lancelot')).toBe('unknown');
    });
  });

  describe('getRoleName', () => {
    it('should return Chinese name for known roles', () => {
      expect(getRoleName('merlin')).toBe('梅林');
      expect(getRoleName('percival')).toBe('派西维尔');
      expect(getRoleName('loyal')).toBe('忠臣');
      expect(getRoleName('mordred')).toBe('莫德雷德');
      expect(getRoleName('morgana')).toBe('莫甘娜');
      expect(getRoleName('assassin')).toBe('刺客');
      expect(getRoleName('minion')).toBe('爪牙');
    });

    it('should return 未知 for unknown roles', () => {
      expect(getRoleName('oberon')).toBe('未知');
      expect(getRoleName('lancelot')).toBe('未知');
      expect(getRoleName('unknown')).toBe('未知');
      expect(getRoleName(undefined)).toBe('未知');
    });

    it('should be missing oberon and lancelot compared to constants.js', () => {
      // gameLogic.js is outdated: oberon and lancelot return '未知'
      expect(getRoleName('oberon')).toBe('未知');
      expect(getRoleName('lancelot')).toBe('未知');
    });
  });
});
