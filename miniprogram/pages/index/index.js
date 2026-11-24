// pages/index/index.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg, getSwitchColor, applyTheme, THEME_OPTIONS } = require('../../utils/theme.js');
const { DEFAULT_AVATAR } = require('../../utils/constants.js');
const { buildRoomTags } = require('../../utils/roomTags.js');

Page({
  data: {
    userInfo: { avatarUrl: '', nickName: '' },
    customNickName: '',
    currentRoom: null,
    ownedRoomId: '',

    themeClass: '',
    myRank: 0,
    champions: [],
    podium: [],
    championsLoaded: false,
    publicWinrate: true,
    compactGame: false,
    showWeirdSettings: false,
    showThemePicker: false,
    themeOptions: THEME_OPTIONS,
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
    roomSwitchLoading: false,
    roomPanX: 0,
    roomPanAnim: false,

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

  // 分享/入口进入房间：统一按游客处理，不调用 join
  _navigateRoomPage(roomId) {
    if (!roomId || this._roomNavigating) return;
    this._roomNavigating = true;
    wx.navigateTo({
      url: `/pages/room/room?roomId=${roomId}`,
      fail: () => {
        this._roomNavigating = false;
        wx.showToast({ title: '进入房间失败', icon: 'none' });
      }
    });
  },

  _navigateGamePage(roomId, gameId) {
    if (!gameId || this._roomNavigating) return;
    this._roomNavigating = true;
    const rid = roomId ? `&roomId=${roomId}` : '';
    wx.navigateTo({
      url: `/pages/game/game?gameId=${gameId}${rid}`,
      fail: () => {
        this._roomNavigating = false;
        wx.showToast({ title: '进入对局失败', icon: 'none' });
      }
    });
  },

  doShareJoinFromRoom(roomId) {
    this._navigateRoomPage(roomId);
  },

  // 直接分享的对局链接：游客只读查看；房间卡入口则先进入房间页
  doShareJoinFromGame(roomId, gameId) {
    this._navigateGamePage(roomId, gameId);
  },

  onReady() {
    this._measureMeeting();
  },

  onShow() {
    this._clearRoomPan(true);
    this._roomNavigating = false;
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
    // 返回本页时重新应用主题背景
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
    this._measureMeeting();
  },

  onHide() {
    this._clearRoomPan(true);
  },

  onUnload() {
    this._clearRoomPan(false);
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
  loadRoomList(options) {
    const opts = options || {};
    const minMs = opts.minMs || 0;
    const switchLoading = !!opts.switchLoading;
    const skipLoadingState = !!opts.skipLoadingState;
    const seq = (this._roomSeq = (this._roomSeq || 0) + 1);
    const startedAt = Date.now();
    clearTimeout(this._roomLoadTimer);
    if (!skipLoadingState) {
      this.setData(switchLoading
        ? { roomSwitchLoading: true, roomListLoading: false }
        : { roomListLoading: true, roomSwitchLoading: false });
    }

    const finish = (rooms) => {
      if (seq !== this._roomSeq) return;
      this._allRooms = rooms;
      // 隐藏加载态与更新列表必须同帧完成，否则会闪出旧卡片
      this._applyRoomData({ roomListLoading: false, roomSwitchLoading: false });
    };
    const finishWithMin = (rooms) => {
      const wait = Math.max(0, minMs - (Date.now() - startedAt));
      if (wait > 0) this._roomLoadTimer = setTimeout(() => finish(rooms), wait);
      else finish(rooms);
    };

    api.getPublicRooms().then(res => finishWithMin((res && res.rooms) || []))
      .catch(() => finishWithMin([]));
  },

  _applyRoomData(extra) {
    const all = this._allRooms || [];
    const myId = this.data.currentRoom ? this.data.currentRoom.roomId : '';
    const myOpenId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
    const mySeat = this.data.currentRoom && this.data.currentRoom.seatNumber != null
      ? this.data.currentRoom.seatNumber : null;
    const expanded = this._expandedTags || {};
    const mapped = all.map(r => {
      const showAllTags = !!expanded[r.roomId];
      const isMine = r.roomId === myId;
      const isMineHost = !!myOpenId && r.ownerId === myOpenId;
      const full = r.maxPlayers > 0 && r.playerCount >= r.maxPlayers;
      let statusText = '准备中';
      let statusClass = 'room-status-wait';
      if (r.gameStarted) {
        statusText = '游戏中';
        statusClass = 'room-status-ingame';
      } else if (full) {
        statusText = '即将开始';
        statusClass = 'room-status-soon';
      }
      let identityText = '';
      let identityClass = '';
      if (isMine) {
        if (isMineHost) { identityText = '房主'; identityClass = 'room-status-host'; }
        else if (mySeat === -1) { identityText = '观众'; identityClass = 'room-status-spectator'; }
        else if (mySeat === 0) { identityText = '等待'; identityClass = 'room-status-waiting'; }
        else if (mySeat >= 1) { identityText = '玩家'; identityClass = 'room-status-player'; }
      }
      if (!identityText && isMineHost) {
        identityText = '房主';
        identityClass = 'room-status-host';
      }
      return {
        ...r,
        isMine,
        isMineHost,
        isPinned: isMine || isMineHost,
        statusText,
        statusClass,
        identityText,
        identityClass,
        showAllTags,
        displayTags: showAllTags ? (r.tags || []) : (r.tags || []).slice(0, 3)
      };
    });
    // 当前成员房间最优先，其次自己拥有的房间；其余保持服务端 updated_at 倒序
    const pinRank = r => (r.isMine ? 2 : (r.isMineHost ? 1 : 0));
    mapped.sort((a, b) => pinRank(b) - pinRank(a));
    const waiting = mapped.filter(r => !r.gameStarted).length;
    const playing = mapped.length - waiting;
    const wantPlaying = this.data.roomTab === 'playing';
    const visibleRooms = mapped.filter(r => !!r.gameStarted === wantPlaying);
    this.setData({
      publicRooms: mapped,
      roomCounts: { waiting, playing },
      visibleRooms,
      ...(extra || {})
    });
  },

  // 原子切换：标签 + 三点加载态（滑动时同时复位面板），避免闪出旧列表
  _switchToTab(tab, resetPan) {
    const patch = { roomTab: tab, roomSwitchLoading: true, roomListLoading: false };
    if (resetPan) {
      patch.roomPanAnim = false;
      patch.roomPanX = 0;
    }
    this.setData(patch);
    this.loadRoomList({ minMs: 500, switchLoading: true, skipLoadingState: true });
  },

  switchRoomTab(e) {
    if (this._roomAnimating || this.data.roomSwitchLoading) return;
    const tab = e.currentTarget.dataset.tab === 'playing' ? 'playing' : 'waiting';
    if (tab === this.data.roomTab) {
      this.loadRoomList();
      return;
    }
    this._switchToTab(tab, false);
  },

  // 房间列表左右滑动切换：内容面板跟手，松手仅滑出
  onRoomTouchStart(e) {
    if (this._roomAnimating || this.data.roomSwitchLoading) return;
    clearTimeout(this._roomPanTimer);
    const t = e.touches && e.touches[0];
    if (!t) { this._roomPanStart = null; return; }
    let W = 375;
    try {
      const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
      W = (info && info.windowWidth) || 375;
    } catch (err) { /* 取不到时用默认宽度 */ }
    this._roomW = W;
    this._roomPanStart = { x: t.clientX, y: t.clientY };
    this._roomPanLocked = false;
    this._roomPanIgnore = false;
    this._roomSwipeMoved = false;
    this._roomPanLastSet = 0;
    if (this.data.roomPanAnim || this.data.roomPanX) {
      this.setData({ roomPanAnim: false, roomPanX: 0 });
    }
  },

  onRoomTouchMove(e) {
    if (this._roomAnimating || this._roomPanIgnore || this.data.roomSwitchLoading) return;
    const s = this._roomPanStart;
    const t = e.touches && e.touches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    if (!this._roomPanLocked) {
      // 提高横滑判定阈值，避免点击时轻微抖动手势被当成滑动
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this._roomPanLocked = true;
      } else if (Math.abs(dy) > 10) {
        this._roomPanIgnore = true; // 纵向滚动，不拦截
        return;
      } else {
        return;
      }
    }

    if (Math.abs(dx) > 24) this._roomSwipeMoved = true;
    const W = this._roomW || 375;
    const target = dx < 0 ? 'playing' : 'waiting';
    let x = target === this.data.roomTab ? dx * 0.35 : dx; // 边缘阻尼
    const max = W * 0.9;
    if (x > max) x = max;
    if (x < -max) x = -max;

    const now = Date.now();
    if (now - (this._roomPanLastSet || 0) < 16) return;
    this._roomPanLastSet = now;
    this.setData({ roomPanX: x });
  },

  onRoomTouchEnd(e) {
    if (this._roomAnimating || this.data.roomSwitchLoading) return;
    const s = this._roomPanStart;
    this._roomPanStart = null;
    this._roomPanLocked = false;
    if (!s) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) { this._resetRoomPan(); return; }
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const horizontal = !this._roomPanIgnore && Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.2;
    const target = dx < 0 ? 'playing' : 'waiting';
    if (horizontal && target !== this.data.roomTab) {
      this._animateRoomSwitch(target, dx < 0 ? -1 : 1);
      return;
    }
    this._roomSwipeMoved = false;
    this._resetRoomPan();
  },

  onRoomTouchCancel() {
    if (this._roomAnimating || this.data.roomSwitchLoading) return;
    this._roomPanStart = null;
    this._roomPanLocked = false;
    this._resetRoomPan();
  },

  _resetRoomPan() {
    clearTimeout(this._roomPanTimer);
    this.setData({ roomPanAnim: true, roomPanX: 0 });
    this._roomPanTimer = setTimeout(() => {
      this._roomAnimating = false;
      this._roomSwipeMoved = false;
      this.setData({ roomPanAnim: false });
    }, 200);
  },

  // 仅切出：当前面板滑出后立即归位，切换标签并进入最短 0.5s 的加载态
  _animateRoomSwitch(tab, dir) {
    clearTimeout(this._roomPanTimer);
    this._roomAnimating = true;
    this._roomSwipeMoved = true;
    const W = this._roomW || 375;
    this.setData({ roomPanAnim: true, roomPanX: dir * W });
    this._roomPanTimer = setTimeout(() => {
      this._roomAnimating = false;
      this._roomSwipeMoved = false;
      this._switchToTab(tab, true);
    }, 180);
  },

  _clearRoomPan(applyData) {
    clearTimeout(this._roomPanTimer);
    clearTimeout(this._roomLoadTimer);
    this._roomAnimating = false;
    this._roomSwipeMoved = false;
    this._roomPanStart = null;
    this._roomPanLocked = false;
    this._roomPanIgnore = false;
    if (applyData && (this.data.roomPanX || this.data.roomPanAnim || this.data.roomSwitchLoading)) {
      this.setData({ roomPanX: 0, roomPanAnim: false, roomSwitchLoading: false });
    }
  },

  toggleRoomTags(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (!this._expandedTags) this._expandedTags = {};
    this._expandedTags[id] = !this._expandedTags[id];
    this._applyRoomData();
  },

  // 点击公开房间卡：先以游客进入房间页；不调用 join
  onPublicRoomTap(e) {
    if (this._roomNavigating) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.currentRoom && this.data.currentRoom.roomId === id) {
      this.backToRoom();
      return;
    }
    this._navigateRoomPage(id);
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
      if (res && res.success) {
        this.setData({
          currentRoom: res.room || null,
          ownedRoomId: res.ownedRoomId || ''
        });
        this._applyRoomData();
      }
    }).catch(() => {});
  },

  backToRoom() {
    const room = this.data.currentRoom;
    if (!room || this._roomNavigating) return;
    this._roomNavigating = true;
    const url = (room.gameStarted && room.gameId)
      ? `/pages/game/game?gameId=${room.gameId}&roomId=${room.roomId}`
      : `/pages/room/room?roomId=${room.roomId}`;
    wx.navigateTo({
      url,
      fail: () => {
        this._roomNavigating = false;
        wx.showToast({ title: '进入房间失败', icon: 'none' });
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
    this.setData({ showThemePicker: true, showWeirdSettings: false });
  },
  closeThemePicker() {
    this.setData({ showThemePicker: false });
  },
  selectTheme(e) {
    const index = Number(e.currentTarget.dataset.index);
    const opt = THEME_OPTIONS[index];
    if (!opt) return;
    applyTheme(opt.key);
    // 保持弹窗打开，方便连续切换预览；当前标记随 themeClass 更新
    this.setData({ themeClass: opt.key, switchColor: getSwitchColor(opt.key) });
  },

  showWeirdSettings() {
    this.setData({ showWeirdSettings: true, showThemePicker: false });
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
    if (this.data.ownedRoomId) {
      wx.showModal({
        title: '已有房间',
        content: '你已有一个房间，请先解散原房间',
        confirmText: '进入房间',
        cancelText: '取消',
        success: (r) => {
          if (!r.confirm) return;
          if (this.data.currentRoom && this.data.currentRoom.roomId === this.data.ownedRoomId) {
            this.backToRoom();
          } else {
            this._navigateRoomPage(this.data.ownedRoomId);
          }
        }
      });
      return;
    }

    const cur = this.data.currentRoom;
    if (cur) {
      if (cur.gameStarted && cur.seatNumber >= 1) {
        wx.showModal({
          title: '游戏进行中',
          content: '当前对局尚未结束，无法退出后召开新会议',
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      wx.showModal({
        title: '召开会议',
        content: `将退出当前房间 ${cur.roomId} 后召开新会议，是否继续？`,
        confirmText: '继续',
        success: (r) => {
          if (!r.confirm) return;
          wx.showLoading({ title: '退出房间...', mask: true });
          api.leaveRoom(cur.roomId).then(leave => {
            if (!leave.success) throw new Error((leave && leave.message) || '退出房间失败');
            this.setData({ currentRoom: null });
            this._applyRoomData();
            wx.hideLoading();
            this._openConfigsPage();
          }).catch(err => {
            wx.hideLoading();
            wx.showModal({
              title: '无法召开会议',
              content: (err && err.message) || '退出当前房间失败',
              showCancel: false
            });
          });
        }
      });
      return;
    }

    this._openConfigsPage();
  },

  _openConfigsPage() {
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

  // 手输会议 ID：以游客进入房间页，不调用 join
  doJoinRoom(roomId) {
    this._navigateRoomPage(roomId);
  }
});
