const {
  createRoomWithPlayers, startGame, getGameState, advancePhase, toggleReady,
  buildStandardRoomConfig, buildCustomBoard10, buildCustomBoard9, withConfigOverrides
} = require('./helpers/testHelper');

const EVIL_OPEN_EYES = ['morgana', 'assassin', 'minion', 'mordred'];
const CAN_SEE_DEFAULT = ['assassin', 'morgana', 'minion', 'oberon'];

const BOARD_STANDARDS = [5, 6, 7, 8, 9, 10, 11, 12].map(n => ({
  name: `std${n}`,
  config: () => buildStandardRoomConfig(n)
}));

const BOARDS = [
  ...BOARD_STANDARDS,
  { name: 'custom10', config: buildCustomBoard10 },
  { name: 'custom9', config: buildCustomBoard9 }
];

const BOARDS_WITH_RED_LANCELOT = BOARDS.filter(b =>
  (b.config().roles.evil || []).includes('lancelotRed'));
const BOARDS_WITH_OBERON_RED = BOARDS.filter(b =>
  (b.config().roles.evil || []).includes('oberon') && (b.config().roles.evil || []).includes('lancelotRed'));
const DUAL_LANCELOT = BOARDS.filter(b => {
  const evil = b.config().roles.evil || [];
  const good = b.config().roles.good || [];
  return good.includes('lancelotBlue') && evil.includes('lancelotRed');
});

async function startBoard(config) {
  const n = config.roles.good.length + config.roles.evil.length;
  const { roomId, hostId } = await createRoomWithPlayers(n, config);
  const m = new Date().getMinutes();
  const start = await startGame(roomId, hostId);
  if (!start.success) throw new Error(`start failed: ${JSON.stringify(start)}`);
  const gameId = start.gameId;
  const state = await getGameState(gameId);
  const fullPlayers = state.players.map(p => ({
    openId: p.openId, role: p.role, side: p.side, seatNumber: p.seatNumber
  }));
  return { gameId, roomId, hostId, players: fullPlayers, m, leaderIndex: fullPlayers.findIndex(p => p.openId === state.current.teamLeaderOpenId) };
}

async function visionOf(gameId, openId) {
  const state = await getGameState(gameId, openId);
  return state.player.vision ? state.player.vision.players : [];
}

