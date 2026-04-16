// app.js
App({
  onLaunch: function () {
    const savedOpenId = wx.getStorageSync('openId');
    if (savedOpenId) {
      this.globalData.openId = savedOpenId;
    } else {
      const openId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      wx.setStorageSync('openId', openId);
      this.globalData.openId = openId;
    }

    wx.getSetting({
      success: res => {
        if (res.authSetting['scope.userInfo']) {
          wx.getUserInfo({
            success: res => {
              this.globalData.userInfo = res.userInfo;
              if (this.userInfoReadyCallback) {
                this.userInfoReadyCallback(res);
              }
            }
          });
        }
      }
    });
  },
  globalData: {
    openId: null,
    userInfo: null,
    roomId: null,
    gameState: null
  }
});
