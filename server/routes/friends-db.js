// 好友系统路由
// 端点均以 openId 明文传参（与全项目一致，依赖微信登录获取 openId）
const express = require('express');
const db = require('../config/db');
const socket = require('../config/socket');

const FRIEND_LIMIT = 100;
const ONLINE_WINDOW_SECONDS = 5 * 60; // last_seen_at 5 分钟内活跃视为在线
const UNIQUE_ID_RE = /^[\w\u4e00-\u9fa5-]{1,16}$/;

function isSocketOnline(openId) {
  const wss = socket.getWSS();
  if (!wss || !openId) return false;
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.playerId === openId) return true;
  }
  return false;
}

// 用户基础信息（含在线/房间状态聚合）
async function getUserView(openId, viewerOpenId) {
  const [user] = await db.query(
    `SELECT open_id as openId, wx_nick_name as wxNickName, custom_nick_name as customNickName,
            avatar_url as avatarUrl, unique_id as uniqueId, last_seen_at as lastSeenAt
     FROM users WHERE open_id = ?`,
    [openId]
  );
  if (!user) return null;

  const now = Date.now();
  const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  const online = isSocketOnline(openId) || (now - lastSeen) / 1000 <= ONLINE_WINDOW_SECONDS;

  // 房间状态：current_room_id → rooms.game_started → activeGameId
  let room = null;
  const rows = await db.query(
    `SELECT u.current_room_id as roomId, r.game_started as gameStarted
     FROM users u LEFT JOIN rooms r ON r.id = u.current_room_id
     WHERE u.open_id = ?`,
    [openId]
  );
  if (rows.length > 0 && rows[0].roomId) {
    room = { roomId: rows[0].roomId, gameStarted: !!rows[0].gameStarted, activeGameId: null };
    if (room.gameStarted) {
      const games = await db.query(
        `SELECT id FROM games WHERE room_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [room.roomId]
      );
      if (games.length > 0) room.activeGameId = games[0].id;
    }
  }

  return {
    openId: user.openId,
    nickName: user.customNickName || user.wxNickName || '玩家',
    avatarUrl: user.avatarUrl || '',
    uniqueId: user.uniqueId || '',
    online,
    room
  };
}

async function isFriend(a, b) {
  const rows = await db.query(
    'SELECT 1 FROM friendships WHERE user_open_id = ? AND friend_open_id = ? LIMIT 1',
    [a, b]
  );
  return rows.length > 0;
}

async function hasPendingRequest(fromOpenId, toOpenId) {
  const rows = await db.query(
    'SELECT id FROM friend_requests WHERE from_open_id = ? AND to_open_id = ? LIMIT 1',
    [fromOpenId, toOpenId]
  );
  return rows.length > 0 ? rows[0].id : null;
}

function createRouter() {
  const router = express.Router();

  // 好友列表
  router.get('/', async (req, res) => {
    try {
      const { openId } = req.query;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });

      const friends = await db.query(
        `SELECT f.friend_open_id as openId
         FROM friendships f
         JOIN users u ON u.open_id = f.friend_open_id
         WHERE f.user_open_id = ?
         ORDER BY f.created_at DESC`,
        [openId]
      );

      const list = [];
      for (const f of friends) {
        const view = await getUserView(f.openId, openId);
        if (view) list.push(view);
      }
      res.json({ success: true, friends: list, count: list.length });
    } catch (error) {
      console.error('好友列表API错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 待处理好友申请（收到的）
  router.get('/requests', async (req, res) => {
    try {
      const { openId } = req.query;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });

      const requests = await db.query(
        `SELECT r.id, r.from_open_id as fromOpenId, r.created_at as createdAt,
                u.custom_nick_name as customNickName, u.wx_nick_name as wxNickName,
                u.avatar_url as avatarUrl, u.unique_id as uniqueId
         FROM friend_requests r
         JOIN users u ON u.open_id = r.from_open_id
         WHERE r.to_open_id = ?
         ORDER BY r.created_at DESC`,
        [openId]
      );

      res.json({
        success: true,
        requests: requests.map(r => ({
          id: r.id,
          fromOpenId: r.fromOpenId,
          fromNickName: r.customNickName || r.wxNickName || '玩家',
          fromAvatarUrl: r.avatarUrl || '',
          fromUniqueId: r.uniqueId || '',
          createdAt: r.createdAt
        }))
      });
    } catch (error) {
      console.error('好友申请列表API错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 发起申请
  router.post('/request', async (req, res) => {
    try {
      const { fromOpenId, toOpenId } = req.body || {};
      if (!fromOpenId || !toOpenId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      if (fromOpenId === toOpenId) return res.status(400).json({ success: false, message: '不能添加自己为好友' });

      // 双方必须已设置 unique_id（未设置=不可发起/不可被加）
      const [fromUser] = await db.query('SELECT unique_id FROM users WHERE open_id = ?', [fromOpenId]);
      const [toUser] = await db.query('SELECT unique_id FROM users WHERE open_id = ?', [toOpenId]);
      if (!fromUser || !fromUser.unique_id) return res.status(400).json({ success: false, message: '请先设置自己的ID再添加好友' });
      if (!toUser || !toUser.unique_id) return res.status(400).json({ success: false, message: '对方尚未开通好友功能' });

      if (await isFriend(fromOpenId, toOpenId)) return res.status(400).json({ success: false, message: '你们已是好友' });
      if (await hasPendingRequest(fromOpenId, toOpenId)) return res.status(400).json({ success: false, message: '已发送过申请，请等待对方处理' });

      // 好友上限 100（双方）
      const fromCnt = await db.query('SELECT COUNT(*) as c FROM friendships WHERE user_open_id = ?', [fromOpenId]);
      const toCnt = await db.query('SELECT COUNT(*) as c FROM friendships WHERE user_open_id = ?', [toOpenId]);
      if (fromCnt[0].c >= FRIEND_LIMIT) return res.status(400).json({ success: false, message: '你的好友已达上限' });
      if (toCnt[0].c >= FRIEND_LIMIT) return res.status(400).json({ success: false, message: '对方好友已达上限' });

      const result = await db.query(
        'INSERT INTO friend_requests (from_open_id, to_open_id) VALUES (?, ?)',
        [fromOpenId, toOpenId]
      );
      res.json({ success: true, requestId: result.insertId });
    } catch (error) {
      console.error('发起好友申请API错误:', error);
      if (error && (error.code === 'ER_DUP_ENTRY' || /ER_DUP_ENTRY/.test(error.message || ''))) {
        return res.status(400).json({ success: false, message: '已发送过申请，请等待对方处理' });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 处理申请（同意/拒绝）；同意→删申请+双向建关系；拒绝→删申请
  router.post('/respond', async (req, res) => {
    try {
      const { requestId, openId, accept } = req.body || {};
      if (!requestId || !openId) return res.status(400).json({ success: false, message: '缺少必要参数' });

      const rows = await db.query('SELECT id, from_open_id, to_open_id FROM friend_requests WHERE id = ?', [requestId]);
      if (rows.length === 0) return res.status(400).json({ success: false, message: '该申请已处理或不存在' });
      const reqRow = rows[0];
      if (reqRow.to_open_id !== openId) return res.status(403).json({ success: false, message: '无权处理该申请' });

      await db.transaction(async (connection) => {
        await connection.execute('DELETE FROM friend_requests WHERE id = ?', [requestId]);
        if (accept) {
          await connection.execute(
            'INSERT IGNORE INTO friendships (user_open_id, friend_open_id) VALUES (?, ?), (?, ?)',
            [reqRow.from_open_id, reqRow.to_open_id, reqRow.to_open_id, reqRow.from_open_id]
          );
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error('处理好友申请API错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 删除好友（双向）
  router.delete('/', async (req, res) => {
    try {
      const { openId, friendOpenId } = req.query;
      if (!openId || !friendOpenId) return res.status(400).json({ success: false, message: '缺少必要参数' });

      await db.query('DELETE FROM friendships WHERE user_open_id = ? AND friend_open_id = ?', [openId, friendOpenId]);
      await db.query('DELETE FROM friendships WHERE user_open_id = ? AND friend_open_id = ?', [friendOpenId, openId]);
      res.json({ success: true });
    } catch (error) {
      console.error('删除好友API错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 按 unique_id 精确搜索（不区分大小写）；返回与当前用户的三种关系态
  router.get('/search', async (req, res) => {
    try {
      const { openId, uniqueId } = req.query;
      if (!openId || !uniqueId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      if (!UNIQUE_ID_RE.test(uniqueId || '')) return res.status(400).json({ success: false, message: 'ID格式不正确' });

      const rows = await db.query(
        `SELECT open_id as openId, wx_nick_name as wxNickName, custom_nick_name as customNickName,
                avatar_url as avatarUrl, unique_id as uniqueId
         FROM users WHERE unique_id = ? LIMIT 1`,
        [uniqueId]
      );
      if (rows.length === 0) return res.json({ success: true, found: false, user: null });

      const u = rows[0];
      if (u.openId === openId) return res.json({ success: true, found: true, user: null, isSelf: true });

      res.json({
        success: true,
        found: true,
        isSelf: false,
        user: {
          openId: u.openId,
          nickName: u.customNickName || u.wxNickName || '玩家',
          avatarUrl: u.avatarUrl || '',
          uniqueId: u.uniqueId || '',
          isFriend: await isFriend(openId, u.openId),
          hasPending: !!(await hasPendingRequest(openId, u.openId))
        }
      });
    } catch (error) {
      console.error('搜索用户API错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 好友详情（校验好友关系；仅好友可见完整信息）
  router.get('/:friendOpenId/detail', async (req, res) => {
    try {
      const { friendOpenId } = req.params;
      const { openId } = req.query;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });

      if (!(await isFriend(openId, friendOpenId))) {
        return res.status(403).json({ success: false, message: '你们不是好友' });
      }
      const view = await getUserView(friendOpenId, openId);
      if (!view) return res.status(404).json({ success: false, message: '用户不存在' });
      res.json({ success: true, friend: view });
    } catch (error) {
      console.error('好友详情API错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = createRouter;
