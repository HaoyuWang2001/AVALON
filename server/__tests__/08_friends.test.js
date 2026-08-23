const { request, makeUserId, apiGet, apiPost } = require('./helpers/testHelper');

async function setUniqueId(openId, uniqueId) {
  return apiPost(`/api/users/${openId}/uniqueId`, { uniqueId });
}

async function ensureUser(openId) {
  const res = await apiGet(`/api/users/${openId}`);
  expect(res.body.success).toBe(true);
  return res.body.user;
}

describe('08 — 好友系统（uniqueId/搜索/申请/同意/删除）', () => {

  // ─────────── 08.1 uniqueId 设置 ───────────
  describe('uniqueId 设置', () => {
    it('08.1-1 合法ID设置成功，GET /users 返回 uniqueId', async () => {
      const openId = makeUserId();
      await ensureUser(openId);
      const res = await setUniqueId(openId, 'alice_01');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.uniqueId).toBe('alice_01');

      const profile = await ensureUser(openId);
      expect(profile.uniqueId).toBe('alice_01');
      expect(profile).toHaveProperty('lastSeenAt');
    });

    it('08.1-2 非法格式（超长/非法字符/空）被拒', async () => {
      const openId = makeUserId();
      await ensureUser(openId);
      for (const bad of ['', 'a'.repeat(17), 'has space', 'a/b', 'ok!', ' 中文 ']) {
        const res = await setUniqueId(openId, bad);
        expect(res.status).toBe(400);
      }
    });

    it('08.1-3 中文/字母/数字/-/_ 合法', async () => {
      const openId = makeUserId();
      await ensureUser(openId);
      for (const ok of ['小明', 'ABC_123', 'a-b', '牛马朋友123', 'a1_2-3']) {
        const uid = makeUserId();
        await ensureUser(uid);
        const res = await setUniqueId(uid, ok);
        expect(res.status).toBe(200);
      }
    });

    it('08.1-4 重复ID被拒（大小写视为同一，CI 不区分）', async () => {
      const a = makeUserId(); await ensureUser(a);
      const b = makeUserId(); await ensureUser(b);
      expect((await setUniqueId(a, 'Dup_01')).status).toBe(200);
      const res = await setUniqueId(b, 'dup_01'); // 小写撞大写
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/占用/);
    });

    it('08.1-5 每日仅一次：当天再次设置被拒', async () => {
      const openId = makeUserId();
      await ensureUser(openId);
      expect((await setUniqueId(openId, 'once_01')).status).toBe(200);
      const res = await setUniqueId(openId, 'once_02');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/每天/);
    });
  });

  // ─────────── 08.2 搜索 ───────────
  describe('uniqueId 搜索', () => {
    let uid, uid2;
    beforeAll(async () => {
      uid = makeUserId(); await ensureUser(uid);
      uid2 = makeUserId(); await ensureUser(uid2);
      await setUniqueId(uid, 'search_target');
      await setUniqueId(uid2, 'searcher_01');
    });

    it('08.2-1 精确命中（不区分大小写），返回 isFriend=false', async () => {
      const res = await apiGet(`/api/friends/search?openId=${uid2}&uniqueId=SEARCH_TARGET`);
      expect(res.body.success).toBe(true);
      expect(res.body.found).toBe(true);
      expect(res.body.user.openId).toBe(uid);
      expect(res.body.user.isFriend).toBe(false);
      expect(res.body.user.hasPending).toBe(false);
    });

    it('08.2-2 未命中 found=false', async () => {
      const res = await apiGet(`/api/friends/search?openId=${uid2}&uniqueId=not_exist_zzz`);
      expect(res.body.success).toBe(true);
      expect(res.body.found).toBe(false);
    });

    it('08.2-3 搜自己 → isSelf', async () => {
      const res = await apiGet(`/api/friends/search?openId=${uid}&uniqueId=search_target`);
      expect(res.body.isSelf).toBe(true);
    });

    it('08.2-4 非法ID参数被拒', async () => {
      const res = await apiGet(`/api/friends/search?openId=${uid2}&uniqueId=has space`);
      expect(res.status).toBe(400);
    });
  });

  // ─────────── 08.3 申请/同意/拒绝 ───────────
  describe('好友申请流程', () => {
    let a, b, c;
    beforeAll(async () => {
      a = makeUserId(); await ensureUser(a);
      b = makeUserId(); await ensureUser(b);
      c = makeUserId(); await ensureUser(c);
      await setUniqueId(a, 'req_a');
      await setUniqueId(b, 'req_b');
      await setUniqueId(c, 'req_c');
    });

    it('08.3-1 不能添加自己', async () => {
      const res = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: a });
      expect(res.status).toBe(400);
    });

    it('08.3-2 未设置ID者不可发起/不可被加', async () => {
      const noId = makeUserId(); await ensureUser(noId);
      const noId2 = makeUserId(); await ensureUser(noId2);
      const res1 = await apiPost('/api/friends/request', { fromOpenId: noId, toOpenId: b });
      expect(res1.status).toBe(400);
      const res2 = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: noId2 });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/好友功能/);
    });

    it('08.3-3 申请→被申请方待处理列表可见→同意后互为好友', async () => {
      const req = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: b });
      expect(req.body.success).toBe(true);
      const reqId = req.body.requestId;

      const list = await apiGet(`/api/friends/requests?openId=${b}`);
      expect(list.body.requests.length).toBe(1);
      expect(list.body.requests[0].fromOpenId).toBe(a);
      expect(list.body.requests[0].fromUniqueId).toBe('req_a');

      const respond = await apiPost('/api/friends/respond', { requestId: reqId, openId: b, accept: true });
      expect(respond.body.success).toBe(true);

      // 互为好友
      const fa = await apiGet(`/api/friends?openId=${a}`);
      const fb = await apiGet(`/api/friends?openId=${b}`);
      expect(fa.body.friends.some(f => f.openId === b)).toBe(true);
      expect(fb.body.friends.some(f => f.openId === a)).toBe(true);
      // 列表结构含 online/room/uniqueId
      const friendView = fa.body.friends.find(f => f.openId === b);
      expect(friendView).toHaveProperty('online');
      expect(friendView).toHaveProperty('room');
      expect(friendView.uniqueId).toBe('req_b');

      // 已是好友不能重复申请
      const dup = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: b });
      expect(dup.status).toBe(400);
      expect(dup.body.message).toMatch(/已是好友/);
    });

    it('08.3-4 重复申请（pending中）被拒', async () => {
      const req = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: c });
      expect(req.body.success).toBe(true);
      const dup = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: c });
      expect(dup.status).toBe(400);
    });

    it('08.3-5 拒绝后申请删除，可再次申请', async () => {
      const req = await apiPost('/api/friends/request', { fromOpenId: c, toOpenId: a });
      const reqId = req.body.requestId;
      const respond = await apiPost('/api/friends/respond', { requestId: reqId, openId: a, accept: false });
      expect(respond.body.success).toBe(true);

      const list = await apiGet(`/api/friends/requests?openId=${a}`);
      expect(list.body.requests.some(r => r.fromOpenId === c)).toBe(false);

      // 可再次申请
      const again = await apiPost('/api/friends/request', { fromOpenId: c, toOpenId: a });
      expect(again.body.success).toBe(true);
    });

    it('08.3-6 非被申请方无权处理', async () => {
      const req = await apiPost('/api/friends/request', { fromOpenId: b, toOpenId: c });
      const reqId = req.body.requestId;
      const respond = await apiPost('/api/friends/respond', { requestId: reqId, openId: a, accept: true });
      expect(respond.status).toBe(403);
      // 原申请仍在
      const list = await apiGet(`/api/friends/requests?openId=${c}`);
      expect(list.body.requests.some(r => r.fromOpenId === b)).toBe(true);
    });
  });

  // ─────────── 08.4 删除好友 ───────────
  describe('删除好友', () => {
    it('08.4-1 删除后双向解除，可重新申请', async () => {
      const a = makeUserId(); await ensureUser(a);
      const b = makeUserId(); await ensureUser(b);
      await setUniqueId(a, 'del_a');
      await setUniqueId(b, 'del_b');
      const req = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: b });
      await apiPost('/api/friends/respond', { requestId: req.body.requestId, openId: b, accept: true });

      const del = await request().delete(`/api/friends?openId=${a}&friendOpenId=${b}`);
      expect(del.body.success).toBe(true);

      const fa = await apiGet(`/api/friends?openId=${a}`);
      const fb = await apiGet(`/api/friends?openId=${b}`);
      expect(fa.body.friends.some(f => f.openId === b)).toBe(false);
      expect(fb.body.friends.some(f => f.openId === a)).toBe(false);

      const again = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: b });
      expect(again.body.success).toBe(true);
    });
  });

  // ─────────── 08.5 好友详情 ───────────
  describe('好友详情', () => {
    it('08.5-1 好友可见详情，非好友403', async () => {
      const a = makeUserId(); await ensureUser(a);
      const b = makeUserId(); await ensureUser(b);
      const c = makeUserId(); await ensureUser(c);
      await setUniqueId(a, 'det_a');
      await setUniqueId(b, 'det_b');
      await setUniqueId(c, 'det_c');
      const req = await apiPost('/api/friends/request', { fromOpenId: a, toOpenId: b });
      await apiPost('/api/friends/respond', { requestId: req.body.requestId, openId: b, accept: true });

      const detail = await apiGet(`/api/friends/${b}/detail?openId=${a}`);
      expect(detail.body.success).toBe(true);
      expect(detail.body.friend.openId).toBe(b);
      expect(detail.body.friend.uniqueId).toBe('det_b');
      expect(detail.body.friend).toHaveProperty('online');
      expect(detail.body.friend).toHaveProperty('room');

      const forbidden = await apiGet(`/api/friends/${b}/detail?openId=${c}`);
      expect(forbidden.status).toBe(403);
    });
  });
});
