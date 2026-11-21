const {
  createRoom, createRoomAndStartGame, getRoom, getGameState, apiGet,
  createOfflineRecord, joinOfflineSeat, buildStandardRoomConfig
} = require('./helpers/testHelper');
const db = require('../config/db');

// users.titles JSON → 数组断言辅助
const TITLES = ['开朝元老', '六边形战士'];

async function setUserTitles(openId, titles) {
  const json = titles === null ? null : JSON.stringify(titles);
  await db.query(
    `INSERT INTO users (open_id, custom_nick_name, titles) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE custom_nick_name = VALUES(custom_nick_name), titles = VALUES(titles)`,
    [openId, '称谓玩家', json]
  );
}

describe('17 — 玩家特殊称谓', () => {
  const TS = Date.now();

  beforeAll(async () => { await db.initPool(); });

  it('17-1 个人 stats 下发称谓；无称谓为 []', async () => {
    const withTitles = `title_a_${TS}`;
    const noTitles = `title_b_${TS}`;
    await setUserTitles(withTitles, TITLES);
    await setUserTitles(noTitles, null);

    const a = await apiGet(`/api/games/stats?subjectOpenId=${withTitles}&viewerOpenId=${withTitles}`);
    expect(a.body.success).toBe(true);
    expect(a.body.stats.titles).toEqual(TITLES);

    const b = await apiGet(`/api/games/stats?subjectOpenId=${noTitles}&viewerOpenId=${noTitles}`);
    expect(b.body.stats.titles).toEqual([]);
  });

  it('17-2 房间玩家列表下发称谓', async () => {
    const host = `title_host_${TS}`;
    // 先建房（此时 users 可能无行），再补 titles 后重新读取
    const created = await createRoom(host, '房主玩家');
    const roomId = created.roomId;
    expect(roomId).toBeTruthy();
    await setUserTitles(host, TITLES);
    const roomRes = await getRoom(roomId);
    const me = ((roomRes.room && roomRes.room.players) || []).find(p => p.openId === host);
    expect(me).toBeTruthy();
    expect(me.titles).toEqual(TITLES);
  });

  it('17-3 游戏状态 players / 观众下发称谓', async () => {
    const { gameId, players } = await createRoomAndStartGame(5, buildStandardRoomConfig(5));
    const [p1, p2] = players;
    await setUserTitles(p1.openId, TITLES);
    await setUserTitles(p2.openId, null);

    const st = await getGameState(gameId, p1.openId);
    const a = st.players.find(p => p.openId === p1.openId);
    const b = st.players.find(p => p.openId === p2.openId);
    expect(a.titles).toEqual(TITLES);
    expect(b.titles).toEqual([]);
  });

  it('17-4 好友列表下发称谓', async () => {
    const me = `title_me_${TS}`;
    const fr = `title_fr_${TS}`;
    await setUserTitles(me, null);
    await setUserTitles(fr, TITLES);
    await db.query(
      'INSERT INTO friendships (user_open_id, friend_open_id) VALUES (?, ?), (?, ?) ON DUPLICATE KEY UPDATE user_open_id = VALUES(user_open_id)',
      [me, fr, fr, me]
    );
    const res = await apiGet(`/api/friends?openId=${me}`);
    expect(res.body.success).toBe(true);
    const f = (res.body.friends || []).find(x => x.openId === fr);
    expect(f).toBeTruthy();
    expect(f.titles).toEqual(TITLES);
  });

  it('17-5 线下记录详情下发称谓（坐位玩家）', async () => {
    const owner = `title_rec_owner_${TS}`;
    const guest = `title_rec_guest_${TS}`;
    await setUserTitles(owner, null);
    await setUserTitles(guest, TITLES);

    const cfg = buildStandardRoomConfig(5);
    const rec = await createOfflineRecord(owner, cfg);
    expect(rec.success).toBe(true);
    const rid = rec.record.id;
    await joinOfflineSeat(rid, guest, 2, { nickName: '称谓玩家' }, true);

    const detail = await apiGet(`/api/offline-records/${rid}?openId=${owner}`);
    expect(detail.body.success).toBe(true);
    const p = detail.body.record.players.find(x => x.openId === guest);
    expect(p.titles).toEqual(TITLES);

    // 清理本次记录
    const { apiPost } = require('./helpers/testHelper');
    await apiPost(`/api/offline-records/${rid}/delete`, { openId: owner });
  });
});
