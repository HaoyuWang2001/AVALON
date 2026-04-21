// API服务封装
const app = getApp();
const BASE_URL = 'https://haoyu-wang141.top:8082/api';

class ApiService {
  constructor() {
    this.openId = null;
    this.nickName = '';
  }

  setOpenId(openId) {
    this.openId = openId;
  }

  setNickName(nickName) {
    this.nickName = nickName;
  }

  async request(url, options = {}) {
    try {
      const res = await wx.request({
        url: BASE_URL + url,
        header: {
          'Content-Type': 'application/json',
          ...options.header
        },
        ...options
      });
      return res.data;
    } catch (err) {
      console.error('API请求失败:', err);
      throw err;
    }
  }

  async createRoom() {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/rooms/create', {
      method: 'POST',
      data: {
        hostOpenId: openId,
        hostNickName: this.nickName || wx.getStorageSync('customNickName') || '房主'
      }
    });
  }

  async getRoom(roomId) {
    return this.request(`/rooms/${roomId}`);
  }

  async joinRoom(roomId, seatNumber, userInfo = {}) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/rooms/join', {
      method: 'POST',
      data: {
        roomId,
        userInfo: {
          openId,
          nickName: userInfo.nickName || this.nickName || wx.getStorageSync('customNickName') || '玩家',
          avatarUrl: userInfo.avatarUrl || ''
        },
        seatNumber,
        customNickName: wx.getStorageSync('customNickName') || ''
      }
    });
  }

  async leaveRoom(roomId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/rooms/leave', {
      method: 'POST',
      data: { roomId, openId }
    });
  }

  async toggleReady(roomId, isReady) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/rooms/toggleReady', {
      method: 'POST',
      data: { roomId, openId, isReady }
    });
  }

  async updateSeatNumber(roomId, newSeatNumber) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/rooms/updateSeatNumber', {
      method: 'POST',
      data: { roomId, openId, newSeatNumber }
    });
  }

  async kickPlayer(roomId, playerId) {
    return this.request('/rooms/kickPlayer', {
      method: 'POST',
      data: { roomId, playerId }
    });
  }

  async startGame(roomId) {
    return this.request('/games/start', {
      method: 'POST',
      data: { roomId }
    });
  }

  async getGameState(roomId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${roomId}?openId=${openId}`);
  }

  async submitNomination(roomId, nominatedTeam) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/submitNomination', {
      method: 'POST',
      data: { roomId, openId, nominatedTeam }
    });
  }

  async castVote(roomId, vote) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/castVote', {
      method: 'POST',
      data: { roomId, openId, vote }
    });
  }

  async castMissionVote(roomId, vote, playerRole) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/castMissionVote', {
      method: 'POST',
      data: { roomId, openId, vote, playerRole }
    });
  }

  async endGame(roomId) {
    return this.request('/games/end', {
      method: 'POST',
      data: { roomId }
    });
  }

  async sendMessage(roomId, content, type = 'text') {
    const openId = this.openId || getApp().globalData.openId;
    const nickName = this.nickName || wx.getStorageSync('customNickName') || '玩家';
    return this.request('/messages/send', {
      method: 'POST',
      data: { roomId, openId, nickName, content, type }
    });
  }

  async getMessages(roomId, limit = 50, beforeTime = null) {
    let url = `/messages/${roomId}?limit=${limit}`;
    if (beforeTime) {
      url += `&beforeTime=${beforeTime}`;
    }
    return this.request(url);
  }

  connectSocket(roomId, playerId) {
    const socketUrl = 'wss://haoyu-wang141.top:8082';
    return wx.connectSocket({
      url: socketUrl,
      method: 'GET'
    });
  }
}

const apiService = new ApiService();

export default apiService;
