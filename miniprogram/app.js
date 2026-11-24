// app.js
const api = require('./services/api.js');

App({
  globalData: {
    openId: null,
    userInfo: null,
    roomId: null,
    gameState: null,
    profileLoaded: false
  },

  onLaunch: function () {
    const savedOpenId = wx.getStorageSync('openId');
    if (savedOpenId) {
      this.globalData.openId = savedOpenId;
    }
    this.weixinLogin();
  },

  weixinLogin: function () {
    wx.login({
      success: (res) => {
        if (res.code) {
          api.login(res.code).then(result => {
            if (result && result.success) {
              this.globalData.openId = result.openid;
              wx.setStorageSync('openId', result.openid);
              if (result.user) {
                if (result.user.wxNickName) {
                  if (!this.globalData.userInfo) this.globalData.userInfo = {};
                  this.globalData.userInfo.nickName = result.user.wxNickName;
                }
              }
              if (this.openIdReadyCallback) {
                this.openIdReadyCallback(result);
              }
            }
          }).catch(() => {});
        }
      }
    });
  }
});
