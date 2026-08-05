// pages/room/room.js
const app = getApp();
const api = require('../../services/api.js');

const GOOD_ROLES = ['merlin', 'percival', 'lancelotBlue'];
const EVIL_ROLES = ['morgana', 'assassin', 'mordred', 'minion', 'oberon', 'lancelotRed'];
const FORCED_ROLES = ['merlin', 'percival', 'morgana'];

const ROLE_NAMES = {
  merlin: '梅林', percival: '派西', loyal: '忠臣',
  lancelotBlue: '蓝兰', lancelotRed: '红兰',
  morgana: '莫甘娜', assassin: '刺客', mordred: '莫德雷德',
  minion: '爪牙', oberon: '奥伯伦'
};

const DEFAULT_CONFIGS = {
  5:  { good: ['merlin','percival'], evil: ['morgana','assassin'] },
  6:  { good: ['merlin','percival'], evil: ['morgana','assassin'] },
  7:  { good: ['merlin','percival'], evil: ['morgana','assassin','oberon'] },
  8:  { good: ['merlin','percival'], evil: ['morgana','assassin','minion'] },
  9:  { good: ['merlin','percival'], evil: ['morgana','assassin','mordred'] },
  10: { good: ['merlin','percival'], evil: ['morgana','assassin','mordred','oberon'] },
  11: { good: ['merlin','percival'], evil: ['morgana','mordred','oberon','lancelotBlue','lancelotRed'] },
  12: { good: ['merlin','percival'], evil: ['morgana','assassin','mordred','oberon','lancelotBlue','lancelotRed'] }
};

const SPEECH_OPTIONS = ['不限', '30秒', '60秒', '90秒', '120秒', '150秒', '180秒'];
const ROUND_OPTIONS = ['不限', '30秒', '60秒', '90秒', '120秒'];
const VOTE_OPTIONS = ['不限', '15秒', '30秒', '45秒', '60秒'];

const TEAM_SIZES = {
  5: [2,3,2,3,3], 6: [2,3,4,3,4], 7: [2,3,3,4,4],
  8: [3,4,4,5,5], 9: [3,4,4,5,5], 10: [3,4,4,5,5],
  11: [3,4,5,6,6], 12: [3,4,5,6,6]
};

