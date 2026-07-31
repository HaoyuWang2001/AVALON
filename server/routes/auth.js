const express = require('express');
const https = require('https');

function createRouter(users) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: '缺少 code 参数' });
    }

    const WX_APPID = process.env.WX_APPID;
    const WX_SECRET = process.env.WX_SECRET;

    if (!WX_APPID || !WX_SECRET) {
      return res.status(500).json({ success: false, message: '服务器未配置微信凭证' });
    }

    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;

    https.get(wxUrl, (wxRes) => {
      let body = '';
      wxRes.on('data', (chunk) => { body += chunk; });
      wxRes.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.errcode) {
            return res.status(400).json({ success: false, message: data.errmsg || '微信登录失败' });
          }

          const { openid, session_key } = data;

          let user = users.get(openid);
          if (!user) {
            user = {
              openId: openid,
              wxNickName: '',
              customNickName: '',
              avatarUrl: '',
              sessionKey: session_key,
              updatedAt: new Date()
            };
            users.set(openid, user);
          } else {
            user.sessionKey = session_key;
            user.updatedAt = new Date();
          }

          res.json({
            success: true,
            openid,
            user: {
              openId: user.openId,
              wxNickName: user.wxNickName || '',
              customNickName: user.customNickName || '',
              avatarUrl: user.avatarUrl || ''
            }
          });
        } catch (e) {
          res.status(500).json({ success: false, message: '解析微信响应失败' });
        }
      });
    }).on('error', () => {
      res.status(500).json({ success: false, message: '调用微信API失败' });
    });
  });

  return router;
}

module.exports = createRouter;
