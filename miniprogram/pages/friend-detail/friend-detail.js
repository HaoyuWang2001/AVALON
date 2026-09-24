// pages/friend-detail/friend-detail.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { DEFAULT_AVATAR, ROLE_NAMES, ROLE_EMOJIS, CONFIG_EVIL_ROLES } = require('../../utils/constants.js');

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '小时' + (m > 0 ? m + '分钟' : '');
  if (m > 0) return m + '分钟';
  return '不足1分钟';
}

// 后端返回 UTC 字符串，转换为北京时间(+8)
function formatDate(ts) {
  if (!ts) return '';
  let ms;
  if (typeof ts === 'string') {
    const m = ts.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    ms = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : new Date(ts).getTime();
  } else {
    ms = new Date(ts).getTime();
  }
  if (isNaN(ms)) return '';
  const bj = new Date(ms + 8 * 3600 * 1000);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
}

Page({
  data: {
    themeClass: '',
    friendOpenId: '',
    friend: null,           // {openId, nickName, avatarUrl, uniqueId, online, room}
    roleStats: [],
    summary: null,
    historyList: [],
    myInvite: '',           // '' | 'room' | 'game'
    myRoomId: '',
    myGameId: '',
    loading: false
  },

  onLoad(options) {
    this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
    const tc = getThemeClass();
    this.setData({ themeClass: tc });
    this.setData({ friendOpenId: options.openId || '' });
  },

  onShow() {
    this.loadDetail();
    this.loadStats();
    this.loadHistory();
    this.loadMyRoom();
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
  },

  // 我当前状态（用于邀请按钮）
  loadMyRoom() {
    if (!this._openId) return;
    api.getCurrentRoom(this._openId).then(res => {
      const room = res && res.room;
      if (room && room.gameStarted && room.activeGameId) {
        this.setData({ myInvite: 'game', myRoomId: room.roomId, myGameId: room.activeGameId });
      } else if (room && !room.gameStarted) {
        this.setData({ myInvite: 'room', myRoomId: room.roomId, myGameId: '' });
      } else {
        this.setData({ myInvite: '', myRoomId: '', myGameId: '' });
      }
    }).catch(() => {});
  },

  onShareAppMessage(res) {
    const f = this.data.friend;
    const name = (f && f.nickName) || '好友';
    const ds = res && res.target && res.target.dataset ? res.target.dataset : {};
    if (ds.invite === 'room' && this.data.myRoomId) {
      return { title: `${name}，来开瓦！`, path: `/pages/index/index?roomId=${this.data.myRoomId}` };
    }
    if (ds.invite === 'game' && this.data.myRoomId && this.data.myGameId) {
      return { title: `${name}，来看瓦！`, path: `/pages/index/index?roomId=${this.data.myRoomId}&gameId=${this.data.myGameId}` };
    }
    return { title: 'AVALON · 瓦协会之练秋湖分部', path: '/pages/index/index' };
  },

  loadDetail() {
    if (!this._openId || !this.data.friendOpenId) return;
    this.setData({ loading: true });
    api.getFriendDetail(this._openId, this.data.friendOpenId).then(res => {
      this.setData({ loading: false });
      if (res && res.success && res.friend) {
        this.setData({ friend: res.friend });
      } else if (res && res.success === false) {
        this._kickBack(res.message);
      }
    }).catch(err => {
      this.setData({ loading: false });
      this._kickBack((err && err.message) || '加载失败');
    });
  },

  _kickBack(msg) {
    wx.showModal({
      title: '提示', content: msg || '无法查看', showCancel: false,
      success: () => wx.navigateBack()
    });
  },

  loadStats() {
    if (!this.data.friendOpenId) return;
    api.getUserStats(this.data.friendOpenId).then(res => {
      if (res && res.success && res.stats) {
        const s = res.stats;
        this.setData({
          roleStats: (s.roles || []).filter(r => r.games > 0).map(r => ({
            role: r.role,
            roleName: ROLE_NAMES[r.role] || r.role,
            emoji: ROLE_EMOJIS[r.role] || '🎴',
            side: CONFIG_EVIL_ROLES.includes(r.role) ? 'evil' : 'good',
            games: r.games,
            wins: r.wins,
            winRate: r.winRate + '%'
          })),
          summary: {
            totalWinRate: s.totalWinRate,
            totalWins: s.totalWins,
            totalGames: s.totalGames,
            goodWinRate: s.goodWinRate + '%',
            evilWinRate: s.evilWinRate + '%'
          }
        });
      }
    }).catch(() => {});
  },

  loadHistory() {
    if (!this.data.friendOpenId) return;
    api.getUserHistory(this.data.friendOpenId, 0).then(res => {
      if (res && res.success && Array.isArray(res.history)) {
        this.setData({
          historyList: res.history.map(item => ({
            gameId: item.gameId,
            role: item.role,
            roleName: ROLE_NAMES[item.role] || item.role,
            side: item.side,
            playerCount: item.playerCount,
            durationText: formatDuration(item.durationSeconds),
            dateText: formatDate(item.createdAt),
            isWin: !!(item.gameResult && item.gameResult.winner === item.side)
          }))
        });
      }
    }).catch(() => {});
  },

  openHistoryGame(e) {
    const gameId = e.currentTarget.dataset.gameid;
    if (!gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
  },

  // ─── 观战 / 进房间（复用 index 的加入逻辑） ───
  spectate() {
    const f = this.data.friend;
    if (!f || !f.room || !f.room.gameStarted || !f.room.activeGameId) return;
    this._joinRoom(f.room.roomId, f.room.activeGameId);
  },

  enterRoom() {
    const f = this.data.friend;
    if (!f || !f.room || f.room.gameStarted) return;
    this._joinRoom(f.room.roomId, null);
  },

  _joinRoom(roomId, gameId) {
    wx.showLoading({ title: gameId ? '加入观战...' : '进入房间...', mask: true });
    api.joinRoom(roomId, 0).then(res => {
      wx.hideLoading();
      if (res.success) {
        getApp().globalData.roomId = roomId;
        if (gameId) {
          wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&roomId=${roomId}` });
        } else {
          wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}` });
        }
        return;
      }
      const msg = (res && res.message) || '';
      if (msg.includes('已在其他房间') || msg.includes('已在房间中')) {
        this._confirmLeaveAndJoin(roomId, gameId);
      } else {
        wx.showToast({ title: msg || '加入失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' });
    });
  },

  _confirmLeaveAndJoin(roomId, gameId) {
    api.getCurrentRoom(this._openId).then(res => {
      const cur = res && res.room;
      if (cur && cur.gameStarted) {
        wx.showToast({ title: '游戏进行中，无法退出当前房间', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '已在其他房间',
        content: '退出当前房间并加入？',
        confirmText: '退出并加入',
        success: (r) => {
          if (r.confirm) {
            if (cur && cur.roomId) {
              api.leaveRoom(cur.roomId).then(leaveRes => {
                if (leaveRes.success) this._joinRoom(roomId, gameId);
                else wx.showToast({ title: (leaveRes && leaveRes.message) || '退出失败', icon: 'none' });
              }).catch(() => {});
            } else {
              this._joinRoom(roomId, gameId);
            }
          }
        }
      });
    }).catch(() => wx.showToast({ title: '加入失败', icon: 'none' }));
  },

  // ─── 删除好友 ───
  moreActions() {
    wx.showActionSheet({
      itemList: ['删除好友'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '删除好友',
            content: '确定删除该好友吗？',
            confirmColor: '#DC2626',
            success: (r) => {
              if (r.confirm) {
                api.deleteFriend(this._openId, this.data.friendOpenId).then(res2 => {
                  if (res2 && res2.success) {
                    wx.showToast({ title: '已删除', icon: 'success' });
                    setTimeout(() => wx.navigateBack(), 600);
                  }
                }).catch(err => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
              }
            }
          });
        }
      }
    });
  }
});
