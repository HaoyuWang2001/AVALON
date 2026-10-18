const {
  buildMinimalRoomConfig, getGameState, apiGet, createRoomAndStartGame,
  createOfflineRecord, joinOfflineSeat, setOfflineRole, saveOfflineRounds,
  finishOfflineRecord, deleteOfflineRecord
} = require('./helpers/testHelper');
const db = require('../config/db');

function recordConfig() {
  const cfg = buildMinimalRoomConfig();
  cfg.roles = { good: ['merlin', 'percival', 'loyal'], evil: ['morgana', 'assassin'] };
  return cfg;
}

const TS = Date.now();
const HOST = `aw_host_${TS}`;
const U = { u1: `aw_u1_${TS}`, u2: `aw_u2_${TS}`, u3: `aw_u3_${TS}`, u4: `aw_u4_${TS}` };

async function awardVote(gameId, openId, award, action, targetOpenId) {
  const { apiPost } = require('./helpers/testHelper');
  const res = await apiPost(`/api/games/${gameId}/awardVote`, { openId, award, action, targetOpenId });
  return res.body;
}

describe('16 — MVP/SVP', () => {
  let gameId;
  let recordId;

  beforeAll(async () => {
    await db.initPool();
    // 快速构造一局正常结束的对局（线下记录：红方 3 任务全胜）
    const rec = await createOfflineRecord(HOST, recordConfig());
    recordId = rec.record.id;
    // 座位：HOST=1 u1=2 u2=3 u3=4 u4=5（受邀直达）
    await joinOfflineSeat(recordId, HOST, 1, { nickName: 'host' }, false);
    await joinOfflineSeat(recordId, U.u1, 2, { nickName: 'u1' }, true);
    await joinOfflineSeat(recordId, U.u2, 3, { nickName: 'u2' }, true);
    await joinOfflineSeat(recordId, U.u3, 4, { nickName: 'u3' }, true);
    await joinOfflineSeat(recordId, U.u4, 5, { nickName: 'u4' }, true);
    // 身份：u1=梅林 HOST=派西 u2=忠臣 | u3=刺客 u4=莫甘娜（红方胜）
    await setOfflineRole(recordId, U.u1, null, 'merlin');
    await setOfflineRole(recordId, HOST, HOST, 'percival');
    await setOfflineRole(recordId, HOST, U.u2, 'loyal');
    await setOfflineRole(recordId, HOST, U.u3, 'assassin');
    await setOfflineRole(recordId, HOST, U.u4, 'morgana');
    const v = k => Object.fromEntries([HOST, U.u1, U.u2, U.u3, U.u4].map(id => [id, k]));
    const rounds = {
      firstLeaderOpenId: HOST,
      firstLakeHolderOpenId: null,
      cars: [1, 2, 3].map(r => ({
        round: r, carIndex: 1, leaderOpenId: HOST,
        team: r === 1 ? [HOST, U.u1] : r === 2 ? [HOST, U.u1, U.u2] : [U.u3, U.u4],
        forced: false,
        votes: { [HOST]: 'approve', [U.u1]: 'approve', [U.u2]: 'approve', [U.u3]: 'reject', [U.u4]: 'reject' },
        mission: r === 3 ? { votes: { [U.u3]: 'success', [U.u4]: 'fail' } }
          : { votes: r === 1 ? { [HOST]: 'fail', [U.u1]: 'success' } : { [HOST]: 'fail', [U.u1]: 'success', [U.u2]: 'success' } }
      })),
      lake: [], lancelot: [], assassination: null
    };
    await saveOfflineRounds(recordId, HOST, rounds);
    const done = await finishOfflineRecord(recordId, HOST);
    expect(done.success).toBe(true);
    gameId = done.gameId;
  });

  it('16-1 结束局参与者可见 awards 状态（none=未选/已跳过）', async () => {
    const st = await getGameState(gameId, U.u1);
    expect(st.player.awards).toEqual({
      mvp: { state: 'none', target: null },
      svp: { state: 'none', target: null }
    });
  });

  it('16-2 MVP 投票：胜方玩家可投；重复/自投/败方目标被拒', async () => {
    // u1（败方）投 MVP 给 u3（胜方刺客）✓
    let r = await awardVote(gameId, U.u1, 'mvp', 'vote', U.u3);
    expect(r.success).toBe(true);
    expect(r.awards.mvp).toEqual({ state: 'voted', target: U.u3 });

    // 重复选择 → 拒绝
    r = await awardVote(gameId, U.u1, 'mvp', 'vote', U.u4);
    expect(r.success).toBe(false);
    expect(r.message).toContain('已完成选择');

    // u2 自投 MVP？u2 是败方不能成为 MVP 目标，先测自投：u4（胜方）投自己 → 拒绝
    r = await awardVote(gameId, U.u4, 'mvp', 'vote', U.u4);
    expect(r.success).toBe(false);
    expect(r.message).toContain('不能选择自己');

    // u2 投 MVP 给 u1（败方）→ 拒绝
    r = await awardVote(gameId, U.u2, 'mvp', 'vote', U.u1);
    expect(r.success).toBe(false);
    expect(r.message).toContain('MVP 只能选择胜利方');
  });

  it('16-3 SVP 投票：败方玩家可投；胜方目标被拒', async () => {
    let r = await awardVote(gameId, U.u1, 'svp', 'vote', HOST);
    expect(r.success).toBe(true);
    expect(r.awards.svp.state).toBe('voted');

    // u3（胜方）不能作为 SVP 目标
    r = await awardVote(gameId, U.u4, 'svp', 'vote', U.u3);
    expect(r.success).toBe(false);
    expect(r.message).toContain('SVP 只能选择失败方');
  });

  it('16-4 NoNoNo：declined 后不可再选；跳过不落库可重弹', async () => {
    let r = await awardVote(gameId, U.u2, 'mvp', 'decline');
    expect(r.success).toBe(true);
    expect(r.awards.mvp.state).toBe('declined');

    r = await awardVote(gameId, U.u2, 'mvp', 'vote', U.u3);
    expect(r.success).toBe(false);
    expect(r.message).toContain('已完成选择');

    // HOST 未处理任何奖项（相当于跳过）→ awards 仍 none
    const st = await getGameState(gameId, HOST);
    expect(st.player.awards.mvp.state).toBe('none');
  });

  it('16-5 校验：非参与者 / 未结束对局 / 参数非法', async () => {
    let r = await awardVote(gameId, `ghost_${TS}`, 'mvp', 'vote', U.u3);
    expect(r.success).toBe(false);
    expect(r.message).toContain('只有本局玩家');

    r = await awardVote(gameId, HOST, 'xxx', 'vote', U.u3);
    expect(r.success).toBe(false);

    // 进行中对局不可投
    const active = await createRoomAndStartGame(5, buildMinimalRoomConfig());
    r = await awardVote(active.gameId, active.players[0].openId, 'mvp', 'vote', active.players[1].openId);
    expect(r.success).toBe(false);
    expect(r.message).toContain('尚未结束');
  });

  it('16-6 聚合：个人 stats 返回 mvpCount/svpCount；排行榜字段透传', async () => {
    const s = await apiGet(`/api/games/stats?subjectOpenId=${U.u3}&viewerOpenId=${U.u3}`);
    expect(s.body.stats.mvpCount).toBeGreaterThanOrEqual(1);
    const s2 = await apiGet(`/api/games/stats?subjectOpenId=${HOST}&viewerOpenId=${HOST}`);
    expect(s2.body.stats.svpCount).toBeGreaterThanOrEqual(1);

    const lb = await apiGet('/api/games/stats/leaderboard?page=1&pageSize=5');
    expect(lb.status).toBe(200);
    if ((lb.body.players || []).length > 0) {
      expect(typeof lb.body.players[0].mvpCount).toBe('number');
      expect(typeof lb.body.players[0].svpCount).toBe('number');
    }
  });

  it('16-7 删除线下记录连带清理投票，计数回落', async () => {
    const gone = await deleteOfflineRecord(recordId, HOST);
    expect(gone.success).toBe(true);
    const s = await apiGet(`/api/games/stats?subjectOpenId=${U.u3}&viewerOpenId=${U.u3}`);
    expect(s.body.stats.mvpCount || 0).toBe(0);
  });
});
