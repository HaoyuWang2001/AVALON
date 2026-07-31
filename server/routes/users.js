const express = require('express');

function createRouter(users) {
  const router = express.Router();

  router.get('/:openId', (req, res) => {
    const { openId } = req.params;
    let user = users.get(openId);

    if (!user) {
      user = {
        openId,
        wxNickName: '',
        customNickName: '',
        avatarUrl: '',
        updatedAt: new Date()
      };
      users.set(openId, user);
    }

    res.json({ success: true, user });
  });

  router.post('/:openId/profile', (req, res) => {
    const { openId } = req.params;
    const { wxNickName, customNickName, avatarUrl } = req.body;

    let user = users.get(openId) || {
      openId,
      wxNickName: '',
      customNickName: '',
      avatarUrl: ''
    };

    if (wxNickName !== undefined) user.wxNickName = wxNickName;
    if (customNickName !== undefined) user.customNickName = customNickName;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    user.updatedAt = new Date();

    users.set(openId, user);
    res.json({ success: true, user });
  });

  return router;
}

module.exports = createRouter;
