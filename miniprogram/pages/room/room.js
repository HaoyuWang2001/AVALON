// pages/room/room.js
const app = getApp();
const api = require('../../services/api.js');

Page({
  data: {
    roomId: '',
    isHost: false,
    seatNumber: 0,
    players: [],
    readyPlayers: [],
    gameStarted: false,
    currentUser: null,
    roomInfo: null,
    userInfo: null,
    showSeatModal: false,
    occupiedSeats: []
  },

  onLoad(options) {
    const { roomId, isHost, seatNumber } = options;
    this.setData({
      roomId: roomId || '',
      isHost: isHost === 'true',
      seatNumber: parseInt(seatNumber) || 0
    });

    const userInfo = app.globalData.userInfo;
    this.setData({ userInfo });

    this.initRoomPolling();
  },

  onUnload() {
    if (this.roomPolling) {
      clearInterval(this.roomPolling);
    }
    this.leaveRoom();
  },

  initRoomPolling() {
    this.fetchRoomInfo();
    this.roomPolling = setInterval(() => {
      this.fetchRoomInfo();
    }, 2000);
  },

  fetchRoomInfo() {
    const { roomId } = this.data;
    api.getRoom(roomId).then(res => {
      if (res.success && res.room) {
        const room = res.room;
        const players = room.players || [];
        const occupiedSeats = players.map(p => p.seatNumber);
        const currentUser = players.find(p => p.openId === app.globalData.openId);

        this.setData({
          roomInfo: room,
          players: players,
          readyPlayers: room.readyPlayers || [],
          gameStarted: room.gameStarted || false,
          occupiedSeats: occupiedSeats,
          currentUser: currentUser,
          seatNumber: currentUser ? currentUser.seatNumber : this.data.seatNumber
        });

        if (room.gameStarted && !this.data.gameStarted) {
          wx.redirectTo({
            url: `/pages/game/game?roomId=${roomId}`,
          });
        }
      } else {
        wx.showToast({
          title: '房间已解散',
          icon: 'error',
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    }).catch(err => {
      console.error('获取房间信息失败:', err);
    });
  },

  showSeatSelectionModal() {
    this.setData({ showSeatModal: true });
  },

  hideSeatModal() {
    this.setData({ showSeatModal: false });
  },

  selectSeat(e) {
    const seatNumber = e.currentTarget.dataset.seat;
    const { occupiedSeats, roomId } = this.data;

    if (occupiedSeats.includes(seatNumber)) {
      wx.showToast({
        title: '该座位已被占用',
        icon: 'error'
      });
      return;
    }

    api.updateSeatNumber(roomId, seatNumber).then(res => {
      if (res.success) {
        this.setData({
          seatNumber: seatNumber,
          showSeatModal: false
        });
        wx.showToast({
          title: `已选择${seatNumber}号座位`,
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: res.message || '选择失败',
          icon: 'error'
        });
      }
    }).catch(err => {
      wx.showToast({
        title: '选择失败',
        icon: 'error'
      });
    });
  },

  changeSeatNumber() {
    this.setData({ showSeatModal: true });
  },

  leaveRoom() {
    const { roomId } = this.data;
    api.leaveRoom(roomId).then(() => {
      console.log('已离开房间');
    }).catch(err => {
      console.error('离开房间失败:', err);
    });
  },

  toggleReady() {
    const { roomId, readyPlayers } = this.data;
    const userOpenId = app.globalData.openId;
    const isReady = readyPlayers.includes(userOpenId);

    api.toggleReady(roomId, !isReady).then(res => {
      console.log('准备状态切换成功:', res);
    }).catch(err => {
      console.error('准备状态切换失败:', err);
    });
  },

  startGame() {
    const { roomId, players } = this.data;
    if (players.length < 5) {
      wx.showToast({
        title: '至少需要5人',
        icon: 'error',
      });
      return;
    }

    wx.showModal({
      title: '开始游戏',
      content: '确定要开始游戏吗？游戏开始后不能再加入新玩家。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '游戏准备中...',
          });
          api.startGame(roomId).then(res => {
            wx.hideLoading();
            console.log('游戏开始成功:', res);
          }).catch(err => {
            wx.hideLoading();
            console.error('游戏开始失败:', err);
            wx.showToast({
              title: '开始失败',
              icon: 'error',
            });
          });
        }
      }
    });
  },

  shareRoom() {
    const { roomId } = this.data;
    wx.showShareMenu({
      withShareTicket: true
    });
    wx.shareAppMessage({
      title: '加入我的阿瓦隆房间',
      path: `/pages/room/room?roomId=${roomId}&isHost=false`,
      imageUrl: '/images/share.jpg'
    });
  },

  copyRoomId() {
    const { roomId } = this.data;
    wx.setClipboardData({
      data: roomId,
      success: () => {
        wx.showToast({
          title: '房间号已复制',
          icon: 'success',
        });
      }
    });
  },

  kickPlayer(e) {
    const playerId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '踢出玩家',
      content: '确定要踢出该玩家吗？',
      success: (res) => {
        if (res.confirm) {
          api.kickPlayer(this.data.roomId, playerId).then(() => {
            console.log('踢出玩家成功');
          }).catch(err => {
            console.error('踢出玩家失败:', err);
          });
        }
      }
    });
  }
});
