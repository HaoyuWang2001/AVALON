// pages/room/room.js
const app = getApp();
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { buildConfigSummary } = require('../../utils/configSummary.js');

const {
  CONFIG_GOOD_ROLES, CONFIG_EVIL_ROLES, CONFIG_FORCED_ROLES, ROLE_NAMES_SHORT,
  DEFAULT_CONFIGS, SPEECH_OPTIONS, ROUND_OPTIONS, VOTE_OPTIONS, VOTE_REVEAL_OPTIONS,
  TEAM_SIZES, buildDefaultRule
} = require('../../utils/constants.js');

Page({
  data: {
    themeClass: '',
    roomId: '',
    playerCount: 0,
    players: [],
    seatedPlayers: [],
    spectatorPlayers: [],
    readyPlayers: [],
    roomInfo: null,
    currentUser: null,
    gameStarted: false,
    canStartGame: false,
    startHint: '',
    seatsFull: false,
    currentUserReady: false,
    showBottomBar: false,
    roomLoading: true,
    readyCharging: false,
    readyProgress: 0,
    readyCharged: false,
    startGameCharging: false,
    startGameProgress: 0,
    startGameCharged: false,
    startGameLaunching: false,
    dissolving: false,
    spectatorAllowed: true,

    showConfigView: false,
    configSummary: null,
    summaryLady: '',

    showLaunchAnimModal: false,
    launchAnim: 'A',
    launchAnimIndex: 0,
    launchAnimOptions: ['A', 'B', 'C', 'D', 'E']
  },

  onLoad(options) {
    const { roomId } = options;
    const launchAnim = wx.getStorageSync('avalon_launch_anim') || 'A';
    const tc = getThemeClass();
    this.setData({
      themeClass: tc,
      roomId: roomId || '',
      launchAnim: launchAnim,
      launchAnimIndex: this.data.launchAnimOptions.indexOf(launchAnim) >= 0 ? this.data.launchAnimOptions.indexOf(launchAnim) : 0
    });
    this.initRoomPolling();
    this._loadFriendSet();
    // 开启原生分享：发送给朋友 + 分享到朋友圈
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  // 缓存好友 openId 集合（玩家信息底部框判断是否好友用）
  _loadFriendSet() {
    const openId = app.globalData.openId;
    if (!openId) { this._friendSet = new Set(); return; }
    api.getFriends(openId).then(res => {
      this._friendSet = new Set((res && res.friends || []).map(f => f.openId));
    }).catch(() => { this._friendSet = new Set(); });
  },

  onShow() {
    if (this.data.roomId) this.fetchRoomInfo();
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
  },

  onUnload() {
    if (this.roomPolling) clearInterval(this.roomPolling);
    if (this._startGameTimer) clearInterval(this._startGameTimer);
    if (this._readyTimer) clearInterval(this._readyTimer);
    this._stopVibration();
    if (this._launchTimer) clearTimeout(this._launchTimer);
    if (this.leaving) this.leaveRoom();
  },

  onShareAppMessage() {
    return {
      title: '加入我的阿瓦隆房间',
      path: `/pages/index/index?roomId=${this.data.roomId}`
    };
  },

  onShareTimeline() {
    return {
      title: '加入我的阿瓦隆房间',
      query: `roomId=${this.data.roomId}`
    };
  },

  _guard() {
    if (this._busy) return false;
    this._busy = true;
    setTimeout(() => { this._busy = false; }, 500);
    return true;
  },

  initRoomPolling() {
    this.roomPolling = setInterval(() => { this.fetchRoomInfo(); }, 1000);
  },

  fetchRoomInfo() {
    api.getRoom(this.data.roomId).then(res => {
      if (res.success && res.room) {        const room = res.room;
        const players = room.players || [];
        const readyPlayers = room.readyPlayers || [];
        const currentUser = players.find(p => p.openId === app.globalData.openId);

        let playerCount = 0;
        if (room.roomConfig && room.roomConfig.roles) {
          const good = room.roomConfig.roles.good || [];
          const evil = room.roomConfig.roles.evil || [];
          playerCount = good.length + evil.length;
        }

        let spectatorAllowed = true;
        if (room.roomConfig && room.roomConfig.spectator) {
          spectatorAllowed = room.roomConfig.spectator.allow !== false;
        }

        const seatedPlayers = players.filter(p => p.seatNumber >= 1).sort((a, b) => a.seatNumber - b.seatNumber);
        const spectatorPlayers = players.filter(p => p.seatNumber === -1);
        const seatedSeats = new Set(seatedPlayers.map(p => p.seatNumber));

        const seats = [];
        for (let i = 1; i <= playerCount; i++) {
          const player = seatedPlayers.find(p => p.seatNumber === i);
          const isReady = player ? readyPlayers.includes(player.openId) : false;
          seats.push({
            number: i,
            player: player || null,
            occupied: !!player,
            isReady: isReady,
            isHost: player ? player.isHost : false,
            isSelf: player ? player.openId === (currentUser ? currentUser.openId : '') : false
          });
        }

        const wasGameStarted = this.data.gameStarted;

        this.setData({
          roomInfo: room,
          players: players,
          playerCount: playerCount,
          seatedPlayers: seatedPlayers,
          spectatorPlayers: spectatorPlayers,
          readyPlayers: readyPlayers,
          currentUser: currentUser,
          isHost: room.ownerId === app.globalData.openId,
          gameStarted: room.gameStarted || false,
          seatedSeats: seats,
          spectatorAllowed: spectatorAllowed,
          seatsFull: seats.length > 0 && seats.every(s => s.occupied),
          currentUserReady: currentUser ? readyPlayers.includes(currentUser.openId) : false,
          showBottomBar: (room.ownerId === app.globalData.openId) || !!(currentUser && currentUser.seatNumber >= 1),
          roomLoading: false
        });

        let canStart = playerCount > 0;
        let hint = '';
        if (seats.some(s => !s.occupied)) {
          canStart = false;
          hint = '入座区未坐满';
        } else if (seats.some(s => s.occupied && !s.isReady)) {
          canStart = false;
          const unready = seats.filter(s => s.occupied && !s.isReady).map(s => s.number + '号').join('、');
          hint = unready + ' 未准备';
        }
        this.setData({ canStartGame: canStart, startHint: hint });

        if (room.gameStarted && !wasGameStarted && currentUser && currentUser.seatNumber >= 1) {
          // 开局信号：全员播放各自所选入场动画（5s），结束后进入游戏页
          this.setData({ startGameLaunching: true, dissolving: false, startGameProgress: 0 });
          this._launchGameId = room.activeGameId;
          if (this._launchTimer) clearTimeout(this._launchTimer);
          this._launchTimer = setTimeout(() => {
            wx.redirectTo({ url: `/pages/game/game?gameId=${this._launchGameId}&roomId=${this.data.roomId}` });
          }, 5000);
        }
      } else {
        this.setData({ roomLoading: false });
        const msg = (res && res.message) || '';
        if (msg.includes('房间不存在')) {
          // 房间不存在：停止轮询 + 回首页
          this.handleRoomGone();
        } else {
          wx.showToast({ title: '会议已解散', icon: 'error' });
          setTimeout(() => { wx.navigateBack(); }, 1500);
        }
      }
    }).catch(() => {
      this.setData({ roomLoading: false });
    });
  },

  // 房间不存在：停止轮询 + 提示 + 回首页
  handleRoomGone() {
    if (this.roomPolling) { clearInterval(this.roomPolling); this.roomPolling = null; }
    wx.showToast({ title: '房间不存在', icon: 'none' });
    setTimeout(() => { wx.reLaunch({ url: '/pages/index/index' }); }, 1200);
  },

  // ─── Seat actions ───

  _enterJoinedRoom(room) {
    const r = room || this.data.roomInfo || {};
    if (r.gameStarted && r.activeGameId) {
      wx.redirectTo({ url: `/pages/game/game?gameId=${r.activeGameId}&roomId=${this.data.roomId}` });
      return;
    }
    this.fetchRoomInfo();
  },

  // 游客入座/观战：调用 join；已在其他房间时询问是否退出旧房间
  _joinAsVisitor(seatNumber, keepLoading) {
    if (!keepLoading) wx.showLoading({ title: seatNumber === -1 ? '进入观战区...' : '入座中...', mask: true });
    api.joinRoom(this.data.roomId, seatNumber, this.data.userInfo || {}).then(res => {
      if (!res.success) throw new Error((res && res.message) || '加入失败');
      this._enterJoinedRoom(res.room);
    }).catch(err => {
      const msg = (err && err.message) || '加入失败';
      if (msg.includes('已在其他房间') || msg.includes('已在房间中')) {
        this._confirmSwitchRoom(seatNumber);
        return;
      }
      wx.hideLoading();
      wx.showToast({ title: msg, icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  _confirmSwitchRoom(seatNumber) {
    api.getCurrentRoom(app.globalData.openId).then(res => {
      const cur = res && res.room;
      if (cur && cur.gameStarted && cur.seatNumber >= 1) {
        wx.hideLoading();
        wx.showToast({ title: '游戏进行中，无法退出当前房间', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '已在其他房间',
        content: '退出当前房间并加入？',
        confirmText: '退出并加入',
        success: r => {
          if (!r.confirm) { wx.hideLoading(); return; }
          if (!cur || !cur.roomId) {
            this._joinAsVisitor(seatNumber);
            return;
          }
          wx.showLoading({ title: '退出并加入...', mask: true });
          api.leaveRoom(cur.roomId).then(leave => {
            if (!leave.success) throw new Error((leave && leave.message) || '退出房间失败');
            this._joinAsVisitor(seatNumber, true);
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '退出房间失败', icon: 'none' });
          });
        }
      });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '加入失败', icon: 'none' });
    });
  },

  takeSeat(e) {
    const seatNum = Number(e.currentTarget.dataset.seat);
    if (!seatNum) return;
    if (!this.data.currentUser) {
      this._joinAsVisitor(seatNum);
      return;
    }
    if (!this._guard()) return;
    wx.showLoading({ title: '入座中...', mask: true });
    api.updateSeatNumber(this.data.roomId, seatNum).then(() => {
      this.fetchRoomInfo();
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '入座失败', icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  becomeSpectator() {
    if (!this.data.currentUser) {
      this._joinAsVisitor(-1);
      return;
    }
    if (!this._guard()) return;
    wx.showLoading({ title: '进入观战区...', mask: true });
    api.updateSeatNumber(this.data.roomId, -1).then(() => {
      this._enterJoinedRoom(this.data.roomInfo);
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  // ─── Ready / Start / Disband ───

  setReady(value) {
    // 使用独立的准备锁：不占用 _guard 的 500ms 定时锁，
    // 避免刚变为已准备后立即点击取消被误拦截。
    if (this._readyBusy) return;
    this._readyBusy = true;
    wx.showLoading({ title: '请稍候...', mask: true });
    api.toggleReady(this.data.roomId, !!value).then(() => {
      this.fetchRoomInfo();
    }).finally(() => {
      this._readyBusy = false;
      wx.hideLoading();
    });
  },

  // ─── 低频振动（长按充电期间） ───
  _vibeOnce() {
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (e) {
      try { wx.vibrateShort(); } catch (e2) {}
    }
  },
  _startVibration() {
    if (this._vibeTimer) return;
    this._vibeOnce();
    this._vibeTimer = setInterval(() => this._vibeOnce(), 180);
  },
  _stopVibration() {
    if (this._vibeTimer) { clearInterval(this._vibeTimer); this._vibeTimer = null; }
  },

  // ─── 准备长按（1s）：未准备长按满格松手→准备；已准备点击→取消 ───
  onReadyTouchStart() {
    // 这里只是 UI 读条/记录取消意图，不能占用 _guard 的 500ms 网络锁，
    // 否则快速点击「已准备·点击取消」时 touchend 会被 _busy 拦截。
    if (this.data.currentUserReady) { this._readyTapCancel = true; return; }
    if (this._readyTimer || this.data.readyCharged || this.data.readyCharging) return;
    this._readyTapCancel = false;
    this.setData({ readyCharging: true, readyCharged: false, readyProgress: 0 });
    this._startVibration();
    let p = 0;
    this._readyTimer = setInterval(() => {
      p += 2;
      if (p >= 100) {
        clearInterval(this._readyTimer);
        this._readyTimer = null;
        this.setData({ readyProgress: 100, readyCharged: true });
      } else {
        this.setData({ readyProgress: p });
      }
    }, 20);
  },

  onReadyTouchEnd() {
    if (this.data.currentUserReady) {
      if (this._readyTapCancel) {
        this._readyTapCancel = false;
        this.setReady(false);
      }
      return;
    }
    this._stopVibration();
    if (this._readyTimer) { clearInterval(this._readyTimer); this._readyTimer = null; }
    if (this.data.readyCharged) this.setReady(true);
    this.setData({ readyCharging: false, readyCharged: false, readyProgress: 0 });
  },

  onReadyTouchCancel() {
    this._readyTapCancel = false;
    this._stopVibration();
    if (this._readyTimer) { clearInterval(this._readyTimer); this._readyTimer = null; }
    this.setData({ readyCharging: false, readyCharged: false, readyProgress: 0 });
  },

  startGame() {
    if (!this._guard()) return;
    const { roomId, canStartGame } = this.data;
    if (!canStartGame) return;
    wx.showLoading({ title: '准备中...' });
    api.startGame(roomId).then(result => {
      wx.hideLoading();
      if (result.success) {
        // 开局请求成功：由 fetchRoomInfo 检测 gameStarted 跃迁，触发全员入场动画并跳转
      }
    }).catch(() => {
      wx.hideLoading(); wx.showToast({ title: '开始失败', icon: 'error' });
      this.setData({ dissolving: false, startGameProgress: 0 });
    });
  },

  // 长按开始游戏：按下读条（2s），满格后按住保持呼吸；松手立即提交开局，按钮溶解作为反馈，
  // 全员在轮询检测到 gameStarted 跃迁时播放各自所选 5s 入场动画后跳转
  onStartGameTouchStart() {
    if (!this.data.canStartGame) return;
    if (this._startGameTimer || this.data.startGameCharged || this.data.startGameLaunching || this.data.dissolving) return;
    this.setData({ startGameCharging: true, startGameCharged: false, startGameProgress: 0 });
    this._startVibration();
    let p = 0;
    this._startGameTimer = setInterval(() => {
      p += 1;
      if (p >= 100) {
        clearInterval(this._startGameTimer);
        this._startGameTimer = null;
        // 满格：仍按住 → 按钮进入呼吸动画，等待松手
        this.setData({ startGameProgress: 100, startGameCharged: true });
      } else {
        this.setData({ startGameProgress: p });
      }
    }, 20);
  },

  onStartGameTouchEnd() {
    this._stopVibration();
    if (this.data.startGameLaunching) return;
    if (this._startGameTimer) { clearInterval(this._startGameTimer); this._startGameTimer = null; }
    if (this.data.startGameCharged) {
      // 已满格松手：立即提交开局，按钮扭曲淡出作为提交反馈（保持到入场动画覆盖）
      this.setData({ startGameCharging: false, startGameCharged: false, startGameProgress: 100, dissolving: true });
      this.startGame();
    } else {
      this.setData({ startGameCharging: false, startGameCharged: false, startGameProgress: 0 });
    }
  },

  onStartGameTouchCancel() {
    this._stopVibration();
    if (this.data.startGameLaunching) return;
    if (this._startGameTimer) { clearInterval(this._startGameTimer); this._startGameTimer = null; }
    this.setData({ startGameCharging: false, startGameCharged: false, startGameProgress: 0, dissolving: false });
  },

  // ─── 启动动画选择（房主） ───
  openLaunchAnimModal() {
    this.setData({ showLaunchAnimModal: true });
  },

  closeLaunchAnimModal() {
    this.setData({ showLaunchAnimModal: false });
  },

  onLaunchAnimPick(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    if (index >= 0 && index < this.data.launchAnimOptions.length) {
      this.setData({ launchAnimIndex: index });
    }
  },

  confirmLaunchAnim() {
    const key = this.data.launchAnimOptions[this.data.launchAnimIndex];
    wx.setStorageSync('avalon_launch_anim', key);
    this.setData({ launchAnim: key, showLaunchAnimModal: false });
    wx.showToast({ title: '已选择 ' + key, icon: 'none' });
  },

  disbandRoom() {
    if (!this._guard()) return;
    wx.showModal({
      title: '解散房间',
      content: '确定解散房间吗？所有玩家将被移出。',
      success: (res) => {
        if (res.confirm) {
          this.leaving = true;
          api.disbandRoom(this.data.roomId).then(() => {
            wx.showToast({ title: '已解散', icon: 'success' });
            wx.reLaunch({ url: '/pages/index/index' });
          }).catch(() => wx.showToast({ title: '解散失败', icon: 'error' }));
        }
      }
    });
  },

  randomShuffleSeats() {
    if (!this._guard()) return;
    if (!this.data.seatsFull) {
      wx.showToast({ title: '上座区未坐满', icon: 'none' });
      return;
    }
    api.randomSeats(this.data.roomId).catch(() => {});
  },

  // ─── Player Actions ───

  onSeatRowTap(e) {
    const { id, seat } = e.currentTarget.dataset;
    // 已坐玩家：点击弹出玩家胜率弹窗
    if (id) { this.openPlayerStats(id); return; }
    // 空座位：游客/观战者/未准备玩家点击即可入座
    if (!id && seat) {
      const cu = this.data.currentUser;
      if (cu && cu.seatNumber >= 1 && this.data.currentUserReady) return;
      this.takeSeat({ currentTarget: { dataset: { seat } } });
    }
  },

  // 等待区/观战区/座位：点击玩家 → 玩家胜率弹窗
  onPlayerTap(e) {
    const { id } = e.currentTarget.dataset;
    if (id) this.openPlayerStats(id);
  },

  openPlayerStats(openId) {
    const comp = this.selectComponent('#playerStats');
    if (!comp || !openId) return;
    const p = (this.data.players || []).find(x => x.openId === openId) || {};
    comp.open({
      openId,
      nickName: p.nickName || p.wxNickName || '玩家',
      avatarUrl: p.avatarUrl || '',
      isFriend: !!(this._friendSet && this._friendSet.has(openId)),
      isSelf: openId === app.globalData.openId
    });
  },

  onPlayerAction(e) {
    const playerId = e.currentTarget.dataset.id;
    if (!playerId) return;
    const player = this.data.players.find(p => p.openId === playerId);
    if (!player) return;
    const myOpenId = app.globalData.openId;
    const roomId = this.data.roomId;

    // 房主长按自己：下座 / 退出观战，保留房主身份
    if (player.openId === myOpenId) {
      if (!this.data.isHost || (player.seatNumber !== -1 && player.seatNumber < 1)) return;
      const label = player.seatNumber === -1 ? '退出观战（保留房主）' : '下座（保留房主）';
      wx.showModal({
        title: label,
        content: '将退出当前房间成员关系，但仍保留该房间的房主权限。',
        success: r => {
          if (!r.confirm) return;
          wx.showLoading({ title: '处理中...', mask: true });
          api.leaveRoom(roomId).then(() => {
            this.fetchRoomInfo();
          }).catch(err => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          }).finally(() => wx.hideLoading());
        }
      });
      return;
    }

    if (!this.data.isHost) return;
    const name = player.nickName || player.wxNickName || '玩家';
    wx.showActionSheet({
      itemList: ['踢出房间', '转让房主'],
      success: res => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '踢出房间',
            content: `确定将 ${name} 踢出房间吗？`,
            success: r => { if (r.confirm) api.kickPlayer(roomId, playerId).catch(() => {}); }
          });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '转让房主',
            content: `确定将房主转让给 ${name} 吗？转让后你将失去房主权限。`,
            success: r => {
              if (r.confirm) {
                api.transferOwner(roomId, playerId).then(() => {
                  wx.showToast({ title: '已转让', icon: 'success' });
                }).catch(() => {});
              }
            }
          });
        }
      }
    });
  },

  leaveRoom() {
    api.leaveRoom(this.data.roomId).catch(() => {});
  },

  exitRoom() {
    if (!this.data.currentUser) {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) });
      return;
    }
    if (!this._guard()) return;
    wx.showModal({
      title: '退出房间',
      content: '确定退出当前房间吗？',
      success: (res) => {
        if (res.confirm) {
          this.leaving = true;
          api.leaveRoom(this.data.roomId).catch(() => {});
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  },

  // 只读配置缩略（所有人可见）
  openConfigView() {
    const room = this.data.roomInfo;
    if (!room || !room.roomConfig) {
      wx.showToast({ title: '暂无配置', icon: 'none' });
      return;
    }
    this.setData({
      showConfigView: true,
      configSummary: buildConfigSummary(room.roomConfig)
    });
  },

  closeConfigView() {
    this.setData({ showConfigView: false });
  },

  noop() {},

  backToLobby() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  // 修改配置：跳转独立配置页（无状态，每次从 roomConfig 初始化）
  modifyConfig() {
    const rc = this.data.roomInfo && this.data.roomInfo.roomConfig;
    if (!rc) { wx.showToast({ title: '房间信息未就绪', icon: 'none' }); return; }
    if (this.roomPolling) { clearInterval(this.roomPolling); this.roomPolling = null; }
    wx.navigateTo({
      url: '/pages/configs/configs?mode=update&roomId=' + this.data.roomId,
      events: {
        // 保存成功 → 恢复轮询 + 刷新房间
        submit: () => {
          this.initRoomPolling();
          this.fetchRoomInfo();
          wx.showToast({ title: '已保存', icon: 'success' });
        },
        // 取消（返回/手势返回）→ 恢复轮询
        cancel: () => {
          this.initRoomPolling();
        }
      },
      success: (res) => {
        res.eventChannel.emit('init', { roomConfig: rc });
      }
    });
  },

});
