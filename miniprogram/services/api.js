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
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/rooms/kickPlayer', {
      method: 'POST',
      data: { roomId, playerId, mode: mode || 'room', openId }
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
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/rooms/${roomId}/banSeat`, {
      method: 'POST',
      data: { playerId, banned, openId }
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
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/rooms/${roomId}/config`, {
      method: 'PUT',
      data: { roomConfig, openId }
    });
  }

  async startGame(roomId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/start', {
      method: 'POST',
      data: { roomId, openId }
    });
  }

  async confirmReveal(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/confirmReveal`, {
      method: 'POST',
      data: { openId }
    });
  }

  async submitPreNomination(gameId, preNominatedTeam) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/preNominate', {
      method: 'POST',
      data: { gameId, openId, preNominatedTeam }
    });
  }

  async selectSpeakingOrder(gameId, speakingOrder) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request('/games/speakingOrder', {
      method: 'POST',
      data: { gameId, openId, speakingOrder }
    });
  }

  async lakeInspect(gameId, targetOpenId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/lakeInspect`, {
      method: 'POST',
      data: { openId, targetOpenId }
    });
  }

  async confirmLancelot(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/confirmLancelot`, {
      method: 'POST',
      data: { openId }
    });
  }

  async abandonGame(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/abandon`, {
      method: 'POST',
      data: { openId }
    });
  }

  async startAssassination(gameId) {
    const killerOpenId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/startAssassination`, {
      method: 'POST',
      data: { killerOpenId }
    });
  }

  async assassinate(gameId, targetOpenId) {
    const killerOpenId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/assassinate`, {
      method: 'POST',
      data: { killerOpenId, targetOpenId }
    });
  }

  async getGameState(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}?openId=${openId}`);
  }

  async submitNomination(gameId, nominatedTeam, forcedCar) {
    const openId = this.openId || getApp().globalData.openId;
    const data = { gameId, openId, nominatedTeam };
    if (forcedCar !== undefined) data.forcedCar = forcedCar;
    return this.request('/games/submitNomination', {
      method: 'POST',
      data
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
    throw new Error('聊天功能已移除');
  }

  async getMessages(roomId, limit = 50, beforeTime = null) {
    throw new Error('聊天功能已移除');
  }

  connectSocket(roomId, playerId) {
    const WSSURL = 'wss://haoyu-wang141.top:8082';
    if (this._socketTask) this.disconnectSocket();
    const task = wx.connectSocket({ url: WSSURL });
    this._socketTask = task;
    this._socketRoomId = roomId;
    this._socketHandlers = {};
    task.onOpen(() => { task.send({ data: JSON.stringify({ type: 'joinRoom', roomId, playerId }) }); });
    task.onMessage((res) => {
      try {
        const msg = JSON.parse(res.data);
        if (msg.type && this._socketHandlers[msg.type]) {
          this._socketHandlers[msg.type].forEach(fn => fn(msg));
        }
      } catch (e) {}
    });
    task.onClose(() => { this._socketTask = null; });
    task.onError(() => { this._socketTask = null; });
    return task;
  }

  onSocketMessage(type, fn) {
    if (!this._socketHandlers) this._socketHandlers = {};
    if (!this._socketHandlers[type]) this._socketHandlers[type] = [];
    this._socketHandlers[type].push(fn);
  }

  disconnectSocket() {
    if (this._socketTask) {
      try { this._socketTask.close(); } catch (e) {}
      this._socketTask = null;
    }
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
