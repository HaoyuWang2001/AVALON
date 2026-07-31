const express = require('express');
const https = require('https');
const UserModel = require('../models/UserModel');

function createRouter() {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, message: '缺少 code 参数' });
      }

      const WX_APPID = process.env.WX_APPID;
      const WX_SECRET = process.env.WX_SECRET;

      if (!WX_APPID || !WX_SECRET) {
        return res.status(500).json({ success: false, message: '服务器未配置微信凭证' });
      }

      const wxResult = await new Promise((resolve, reject) => {
        const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;
        https.get(wxUrl, (wxRes) => {
          let body = '';
          wxRes.on('data', (chunk) => { body += chunk; });
          wxRes.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error('解析微信响应失败'));
            }
          });
        }).on('error', reject);
      });

      if (wxResult.errcode) {
        return res.status(400).json({ success: false, message: wxResult.errmsg || '微信登录失败' });
      }

      const { openid, session_key } = wxResult;

      const user = await UserModel.getOrCreate(openid);

      res.json({
        success: true,
        openid,
        user: {
          openId: user.open_id,
          wxNickName: user.wx_nick_name || '',
          customNickName: user.custom_nick_name || '',
          avatarUrl: user.avatar_url || ''
        }
      });
    } catch (error) {
      console.error('微信登录错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = createRouter;
