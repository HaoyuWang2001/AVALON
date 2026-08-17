const { request, makeUserId, apiGet, apiPost, createRoom, joinRoom, getRoom } = require('./helpers/testHelper');

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

  it('02b-5 上传头像后加入房间：join 未传头像时回查 users 表，room_players 头像为上传 URL；上传后再 join 即时刷新', async () => {
    const openId = makeUserId();
    const room = await createRoom(makeUserId(), 'Host');
    const roomId = room.roomId;

    // 上传头像后加入（join 不带 avatarUrl → DB 兜底）
    const up = await uploadAvatar(openId, PNG_1x1, 'image/png', 'a.png');
    const avatarUrl = up.body.avatarUrl;
    await joinRoom(roomId, openId, 2, 'AvatarUser');

    let roomInfo = await getRoom(roomId);
    const seated = roomInfo.room.players.find(p => p.openId === openId);
    expect(seated.avatarUrl).toBe(avatarUrl);

    // 换新头像：room_players 即时刷新（上传路由同步 UPDATE）
    const up2 = await uploadAvatar(openId, PNG_1x1, 'image/png', 'b.png');
    expect(up2.status).toBe(200);
    roomInfo = await getRoom(roomId);
    expect(roomInfo.room.players.find(p => p.openId === openId).avatarUrl).toBe(up2.body.avatarUrl);
  });

  it('02b-6 join 传本机/包内路径头像被忽略：room_players 头像为空', async () => {
    const openId = makeUserId();
    const room = await createRoom(makeUserId(), 'Host');
    const roomId = room.roomId;

    const res = await apiPost('/api/rooms/join', {
      roomId,
      userInfo: { openId, nickName: 'LocalPathUser', wxNickName: '', avatarUrl: '/images/default-avatar.png' },
      seatNumber: 2,
      customNickName: 'LocalPathUser'
    });
    expect(res.body.success).toBe(true);

    const roomInfo = await getRoom(roomId);
    const seated = roomInfo.room.players.find(p => p.openId === openId);
    expect(seated.avatarUrl).toBe('');
  });
});
