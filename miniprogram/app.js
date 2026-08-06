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

    // 全局持久通知：游戏开始被移出房间（等待区玩家）→ 弹窗并返回首页
    api.onSocketMessagePersistent('kickedFromRoom', (msg) => {
      wx.showModal({
        title: '游戏已开始',
        content: (msg && msg.reason) || '您已离开房间，正在返回首页',
        showCancel: false,
        success: () => {
          wx.reLaunch({ url: '/pages/index/index' });
        }
      });
    });
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
