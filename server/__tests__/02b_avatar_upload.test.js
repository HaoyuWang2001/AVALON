const { request, makeUserId, apiGet } = require('./helpers/testHelper');

// 1x1 透明 PNG
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function uploadAvatar(openId, buffer, contentType, filename) {
  return request().post(`/api/users/${openId}/avatar`)
    .attach('avatar', buffer, { filename: filename || 'a.png', contentType });
}

describe('02b — 头像上传与静态访问', () => {

  it('02b-1 上传合法 PNG：成功并返回可访问 URL，用户资料已更新', async () => {
    const openId = makeUserId();
    const res = await uploadAvatar(openId, PNG_1x1, 'image/png', 'a.png');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.avatarUrl).toMatch(/\/uploads\/avatars\/.+/);
    expect(res.body.user.avatarUrl).toBe(res.body.avatarUrl);

    // 用户资料已更新
    const profile = await apiGet(`/api/users/${openId}`);
    expect(profile.body.user.avatarUrl).toBe(res.body.avatarUrl);

    // 静态路径可访问
    const rel = res.body.avatarUrl.split('/uploads/')[1];
    const staticRes = await request().get('/uploads/' + rel);
    expect(staticRes.status).toBe(200);
    expect(staticRes.headers['content-type']).toContain('image/png');
  });

  it('02b-2 非法类型被拒（400）', async () => {
    const openId = makeUserId();
    const res = await uploadAvatar(openId, Buffer.from('hello'), 'text/plain', 'a.txt');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('02b-3 超过 2MB 被拒（400）', async () => {
    const openId = makeUserId();
    const big = Buffer.alloc(MAX_AVATAR_BYTES + 1, 1);
    const res = await uploadAvatar(openId, big, 'image/png', 'big.png');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('02b-4 二次上传覆盖：返回新 URL，旧文件静态访问 404', async () => {
    const openId = makeUserId();
    const first = await uploadAvatar(openId, PNG_1x1, 'image/png', 'a.png');
    expect(first.status).toBe(200);
    const firstRel = first.body.avatarUrl.split('/uploads/')[1];

    const second = await uploadAvatar(openId, PNG_1x1, 'image/png', 'b.png');
    expect(second.status).toBe(200);
    expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);

    // 新文件可访问，旧文件已删除
    const secondRel = second.body.avatarUrl.split('/uploads/')[1];
    expect((await request().get('/uploads/' + secondRel)).status).toBe(200);
    expect((await request().get('/uploads/' + firstRel)).status).toBe(404);
  });
});
