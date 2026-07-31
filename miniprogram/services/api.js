// API服务封装
const app = getApp();
const BASE_URL = 'https://haoyu-wang141.top:8082/api';

class ApiService {
  constructor() {
    this.openId = null;
    this.nickName = '';
  }

  login(code) {
    return this.request('/auth/login', {
      method: 'POST',
      data: { code }
    });
  }

  setOpenId(openId) {
    this.openId = openId;
  }

  setNickName(nickName) {
    this.nickName = nickName;
  }

  request(url, options = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: BASE_URL + url,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'Content-Type': 'application/json',
          ...options.header
        },
        success: (res) => {
          if (!res || !res.data) {
            reject(new Error('请求失败：服务器无响应'));
          } else if (res.statusCode >= 400) {
            reject(new Error((res.data && res.data.message) || `HTTP ${res.statusCode}`));
          } else {
            resolve(res.data);
          }
        },
        fail: (err) => {
          console.error('API请求失败:', err);
          reject(new Error(err.errMsg || '请求失败：网络错误'));
        }
      });
    });
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
          wxNickName: userInfo.nickName || '',
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

  async kickPlayer(roomId, playerId, mode) {
    return this.request('/rooms/kickPlayer', {
      method: 'POST',
      data: { roomId, playerId, mode: mode || 'room' }
    });
  }

  async disbandRoom(roomId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/rooms/${roomId}/disband`, {
      method: 'POST',
      data: { openId }
    });
  }

  async randomSeats(roomId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/rooms/${roomId}/randomSeats`, {
      method: 'POST',
      data: { openId }
    });
  }

  async banFromSeating(roomId, playerId, banned) {
    return this.request(`/rooms/${roomId}/banSeat`, {
      method: 'POST',
      data: { playerId, banned }
    });
  }

  async transferOwner(roomId, newOwnerId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/rooms/${roomId}/transferOwner`, {
      method: 'POST',
      data: { currentOwnerId: openId, newOwnerId }
    });
  }

  async getCurrentRoom(openId) {
    return this.request(`/players/${openId}/currentRoom`);
  }

  async updateRoomConfig(roomId, roomConfig) {
    return this.request(`/rooms/${roomId}/config`, {
      method: 'PUT',
      data: { roomConfig }
    });
  }

  async startGame(roomId) {
    return this.request('/games/start', {
      method: 'POST',
      data: { roomId }
    });
  }

  async getGameState(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}?openId=${openId}`);
  }

  async submitNomination(gameId, nominatedTeam) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/submitNomination', {
      method: 'POST',
      data: { gameId, openId, nominatedTeam }
    });
  }

  async castVote(gameId, vote) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/castVote', {
      method: 'POST',
      data: { gameId, openId, vote }
    });
  }

  async castMissionVote(gameId, vote, playerRole) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/castMissionVote', {
      method: 'POST',
      data: { gameId, openId, vote, playerRole }
    });
  }

  async endGame(gameId) {
    return this.request('/games/end', {
      method: 'POST',
      data: { gameId }
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

  async getUserProfile(openId) {
    return this.request(`/users/${openId}`);
  }

  async updateUserProfile(openId, data) {
    return this.request(`/users/${openId}/profile`, {
      method: 'POST',
      data
    });
  }
}

const apiService = new ApiService();

module.exports = apiService;
