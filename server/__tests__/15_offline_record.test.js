const {
  buildMinimalRoomConfig, getGameState, apiGet,
  createOfflineRecord, getOfflineRecord, listOfflineRecords,
  joinOfflineSeat, respondOfflineSeat, assignOfflinePlayer, setOfflineRole,
  saveOfflineRounds, finishOfflineRecord, reopenOfflineRecord, deleteOfflineRecord
} = require('./helpers/testHelper');
const db = require('../config/db');

// 5 人板：梅林/派西/忠臣 + 莫甘娜/刺客
function recordConfig() {
  const cfg = buildMinimalRoomConfig();
  cfg.roles = { good: ['merlin', 'percival', 'loyal'], evil: ['morgana', 'assassin'] };
  return cfg;
}

const TS = Date.now();
const HOST = `rec_host_${TS}`;
const U = {
  u1: `rec_u1_${TS}`,  // 自选座（待审批）
  u2: `rec_u2_${TS}`,  // 被拒绝的申请
  u3: `rec_u3_${TS}`,  // 受邀直接入座
  u4: `rec_u4_${TS}`   // 房主指定
};

async function ensureUser(openId) {
  await db.query('INSERT INTO users (open_id, custom_nick_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE custom_nick_name = VALUES(custom_nick_name)',
    [openId, openId]);
}