function buildDefaultRule() {
  return {
    evilKnowsEachOther: true, lancelotsKnowEachOther: false, lancelotSwapRound: 2,
    ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
    oberonMustFailMission: false, lancelotMustFail: false,
    voteVisibility: 'public', missionFailDetail: 'count',
    evilsKnowRedLancelot: true, oberonKnowsRedLancelot: true, merlinKnowsLancelotSide: true
  };
}

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
    spectatorMax: 0,
    spectatorAllowed: true,

    showConfig: false,
    logicalPage: 0,
    visiblePages: [0, 1, 4, 5],
    goodCount: 2,
    evilCount: 2,
    teamSizes: [3,4,4,5,5],

    selectedRoles: {
      merlin: true, percival: true, lancelotBlue: false,
      morgana: true, assassin: true, mordred: false,
      minion: false, oberon: false, lancelotRed: false
    },
    loyalCount: 0,
    roleWarning: '',

    rules: buildDefaultRule(),
    ladyOfTheLake: false,
    ladyOfTheLakeRound: 2,

    speechTimeoutIndex: 0,
    roundTimeoutIndex: 0,
    voteTimeoutIndex: 0,

    speechOptions: SPEECH_OPTIONS,
    roundOptions: ROUND_OPTIONS,
    voteOptions: VOTE_OPTIONS,

    roomName: '',
    roomDescription: 'Welcome Join the Conference!',
    tags: [],

    pageCount: 3,
    swiperPage: 0,

    allowSpectator: true,
    maxSpectators: '',
    spectatorLimited: false,
    spectatorLimitInvalid: false,

    goodRoleNames: '',
    evilRoleNames: '',
    summarySpeech: '',
    summarySpec: '',
    summaryLady: ''
  },

  onLoad(options) {
    const { roomId } = options;
    this.setData({
      roomId: roomId || ''
    });
    this.initRoomPolling();
  },

  onShow() {
    if (this.data.roomId) this.fetchRoomInfo();
  },

  onUnload() {
    if (this.roomPolling) clearInterval(this.roomPolling);
    if (this.leaving) this.leaveRoom();
  },

  onShareAppMessage() {
    return {
      title: '加入我的阿瓦隆房间',
      path: `/pages/room/room?roomId=${this.data.roomId}`
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
      if (res.success && res.room) {
        const room = res.room;
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
          this.navigatingToGame = true;
          wx.redirectTo({ url: `/pages/game/game?gameId=${room.activeGameId}&roomId=${this.data.roomId}` });
        }
      } else {
        wx.showToast({ title: '会议已解散', icon: 'error' });
        setTimeout(() => { wx.navigateBack(); }, 1500);
      }
    }).catch(() => {});
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
    wx.showModal({
      title: '开始游戏',
      content: '确定开始游戏吗？开始后不能再加入。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '准备中...' });
          api.startGame(roomId).then(result => {
            wx.hideLoading();
            if (result.success) {
              this.navigatingToGame = true;
              wx.redirectTo({ url: `/pages/game/game?gameId=${result.gameId}&roomId=${roomId}` });
            }
          }).catch(() => {
            wx.hideLoading(); wx.showToast({ title: '开始失败', icon: 'error' });
          });
        }
      }
    });
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
    if (!id && seat && this.data.currentUser && (this.data.currentUser.seatNumber < 1 || !this.data.currentUserReady)) {
      this.takeSeat({ currentTarget: { dataset: { seat } } });
      return;
    }
    this.onPlayerAction(e);
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

  // ─────────── Config Modal ───────────

  _applyConfig(rc) {
    const roles = rc.roles || { good: [], evil: [] };
    const n = (roles.good || []).length + (roles.evil || []).length;
    const selected = {};
    GOOD_ROLES.forEach(r => { selected[r] = (roles.good || []).includes(r); });
    EVIL_ROLES.forEach(r => { selected[r] = (roles.evil || []).includes(r); });
    FORCED_ROLES.forEach(r => { selected[r] = true; });

    const patch = { selectedRoles: selected, playerCount: n || 5 };

    if (rc.rules) {
      patch.rules = { ...this.data.rules, ...rc.rules };
      patch.ladyOfTheLake = !!rc.rules.ladyOfTheLake;
      patch.ladyOfTheLakeRound = rc.rules.ladyOfTheLakeRound || 2;
    }
    if (rc.spectator) {
      const max = rc.spectator.max || 0;
      patch.allowSpectator = rc.spectator.allow !== false;
      patch.spectatorLimited = max > 0;
      patch.maxSpectators = max > 0 ? max : '';
    }
    if (rc.meta) {
      patch.roomName = rc.meta.roomName || '';
      patch.roomDescription = rc.meta.roomDescription || '';
    }
    if (rc.limits) {
      const l = rc.limits;
      if (l.speechTimeout !== undefined) {
        const idx = SPEECH_OPTIONS.indexOf(l.speechTimeout === null ? '不限' : l.speechTimeout + '秒');
        if (idx >= 0) patch.speechTimeoutIndex = idx;
      }
      if (l.roundTimeout !== undefined) {
        const idx = ROUND_OPTIONS.indexOf(l.roundTimeout === null ? '不限' : l.roundTimeout + '秒');
        if (idx >= 0) patch.roundTimeoutIndex = idx;
      }
      if (l.voteTimeout !== undefined) {
        const idx = VOTE_OPTIONS.indexOf(l.voteTimeout === null ? '不限' : l.voteTimeout + '秒');
        if (idx >= 0) patch.voteTimeoutIndex = idx;
      }
    }

    this.setData(patch);
    this.computeAll();
  },

  openConfig() {
    const room = this.data.roomInfo;
    if (!room || !room.roomConfig) return;
    this._configSnapshot = JSON.parse(JSON.stringify(room.roomConfig));
    this._applyConfig(this._configSnapshot);
    this.setData({ logicalPage: 0, swiperPage: 0 });
    if (this.roomPolling) clearInterval(this.roomPolling);
    this.setData({ showConfig: true });
  },

  closeConfig() {
    if (this._configSnapshot) this._applyConfig(this._configSnapshot);
    this.initRoomPolling();
    this.setData({ showConfig: false });
  },

  finishConfig() {
    if (this.data.spectatorLimited) {
      const n = Number(this.data.maxSpectators);
      if (!n || n < 1 || n > 100) {
        this.setData({ spectatorLimitInvalid: true });
        wx.showToast({ title: '观战人数需在 1-100 之间', icon: 'none' });
        return;
      }
    }
    const config = this.getRoomConfig();
    wx.showLoading({ title: '保存中...', mask: true });
    api.updateRoomConfig(this.data.roomId, config).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this._configSnapshot = JSON.parse(JSON.stringify(config));
      this.initRoomPolling();
      this.setData({ showConfig: false });
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'error' });
    });
  },

  backToLobby() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  modifyConfig() {
    this.openConfig();
  },

  // ─────────── Page 1: Player Count + Roles ───────────

  onPlayerCountChange(e) {
    const n = parseInt(e.currentTarget.dataset.count);
    this.setData({ playerCount: n });
    this.applyDefaultConfig(n);
    this.computeAll();
  },

  applyDefaultConfig(n) {
    const def = DEFAULT_CONFIGS[n] || DEFAULT_CONFIGS[5];
    const selected = {};
    GOOD_ROLES.forEach(r => { selected[r] = false; });
    EVIL_ROLES.forEach(r => { selected[r] = false; });
    def.good.forEach(r => { if (r !== 'loyal') selected[r] = true; });
    def.evil.forEach(r => { selected[r] = true; });
    FORCED_ROLES.forEach(r => { selected[r] = true; });

    const rules = buildDefaultRule();
    const hasLancelot = selected.lancelotBlue || selected.lancelotRed;
    rules.lancelotMustFail = hasLancelot;
    rules.oberonMustFailMission = !hasLancelot;

    this.setData({
      selectedRoles: selected,
      rules: rules,
      ladyOfTheLake: n >= 10,
      ladyOfTheLakeRound: n >= 10 ? 2 : 2,
      speechTimeoutIndex: 0,
      roundTimeoutIndex: 0,
      voteTimeoutIndex: 0,
      goodCount: def.good.filter(r => r !== 'loyal').length + (def.good.includes('loyal') ? 0 : 0),
      evilCount: def.evil.length,
    });
  },

  onRoleToggle(e) {
    const role = e.currentTarget.dataset.role;
    const current = this.data.selectedRoles;
    // 梅林/派西/莫甘娜必选，不可点击取消
    if (current[role] && FORCED_ROLES.includes(role)) return;
    current[role] = !current[role];
    this.setData({ selectedRoles: current });
    this.computeAll();
  },

  // ─────────── Page 2: Must-Set Rules ───────────

  onRuleToggle(e) {
    const { field } = e.currentTarget.dataset;
    const rules = this.data.rules;
    rules[field] = !rules[field];
    this.setData({ rules });
  },

  onRulePicker(e) {
    const { field } = e.currentTarget.dataset;
    const rules = this.data.rules;
    const range = e.currentTarget.dataset.range;
    rules[field] = range ? range[e.detail.value] : e.detail.value;
    this.setData({ rules });
  },

  onRuleSegment(e) {
    const { field, val } = e.currentTarget.dataset;
    const rules = this.data.rules;
    rules[field] = val;
    this.setData({ rules });
  },

  onLadyToggle() {
    this.setData({ ladyOfTheLake: !this.data.ladyOfTheLake });
  },

  onLadyRoundChange(e) {
    this.setData({ ladyOfTheLakeRound: e.detail.value });
  },

  onSpectatorToggle() {
    this.setData({ allowSpectator: !this.data.allowSpectator });
  },

  onSpectatorLimitMode(e) {
    const limited = e.currentTarget.dataset.val === 'true';
    this.setData({ spectatorLimited: limited });
  },

  onSpectatorLimitInput(e) {
    const val = e.detail.value;
    const num = parseInt(val, 10);
    const invalid = val !== '' && (isNaN(num) || num < 1 || num > 100);
    this.setData({ maxSpectators: val, spectatorLimitInvalid: invalid });
  },

  // ─────────── Page 5: Limits + Meta ───────────

  onLimitChange(e) {
    const { field } = e.currentTarget.dataset;
    const data = {};
    data[field] = e.detail.value;
    this.setData(data);
  },

  onMetaInput(e) {
    const { field } = e.currentTarget.dataset;
    const data = {};
    data[field] = e.detail.value;
    this.setData(data);
  },

  // ─────────── Navigation ───────────

  prevPage() {
    const { logicalPage, visiblePages } = this.data;
    if (logicalPage > 0) {
      const newPage = logicalPage - 1;
      this.setData({ logicalPage: newPage, swiperPage: visiblePages[newPage] });
    }
  },

  nextPage() {
    const { logicalPage, visiblePages } = this.data;
    if (logicalPage < visiblePages.length - 1) {
      const newPage = logicalPage + 1;
      this.setData({ logicalPage: newPage, swiperPage: visiblePages[newPage] });
    }
  },

  onSwiperChange(e) {
    const swiperIdx = e.detail.current;
    const logicalIdx = this.data.visiblePages.indexOf(swiperIdx);
    if (logicalIdx >= 0) {
      this.setData({ logicalPage: logicalIdx });
    }
  },

  // ─────────── Computations ───────────

  computeLoyalCount() {
    const sel = this.data.selectedRoles;
    let goodCount = 0, evilCount = 0;
    GOOD_ROLES.forEach(r => { if (sel[r]) goodCount++; });
    EVIL_ROLES.forEach(r => { if (sel[r]) evilCount++; });
    const loyal = this.data.playerCount - goodCount - evilCount;
    let warning = '';
    if (loyal < 0) {
      warning = `好人+坏人超出总人数 ${Math.abs(loyal)} 位，请减少选择`;
    }
    this.setData({ loyalCount: Math.max(loyal, 0), roleWarning: warning, goodCount, evilCount });
  },

  computeTeamSizes() {
    this.setData({ teamSizes: TEAM_SIZES[this.data.playerCount] || TEAM_SIZES[5] });
  },

  computeVisiblePages() {
    const sel = this.data.selectedRoles;
    const hasLancelot = sel.lancelotBlue || sel.lancelotRed;

    const pages = [0, 1];
    if (hasLancelot) pages.push(2);
    pages.push(4);
    pages.push(5);

    this.setData({
      visiblePages: pages,
      pageCount: pages.length,
      logicalPage: Math.min(this.data.logicalPage, pages.length - 1),
      swiperPage: pages[Math.min(this.data.logicalPage, pages.length - 1)]
    });
  },

  computeAll() {
    this.computeLoyalCount();
    this.computeTeamSizes();
    this.computeVisiblePages();

    const sel = this.data.selectedRoles;
    const good = [];
    if (sel.merlin) good.push('梅林');
    if (sel.percival) good.push('派西');
    if (sel.lancelotBlue) good.push('蓝兰');
    if (this.data.loyalCount > 0) good.push('忠臣×' + this.data.loyalCount);
    const evil = [];
    if (sel.morgana) evil.push('莫甘娜');
    if (sel.assassin) evil.push('刺客');
    if (sel.mordred) evil.push('莫德雷德');
    if (sel.oberon) evil.push('奥伯伦');
    if (sel.minion) evil.push('爪牙');
    if (sel.lancelotRed) evil.push('红兰');

    const speech = this.data.speechTimeoutIndex > 0 ? SPEECH_OPTIONS[this.data.speechTimeoutIndex] : '不限';
    const spec = this.data.allowSpectator ? (this.data.spectatorLimited ? '允许（上限' + this.data.maxSpectators + '人）' : '允许（不限人数）') : '不允许';
    const lady = this.data.ladyOfTheLake ? '启用（第' + this.data.ladyOfTheLakeRound + '轮）' : '未启用';

    this.setData({
      goodRoleNames: good.join('、'),
      evilRoleNames: evil.join('、'),
      summarySpeech: speech,
      summarySpec: spec,
      summaryLady: lady
    });
  },

  getRoomConfig() {
    const good = [];
    const evil = [];
    GOOD_ROLES.forEach(r => { if (this.data.selectedRoles[r]) good.push(r); });
    EVIL_ROLES.forEach(r => { if (this.data.selectedRoles[r]) evil.push(r); });
    for (let i = 0; i < this.data.loyalCount; i++) { good.push('loyal'); }

    const limits = {
      speechTimeout: this.data.speechTimeoutIndex > 0 ? SPEECH_OPTIONS[this.data.speechTimeoutIndex] === '不限' ? null : parseInt(SPEECH_OPTIONS[this.data.speechTimeoutIndex]) : null,
      roundTimeout: this.data.roundTimeoutIndex > 0 ? ROUND_OPTIONS[this.data.roundTimeoutIndex] === '不限' ? null : parseInt(ROUND_OPTIONS[this.data.roundTimeoutIndex]) : null,
      voteTimeout: this.data.voteTimeoutIndex > 0 ? VOTE_OPTIONS[this.data.voteTimeoutIndex] === '不限' ? null : parseInt(VOTE_OPTIONS[this.data.voteTimeoutIndex]) : null
    };

    const meta = {
      roomName: this.data.roomName || '',
      roomDescription: this.data.roomDescription || '',
      tags: this.data.tags || []
    };

    return {
      roles: { good, evil },
      rules: {
        ...this.data.rules,
        ladyOfTheLake: this.data.ladyOfTheLake,
        ladyOfTheLakeRound: this.data.ladyOfTheLakeRound
      },
      limits,
      meta,
      spectator: {
        allow: this.data.allowSpectator,
        max: this.data.spectatorLimited ? (Number(this.data.maxSpectators) || 0) : 0
      }
    };
  }
});
