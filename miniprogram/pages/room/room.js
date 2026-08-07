// pages/room/room.js
const app = getApp();
const api = require('../../services/api.js');
const { buildConfigSummary } = require('../../utils/configSummary.js');

const {
  CONFIG_GOOD_ROLES, CONFIG_EVIL_ROLES, CONFIG_FORCED_ROLES, ROLE_NAMES_SHORT,
  DEFAULT_CONFIGS, SPEECH_OPTIONS, ROUND_OPTIONS, VOTE_OPTIONS, VOTE_REVEAL_OPTIONS,
  TEAM_SIZES, buildDefaultRule
} = require('../../utils/constants.js');

Page({
  data: {
    roomId: '',
    playerCount: 0,
    players: [],
    seatedPlayers: [],
    unseatedPlayers: [],
    spectatorPlayers: [],
    readyPlayers: [],
    roomInfo: null,
    currentUser: null,
    gameStarted: false,
    canStartGame: false,
    startHint: '',
    seatsFull: false,
    currentUserReady: false,
    startGameCharging: false,
    startGameProgress: 0,
    startGameCharged: false,
    startGameLaunching: false,
    dissolving: false,
    spectatorMax: 0,
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
    this.setData({
      roomId: roomId || '',
      launchAnim: launchAnim,
      launchAnimIndex: this.data.launchAnimOptions.indexOf(launchAnim) >= 0 ? this.data.launchAnimOptions.indexOf(launchAnim) : 0
    });
    this.initRoomPolling();
  },

  onShow() {
    if (this.data.roomId) this.fetchRoomInfo();
  },

  onUnload() {
    if (this.roomPolling) clearInterval(this.roomPolling);
    if (this._startGameTimer) clearInterval(this._startGameTimer);
    if (this._launchTimer) clearTimeout(this._launchTimer);
    if (this.leaving) this.leaveRoom();
  },

  onShareAppMessage() {
    return {
      title: '加入我的阿瓦隆房间',
      path: `/pages/index/index?roomId=${this.data.roomId}`
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

        let specMax = 0;
        let spectatorAllowed = true;
        if (room.roomConfig && room.roomConfig.spectator) {
          specMax = room.roomConfig.spectator.max || 0;
          spectatorAllowed = room.roomConfig.spectator.allow !== false;
        }

        const seatedPlayers = players.filter(p => p.seatNumber >= 1).sort((a, b) => a.seatNumber - b.seatNumber);
        const unseatedPlayers = players.filter(p => p.seatNumber === 0);
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
          unseatedPlayers: unseatedPlayers,
          spectatorPlayers: spectatorPlayers,
          readyPlayers: readyPlayers,
          currentUser: currentUser,
          isHost: room.ownerId === app.globalData.openId,
          gameStarted: room.gameStarted || false,
          seatedSeats: seats,
          spectatorMax: specMax,
          spectatorAllowed: spectatorAllowed,
          seatsFull: seats.length > 0 && seats.every(s => s.occupied),
          currentUserReady: currentUser ? readyPlayers.includes(currentUser.openId) : false
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

        if (room.gameStarted && !wasGameStarted) {
          // 开局信号：全员播放各自所选入场动画（5s），结束后进入游戏页
          this.setData({ startGameLaunching: true, dissolving: false, startGameProgress: 0 });
          this._launchGameId = room.activeGameId;
          if (this._launchTimer) clearTimeout(this._launchTimer);
          this._launchTimer = setTimeout(() => {
            wx.redirectTo({ url: `/pages/game/game?gameId=${this._launchGameId}&roomId=${this.data.roomId}` });
          }, 5000);
        }
      } else {
        const msg = (res && res.message) || '';
        if (msg.includes('房间不存在')) {
          // 房间不存在：停止轮询 + 回首页
          this.handleRoomGone();
        } else {
          wx.showToast({ title: '会议已解散', icon: 'error' });
          setTimeout(() => { wx.navigateBack(); }, 1500);
        }
      }
    }).catch(() => {});
  },

  // 房间不存在：停止轮询 + 提示 + 回首页
  handleRoomGone() {
    if (this.roomPolling) { clearInterval(this.roomPolling); this.roomPolling = null; }
    wx.showToast({ title: '房间不存在', icon: 'none' });
    setTimeout(() => { wx.reLaunch({ url: '/pages/index/index' }); }, 1200);
  },

  // ─── Seat actions ───

  takeSeat(e) {
    if (!this._guard()) return;
    const seatNum = e.currentTarget.dataset.seat;
    wx.showLoading({ title: '入座中...', mask: true });
    api.updateSeatNumber(this.data.roomId, seatNum).then(() => {
      this.fetchRoomInfo();
    }).finally(() => wx.hideLoading());
  },

  randomTakeSeat() {
    if (!this._guard()) return;
    if (!this.data.currentUser || this.data.currentUser.seatNumber >= 1) return;
    const occupiedSeats = new Set(this.data.seatedPlayers.map(p => p.seatNumber));
    const emptySeats = [];
    for (let i = 1; i <= this.data.playerCount; i++) {
      if (!occupiedSeats.has(i)) emptySeats.push(i);
    }
    if (emptySeats.length === 0) return;
    const seat = emptySeats[Math.floor(Math.random() * emptySeats.length)];
    wx.showLoading({ title: '入座中...', mask: true });
    api.updateSeatNumber(this.data.roomId, seat).then(() => {
      this.fetchRoomInfo();
    }).finally(() => wx.hideLoading());
  },

  leaveSeat() {
    if (!this._guard()) return;
    wx.showLoading({ title: '请稍候...', mask: true });
    api.updateSeatNumber(this.data.roomId, 0).then(() => {
      this.fetchRoomInfo();
    }).finally(() => wx.hideLoading());
  },

  becomeSpectator() {
    if (!this._guard()) return;
    wx.showLoading({ title: '请稍候...', mask: true });
    api.updateSeatNumber(this.data.roomId, -1).then(() => {
      this.fetchRoomInfo();
    }).finally(() => wx.hideLoading());
  },

  // ─── Ready / Start / Disband ───

  toggleReady() {
    if (!this._guard()) return;
    const isReady = this.data.readyPlayers.includes(app.globalData.openId);
    wx.showLoading({ title: '请稍候...', mask: true });
    api.toggleReady(this.data.roomId, !isReady).then(() => {
      this.fetchRoomInfo();
    }).finally(() => wx.hideLoading());
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
    // 空座位：点击入座；已坐玩家（有 id）：点击不触发操作，长按才弹操作面板
    if (!id && seat && this.data.currentUser && (this.data.currentUser.seatNumber < 1 || !this.data.currentUserReady)) {
      this.takeSeat({ currentTarget: { dataset: { seat } } });
    }
  },

  onPlayerAction(e) {
    if (!this.data.isHost) return;
    const playerId = e.currentTarget.dataset.id;
    if (!playerId) return;
    const player = this.data.players.find(p => p.openId === playerId);
    if (!player) return;
    if (player.openId === app.globalData.openId) return;
    const name = player.nickName || player.wxNickName || '玩家';
    const isBanned = player.bannedFromSeating;
    const roomId = this.data.roomId;

    wx.showActionSheet({
      itemList: ['踢出房间', isBanned ? '允许上座' : '禁止上座', '转让房主'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '踢出房间',
            content: `确定将 ${name} 踢出房间吗？`,
            success: (r) => { if (r.confirm) api.kickPlayer(roomId, playerId, 'room').catch(() => {}); }
          });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: isBanned ? '允许上座' : '禁止上座',
            content: `确定${isBanned ? '允许' : '禁止'} ${name} 上座吗？`,
            success: (r) => { if (r.confirm) api.banFromSeating(roomId, playerId, !isBanned).catch(() => {}); }
          });
        } else if (res.tapIndex === 2) {
          wx.showModal({
            title: '转让房主',
            content: `确定将房主转让给 ${name} 吗？转让后你将变为普通玩家。`,
            success: (r) => {
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

  // ─── Copy ───

  copyRoomId() {
    wx.setClipboardData({
      data: this.data.roomId,
      success: () => wx.showToast({ title: '会议ID已复制', icon: 'success' })
    });
  },

  leaveRoom() {
    api.leaveRoom(this.data.roomId).catch(() => {});
  },

  exitRoom() {
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

  // 修改配置：打开 configs 公共组件（无状态，每次从 roomConfig 初始化）
  modifyConfig() {
    if (this.roomPolling) clearInterval(this.roomPolling);
    this.selectComponent('#configs').open();
  },

  // 组件关闭（丢弃修改）→ 恢复轮询
  onConfigClosed() {
    this.initRoomPolling();
  },

  // 组件保存成功 → 恢复轮询 + 刷新房间
  onUpdated() {
    this.initRoomPolling();
    this.fetchRoomInfo();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

});
