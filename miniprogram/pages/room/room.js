// pages/room/room.js
const app = getApp();
const api = require('../../services/api.js');

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
    infoCollapsed: false,
    spectatorMax: 0
  },

  onLoad(options) {
    const { roomId } = options;
    this.setData({
      roomId: roomId || ''
    });
    this.initRoomPolling();
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
        if (room.roomConfig && room.roomConfig.spectator) {
          specMax = room.roomConfig.spectator.max || 0;
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
          seatsFull: seats.length > 0 && seats.every(s => s.occupied)
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

        if (room.gameStarted && !this.data.gameStarted) {
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
    api.updateSeatNumber(this.data.roomId, seatNum).catch(() => {});
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
    api.updateSeatNumber(this.data.roomId, seat).catch(() => {});
  },

  leaveSeat() {
    if (!this._guard()) return;
    api.updateSeatNumber(this.data.roomId, 0).catch(() => {});
  },

  becomeSpectator() {
    if (!this._guard()) return;
    api.updateSeatNumber(this.data.roomId, -1).catch(() => {});
  },

  // ─── Ready / Start / Disband ───

  toggleReady() {
    if (!this._guard()) return;
    const isReady = this.data.readyPlayers.includes(app.globalData.openId);
    api.toggleReady(this.data.roomId, !isReady).catch(() => {});
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

  // ─── Modify config placeholder ───

  toggleInfoCard() {
    this.setData({ infoCollapsed: !this.data.infoCollapsed });
  },

  modifyConfig() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  }
});
