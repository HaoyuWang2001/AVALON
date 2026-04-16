// pages/index/index.js
const api = require('../../services/api.js');

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUseGetUserProfile: false,
    customNickName: '',
    showNickNameInput: false,
  },
  onLoad() {
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
    const app = getApp();
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      });
    } else {
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      };
    }
    const savedNickName = wx.getStorageSync('customNickName');
    if (savedNickName) {
      this.setData({
        customNickName: savedNickName
      });
    }
  },
  getUserProfile(e) {
    wx.getUserProfile({
      desc: '用于展示用户信息',
      success: (res) => {
        const app = getApp();
        app.globalData.userInfo = res.userInfo;
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      }
    });
  },
  showNickNameModal() {
    const savedNickName = wx.getStorageSync('customNickName') || '';
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称',
      content: savedNickName,
      success: (res) => {
        if (res.confirm && res.content) {
          const nickName = res.content.trim();
          if (nickName.length > 0 && nickName.length <= 10) {
            wx.setStorageSync('customNickName', nickName);
            this.setData({
              customNickName: nickName
            });
            wx.showToast({
              title: '昵称已修改',
              icon: 'success'
            });
          } else {
            wx.showToast({
              title: '昵称1-10字符',
              icon: 'error'
            });
          }
        }
      }
    });
  },
  createRoom() {
    wx.showLoading({
      title: '创建房间中...',
    });
    api.createRoom().then(res => {
      wx.hideLoading();
      if (res.success) {
        const roomId = res.roomId;
        const app = getApp();
        app.globalData.roomId = roomId;
        wx.navigateTo({
          url: `/pages/room/room?roomId=${roomId}&isHost=true`,
        });
      } else {
        wx.showToast({
          title: res.message || '创建失败',
          icon: 'error',
        });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({
        title: '创建失败',
        icon: 'error',
      });
      console.error('创建房间失败:', err);
    });
  },
  joinRoom() {
    wx.showModal({
      title: '加入房间',
      editable: true,
      placeholderText: '6位房间号',
      success: (res) => {
        if (res.confirm && res.content) {
          const input = res.content.trim();
          const parts = input.split(' ');
          const roomId = parts[0];
          let seatNumber = parseInt(parts[1]) || null;

          if (roomId.length === 6) {
            if (!seatNumber || seatNumber < 1 || seatNumber > 12) {
              wx.showModal({
                title: '选择座位号',
                content: '请输入座位号(1-12)',
                editable: true,
                placeholderText: '1-12',
                success: (seatRes) => {
                  if (seatRes.confirm && seatRes.content) {
                    seatNumber = parseInt(seatRes.content.trim());
                    if (seatNumber >= 1 && seatNumber <= 12) {
                      this.doJoinRoom(roomId, seatNumber);
                    } else {
                      wx.showToast({
                        title: '座位号无效',
                        icon: 'error'
                      });
                    }
                  }
                }
              });
            } else {
              this.doJoinRoom(roomId, seatNumber);
            }
          } else {
            wx.showToast({
              title: '房间号格式错误',
              icon: 'error',
            });
          }
        }
      }
    });
  },
  doJoinRoom(roomId, seatNumber) {
    wx.showLoading({
      title: '加入房间中...',
    });
    api.joinRoom(roomId, seatNumber).then(res => {
      wx.hideLoading();
      if (res.success) {
        const app = getApp();
        app.globalData.roomId = roomId;
        app.globalData.seatNumber = seatNumber;
        wx.navigateTo({
          url: `/pages/room/room?roomId=${roomId}&isHost=false&seatNumber=${seatNumber}`,
        });
      } else {
        wx.showToast({
          title: res.message || '加入失败',
          icon: 'error',
        });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({
        title: '加入失败',
        icon: 'error',
      });
      console.error('加入房间失败:', err);
    });
  }
});
