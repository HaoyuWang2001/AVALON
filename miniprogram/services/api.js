// API服务封装
const app = getApp();
const BASE_URL = 'https://haoyu-wang141.top:8082/api';

class ApiService {
  constructor() {
    this.openId = null;
    this.nickName = '';
    this._socketHandlers = {};
    this._persistentHandlers = {};
    this._socketStatusCallbacks = [];
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
    const storedNick = wx.getStorageSync('customNickName') || '';
    // 仅发送服务端可访问的 http(s) 头像链接；本地路径(/images、wxfile、USER_DATA_PATH)发空串交由服务端回查 users 表
    const httpUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
    const avatarUrl = httpUrl(userInfo.avatarUrl) || httpUrl(wx.getStorageSync('avatarUrl')) || '';
    return this.request('/rooms/join', {
      method: 'POST',
      data: {
        roomId,
        userInfo: {
          openId,
          nickName: userInfo.nickName || this.nickName || storedNick || '玩家',
          wxNickName: userInfo.nickName || '',
          avatarUrl
        },
        seatNumber,
        customNickName: storedNick || ''
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
    return this.request(`/games/speakingOrder`, {
      method: 'POST',
      data: { gameId, openId, speakingOrder }
    });
  }

  async startDiscussion(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/startDiscussion`, {
      method: 'POST',
      data: { gameId, openId }
    });
  }

  async endDiscussion(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/endDiscussion`, {
      method: 'POST',
      data: { gameId, openId }
    });
  }

  async setIdentityMark(gameId, targetOpenId, mark) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/identityMark`, {
      method: 'POST',
      data: { gameId, openId, targetOpenId, ...mark }
    });
  }

  async clearIdentityMark(gameId, targetOpenId, clear) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/identityMark`, {
      method: 'POST',
      data: { gameId, openId, targetOpenId, clear }
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

  async confirmLake(gameId) {
    const openId = this.openId || getApp().globalData.openId;
    return this.request(`/games/${gameId}/confirmLake`, {
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
    this._socketIntentionalClose = false;
    this._socketRoomId = roomId;
    this._socketPlayerId = playerId;
    // 关闭旧连接（不清理 handlers/status 回调，重连需保留已注册处理器）
    if (this._socketTask) {
      try { this._socketTask.close({ code: 1000 }); } catch (e) {}
      this._socketTask = null;
    }
    if (this._socketRetryTimer) { clearTimeout(this._socketRetryTimer); this._socketRetryTimer = null; }
    this._emitSocketStatus('connecting');
    const task = wx.connectSocket({ url: WSSURL });
    this._socketTask = task;
    this._lastSocketMessageAt = Date.now();
    // 消息超时兜底：半开连接（收不到数据且无 onClose）时主动断开重连。
    // 服务端每 30s 广播应用层 heartbeat，健康连接的时间戳恒 ≤30s；
    // 90s（3×心跳）才触发，仅当服务器真正停止发消息时判死，避免"健康但安静"的对局被误杀。
    if (this._socketTimeoutTimer) clearInterval(this._socketTimeoutTimer);
    this._socketTimeoutTimer = setInterval(() => {
      if (this._socketIntentionalClose) return;
      if (Date.now() - this._lastSocketMessageAt > 90000) {
        console.log('[socket] 看门狗触发: 90s 无消息，强制重连', this._socketRoomId);
        this._emitSocketStatus('closed');
        if (this._socketTask) { try { this._socketTask.close({ code: 1000 }); } catch (e) {} }
        this._socketTask = null;
        this._scheduleReconnect();
      }
    }, 5000);
    task.onOpen(() => {
      this._socketRetryCount = 0;
      this._lastSocketMessageAt = Date.now();
      this._emitSocketStatus('open');
      task.send({ data: JSON.stringify({ type: 'joinRoom', roomId, playerId }) });
    });
    task.onMessage((res) => {
      this._lastSocketMessageAt = Date.now();
      try {
        const msg = JSON.parse(res.data);
        if (msg.type) {
          if (this._socketHandlers[msg.type]) this._socketHandlers[msg.type].forEach(fn => fn(msg));
          if (this._persistentHandlers[msg.type]) this._persistentHandlers[msg.type].forEach(fn => fn(msg));
        }
      } catch (e) {}
    });
    task.onClose(() => {
      if (this._socketTask === task) this._socketTask = null;
      if (this._socketIntentionalClose) return; // 主动断开（离开页面），不广播状态、不重连
      this._emitSocketStatus('closed');
      this._scheduleReconnect();
    });
    task.onError(() => {
      if (this._socketTask === task) this._socketTask = null;
      if (this._socketIntentionalClose) return;
      this._emitSocketStatus('closed');
      this._scheduleReconnect();
    });
    return task;
  }

  // 指数退避重连：1s/2s/4s/8s，上限 15s；重连后 onOpen 自动重新 joinRoom，
  // 服务端 pushCurrentGameState 会推送全量状态（gameState 消息）恢复视图
  _scheduleReconnect() {
    if (this._socketIntentionalClose) return;
    if (this._socketRetryTimer) return;
    if (this._socketRetryCount == null) this._socketRetryCount = 0;
    const delay = Math.min(1000 * Math.pow(2, this._socketRetryCount), 15000);
    this._socketRetryCount++;
    this._emitSocketStatus('connecting');
    this._socketRetryTimer = setTimeout(() => {
      this._socketRetryTimer = null;
      if (this._socketIntentionalClose) return;
      if (this._socketRoomId) this.connectSocket(this._socketRoomId, this._socketPlayerId);
    }, delay);
  }

  onSocketStatus(fn) {
    this._socketStatusCallbacks.push(fn);
  }

  // 当前 socket 连接状态：'open' | 'closed' | 'connecting' | 'idle'
  getSocketStatus() {
    return this._socketStatus || 'idle';
  }

  _emitSocketStatus(status) {
    this._socketStatus = status;
    (this._socketStatusCallbacks || []).forEach(fn => { try { fn(status); } catch (e) {} });
  }

  onSocketMessage(type, fn) {
    if (!this._socketHandlers[type]) this._socketHandlers[type] = [];
    this._socketHandlers[type].push(fn);
  }

  // 全局持久消息处理器（不受页面 disconnectSocket 清除，如"被移出房间"通知）
  onSocketMessagePersistent(type, fn) {
    if (!this._persistentHandlers[type]) this._persistentHandlers[type] = [];
    this._persistentHandlers[type].push(fn);
  }

  // 通过 socket 发送自定义消息（如发言计时器 timerUpdate），经后端中转广播到房间
  sendSocket(type, payload = {}) {
    if (!this._socketTask) return;
    try {
      this._socketTask.send({ data: JSON.stringify({ type, roomId: this._socketRoomId, ...payload }) });
    } catch (e) {}
  }

  disconnectSocket() {
    this._socketIntentionalClose = true;
    if (this._socketRetryTimer) { clearTimeout(this._socketRetryTimer); this._socketRetryTimer = null; }
    if (this._socketTimeoutTimer) { clearInterval(this._socketTimeoutTimer); this._socketTimeoutTimer = null; }
    if (this._socketTask) {
      try { this._socketTask.close({ code: 1000 }); } catch (e) {}
      this._socketTask = null;
    }
    // 离开页面：清理本页注册的处理器与状态回调（保留全局持久处理器），避免旧实例残留
    this._socketHandlers = {};
    this._socketStatusCallbacks = [];
  }

  // 停止重连但不关闭健康 socket（gameEnd 使用）：断链后不再重连，健康连接保持可收事件
  stopReconnect() {
    this._socketIntentionalClose = true;
    if (this._socketRetryTimer) { clearTimeout(this._socketRetryTimer); this._socketRetryTimer = null; }
  }

  async getUserProfile(openId) {
    return this.request(`/users/${openId}`);
  }

  async uploadAvatar(openId, filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${BASE_URL}/users/${openId}/avatar`,
        filePath,
        name: 'avatar',
        success: (res) => {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            if (res.statusCode >= 400 || !data.success) {
              reject(new Error((data && data.message) || `HTTP ${res.statusCode}`));
            } else {
              resolve(data);
            }
          } catch (e) {
            reject(new Error('上传头像响应解析失败'));
          }
        },
        fail: (err) => reject(new Error(err.errMsg || '头像上传失败'))
      });
    });
  }

  async updateUserProfile(openId, data) {
    return this.request(`/users/${openId}/profile`, {
      method: 'POST',
      data
    });
  }

  async getUserHistory(openId, limit = 0) {
    return this.request(`/games/history/user?openId=${openId}&limit=${limit}`);
  }

  async getUserStats(openId) {
    return this.request(`/games/stats?openId=${openId}`);
  }

  // ─────── 好友系统 ───────

  async setUniqueId(openId, uniqueId) {
    return this.request(`/users/${openId}/uniqueId`, { method: 'POST', data: { uniqueId } });
  }

  async searchUser(openId, uniqueId) {
    return this.request(`/friends/search?openId=${openId}&uniqueId=${encodeURIComponent(uniqueId)}`);
  }

  async getFriends(openId) {
    return this.request(`/friends?openId=${openId}`);
  }

  async getFriendRequests(openId) {
    return this.request(`/friends/requests?openId=${openId}`);
  }

  async sendFriendRequest(fromOpenId, toOpenId) {
    return this.request('/friends/request', { method: 'POST', data: { fromOpenId, toOpenId } });
  }

  async respondFriendRequest(requestId, openId, accept) {
    return this.request('/friends/respond', { method: 'POST', data: { requestId, openId, accept } });
  }

  async deleteFriend(openId, friendOpenId) {
    return this.request(`/friends?openId=${openId}&friendOpenId=${friendOpenId}`, { method: 'DELETE' });
  }

  async getFriendDetail(openId, friendOpenId) {
    return this.request(`/friends/${friendOpenId}/detail?openId=${openId}`);
  }
}

const apiService = new ApiService();

module.exports = apiService;
