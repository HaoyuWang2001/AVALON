const GameModel = require('../models/GameModel');
const RoomModel = require('../models/RoomModel');

const buildVision = GameModel.buildVision;
const parseJson = GameModel.parseJson;

describe('07 — Game Logic Unit Tests', () => {
  describe('parseJson', () => {
    it('should parse string JSON', () => {
      expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    });

    it('should return objects unchanged', () => {
      const obj = { a: 1 };
      expect(parseJson(obj)).toBe(obj);
    });

    it('should return null for null/undefined', () => {
      expect(parseJson(null)).toBeNull();
      expect(parseJson(undefined)).toBeNull();
    });

    it('should return raw value for invalid JSON string', () => {
      const raw = 'not-json';
      expect(parseJson(raw)).toBe(raw);
    });
  });

  describe('validateRoomConfig', () => {
    it('should reject missing config', () => {
      expect(() => RoomModel.validateRoomConfig(null)).toThrow('缺少房间配置');
    });

    it('should reject missing roles', () => {
      expect(() => RoomModel.validateRoomConfig({ rules: {} })).toThrow('缺少角色配置');
    });

    it('should reject unknown role', () => {
      const cfg = { roles: { good: ['merlin'], evil: ['invalid_role'] }, rules: {} };
      expect(() => RoomModel.validateRoomConfig(cfg)).toThrow('未知角色');
    });

    it('should reject missing required rules', () => {
      const cfg = { roles: { good: ['merlin'], evil: ['morgana'] }, rules: {} };
      expect(() => RoomModel.validateRoomConfig(cfg)).toThrow('缺少字段');
    });

    it('should reject invalid lancelotSwapRound (0 and 5)', () => {
      const base = { roles: { good: ['merlin'], evil: ['morgana'] } };
      const req = {
        evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2,
        ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
        oberonMustFailMission: false, lancelotMustFail: false,
        voteVisibility: 'anonymous', missionFailDetail: 'count'
      };
      const valid = { ...base, rules: { ...req, lancelotSwapRound: 3 }, limits: { voteRevealDuration: 0 } };
      expect(() => RoomModel.validateRoomConfig({ ...base, rules: { ...req, lancelotSwapRound: 0 }, limits: { voteRevealDuration: 0 } })).toThrow('lancelotSwapRound');
      expect(() => RoomModel.validateRoomConfig({ ...base, rules: { ...req, lancelotSwapRound: 5 }, limits: { voteRevealDuration: 0 } })).toThrow('lancelotSwapRound');
      expect(() => RoomModel.validateRoomConfig(valid)).not.toThrow();
    });

    it('should validate lancelot card counts (switch/keep)', () => {
      const base = { roles: { good: ['merlin'], evil: ['morgana'] } };
      const req = {
        evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2,
        ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
        oberonMustFailMission: false, lancelotMustFail: false,
        voteVisibility: 'anonymous', missionFailDetail: 'count'
      };
      const withLimits = rules => ({ ...base, rules: { ...req, ...rules }, limits: { voteRevealDuration: 0 } });
      // 缺省（未配置）通过；合法 2/5 通过
      expect(() => RoomModel.validateRoomConfig(withLimits({}))).not.toThrow();
      expect(() => RoomModel.validateRoomConfig(withLimits({ lancelotSwitchCards: 2, lancelotKeepCards: 5 }))).not.toThrow();
      // 负数拒绝
      expect(() => RoomModel.validateRoomConfig(withLimits({ lancelotSwitchCards: -1 }))).toThrow('lancelotSwitchCards');
      // 非整数拒绝
      expect(() => RoomModel.validateRoomConfig(withLimits({ lancelotKeepCards: 1.5 }))).toThrow('lancelotKeepCards');
      // 0+0（和<1）拒绝
      expect(() => RoomModel.validateRoomConfig(withLimits({ lancelotSwitchCards: 0, lancelotKeepCards: 0 }))).toThrow('之和至少为 1');
    });
  });

  describe('buildVision', () => {
    const players = [
      { openId: 'a', role: 'merlin', side: 'good' },
      { openId: 'b', role: 'percival', side: 'good' },
      { openId: 'c', role: 'morgana', side: 'evil' },
      { openId: 'd', role: 'assassin', side: 'evil' },
      { openId: 'e', role: 'loyal', side: 'good' }
    ];
    const defaultCfg = { rules: { evilKnowsEachOther: true, evilsKnowRedLancelot: true } };

    it('merlin sees canSee evil roles (no mordred) with side only', () => {
      const seen = buildVision({ openId: 'a', role: 'merlin', side: 'good' }, players, defaultCfg);
      const seenIds = seen.map(s => s.openId);
      expect(seenIds).toContain('c');
      expect(seenIds).toContain('d');
      expect(seen.some(s => s.openId === 'c' && s.side === 'evil')).toBe(true);
      expect(seen.some(s => s.openId === 'c' && s.role)).toBe(false);
    });

    it('merlin vision does not include self', () => {
      const seen = buildVision({ openId: 'a', role: 'merlin', side: 'good' }, players, defaultCfg);
      expect(seen.some(s => s.openId === 'a')).toBe(false);
    });

    it('percival sees merlin + morgana without identity', () => {
      const seen = buildVision({ openId: 'b', role: 'percival', side: 'good' }, players, defaultCfg);
      const seenIds = seen.map(s => s.openId).sort();
      expect(seenIds).toEqual(['a', 'c']);
      expect(seen.every(s => !s.role && !s.side)).toBe(true);
    });

    it('assassin sees fellow open-eye evils with identity', () => {
      const seen = buildVision({ openId: 'd', role: 'assassin', side: 'evil' }, players, defaultCfg);
      const morgana = seen.find(s => s.openId === 'c');
      expect(morgana).toBeDefined();
      expect(morgana.role).toBe('morgana');
      expect(morgana.canIdentity).toBe(true);
    });

    it('loyal sees nobody', () => {
      const seen = buildVision({ openId: 'e', role: 'loyal', side: 'good' }, players, defaultCfg);
      expect(seen.length).toBe(0);
    });

    it('evilKnowsEachOther=false: open-eye still sees fellow open-eye evils without identity', () => {
      const cfg = { rules: { evilKnowsEachOther: false, evilsKnowRedLancelot: true } };
      const seen = buildVision({ openId: 'd', role: 'assassin', side: 'evil' }, players, cfg);
      const morgana = seen.find(s => s.openId === 'c');
      expect(morgana).toBeDefined();
      expect(morgana.role).toBeUndefined();
      expect(morgana.side).toBe('evil');
      expect(morgana.canIdentity).toBe(false);
      expect(seen.some(s => s.openId === 'd')).toBe(false);
    });
  });

  describe('getTeamSize full table', () => {
    const expected = {
      5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
      11: [3, 4, 5, 6, 6], 12: [3, 4, 5, 6, 6]
    };
    it.each(Object.keys(expected))('N=%s matches canonical table', (n) => {
      const row = expected[n];
      for (let r = 1; r <= 5; r++) {
        expect(GameModel.getTeamSize(parseInt(n), r)).toBe(row[r - 1]);
      }
    });
  });
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
