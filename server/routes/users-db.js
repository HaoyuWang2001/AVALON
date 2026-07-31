const express = require('express');
const UserModel = require('../models/UserModel');

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
          avatarUrl: user.avatar_url || ''
        }
      });
    } catch (error) {
      console.error('获取用户资料错误:', error);
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
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

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

  return router;
}

module.exports = createRouter;
