// pages/index/index.js
const api = require('../../services/api.js');

const { DEFAULT_AVATAR, ROLE_NAMES } = require('../../utils/constants.js');

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '小时' + (m > 0 ? m + '分钟' : '');
  if (m > 0) return m + '分钟';
  return '不足1分钟';
}

Page({
  data: {
    userInfo: { avatarUrl: '', nickName: '' },
    customNickName: '',
    configsUserInfo: null,
    currentRoom: null,
    isCurrentRoomHost: false,
    userStatusText: '在线',
    userStatusClass: 'status-online',

    showInfo: false,
    historyList: [],
    totalWinRate: '',
    goodWinRate: '',
    evilWinRate: '',
    roleStats: []
  },

  onLoad(options) {
    const savedNickName = wx.getStorageSync('customNickName');
    if (savedNickName) { this.setData({ customNickName: savedNickName }); }
    const app = getApp();
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
    const savedAvatar = wx.getStorageSync('avatarUrl');
    if (savedAvatar) {
      this.setData({ 'userInfo.avatarUrl': savedAvatar });
    } else {
      this.setData({ 'userInfo.avatarUrl': DEFAULT_AVATAR });
    }
    if (app.globalData.userInfo) {
      app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: savedAvatar || DEFAULT_AVATAR };
    }

    // 分享链接进入：携带 roomId → 等 openId 就绪后自动加入房间
    const shareRoomId = options && options.roomId;

    if (app.globalData.openId) {
      this.loadUserProfile();
      this.loadHistoryAndStats();
      if (shareRoomId) this.doShareJoin(shareRoomId);
    } else {
      app.openIdReadyCallback = () => {
        this.loadUserProfile();
        this.checkCurrentRoom();
        this.loadHistoryAndStats();
        if (shareRoomId) this.doShareJoin(shareRoomId);
      };
    }

    if (app.globalData.openId) {
      this.checkCurrentRoom();
    }
  },

  // 分享链接加入房间：已在分享房间→直接进入(座位不变)；在其他房间未开始→询问退出后加入；游戏中→不可退出；游戏已开始→自动观战
  doShareJoin(roomId) {
    const app = getApp();
    if (!app.globalData.openId) return;
    wx.showLoading({ title: '加入房间...', mask: true });
    api.joinRoom(roomId, 0).then(res => {
      wx.hideLoading();
      if (res.success) {
        app.globalData.roomId = roomId;
        wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}` });
        return;
      }
      const msg = (res && res.message) || '';
      if (msg.includes('已在其他房间')) {
        this.confirmLeaveAndJoin(roomId);
      } else {
        wx.showToast({ title: msg || '加入失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' });
    });
  },

  // 在其他房间：若旧房间游戏中则不可退出；否则询问后退出并加入新房间
  confirmLeaveAndJoin(roomId) {
    const app = getApp();
    api.getCurrentRoom(app.globalData.openId).then(res => {
      const cur = res && res.room;
      if (cur && cur.gameStarted) {
        wx.showToast({ title: '游戏进行中，无法退出当前房间', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '已在其他房间',
        content: '退出当前房间并加入新房间？',
        confirmText: '退出并加入',
        success: (r) => {
          if (r.confirm) {
            if (cur && cur.roomId) {
              api.leaveRoom(cur.roomId).then(leaveRes => {
                if (leaveRes.success) {
                  wx.showLoading({ title: '加入房间...', mask: true });
                  api.joinRoom(roomId, 0).then(res2 => {
                    wx.hideLoading();
                    if (res2.success) {
                      app.globalData.roomId = roomId;
                      wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}` });
                    } else {
                      wx.showToast({ title: (res2 && res2.message) || '加入失败', icon: 'none' });
                    }
                  }).catch(() => wx.hideLoading());
                } else {
                  wx.showToast({ title: (leaveRes && leaveRes.message) || '退出房间失败', icon: 'none' });
                }
              });
            } else {
              // 无旧房间信息，直接重新加入
              this.doShareJoin(roomId);
            }
          }
        }
      });
    }).catch(() => {
      wx.showToast({ title: '加入失败', icon: 'none' });
    });
  },

  onShow() {
    if (getApp().globalData.openId) {
      this.checkCurrentRoom();
      this.loadHistoryAndStats();
    }
  },

  onPullDownRefresh() {
    this.checkCurrentRoom();
    if (getApp().globalData.openId) {
      this.loadUserProfile();
      this.loadHistoryAndStats();
    }
    wx.stopPullDownRefresh();
  },

  checkCurrentRoom() {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    api.getCurrentRoom(openId).then(res => {
      if (res && res.success && res.room) {
        this.setData({
          currentRoom: res.room,
          isCurrentRoomHost: !!(res.room.ownerId && res.room.ownerId === openId)
        });
        // 状态：游戏中(红) / 房间中(蓝)
        if (res.room.gameStarted) {
          this.setData({ userStatusText: '游戏中', userStatusClass: 'status-ingame' });
        } else {
          this.setData({ userStatusText: '房间中', userStatusClass: 'status-inroom' });
        }
      } else if (res && res.success) {
        this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
      }
    }).catch(() => {});
  },

  backToRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    // 游戏进行中且存在 active gameId → 进入游戏；否则回到房间
    if (room.gameStarted && room.gameId) {
      wx.navigateTo({ url: `/pages/game/game?gameId=${room.gameId}&roomId=${room.roomId}` });
    } else {
      wx.navigateTo({ url: `/pages/room/room?roomId=${room.roomId}` });
    }
  },

  exitCurrentRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    if (room.gameStarted) {
      wx.showToast({ title: '游戏进行中，无法退出房间', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '退出房间',
      content: `确定退出房间 ${room.roomId} 吗？`,
      success: (res) => {
        if (res.confirm) {
          api.leaveRoom(room.roomId).then(() => {
            this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
            getApp().globalData.roomId = null;
            wx.showToast({ title: '已退出', icon: 'success' });
          }).catch(() => {});
        }
      }
    });
  },

  disbandCurrentRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    if (room.gameStarted) {
      wx.showToast({ title: '游戏进行中，无法解散房间', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '解散房间',
      content: `确定解散房间 ${room.roomId} 吗？此操作不可恢复。`,
      success: (res) => {
        if (res.confirm) {
          api.disbandRoom(room.roomId).then(() => {
            this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
            getApp().globalData.roomId = null;
            wx.showToast({ title: '已解散', icon: 'success' });
          }).catch((err) => {
            wx.showToast({ title: (err && err.message) || '解散失败', icon: 'none' });
          });
        }
      }
    });
  },

  loadUserProfile() {
    const app = getApp();
    if (app.globalData.profileLoaded) return;
    app.globalData.profileLoaded = true;
    const openId = app.globalData.openId;
    if (!openId) return;
    api.getUserProfile(openId).then(res => {
      if (res && res.success && res.user) {
        const u = res.user;
        const updates = {};
        if (u.wxNickName) {
          updates['userInfo.nickName'] = u.wxNickName;
          if (app.globalData.userInfo) {
            app.globalData.userInfo.nickName = u.wxNickName;
          }
        }
        if (u.customNickName) {
          updates.customNickName = u.customNickName;
          wx.setStorageSync('customNickName', u.customNickName);
        }
        if (u.avatarUrl) {
          updates['userInfo.avatarUrl'] = u.avatarUrl;
          wx.setStorageSync('avatarUrl', u.avatarUrl);
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates);
        }
      }
    }).catch(() => {});
  },

  loadHistoryAndStats() {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    api.getUserHistory(openId, 10).then(res => {
      if (res && res.success && Array.isArray(res.history)) {
        const historyList = res.history.map(item => ({
          gameId: item.gameId,
          roleName: ROLE_NAMES[item.role] || item.role,
          side: item.side,
          isWin: !!(item.gameResult && item.gameResult.winner === item.side),
          durationText: formatDuration(item.durationSeconds)
        }));
        this.setData({ historyList });
      }
    }).catch(() => {});
    api.getUserStats(openId).then(res => {
      if (res && res.success && res.stats) {
        const s = res.stats;
        const roleStats = (s.roles || []).filter(r => r.games > 0).map(r => ({
          role: r.role,
          roleName: ROLE_NAMES[r.role] || r.role,
          games: r.games,
          wins: r.wins,
          winRate: r.winRate + '%'
        }));
        this.setData({
          totalWinRate: s.totalGames > 0 ? s.totalWinRate + '%' : '',
          goodWinRate: s.goodGames > 0 ? s.goodWinRate + '%' : '',
          evilWinRate: s.evilGames > 0 ? s.evilWinRate + '%' : '',
          roleStats
        });
      }
    }).catch(() => {});
  },

  showInfoModal() {
    this.setData({ showInfo: true });
  },

  closeInfo() {
    this.setData({ showInfo: false });
  },

  openHistoryGame(e) {
    const gameId = e.currentTarget.dataset.gameid;
    if (!gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
  },

  onAvatarError() {},

  onChooseAvatar(e) {
    if (!e.detail || !e.detail.avatarUrl) return;
    const tempPath = e.detail.avatarUrl;
    const app = getApp();
    const openId = app.globalData.openId || wx.getStorageSync('openId') || 'default';

    this.setData({ 'userInfo.avatarUrl': tempPath });
    app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: tempPath };

    // 上传至服务器，链接存入数据库（跨设备可见）；失败回退本地保存
    api.uploadAvatar(openId, tempPath).then((res) => {
      const url = res.avatarUrl || '';
      if (url) {
        wx.setStorageSync('avatarUrl', url);
        this.setData({ 'userInfo.avatarUrl': url });
        app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: url };
      }
    }).catch(() => {
      wx.showToast({ title: '头像上传失败', icon: 'none' });
      const fs = wx.getFileSystemManager();
      const savedPath = wx.env.USER_DATA_PATH + '/avatar_' + openId + '.jpg';
      fs.saveFile({
        tempFilePath: tempPath,
        filePath: savedPath,
        success: () => {
          wx.setStorageSync('avatarUrl', savedPath);
          this.setData({ 'userInfo.avatarUrl': savedPath });
          app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: savedPath };
          if (openId) {
            api.updateUserProfile(openId, { avatarUrl: savedPath }).catch(() => {});
          }
        },
        fail: () => {
          wx.setStorageSync('avatarUrl', tempPath);
        }
      });
    });
  },

  showNickNameModal() {
    const savedNickName = wx.getStorageSync('customNickName') || '';
    wx.showModal({
      title: '修改昵称', editable: true, placeholderText: '请输入昵称',
      content: savedNickName,
      success: (res) => {
        if (res.confirm && res.content) {
          const nickName = res.content.trim();
          if (nickName.length > 0 && nickName.length <= 10) {
            wx.setStorageSync('customNickName', nickName);
            this.setData({ customNickName: nickName });
            const openId = getApp().globalData.openId;
            if (openId) {
              api.updateUserProfile(openId, { customNickName: nickName }).catch(() => {});
            }
          }
        }
      }
    });
  },

  // ─────────── 配置弹窗（configs 公共组件） ───────────
  openConfigs() {
    const name = this.data.customNickName || (this.data.userInfo && this.data.userInfo.nickName) || '房主';
    const ui = { ...(this.data.userInfo || {}), customNickName: this.data.customNickName };
    this.setData({ configsUserInfo: ui });
    this.selectComponent('#configs').open();
  },

  // 组件创建成功 → 跳转房间
  onCreated(e) {
    const roomId = e.detail.roomId;
    if (roomId) {
      const app = getApp();
      app.globalData.roomId = roomId;
      wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}&isHost=true` });
    }
  },

  joinRoom() {
    wx.showModal({
      title: '加入会议', editable: true, placeholderText: '6位会议ID',
      success: (res) => {
        if (res.confirm && res.content) {
          const roomId = res.content.trim();
          if (roomId.length === 6) {
            this.doJoinRoom(roomId, 0);
          }
        }
      }
    });
  },

  doJoinRoom(roomId, seatNumber) {
    wx.showLoading({ title: '加入会议中...' });
    api.joinRoom(roomId, seatNumber).then(res => {
      wx.hideLoading();
      if (res.success) {
        const app = getApp();
        app.globalData.roomId = roomId;
        wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}&isHost=false` });
      }
    });
  }
});