describe('03 — Game Start, Role Assignment & Vision', () => {
  // ─────────────── A 开局校验 ───────────────
  describe('A 开局校验', () => {
    it('T1 未全 ready → start 失败', async () => {
      const config = buildCustomBoard9();
      const n = 9;
      const { roomId, players, hostId } = await createRoomWithPlayers(n, config);
      await toggleReady(roomId, players[1].openId, false);
      const res = await startGame(roomId, hostId);
      expect(res.success).toBe(false);
    });

    it('T2 不存在 room → start 失败', async () => {
      const res = await startGame('000000', 'anyone');
      expect(res.success).toBe(false);
    });

    it('T3 advancePhase：roleReveal→discussion，二次调用失败', async () => {
      const { gameId } = await startBoard(buildCustomBoard10());
      const r1 = await advancePhase(gameId);
      expect(r1.success).toBe(true);
      expect(r1.current.phase).toBe('discussion');
      const r2 = await advancePhase(gameId);
      expect(r2.success).toBe(false);
    });
  });

  // ─────────────── B 基础开局/状态（10 块板） ───────────────
  describe.each(BOARDS)('B $name', ({ config }) => {
    let gameId;
    let players;
    let m;
    let leaderIndex;

    beforeAll(async () => {
      const r = await startBoard(config());
      gameId = r.gameId;
      players = r.players;
      m = r.m;
      leaderIndex = r.leaderIndex;
    });

    it('T4 开局成功（gameId UUID）', () => {
      expect(gameId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('T5 玩家状态正确', async () => {
      const state = await getGameState(gameId);
      const N = players.length;
      expect(state.players.length).toBe(N);
      for (const p of state.players) {
        expect(typeof p.openId).toBe('string');
        expect(typeof p.nickName).toBe('string');
        expect(typeof p.seatNumber).toBe('number');
        expect(typeof p.isHost).toBe('boolean');
        expect(typeof p.role).toBe('string');
        expect(typeof p.side).toBe('string');
      }
      const seats = state.players.map(p => p.seatNumber);
      expect(new Set(seats).size).toBe(N);
      expect(seats.every(s => s >= 1 && s <= N)).toBe(true);
    });

    it('T6 首位车长 = 当前分钟 % N（±1）', () => {
      const N = players.length;
      expect([m % N, (m + 1) % N]).toContain(leaderIndex);
    });

    it('T7 每玩家有合法 role', () => {
      for (const p of players) expect(typeof p.role).toBe('string');
    });

    it('T8 每玩家 side ∈ {good, evil}', () => {
      for (const p of players) expect(['good', 'evil']).toContain(p.side);
    });

    it('T9 玩家数 === 配置角色数', () => {
      const cfg = config();
      const expected = cfg.roles.good.length + cfg.roles.evil.length;
      expect(players.length).toBe(expected);
    });

    it('T10 getGameState 全量/玩家视角', async () => {
      const full = await getGameState(gameId);
      expect(full.players.every(p => typeof p.role === 'string')).toBe(true);
      const view = await getGameState(gameId, players[0].openId);
      expect(Array.isArray(view.player.vision.players)).toBe(true);
      for (const p of view.players) {
        if (p.openId === players[0].openId) {
          expect(p.role).toBe(players[0].role);
        } else {
          expect(p.role).toBeUndefined();
        }
      }
    });
  });

  // ─────────────── C1 坏人互认（evilKnowsEachOther，全部板） ───────────────
  describe.each(BOARDS)('C1 坏人互认 $name', ({ config }) => {
    it('T11 evilKnowsEachOther=true：睁眼狼互知身份，oberon/lancelotRed 不参与', async () => {
      const cfg = withConfigOverrides(config(), { rules: { evilsKnowRedLancelot: false } });
      const { gameId, players } = await startBoard(cfg);
      const openEye = players.find(p => EVIL_OPEN_EYES.includes(p.role));
      expect(openEye).toBeDefined();
      const seen = await visionOf(gameId, openEye.openId);
      const seenIds = seen.map(s => s.openId);
      const expected = players.filter(p =>
        EVIL_OPEN_EYES.includes(p.role) && p.openId !== openEye.openId
      ).map(p => p.openId);
      expect(seenIds.sort()).toEqual([...new Set(expected)].sort());
      for (const s of seen) {
        expect(s.role).toBeDefined();
        expect(s.side).toBe('evil');
        expect(s.canIdentity).toBe(true);
      }
      expect(seen.some(s => s.role === 'oberon')).toBe(false);
      expect(seen.some(s => s.role === 'lancelotRed')).toBe(false);
    });

    it('T12 evilKnowsEachOther=false：睁眼狼互认不可见', async () => {
      const cfg = withConfigOverrides(config(), { rules: { evilKnowsEachOther: false } });
      const { gameId, players } = await startBoard(cfg);
      const openEye = players.find(p => EVIL_OPEN_EYES.includes(p.role));
      const seen = await visionOf(gameId, openEye.openId);
      expect(seen).toEqual([]);
    });
  });

  // ─────────────── C2 派西维尔（全部板） ───────────────
  describe.each(BOARDS)('C2 派西维尔 $name', ({ config }) => {
    it('T13 percival 视角 = {merlin, morgana}（不区分）', async () => {
      const { gameId, players } = await startBoard(config());
      const percival = players.find(p => p.role === 'percival');
      const merlin = players.find(p => p.role === 'merlin');
      const morgana = players.find(p => p.role === 'morgana');
      const seen = await visionOf(gameId, percival.openId);
      const seenIds = seen.map(s => s.openId).sort();
      expect(seenIds).toEqual([merlin.openId, morgana.openId].sort());
      for (const s of seen) {
        expect(s.role).toBeUndefined();
        expect(s.side).toBeUndefined();
        expect(s.canIdentity).toBe(false);
      }
    });
  });

  // ─────────────── C3 梅林（全部板） ───────────────
  describe.each(BOARDS)('C3 梅林 $name', ({ config }) => {
    it('T14 merlin 视角 = canSee 角色 + 兰斯洛特（默认可辨阵营）', async () => {
      const cfg = config();
      const { gameId, players } = await startBoard(cfg);
      const merlin = players.find(p => p.role === 'merlin');
      const canSee = (cfg.merlinVision && cfg.merlinVision.canSee) || CAN_SEE_DEFAULT;
      const lancelots = players.filter(p => p.role === 'lancelotBlue' || p.role === 'lancelotRed');
      const expected = [
        ...players.filter(p => canSee.includes(p.role)).map(p => p.openId),
        ...lancelots.map(p => p.openId)
      ].sort();
      const seen = await visionOf(gameId, merlin.openId);
      const seenIds = seen.map(s => s.openId).sort();
      expect(seenIds).toEqual(expected);
      for (const s of seen) {
        if (!lancelots.some(l => l.openId === s.openId)) {
          expect(s.side).toBe('evil');
          expect(s.role).toBeUndefined();
          expect(s.canIdentity).toBe(false);
        }
      }
      // 兰斯洛特默认可辨阵营（merlinKnowsLancelotSide 默认 true）
      for (const l of lancelots) {
        const entry = seen.find(s => s.openId === l.openId);
        if (entry) {
          expect(entry.role).toBe(l.role);
          expect(entry.side).toBe(l.side);
          expect(entry.canIdentity).toBe(true);
        }
      }
    });
  });

  it('T14b merlinKnowsLancelotSide=false：梅林看到兰斯洛特但不辨阵营', async () => {
    const cfg = withConfigOverrides(buildCustomBoard10(), { rules: { merlinKnowsLancelotSide: false } });
    const { gameId, players } = await startBoard(cfg);
    const merlin = players.find(p => p.role === 'merlin');
    const red = players.find(p => p.role === 'lancelotRed');
    const seen = await visionOf(gameId, merlin.openId);
    const entry = seen.find(s => s.openId === red.openId);
    expect(entry).toBeDefined();
    expect(entry.role).toBeUndefined();
    expect(entry.side).toBeUndefined();
    expect(entry.canIdentity).toBe(false);
  });

  it('T15 canIdentify=[assassin]：梅林可见 assassin 具体身份', async () => {
    const cfg = withConfigOverrides(buildCustomBoard10(), { merlinVision: { canIdentify: ['assassin'] } });
    const { gameId, players } = await startBoard(cfg);
    const merlin = players.find(p => p.role === 'merlin');
    const assassin = players.find(p => p.role === 'assassin');
    const seen = await visionOf(gameId, merlin.openId);
    const ass = seen.find(s => s.openId === assassin.openId);
    expect(ass).toBeDefined();
    expect(ass.role).toBe('assassin');
  });

  // ─────────────── C4 湖仙落位 ───────────────
  it('T16 湖仙落位 = (首车主 seat-1) mod N', async () => {
    const cfg = withConfigOverrides(buildCustomBoard10(), { ladyOfTheLake: true, ladyOfTheLakeRound: 2 });
    const { gameId, players, leaderIndex } = await startBoard(cfg);
    const state = await getGameState(gameId);
    expect(state.current.lakeHolderOpenId).toBeDefined();
    const expected = players[(leaderIndex - 1 + players.length) % players.length].openId;
    expect(state.current.lakeHolderOpenId).toBe(expected);
  });

  // ─────────────── C5 兰斯洛特相关 ───────────────
  describe.each(BOARDS_WITH_RED_LANCELOT)('C5 evilsKnowRedLancelot $name', ({ config }) => {
    it('T17 =true：睁眼狼视角含 lancelotRed 身份', async () => {
      const cfg = withConfigOverrides(config(), { rules: { evilsKnowRedLancelot: true } });
      const { gameId, players } = await startBoard(cfg);
      const openEye = players.find(p => EVIL_OPEN_EYES.includes(p.role));
      const red = players.find(p => p.role === 'lancelotRed');
      const seen = await visionOf(gameId, openEye.openId);
      const entry = seen.find(s => s.openId === red.openId);
      expect(entry).toBeDefined();
      expect(entry.role).toBe('lancelotRed');
    });

    it('T18 =false：睁眼狼视角不含 lancelotRed', async () => {
      const cfg = withConfigOverrides(config(), { rules: { evilsKnowRedLancelot: false } });
      const { gameId, players } = await startBoard(cfg);
      const openEye = players.find(p => EVIL_OPEN_EYES.includes(p.role));
      const red = players.find(p => p.role === 'lancelotRed');
      const seen = await visionOf(gameId, openEye.openId);
      expect(seen.some(s => s.openId === red.openId)).toBe(false);
    });
  });

  describe.each(BOARDS_WITH_OBERON_RED)('C5 oberonKnowsRedLancelot $name', ({ config }) => {
    it('T19 =true：oberon 视角含 lancelotRed 身份', async () => {
      const cfg = withConfigOverrides(config(), { rules: { oberonKnowsRedLancelot: true } });
      const { gameId, players } = await startBoard(cfg);
      const oberon = players.find(p => p.role === 'oberon');
      const red = players.find(p => p.role === 'lancelotRed');
      const seen = await visionOf(gameId, oberon.openId);
      const entry = seen.find(s => s.openId === red.openId);
      expect(entry).toBeDefined();
      expect(entry.role).toBe('lancelotRed');
    });

    it('T20 =false：oberon 视角不含 lancelotRed（空）', async () => {
      const cfg = withConfigOverrides(config(), { rules: { oberonKnowsRedLancelot: false } });
      const { gameId, players } = await startBoard(cfg);
      const oberon = players.find(p => p.role === 'oberon');
      const seen = await visionOf(gameId, oberon.openId);
      expect(seen).toEqual([]);
    });
  });

  describe.each(DUAL_LANCELOT)('C5 lancelotsKnowEachOther $name', ({ config }) => {
    it('T21 =true：蓝↔红互见初始角色', async () => {
      const cfg = withConfigOverrides(config(), { rules: { lancelotsKnowEachOther: true } });
      const { gameId, players } = await startBoard(cfg);
      const blue = players.find(p => p.role === 'lancelotBlue');
      const red = players.find(p => p.role === 'lancelotRed');
      const seenBlue = await visionOf(gameId, blue.openId);
      const seenRed = await visionOf(gameId, red.openId);
      const blueSeesRed = seenBlue.find(s => s.openId === red.openId);
      const redSeesBlue = seenRed.find(s => s.openId === blue.openId);
      expect(blueSeesRed).toBeDefined();
      expect(blueSeesRed.role).toBe('lancelotRed');
      expect(redSeesBlue).toBeDefined();
      expect(redSeesBlue.role).toBe('lancelotBlue');
    });

    it('T22 =false：蓝↔红互不见', async () => {
      const cfg = withConfigOverrides(config(), { rules: { lancelotsKnowEachOther: false } });
      const { gameId, players } = await startBoard(cfg);
      const blue = players.find(p => p.role === 'lancelotBlue');
      const red = players.find(p => p.role === 'lancelotRed');
      const seenBlue = await visionOf(gameId, blue.openId);
      const seenRed = await visionOf(gameId, red.openId);
      expect(seenBlue.some(s => s.openId === red.openId)).toBe(false);
      expect(seenRed.some(s => s.openId === blue.openId)).toBe(false);
    });
  });
});
