const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');
const UserModel = require('../models/UserModel');
const { AVATAR_DIR } = require('../config/uploads');

const AVATAR_MIMETYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    cb(null, AVATAR_DIR);
  },
  filename: (req, file, cb) => {
    const openId = path.basename(req.params.openId).replace(/[^\w-]/g, '');
    const ext = AVATAR_MIMETYPES[file.mimetype] || 'png';
    cb(null, `${openId}_${Date.now()}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: (req, file, cb) => {
    if (AVATAR_MIMETYPES[file.mimetype]) cb(null, true);
    else cb(new Error('不支持的图片类型'));
  }
});

const UNIQUE_ID_RE = /^[\w\u4e00-\u9fa5-]{1,16}$/;

function createRouter() {
  const router = express.Router();

  router.get('/:openId', async (req, res) => {
    try {
      const { openId } = req.params;
      const user = await UserModel.getOrCreate(openId);

      res.json({
        success: true,
        user: {
          openId: user.open_id,
          wxNickName: user.wx_nick_name || '',
          customNickName: user.custom_nick_name || '',
          avatarUrl: user.avatar_url || '',
          uniqueId: user.unique_id || '',
          lastSeenAt: user.last_seen_at || null
        }
      });
    } catch (error) {
      console.error('获取用户资料错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 设置/修改 unique_id：1-16位 中文/英文/数字/-/_；唯一（UNIQUE 索引兜底）；每日一次（自然日）
  router.post('/:openId/uniqueId', async (req, res) => {
    try {
      const { openId } = req.params;
      const { uniqueId } = req.body || {};

      if (!uniqueId || typeof uniqueId !== 'string' || !UNIQUE_ID_RE.test(uniqueId)) {
        return res.status(400).json({ success: false, message: 'ID需为1-16位，仅支持中文、字母、数字、- 和 _' });
      }

      const user = await UserModel.getByOpenId(openId);
      if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

      // 每日一次（自然日）：首次设置也占当天名额；当天已设置/修改过则拒绝
      if (user.unique_id_updated_at) {
        const today = new Date();
        const lastDay = new Date(user.unique_id_updated_at);
        const sameDay = today.getFullYear() === lastDay.getFullYear() &&
          today.getMonth() === lastDay.getMonth() &&
          today.getDate() === lastDay.getDate();
        if (sameDay) {
          return res.status(400).json({ success: false, message: 'ID每天仅可设置/修改一次' });
        }
      }

      try {
        const updated = await UserModel.setUniqueId(openId, uniqueId);
        res.json({
          success: true,
          user: {
            openId: updated.open_id,
            wxNickName: updated.wx_nick_name || '',
            customNickName: updated.custom_nick_name || '',
            avatarUrl: updated.avatar_url || '',
            uniqueId: updated.unique_id || '',
            lastSeenAt: updated.last_seen_at || null
          }
        });
      } catch (e) {
        // 唯一冲突
        if (e && (e.code === 'ER_DUP_ENTRY' || /ER_DUP_ENTRY/.test(e.message || ''))) {
          return res.status(400).json({ success: false, message: '该ID已被占用' });
        }
        throw e;
      }
    } catch (error) {
      console.error('设置unique_id错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.post('/:openId/profile', async (req, res) => {
    try {
      const { openId } = req.params;
      const { wxNickName, customNickName, avatarUrl } = req.body;

      const data = {};
      if (wxNickName !== undefined) data.wxNickName = wxNickName;
      if (customNickName !== undefined) data.customNickName = customNickName;
      // 仅接受 http(s) 头像链接；本机路径(/images、wxfile、USER_DATA_PATH)直接忽略，避免污染跨设备头像
      if (avatarUrl !== undefined && /^https?:\/\//i.test(avatarUrl || '')) data.avatarUrl = avatarUrl;

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, message: '没有要更新的字段' });
      }

      const user = await UserModel.updateProfile(openId, data);

      res.json({
        success: true,
        user: {
          openId: user.open_id,
          wxNickName: user.wx_nick_name || '',
          customNickName: user.custom_nick_name || '',
          avatarUrl: user.avatar_url || ''
        }
      });
    } catch (error) {
      console.error('更新用户资料错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.post('/:openId/avatar', (req, res) => {
    upload.single('avatar')(req, res, async (err) => {
      try {
        if (err) {
          const message = err.code === 'LIMIT_FILE_SIZE' ? '头像超过 2MB 限制' : (err.message || '头像上传失败');
          return res.status(400).json({ success: false, message });
        }
        if (!req.file) {
          return res.status(400).json({ success: false, message: '缺少头像文件' });
        }

        const { openId } = req.params;
        const oldUser = await UserModel.getOrCreate(openId);
        const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;

        // 清理该 openId 旧头像文件（仅限本服务上传的静态文件，容忍文件已不存在）
        const oldUrl = oldUser.avatar_url || '';
        const oldRel = oldUrl.split('/uploads/avatars/')[1];
        if (oldRel) {
          const oldFile = path.join(AVATAR_DIR, path.basename(oldRel));
          fs.unlink(oldFile, () => {});
        }

        const user = await UserModel.updateProfile(openId, { avatarUrl });

        // 已入座房间即时刷新：同步更新该玩家在房间内的头像（房间页轮询自动获取）
        await db.query('UPDATE room_players SET avatar_url = ? WHERE open_id = ?', [avatarUrl, openId]);

        res.json({
          success: true,
          user: {
            openId: user.open_id,
            wxNickName: user.wx_nick_name || '',
            customNickName: user.custom_nick_name || '',
            avatarUrl: user.avatar_url || ''
          },
          avatarUrl
        });
      } catch (error) {
        console.error('上传头像错误:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    });
  });

  return router;
}

module.exports = createRouter;
