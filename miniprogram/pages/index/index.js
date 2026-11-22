// pages/index/index.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg, getSwitchColor, pickTheme, applyTheme } = require('../../utils/theme.js');
const { DEFAULT_AVATAR } = require('../../utils/constants.js');
const { buildRoomTags } = require('../../utils/roomTags.js');

const DEFAULT_SEAT_NUMBER = 0;

Page({
  data: {
    userInfo: { avatarUrl: '', nickName: '' },
    customNickName: '',
    currentRoom: null,
    currentSeat: null,
    isCurrentRoomHost: false,
    userStatusText: '在线',
    userStatusClass: 'status-online',

    themeClass: '',
    myRank: 0,
    champions: [],
    podium: [],
    championsLoaded: false,
    publicWinrate: true,
    compactGame: false,
    showWeirdSettings: false,
    showBrandMenu: false,
    switchColor: '#8B5CF6',

    // 首登资料完善
    showProfileSetup: false,
    setupAvatarUrl: '',
    setupNickName: '',

    // 公开房间列表
    roomTab: 'waiting',
    publicRooms: [],
    visibleRooms: [],
    roomCounts: { waiting: 0, playing: 0 },
    roomListLoading: false,
    myRoomInfo: null,

    meetingPressStyle: '',
    meetingFillClass: '',
    meetingFillMs: 420
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

    // 分享链接进入：room分享(index?roomId) → doShareJoinFromRoom；game分享(index?roomId&gameId) → doShareJoinFromGame
    const shareRoomId = options && options.roomId;
    const shareGameId = options && options.gameId;

    this.loadRoomList();
    if (app.globalData.openId) {
      this.loadUserProfile();
      this.loadHomeData();
      this.checkCurrentRoom();
      this.dispatchShareJoin(shareRoomId, shareGameId);
    } else {
      app.openIdReadyCallback = () => {
        this.loadUserProfile();
        this.checkCurrentRoom();
        this.loadHomeData();
        this.dispatchShareJoin(shareRoomId, shareGameId);
      };
    }

    // 主题初始化
    const tc = getThemeClass();
    this.setData({ themeClass: tc, switchColor: getSwitchColor(tc) });
    wx.setBackgroundColor({ backgroundColor: getThemeBg(tc) });

    // 开启原生分享：发送给朋友 + 分享到朋友圈
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onShareAppMessage() {
    return { title: 'AVALON · 瓦协会之练秋湖分部', path: '/pages/index/index' };
  },

  onShareTimeline() {
    return { title: 'AVALON · 瓦协会之练秋湖分部' };
  },

  dispatchShareJoin(roomId, gameId) {
    if (roomId && gameId) this.doShareJoinFromGame(roomId, gameId);
    else if (roomId) this.doShareJoinFromRoom(roomId);
  },

  // 来自 room 分享(index?roomId)：行为与 doJoinRoom 一致——room未游戏→room页；room游戏中→game页
  doShareJoinFromRoom(roomId) {
    const app = getApp();
    if (!app.globalData.openId) return;
    wx.showLoading({ title: '加入房间...', mask: true });
    api.joinRoom(roomId, DEFAULT_SEAT_NUMBER, this.data.userInfo || {}).then(res => {
      wx.hideLoading();
      if (res.success) {
        app.globalData.roomId = roomId;
        const room = res.room || {};
        if (room.gameStarted && room.activeGameId) {
          wx.navigateTo({ url: `/pages/game/game?gameId=${room.activeGameId}&roomId=${roomId}` });
        } else {
          wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}` });
        }
        return;
      }
      const msg = (res && res.message) || '';
      if (msg.includes('已在其他房间') || msg.includes('已在房间中')) {
        this.confirmLeaveAndJoin(roomId, null);
      } else {
        wx.showModal({
          title: '加入失败', content: msg || '加入失败', showCancel: false,
          success: () => wx.reLaunch({ url: '/pages/index/index' })
        });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showModal({
        title: '加入失败', content: (err && err.message) || '加入失败', showCancel: false,
        success: () => wx.reLaunch({ url: '/pages/index/index' })
      });
    });
  },

  // 来自 game 分享(index?roomId&gameId)：进行中→加入观战并进game；已结束→直接进game查看结果
  doShareJoinFromGame(roomId, gameId) {
    const app = getApp();
    if (!app.globalData.openId) return;
    wx.showLoading({ title: '查看对局...', mask: true });
    api.getGameState(gameId).then(state => {
      wx.hideLoading();
      const status = state && state.basic && state.basic.status;
      if (status === 'ended') {
        wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
        return;
      }
      if (status !== 'active') {
        wx.showModal({
          title: '对局不可用', content: '该对局已失效', showCancel: false,
          success: () => wx.reLaunch({ url: '/pages/index/index' })
        });
        return;
      }
      wx.showLoading({ title: '加入观战...', mask: true });
      api.joinRoom(roomId, DEFAULT_SEAT_NUMBER, this.data.userInfo || {}).then(res => {
        wx.hideLoading();
        if (res.success) {
          app.globalData.roomId = roomId;
          wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&roomId=${roomId}` });
          return;
        }
        const msg = (res && res.message) || '';
        if (msg.includes('已在其他房间') || msg.includes('已在房间中')) {
          this.confirmLeaveAndJoin(roomId, gameId);
        } else {
          wx.showModal({
            title: '无法观战', content: msg || '观战区已满或不可加入', showCancel: false,
            success: () => wx.reLaunch({ url: '/pages/index/index' })
          });
        }
      }).catch(err => {
        wx.hideLoading();
        wx.showModal({
          title: '加入失败', content: (err && err.message) || '加入失败', showCancel: false,
          success: () => wx.reLaunch({ url: '/pages/index/index' })
        });
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showModal({
        title: '对局不可用', content: (err && err.message) || '获取对局失败', showCancel: false,
        success: () => wx.reLaunch({ url: '/pages/index/index' })
      });
    });
  },

  // 在其他房间：若旧房间游戏中则不可退出；否则询问后退出并加入新房间（gameId 有则跳 game，无则跳 room）
  confirmLeaveAndJoin(roomId, gameId) {
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
                  api.joinRoom(roomId, DEFAULT_SEAT_NUMBER).then(res2 => {
                    wx.hideLoading();
                    if (res2.success) {
                      app.globalData.roomId = roomId;
                      if (gameId) {
                        wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&roomId=${roomId}` });
                      } else {
                        wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}` });
                      }
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
              this.dispatchShareJoin(roomId, gameId);
            }
          }
        }
      });
    }).catch(() => {
      wx.showToast({ title: '加入失败', icon: 'none' });
    });
  },

  onReady() {
    this._measureMeeting();
  },

  onShow() {
    this.setData({ compactGame: !!wx.getStorageSync('avalon_compact_game') });
    // 从个人页返回：同步头像/昵称修改
    const savedNick = wx.getStorageSync('customNickName') || '';
    const savedAvatar = wx.getStorageSync('avatarUrl') || '';
    const updates = {};
    if (savedNick && savedNick !== this.data.customNickName) updates.customNickName = savedNick;
    if (savedAvatar && savedAvatar !== this.data.userInfo.avatarUrl) updates['userInfo.avatarUrl'] = savedAvatar;
    if (Object.keys(updates).length > 0) this.setData(updates);

    if (getApp().globalData.openId) {
      this.checkCurrentRoom();
      this.loadHomeData();
    }
    this.loadRoomList();
    // 返回本页时重新应用主题背景（离开时已复位，保证其他亮色页面不串色）
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
    this._measureMeeting();
  },

  onHide() {
    // 离开本页：窗口背景复位为默认亮色，避免暗色泄漏到 room/game 等亮色页面
    wx.setBackgroundColor({ backgroundColor: '#F5F5F5' });
  },

  // 召开/加入会议合并按钮：缓存按钮位置，用于按压方向判定
  _measureMeeting() {
    wx.createSelectorQuery().select('.meeting-btn')
      .boundingClientRect(r => { if (r) this._meetingRect = r; })
      .exec();
  },

  // 按压：按哪个角，哪个角向里凹（偏移越大倾斜越大，中心为 0）
  // 按压 + 颜色铺满：touchstart 同刻触发，松手后（已满足随机时长）再打开组件
  onMeetingTouchStart(e) {
    if (this._meetingBusy) return;
    clearTimeout(this._meetingCommitTimer);
    const t = e.touches && e.touches[0];
    const side = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.side) || 'lead';
    const ms = 700 + Math.floor(Math.random() * 301);
    this._meetingStartAt = Date.now();
    this._meetingStartX = t ? t.clientX : 0;
    this._meetingStartY = t ? t.clientY : 0;
    this._meetingMoved = false;
    this._meetingMs = ms;
    this._meetingSide = side;
    const patch = { meetingFillClass: 'filling-' + side, meetingFillMs: ms };
    const r = this._meetingRect;
    if (r && t && r.width && r.height) {
      const nx = Math.max(-1, Math.min(1, (t.clientX - r.left) / r.width * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (t.clientY - r.top) / r.height * 2 - 1));
      const M = 9;
      patch.meetingPressStyle = `transform: perspective(760rpx) rotateX(${(-ny * M).toFixed(2)}deg) rotateY(${(nx * M).toFixed(2)}deg) scale(0.985);`;
    }
    this.setData(patch);
  },

  onMeetingTouchMove(e) {
    const t = e.touches && e.touches[0];
    if (!t || this._meetingMoved) return;
    const dx = t.clientX - (this._meetingStartX || 0);
    const dy = t.clientY - (this._meetingStartY || 0);
    if (dx * dx + dy * dy > 225) this._meetingMoved = true; // >15px 视为拖动
  },

  onMeetingTouchEnd() {
    if (this._meetingMoved || !this._meetingSide) { this._resetMeeting(); return; }
    this._meetingBusy = true;
    const rest = Math.max(0, (this._meetingMs || 0) - (Date.now() - (this._meetingStartAt || 0)));
    this._meetingCommitTimer = setTimeout(() => {
      const action = this._meetingSide === 'join' ? 'joinRoom' : 'openConfigs';
      this._resetMeeting();
      this[action]();
    }, rest);
  },

  onMeetingTouchCancel() { this._resetMeeting(); },

  _resetMeeting() {
    clearTimeout(this._meetingCommitTimer);
    this._meetingBusy = false;
    this._meetingMoved = false;
    this._meetingSide = null;
    if (this.data.meetingFillClass || this.data.meetingPressStyle) {
      this.setData({ meetingFillClass: '', meetingPressStyle: '' });
    }
  },

  // ─── 公开房间列表（等待中 / 游戏中） ───
  loadRoomList() {
    this.setData({ roomListLoading: true });
    api.getPublicRooms().then(res => {
      this._allRooms = (res && res.rooms) || [];
      this.setData({ roomListLoading: false });
      this._applyRoomData();
    }).catch(() => {
      this._allRooms = [];
      this.setData({ roomListLoading: false });
      this._applyRoomData();
    });
  },

  _applyRoomData() {
    const all = this._allRooms || [];
    const myId = this.data.currentRoom ? this.data.currentRoom.roomId : '';
    const expanded = this._expandedTags || {};
    const mapped = all.map(r => {
      const showAllTags = !!expanded[r.roomId];
      return {
        ...r,
        isMine: r.roomId === myId,
        showAllTags,
        displayTags: showAllTags ? (r.tags || []) : (r.tags || []).slice(0, 3)
      };
    });
    // 我的房间置顶（其余保持服务端 updated_at 倒序）
    mapped.sort((a, b) => (b.isMine ? 1 : 0) - (a.isMine ? 1 : 0));
    const waiting = mapped.filter(r => !r.gameStarted).length;
    const playing = mapped.length - waiting;
    this.setData({
      publicRooms: mapped,
      roomCounts: { waiting, playing }
    });
    this._setVisibleRooms();
  },

  _setVisibleRooms() {
    const wantPlaying = this.data.roomTab === 'playing';
    const list = (this.data.publicRooms || []).filter(r => !!r.gameStarted === wantPlaying);
    this.setData({ visibleRooms: list });
  },

  switchRoomTab(e) {
    const tab = e.currentTarget.dataset.tab === 'playing' ? 'playing' : 'waiting';
    if (tab === this.data.roomTab) return;
    this.setData({ roomTab: tab });
    this._setVisibleRooms();
  },

  toggleRoomTags(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (!this._expandedTags) this._expandedTags = {};
    this._expandedTags[id] = !this._expandedTags[id];
    this._applyRoomData();
  },

  // 点击公开房间卡：等待中→加入等待区进房间；游戏中→观战进对局
  onPublicRoomTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.currentRoom && this.data.currentRoom.roomId === id) {
      this.backToRoom();
      return;
    }
    const room = (this._allRooms || []).find(r => r.roomId === id);
    if (room && room.gameStarted) {
      if (room.activeGameId) this.doShareJoinFromGame(id, room.activeGameId);
      else this.doShareJoinFromRoom(id);
      return;
    }
    this.doShareJoinFromRoom(id);
  },

  // 我的房间信息（人数/标签/头像行）
  _loadMyRoomInfo(roomId) {
    if (!roomId) return;
    api.getRoom(roomId).then(res => {
      const room = res && res.room;
      if (!room) return;
      const cfg = room.roomConfig || {};
      const good = (cfg.roles && cfg.roles.good) || [];
      const evil = (cfg.roles && cfg.roles.evil) || [];
      const players = (room.players || [])
        .filter(p => p.seatNumber >= 1)
        .sort((a, b) => a.seatNumber - b.seatNumber)
        .slice(0, 12)
        .map(p => ({ openId: p.openId, nickName: p.nickName, avatarUrl: p.avatarUrl }));
      this.setData({
        myRoomInfo: {
          roomId,
          gameStarted: !!room.gameStarted,
          maxPlayers: good.length + evil.length,
          playerCount: (room.players || []).filter(p => p.seatNumber >= 1).length,
          tags: buildRoomTags(cfg),
          players
        }
      });
    }).catch(() => {});
  },

  onPullDownRefresh() {
    this.checkCurrentRoom();
    this.loadRoomList();
    if (getApp().globalData.openId) {
      this.loadUserProfile();
      this.loadHomeData();
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
          currentSeat: res.room.seatNumber !== undefined ? res.room.seatNumber : null,
          isCurrentRoomHost: !!(res.room.ownerId && res.room.ownerId === openId)
        });
        this._loadMyRoomInfo(res.room.roomId);
        this._applyRoomData();
        // 状态：游戏中(红) / 房间中(蓝)
        if (res.room.gameStarted) {
          this.setData({ userStatusText: '游戏中', userStatusClass: 'status-ingame' });
        } else {
          this.setData({ userStatusText: '房间中', userStatusClass: 'status-inroom' });
        }
      } else if (res && res.success) {
        this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online', myRoomInfo: null });
        this._applyRoomData();
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
    // 游戏中仅入座玩家（seat>=1）不可退出；观战/等待可退出
    if (room.gameStarted && this.data.currentSeat >= 1) {
      wx.showToast({ title: '游戏进行中，无法退出房间', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '退出房间',
      content: `确定退出房间 ${room.roomId} 吗？`,
      success: (res) => {
        if (res.confirm) {
          api.leaveRoom(room.roomId).then(() => {
            this.setData({ currentRoom: null, currentSeat: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
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
    const openId = app.globalData.openId;
    if (!openId) return;
    return api.getUserProfile(openId).then(res => {
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
        if (u.avatarUrl && /^https?:\/\//i.test(u.avatarUrl)) {
          updates['userInfo.avatarUrl'] = u.avatarUrl;
          wx.setStorageSync('avatarUrl', u.avatarUrl);
        }
        if (u.publicWinrate !== undefined) {
          updates.publicWinrate = u.publicWinrate !== 0;
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates);
        }
        this._maybeShowProfileSetup(u);
      }
    }).catch(() => {});
  },

  // 首登资料完善：头像或昵称缺失时自动弹出（每页面实例只自动检查一次）
  _maybeShowProfileSetup(profile) {
    if (this._profileSetupChecked) return;
    this._profileSetupChecked = true;
    const storedAvatar = wx.getStorageSync('avatarUrl') || '';
    const serverAvatar = (profile && profile.avatarUrl) || '';
    const hasAvatar = !!serverAvatar || !!storedAvatar;
    const nick = (profile && profile.customNickName) || this.data.customNickName || '';
    if (hasAvatar && nick) return;
    const presetNick = (nick || (profile && profile.wxNickName) || '').slice(0, 10);
    this.setData({
      showProfileSetup: true,
      setupAvatarUrl: hasAvatar ? (serverAvatar || storedAvatar) : '',
      setupNickName: presetNick
    });
  },

  goToMe() {
    if (this._goingToMe) return;
    this._goingToMe = true;
    wx.navigateTo({
      url: '/pages/me/me',
      complete: () => { setTimeout(() => { this._goingToMe = false; }, 300); },
      fail: (err) => {
        this._goingToMe = false;
        console.error('跳转个人页失败:', err);
        wx.showModal({
          title: '打开失败',
          content: (err && err.errMsg) || '未知错误',
          showCancel: false
        });
      }
    });
  },

  closeProfileSetup() {
    this.setData({ showProfileSetup: false });
  },

  onSetupAvatarTap() {
    if (!wx.canIUse('button.open-type.chooseAvatar')) {
      wx.showToast({ title: '当前微信版本过低，请升级微信后再换头像', icon: 'none' });
    }
  },

  onSetupChooseAvatar(e) {
    if (!e.detail || !e.detail.avatarUrl) return;
    this._setupAvatarTemp = e.detail.avatarUrl;
    this.setData({ setupAvatarUrl: e.detail.avatarUrl });
  },

  onSetupNickInput(e) {
    this.setData({ setupNickName: e.detail.value });
  },

  saveProfileSetup() {
    const nick = (this.data.setupNickName || '').trim();
    if (!nick) { wx.showToast({ title: '请填写昵称', icon: 'none' }); return; }
    if (nick.length > 10) { wx.showToast({ title: '昵称最多 10 字', icon: 'none' }); return; }
    const avatar = this.data.setupAvatarUrl || '';
    if (!avatar) { wx.showToast({ title: '请先选择头像', icon: 'none' }); return; }
    const app = getApp();
    const openId = app.globalData.openId || wx.getStorageSync('openId');
    if (!openId) { wx.showToast({ title: '登录中，请稍后重试', icon: 'none' }); return; }

    wx.showLoading({ title: '保存中...', mask: true });
    const commit = (avatarUrl) => api.updateUserProfile(openId, { customNickName: nick }).then(() => {
      wx.hideLoading();
      wx.setStorageSync('customNickName', nick);
      if (avatarUrl) wx.setStorageSync('avatarUrl', avatarUrl);
      const finalAvatar = avatarUrl || this.data.userInfo.avatarUrl || DEFAULT_AVATAR;
      this.setData({
        customNickName: nick,
        'userInfo.avatarUrl': finalAvatar,
        showProfileSetup: false
      });
      if (app.globalData.userInfo) {
        app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: finalAvatar };
      }
      this._setupAvatarTemp = '';
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });

    if (this._setupAvatarTemp) {
      api.uploadAvatar(openId, this._setupAvatarTemp).then(res => {
        commit((res && res.avatarUrl) || '');
      }).catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '头像上传失败', icon: 'none' });
      });
    } else {
      commit('');
    }
  },

  loadHomeData() {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    this.loadChampions(openId);
    this.loadMyRank(openId);
  },

  loadMyRank(openId) {
    api.getUserStats(openId).then(res => {
      if (res && res.success && res.stats) {
        this.setData({ myRank: res.stats.rank || 0 });
      }
    }).catch(() => {});
  },

  // ─── 胜率冠军 ───
  loadChampions(openId) {
    api.getChampions(openId).then(res => {
      if (res && res.success && Array.isArray(res.champions)) {
        const champions = res.champions.map((c, i) => ({ ...c, rank: i + 1 }));
        const podium = [];
        if (champions[1]) podium.push(champions[1]);
        if (champions[0]) podium.push(champions[0]);
        if (champions[2]) podium.push(champions[2]);
        this.setData({ champions, podium, championsLoaded: true });
      }
    }).catch(() => {});
  },

  // ─── 功能入口 / 设置 ───
  onChangeTheme() {
    pickTheme().then(picked => {
      if (picked === null) return;
      applyTheme(picked);
      this.setData({ themeClass: picked, switchColor: getSwitchColor(picked) });
    });
  },

  showWeirdSettings() {
    this.setData({ showWeirdSettings: true });
  },
  closeWeirdSettings() {
    this.setData({ showWeirdSettings: false });
  },

  // 公开胜率开关：二次确认；胜率前三禁止关闭
  onPublicWinrateChange(e) {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    const val = !!e.detail.value;
    this.setData({ publicWinrate: val }); // 先同步开关视觉，取消/被禁止时回滚

    if (!val) {
      if (!this.data.championsLoaded) {
        wx.showModal({
          title: '请稍候',
          content: '榜单数据加载中，暂时无法关闭公开胜率，请稍后重试。',
          showCancel: false,
          confirmText: '知道了',
          success: () => this.setData({ publicWinrate: true })
        });
        return;
      }
      const inTop3 = (this.data.podium || []).some(p => p.openId === openId);
      if (inTop3) {
        wx.showModal({
          title: '无法关闭',
          content: '您当前位于胜率前三榜单，公开胜率不可关闭；需胜率掉出前三后方可关闭。',
          showCancel: false,
          confirmText: '知道了',
          success: () => this.setData({ publicWinrate: true })
        });
        return;
      }
    }

    wx.showModal({
      title: val ? '公开胜率' : '关闭公开胜率',
      content: val ? '确定公开你的胜率？其他玩家将可以看到。' : '确定关闭公开胜率？关闭后将不再出现在胜率榜。',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) { this.setData({ publicWinrate: !val }); return; }
        api.setPublicWinrate(openId, val).then(r => {
          if (r && r.success) {
            wx.showToast({ title: val ? '已公开胜率' : '已设为私密', icon: 'none' });
          } else {
            this.setData({ publicWinrate: !val });
            wx.showToast({ title: (r && r.message) || '设置失败', icon: 'none' });
          }
        }).catch(err => {
          this.setData({ publicWinrate: !val });
          wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' });
        });
      }
    });
  },

  // 松弛压缩版开关（本地存储，按设备）
  onCompactGameChange(e) {
    const val = !!e.detail.value;
    this.setData({ compactGame: val });
    try { wx.setStorageSync('avalon_compact_game', val ? 1 : 0); } catch (err) {}
    wx.showToast({ title: val ? '已开启松弛压缩版' : '已关闭松弛压缩版', icon: 'none' });
  },

  goToFriends() {
    wx.navigateTo({ url: '/pages/friends/friends' });
  },
  goToGlobalStats() {
    wx.navigateTo({ url: '/pages/global-stats/global-stats' });
  },
  goToLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' });
  },
  goToRecords() {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  onChampionTap(e) {
    const { openid, name, avatar, friend } = e.currentTarget.dataset;
    const myOpenId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openid) return;
    const comp = this.selectComponent('#playerStats');
    if (!comp) return;
    comp.open({
      openId: openid,
      nickName: name || '玩家',
      avatarUrl: avatar || DEFAULT_AVATAR,
      isFriend: friend === 'true' || friend === true,
      isSelf: openid === myOpenId
    });
  },

  noop() {},

  // ─── 品牌菜单（点击圆徽触发） ───
  openBrandMenu() {
    this.setData({ showBrandMenu: true });
  },
  closeBrandMenu() {
    this.setData({ showBrandMenu: false });
  },
  onBrandMenuAction(e) {
    const action = e.currentTarget.dataset.action;
    this.setData({ showBrandMenu: false });
    if (action && typeof this[action] === 'function') {
      setTimeout(() => { this[action](); }, 60);
    }
  },

  // ─────────── 配置页（pages/configs/configs） ───────────
  openConfigs() {
    const ui = { ...(this.data.userInfo || {}), customNickName: this.data.customNickName };
    wx.navigateTo({
      url: '/pages/configs/configs?mode=create',
      success: (res) => { res.eventChannel.emit('init', { userInfo: ui }); }
    });
  },

  joinRoom() {
    wx.showModal({
      title: '加入会议', editable: true, placeholderText: '6位会议ID',
      success: (res) => {
        if (res.confirm && res.content) {
          const roomId = res.content.trim();
          if (roomId.length === 6) {
            this.doJoinRoom(roomId);
          }
        }
      }
    });
  },

  // 主页"加入会议"入口：固定未入座(seat=0)；room未游戏→room页；room游戏中→game页
  doJoinRoom(roomId) {
    wx.showLoading({ title: '加入会议中...' });
    api.joinRoom(roomId, DEFAULT_SEAT_NUMBER, this.data.userInfo || {}).then(res => {
      wx.hideLoading();
      if (res.success) {
        const app = getApp();
        app.globalData.roomId = roomId;
        const room = res.room || {};
        if (room.gameStarted && room.activeGameId) {
          wx.navigateTo({ url: `/pages/game/game?gameId=${room.activeGameId}&roomId=${roomId}` });
        } else {
          wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}&isHost=false` });
        }
      }
    });
  }
});
