const { makeUserId, createRoom, joinRoom, toggleReady, startGame, endGame, disband, apiGet } = require('./helpers/testHelper');

// 用户历史对局接口 limit 语义：0=全量（无 LIMIT），其余 1-100 夹取、缺省 10
describe('09 — 用户历史对局 limit 语义', () => {
  // 造 1 局 5 人已结束游戏，uid 作为房主参与
  async function createEndedGameWith(uid) {
    const hostNick = 'H' + uid.slice(-6);
    const createResult = await createRoom(uid, hostNick);
    expect(createResult.success).toBe(true);
    const roomId = createResult.roomId;

    const players = [{ openId: uid }];
    for (let i = 2; i <= 5; i++) {
      const pid = makeUserId();
      const r = await joinRoom(roomId, pid, i, 'P' + i);
      expect(r.success).toBe(true);
      players.push({ openId: pid });
    }
    for (const p of players) {
      await toggleReady(roomId, p.openId, true);
    }
    const start = await startGame(roomId, uid);
    expect(start.success).toBe(true);
    const end = await endGame(start.gameId);
    expect(end.success).toBe(true);
    // 结束游戏后房主解散房间，清空 current_room_id 以便创建下一局（games.room_id 置 NULL，对局保留）
    const dis = await disband(roomId, uid);
    expect(dis.success).toBe(true);
    return start.gameId;
  }

  it('09-1 limit=0 返回全量（含 >默认10 的场景语义），limit=1 仅返回1条', async () => {
    const uid = makeUserId();
    for (let i = 0; i < 3; i++) {
      await createEndedGameWith(uid);
    }

    const all = await apiGet(`/api/games/history/user?openId=${uid}&limit=0`);
    expect(all.status).toBe(200);
    expect(all.body.success).toBe(true);
    expect(all.body.history.length).toBe(3);

    const one = await apiGet(`/api/games/history/user?openId=${uid}&limit=1`);
    expect(one.body.success).toBe(true);
    expect(one.body.history.length).toBe(1);

    // 缺省（不传 limit）→ 默认 10，3 局全返回
    const def = await apiGet(`/api/games/history/user?openId=${uid}`);
    expect(def.body.success).toBe(true);
    expect(def.body.history.length).toBe(3);
  });

  it('09-2 limit=0 与 limit=100 结果一致（全量，未夹取截断）', async () => {
    const uid = makeUserId();
    for (let i = 0; i < 2; i++) {
      await createEndedGameWith(uid);
    }

    const all = await apiGet(`/api/games/history/user?openId=${uid}&limit=0`);
    const hundred = await apiGet(`/api/games/history/user?openId=${uid}&limit=100`);
    expect(all.body.history.length).toBe(2);
    expect(hundred.body.history.length).toBe(2);
  });
});
