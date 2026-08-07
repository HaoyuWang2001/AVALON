// pages/room/room.js
const app = getApp();
const api = require('../../services/api.js');

const {
  CONFIG_GOOD_ROLES, CONFIG_EVIL_ROLES, CONFIG_FORCED_ROLES, ROLE_NAMES_SHORT,
  DEFAULT_CONFIGS, SPEECH_OPTIONS, ROUND_OPTIONS, VOTE_OPTIONS, VOTE_REVEAL_OPTIONS,
  TEAM_SIZES, buildDefaultRule
} = require('../../utils/constants.js');

function buildConfigSummary(cfg) {
  const good = (cfg.roles && cfg.roles.good) || [];
  const evil = (cfg.roles && cfg.roles.evil) || [];
  const roleCount = {};
  const countRoles = list => {
    list.forEach(r => { roleCount[r] = (roleCount[r] || 0) + 1; });
  };
  countRoles(good);
  countRoles(evil);
  const roleStr = roleList => {
    const uniq = [...new Set(roleList)];
    return uniq.map(r => {
      const n = roleCount[r] || 1;
      return ROLE_NAMES_SHORT[r] || r + (n > 1 ? '×' + n : '');
    }).join('、');
  };
  const all = [...good, ...evil];
  const hasOberon = all.includes('oberon');
  const hasLancelot = all.includes('lancelotBlue') || all.includes('lancelotRed');
  const hasLancelotRed = all.includes('lancelotRed');
  const hasBothLancelots = all.includes('lancelotBlue') && all.includes('lancelotRed');
  const rules = cfg.rules || {};
  const limits = cfg.limits || {};

  const groups = [];
  // 基础规则
  groups.push({
    title: '基础规则',
    lines: [
      '红狼互见：' + (rules.evilKnowsEachOther ? '开' : '关'),
      '流车上限：' + (rules.maxFailedNominations != null ? rules.maxFailedNominations : 3) + ' 次',
      '投票可见性：' + (rules.voteVisibility === 'hidden' ? '隐藏' : '公开'),
      '任务失败详情：' + (rules.missionFailDetail === 'binary' ? '仅成败' : '计数')
    ]
  });
  // 湖上夫人
  if (rules.ladyOfTheLake) {
    groups.push({ title: '湖上夫人', lines: ['启用：开（第' + (rules.ladyOfTheLakeRound || 1) + '轮起）'] });
  }
  // 红方强制失败（含奥伯伦或兰斯时）
  const failLines = [];
  if (hasOberon) failLines.push('奥伯伦必须任务失败：' + (rules.oberonMustFailMission ? '开' : '关'));
  if (hasLancelot) failLines.push('兰斯洛特必须任务失败：' + (rules.lancelotMustFail ? '开' : '关'));
  if (failLines.length) groups.push({ title: '红方强制失败', lines: failLines });
  // 兰斯洛特（含任意兰斯时）
  if (hasLancelot) {
    const lancLines = [];
    if (hasBothLancelots) lancLines.push('兰斯互认身份：' + (rules.lancelotsKnowEachOther ? '开' : '关'));
    if (rules.lancelotSwapRound != null && rules.lancelotSwapRound > 0) {
      let line = '换身轮次：第' + rules.lancelotSwapRound + '轮 · ';
      if (rules.lancelotSwapForce === 'switch') line += '强制互换';
      else if (rules.lancelotSwapForce === 'keep') line += '保持';
      else line += '随机(转' + (rules.lancelotSwitchCards != null ? rules.lancelotSwitchCards : 2)
        + '/不转' + (rules.lancelotKeepCards != null ? rules.lancelotKeepCards : 5) + ')';
      lancLines.push(line);
    }
    if (hasLancelotRed) lancLines.push('睁眼狼知红兰：' + (rules.evilsKnowRedLancelot ? '开' : '关'));
    if (hasOberon && hasLancelotRed) lancLines.push('奥伯伦知红兰：' + (rules.oberonKnowsRedLancelot ? '开' : '关'));
    if (hasBothLancelots) lancLines.push('梅林辨兰阵营：' + (rules.merlinKnowsLancelotSide ? '开' : '关'));
    groups.push({ title: '兰斯洛特', lines: lancLines });
  }
  // 观战
  const spec = cfg.spectator || {};
  groups.push({
    title: '观战',
    lines: [
      '允许观战：' + (spec.allow !== false ? '开' : '关'),
      '观战上限：' + (spec.max > 0 ? spec.max : '无限制')
    ]
  });
  // 时间限制（0/null → 无限制）
  const f = v => v ? v + 's' : '无限制';
  const limitLines = ['发言：' + f(limits.speechTimeout), '任务：' + f(limits.roundTimeout), '投票：' + f(limits.voteTimeout)];
  if (limits.voteRevealDuration) limitLines.push('票型展示：' + limits.voteRevealDuration + 's');
  return {
    playerCount: good.length + evil.length,
    goodRoles: roleStr(good),
    evilRoles: roleStr(evil),
    groups,
    limitLines
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

    showConfigView: false,
    configSummary: null,
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