describe('15 — Offline Record', () => {
  beforeAll(async () => {
    await db.initPool();
    for (const id of [HOST, ...Object.values(U)]) await ensureUser(id);
  });

  let recordId;

  it('15-1 创建记录：standard/recording，出现在列表', async () => {
    const res = await createOfflineRecord(HOST, recordConfig());
    expect(res.success).toBe(true);
    recordId = res.record.id;
    expect(res.record.boardType).toBe('standard');
    expect(res.record.status).toBe('recording');
    expect(res.record.isOwner).toBe(true);

    const list = await listOfflineRecords(HOST);
    expect(list.records.some(r => r.id === recordId)).toBe(true);
  });

  it('15-2 座位：自选待审批→同意；申请被拒即移除；受邀直接入座；房主指定直接入座', async () => {
    // 自选 → pending
    let r = await joinOfflineSeat(recordId, U.u1, 2, { nickName: '玩家一', avatarUrl: '' }, false);
    expect(r.success).toBe(true);
    expect(r.record.players.find(p => p.openId === U.u1).seatStatus).toBe('pending');

    // 非房主审批 → 403
    const bad = await respondOfflineSeat(recordId, U.u1, U.u1, true);
    expect(bad.success).toBe(false);
    expect(bad.message).toContain('仅房主');

    // 房主同意
    r = await respondOfflineSeat(recordId, HOST, U.u1, true);
    expect(r.record.players.find(p => p.openId === U.u1).seatStatus).toBe('approved');

    // u2 申请 → 拒绝 → 移除
    await joinOfflineSeat(recordId, U.u2, 3, { nickName: '玩家二', avatarUrl: '' }, false);
    r = await respondOfflineSeat(recordId, HOST, U.u2, false);
    expect(r.record.players.find(p => p.openId === U.u2)).toBeUndefined();

    // 座位被占
    const occupied = await joinOfflineSeat(recordId, U.u3, 2, { nickName: '玩家三', avatarUrl: '' }, false);
    expect(occupied.success).toBe(false);
    expect(occupied.message).toContain('已被占用');

    // 受邀直接入座（无需房主同意）
    r = await joinOfflineSeat(recordId, U.u3, 3, { nickName: '玩家三', avatarUrl: '' }, true);
    expect(r.record.players.find(p => p.openId === U.u3).seatStatus).toBe('approved');

    // 房主入座 1 号位（直接 approved）
    r = await joinOfflineSeat(recordId, HOST, 1, { nickName: '房主', avatarUrl: '' }, false);
    expect(r.record.players.find(p => p.openId === HOST).seatStatus).toBe('approved');

    // 房主指定 u4 入座 5 号位
    r = await assignOfflinePlayer(recordId, HOST, U.u4, 5);
    expect(r.record.players.find(p => p.openId === U.u4).seatStatus).toBe('approved');
  });

  it('15-3 身份：自选/房主指定/唯一性/防剧透门控', async () => {
    // u1 自选梅林
    let r = await setOfflineRole(recordId, U.u1, null, 'merlin');
    expect(r.record.players.find(p => p.openId === U.u1).role).toBe('merlin');

    // u3 也想选梅林 → 已被分配
    const taken = await setOfflineRole(recordId, U.u3, null, 'merlin');
    expect(taken.success).toBe(false);
    expect(taken.message).toContain('已被分配');

    // u1 给 u3 指定 → 403（非房主）
    const notOwner = await setOfflineRole(recordId, U.u1, U.u3, 'morgana');
    expect(notOwner.success).toBe(false);
    expect(notOwner.message).toContain('仅房主');

    // 房主指定其余身份（u1=merlin 自选；HOST=percival；u3=assassin；u4=morgana；u2 稍后入座补 loyal）
    await setOfflineRole(recordId, HOST, HOST, 'percival');
    await setOfflineRole(recordId, HOST, U.u3, 'assassin');
    await setOfflineRole(recordId, HOST, U.u4, 'morgana');

    // 防剧透：房主看不到 u1 自选的梅林，u1 自己可见
    const hostView = await getOfflineRecord(recordId, HOST);
    expect(hostView.body.record.players.find(p => p.openId === U.u1).role).toBeNull();
    const u1View = await getOfflineRecord(recordId, U.u1);
    expect(u1View.body.record.players.find(p => p.openId === U.u1).role).toBe('merlin');
    // 房主自己指定的可见
    expect(hostView.body.record.players.find(p => p.openId === U.u4).role).toBe('morgana');
  });

  it('15-4 轮次校验：座位未满/身份未全部分配/轮次为空均不可完成', async () => {
    // 4/5 座位 → 座位未满
    const notFull = await finishOfflineRecord(recordId, HOST);
    expect(notFull.success).toBe(false);
    expect(notFull.message).toContain('座位未满');

    // u2 受邀补 4 号位 → 座位满但身份未分配
    await joinOfflineSeat(recordId, U.u2, 4, { nickName: '玩家二', avatarUrl: '' }, true);
    const missingRole = await finishOfflineRecord(recordId, HOST);
    expect(missingRole.success).toBe(false);
    expect(missingRole.message).toContain('身份未全部分配');

    // 补齐 u2 忠臣身份
    await setOfflineRole(recordId, HOST, U.u2, 'loyal');

    // 轮次为空
    const emptyRounds = await finishOfflineRecord(recordId, HOST);
    expect(emptyRounds.success).toBe(false);
    expect(emptyRounds.message).toContain('轮次记录为空');
  });

  it('15-5 完成：三轮全败 → 红方胜，物化 games 并入统计', async () => {
    const rounds = {
      firstLeaderOpenId: HOST,
      firstLakeHolderOpenId: null,
      cars: [
        { round: 1, carIndex: 1, leaderOpenId: HOST, team: [HOST, U.u1], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'approve', [U.u3]: 'reject', [U.u4]: 'reject' },
          mission: { votes: { [HOST]: 'fail', [U.u1]: 'success' } } },
        { round: 2, carIndex: 1, leaderOpenId: HOST, team: [HOST, U.u1, U.u2], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'approve', [U.u3]: 'reject', [U.u4]: 'approve' },
          mission: { votes: { [HOST]: 'fail', [U.u1]: 'success', [U.u2]: 'success' } } },
        { round: 3, carIndex: 1, leaderOpenId: HOST, team: [U.u3, U.u4], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'reject', [U.u3]: 'approve', [U.u4]: 'approve' },
          mission: { votes: { [U.u3]: 'success', [U.u4]: 'fail' } } }
      ],
      lake: [],
      lancelot: [],
      assassination: null
    };
    const saved = await saveOfflineRounds(recordId, HOST, rounds);
    expect(saved.success).toBe(true);

    // 非房主保存 → 403
    const notOwner = await saveOfflineRounds(recordId, U.u1, rounds);
    expect(notOwner.success).toBe(false);

    const done = await finishOfflineRecord(recordId, HOST);
    expect(done.success).toBe(true);
    const gameId = done.gameId;

    // 物化对局：状态/板型/来源/结果
    const state = await getGameState(gameId, HOST);
    expect(state.basic.status).toBe('ended');
    expect(state.basic.source).toBe('offline');
    expect(state.basic.boardType).toBe('standard');
    expect(state.basic.result.winner).toBe('evil');
    expect(state.basic.result.reason).toBe('红方完成3个任务');
    expect(state.history.missions.length).toBe(3);
    expect(state.history.missions.every(m => !m.success)).toBe(true);

    // 身份全显（gameEnd+ended）
    const gp = state.players.find(p => p.openId === U.u1);
    expect(gp.role).toBe('merlin');

    // 统计并入：u1（梅林，红胜 → 败）
    const stats = await apiGet(`/api/games/stats?subjectOpenId=${U.u1}&viewerOpenId=${U.u1}`);
    const merlin = stats.body.stats.roles.find(r => r.role === 'merlin');
    expect(merlin.games).toBeGreaterThanOrEqual(1);

    // 重复完成 → 错误
    const again = await finishOfflineRecord(recordId, HOST);
    expect(again.success).toBe(false);
    expect(again.message).toContain('记录已完成');

    // 记录状态与 gameId 回读
    const detail = await getOfflineRecord(recordId, HOST);
    expect(detail.body.record.status).toBe('completed');
    expect(detail.body.record.gameId).toBe(gameId);
  });

  it('15-6 编辑：重开→改判→完成，gameId 不变', async () => {
    const before = (await getOfflineRecord(recordId, HOST)).body.record;
    const gameId = before.gameId;

    const reopened = await reopenOfflineRecord(recordId, HOST);
    expect(reopened.record.status).toBe('recording');

    // 改为蓝方胜：三轮任务全成 + 刺客 u3 错杀 u2（u1=梅林未被刺中）
    const rounds = reopened.record.rounds;
    for (const car of rounds.cars) {
      const mv = {};
      Object.keys(car.mission.votes).forEach(k => { mv[k] = 'success'; });
      car.mission.votes = mv;
    }
    rounds.assassination = { killerOpenId: U.u3, targetOpenId: U.u2 };
    await saveOfflineRounds(recordId, HOST, rounds);

    const done = await finishOfflineRecord(recordId, HOST);
    expect(done.success).toBe(true);
    expect(done.gameId).toBe(gameId);

    const state = await getGameState(gameId, HOST);
    expect(state.basic.result.winner).toBe('good');
    expect(state.basic.result.reason).toBe('刺杀未命中梅林');
    expect(state.basic.result.assassination.correct).toBe(false);
  });

  it('15-8 新任务票形态（success/failCount）且无首车主可完成', async () => {
    const rec = await createOfflineRecord(HOST, recordConfig());
    const rid = rec.record.id;
    await joinOfflineSeat(rid, HOST, 1, { nickName: 'host' }, false);
    await joinOfflineSeat(rid, U.u1, 2, { nickName: 'u1' }, true);
    await joinOfflineSeat(rid, U.u2, 3, { nickName: 'u2' }, true);
    await joinOfflineSeat(rid, U.u3, 4, { nickName: 'u3' }, true);
    await joinOfflineSeat(rid, U.u4, 5, { nickName: 'u4' }, true);
    await setOfflineRole(rid, U.u1, null, 'merlin');
    await setOfflineRole(rid, HOST, HOST, 'percival');
    await setOfflineRole(rid, HOST, U.u2, 'loyal');
    await setOfflineRole(rid, HOST, U.u3, 'assassin');
    await setOfflineRole(rid, HOST, U.u4, 'morgana');

    // 无 firstLeaderOpenId；任务票 = 结果 + 失败票数
    const rounds = {
      cars: [
        { round: 1, carIndex: 1, leaderOpenId: HOST, team: [HOST, U.u1], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'approve', [U.u3]: 'reject', [U.u4]: 'reject' },
          mission: { success: false, failCount: 1 } },
        { round: 2, carIndex: 1, leaderOpenId: U.u1, team: [HOST, U.u1, U.u2], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'reject', [U.u3]: 'reject', [U.u4]: 'approve' },
          mission: { success: false, failCount: 2 } },
        { round: 3, carIndex: 1, leaderOpenId: U.u2, team: [U.u3, U.u4], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'approve', [U.u3]: 'reject', [U.u4]: 'reject' },
          mission: { success: true, failCount: 1 } },
        { round: 4, carIndex: 1, leaderOpenId: U.u3, team: [HOST, U.u3, U.u4], forced: false,
          votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'reject', [U.u3]: 'approve', [U.u4]: 'reject' },
          mission: { success: false, failCount: 1 } }
      ],
      lake: [], lancelot: [], assassination: null
    };
    // 第3轮非保护轮成功却 1 坏 → 矛盾应拒绝
    const bad = await saveOfflineRounds(rid, HOST, rounds);
    expect(bad.success).toBe(true); // save 不校验结构
    const badFinish = await finishOfflineRecord(rid, HOST);
    expect(badFinish.success).toBe(false);
    expect(badFinish.message).toContain('任务成功但失败票数');

    rounds.cars[2].mission = { success: true, failCount: 0 };
    await saveOfflineRounds(rid, HOST, rounds);
    const done = await finishOfflineRecord(rid, HOST);
    expect(done.success).toBe(true);

    const state = await getGameState(done.gameId, HOST);
    expect(state.basic.result.winner).toBe('evil');
    expect(state.basic.result.reason).toBe('红方完成3个任务');
    expect(state.history.missions.length).toBe(4);
    expect(state.history.missions[2].success).toBe(true);
    expect(state.history.missions[1].missionFailCount).toBe(2);
    expect(state.history.missions[3].missionFailCount).toBe(1);

    await deleteOfflineRecord(rid, HOST);
  });

  it('15-7 删除：记录与物化对局一并移除', async () => {
    const detail = (await getOfflineRecord(recordId, HOST)).body.record;
    const gameId = detail.gameId;

    const gone = await deleteOfflineRecord(recordId, HOST);
    expect(gone.success).toBe(true);

    const after = await getGameState(gameId, HOST);
    expect(after.success).toBe(false);

    const notFound = await getOfflineRecord(recordId, HOST);
    expect(notFound.status).toBe(404);

    const list = await listOfflineRecords(HOST);
    expect(list.records.some(r => r.id === recordId)).toBe(false);
  });
});
