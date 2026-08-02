const {
  PLAYER_COUNTS,
  SEAT_NUMBER_RANGE,
  ROLES,
  SIDES,
  GAME_PHASES,
  ROLE_CONFIGS,
  TEAM_SIZES,
  ROLE_NAMES,
  ROLE_DESCRIPTIONS,
  getRoleSide,
  getRoleName,
  getRoleDescription
} = require('../utils/constants.js');

describe('constants', () => {
  describe('PLAYER_COUNTS', () => {
    it('should define min as 5 and max as 12', () => {
      expect(PLAYER_COUNTS.MIN).toBe(5);
      expect(PLAYER_COUNTS.MAX).toBe(12);
    });
  });

  describe('SEAT_NUMBER_RANGE', () => {
    it('should define min as 1 and max as 12', () => {
      expect(SEAT_NUMBER_RANGE.MIN).toBe(1);
      expect(SEAT_NUMBER_RANGE.MAX).toBe(12);
    });
  });

  describe('ROLES', () => {
    const roleValues = Object.values(ROLES);

    it('should define all 10 role constants', () => {
      expect(roleValues).toHaveLength(10);
      expect(roleValues).toContain('merlin');
      expect(roleValues).toContain('percival');
      expect(roleValues).toContain('loyal');
      expect(roleValues).toContain('mordred');
      expect(roleValues).toContain('morgana');
      expect(roleValues).toContain('assassin');
      expect(roleValues).toContain('minion');
      expect(roleValues).toContain('oberon');
      expect(roleValues).toContain('lancelot');
      expect(roleValues).toContain('ladyOfTheLake');
    });

    it('should have unique role values', () => {
      const unique = new Set(roleValues);
      expect(unique.size).toBe(roleValues.length);
    });
  });

  describe('SIDES', () => {
    it('should define good and evil', () => {
      expect(SIDES.GOOD).toBe('good');
      expect(SIDES.EVIL).toBe('evil');
    });
  });

  describe('GAME_PHASES', () => {
    it('should define all 7 game phases', () => {
      const phases = Object.values(GAME_PHASES);
      expect(phases).toHaveLength(7);
      expect(phases).toContain('waiting');
      expect(phases).toContain('roleReveal');
      expect(phases).toContain('discussion');
      expect(phases).toContain('teamVote');
      expect(phases).toContain('missionVote');
      expect(phases).toContain('missionResult');
      expect(phases).toContain('gameEnd');
    });
  });

  describe('ROLE_CONFIGS', () => {
    it('should have configs for player counts 5 through 12', () => {
      for (let i = 5; i <= 12; i++) {
        expect(ROLE_CONFIGS[i]).toBeDefined();
      }
    });

    it('should assign correct number of roles per player count', () => {
      for (let i = 5; i <= 12; i++) {
        expect(ROLE_CONFIGS[i]).toHaveLength(i);
      }
    });

    it('should always include merlin and percival for good side', () => {
      for (let i = 5; i <= 12; i++) {
        const roles = ROLE_CONFIGS[i];
        expect(roles).toContain(ROLES.MERLIN);
        expect(roles).toContain(ROLES.PERCIVAL);
      }
    });

    it('should always include mordred and assassin for evil side', () => {
      for (let i = 5; i <= 12; i++) {
        const roles = ROLE_CONFIGS[i];
        expect(roles).toContain(ROLES.MORDRED);
        expect(roles).toContain(ROLES.ASSASSIN);
      }
    });

    it('should include morgana for 7+ players', () => {
      for (let i = 7; i <= 12; i++) {
        expect(ROLE_CONFIGS[i]).toContain(ROLES.MORGANA);
      }
    });

    it('should include minion for 10+ players', () => {
      for (let i = 10; i <= 12; i++) {
        expect(ROLE_CONFIGS[i]).toContain(ROLES.MINION);
      }
    });

    it('should include lancelot for 11+ players', () => {
      for (let i = 11; i <= 12; i++) {
        expect(ROLE_CONFIGS[i]).toContain(ROLES.LANCELOT);
      }
    });

    it('should include oberon for 12 players', () => {
      expect(ROLE_CONFIGS[12]).toContain(ROLES.OBERON);
    });
  });

  describe('TEAM_SIZES', () => {
    it('should have team sizes for player counts 5 through 12', () => {
      for (let i = 5; i <= 12; i++) {
        expect(TEAM_SIZES[i]).toBeDefined();
        expect(TEAM_SIZES[i]).toHaveLength(5);
      }
    });

    it('should return correct team sizes for 5 players', () => {
      expect(TEAM_SIZES[5]).toEqual([2, 3, 2, 3, 3]);
    });

    it('should return correct team sizes for 7 players', () => {
      expect(TEAM_SIZES[7]).toEqual([2, 3, 3, 4, 4]);
    });

    it('should return correct team sizes for 12 players', () => {
      expect(TEAM_SIZES[12]).toEqual([4, 5, 5, 6, 6]);
    });

    it('should have team sizes >= 2 and <= 6', () => {
      for (let i = 5; i <= 12; i++) {
        TEAM_SIZES[i].forEach(size => {
          expect(size).toBeGreaterThanOrEqual(2);
          expect(size).toBeLessThanOrEqual(6);
        });
      }
    });
  });

  describe('ROLE_NAMES', () => {
    it('should map all roles to Chinese names', () => {
      expect(ROLE_NAMES[ROLES.MERLIN]).toBe('梅林');
      expect(ROLE_NAMES[ROLES.PERCIVAL]).toBe('派西维尔');
      expect(ROLE_NAMES[ROLES.LOYAL]).toBe('忠臣');
      expect(ROLE_NAMES[ROLES.MORDRED]).toBe('莫德雷德');
      expect(ROLE_NAMES[ROLES.MORGANA]).toBe('莫甘娜');
      expect(ROLE_NAMES[ROLES.ASSASSIN]).toBe('刺客');
      expect(ROLE_NAMES[ROLES.MINION]).toBe('爪牙');
      expect(ROLE_NAMES[ROLES.OBERON]).toBe('奥伯伦');
      expect(ROLE_NAMES[ROLES.LANCELOT]).toBe('兰斯洛特');
      expect(ROLE_NAMES[ROLES.LADY_OF_THE_LAKE]).toBe('湖中仙女');
    });
  });

  describe('ROLE_DESCRIPTIONS', () => {
    it('should have descriptions for all 10 roles', () => {
      const roles = Object.values(ROLES);
      roles.forEach(role => {
        expect(ROLE_DESCRIPTIONS[role]).toBeDefined();
        expect(typeof ROLE_DESCRIPTIONS[role]).toBe('string');
        expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(0);
      });
    });
  });

  describe('getRoleSide', () => {
    it('should return good for merlin, percival, loyal', () => {
      expect(getRoleSide(ROLES.MERLIN)).toBe('good');
      expect(getRoleSide(ROLES.PERCIVAL)).toBe('good');
      expect(getRoleSide(ROLES.LOYAL)).toBe('good');
    });

    it('should return good for lancelot and ladyOfTheLake', () => {
      expect(getRoleSide(ROLES.LANCELOT)).toBe('good');
      expect(getRoleSide(ROLES.LADY_OF_THE_LAKE)).toBe('good');
    });

    it('should return evil for mordred, morgana, assassin, minion, oberon', () => {
      expect(getRoleSide(ROLES.MORDRED)).toBe('evil');
      expect(getRoleSide(ROLES.MORGANA)).toBe('evil');
      expect(getRoleSide(ROLES.ASSASSIN)).toBe('evil');
      expect(getRoleSide(ROLES.MINION)).toBe('evil');
      expect(getRoleSide(ROLES.OBERON)).toBe('evil');
    });

    it('should default to good for unknown roles', () => {
      expect(getRoleSide('unknown')).toBe('good');
      expect(getRoleSide(null)).toBe('good');
      expect(getRoleSide(undefined)).toBe('good');
      expect(getRoleSide('')).toBe('good');
    });
  });

  describe('getRoleName', () => {
    it('should return Chinese name for known roles', () => {
      expect(getRoleName(ROLES.MERLIN)).toBe('梅林');
      expect(getRoleName(ROLES.MORGANA)).toBe('莫甘娜');
    });

    it('should return 未知 for unknown roles', () => {
      expect(getRoleName('unknown')).toBe('未知');
      expect(getRoleName(null)).toBe('未知');
      expect(getRoleName(undefined)).toBe('未知');
      expect(getRoleName('')).toBe('未知');
    });
  });

  describe('getRoleDescription', () => {
    it('should return description for known roles', () => {
      expect(getRoleDescription(ROLES.MERLIN)).toContain('坏人');
      expect(getRoleDescription(ROLES.ASSASSIN)).toContain('坏人');
    });

    it('should return 角色信息错误 for unknown roles', () => {
      expect(getRoleDescription('unknown')).toBe('角色信息错误');
      expect(getRoleDescription(null)).toBe('角色信息错误');
      expect(getRoleDescription(undefined)).toBe('角色信息错误');
      expect(getRoleDescription('')).toBe('角色信息错误');
    });
  });
});
