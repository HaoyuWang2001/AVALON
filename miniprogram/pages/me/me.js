// pages/me/me.js
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

// 后端返回 UTC 字符串（'YYYY-MM-DD HH:mm:ss'，无时区），转换为北京时间(+8)
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
    openId: '',
    me: { avatarUrl: '', nickName: '', uniqueId: '' },
    rank: 0,
    stats: { totalGames: 0, totalWinRate: 0, goodWinRate: 0, evilWinRate: 0, mvpCount: 0, svpCount: 0 },
    summary: null,
    roleStats: [],
    historyList: [],
    loading: true,
    showEditProfile: false,
    editAvatarUrl: '',
    editNickName: '',
    editUniqueId: '',
    editNickSaving: false,
    editIdSaving: false
  },

  onLoad() {
    const tc = getThemeClass();
    this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
    this.setData({ themeClass: tc, openId: this._openId });
  },

  onShow() {
    if (!this._openId) {
      this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
      this.setData({ openId: this._openId });
    }
    this.loadProfile();
    this.loadStats();
    this.loadHistory();
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
  },

  onPullDownRefresh() {
    this.loadProfile();
    this.loadStats();
    this.loadHistory();
    wx.stopPullDownRefresh();
  },

  // ─── 基本信息 ───
  loadProfile() {
    const openId = this._openId;
    if (!openId) { this.setData({ loading: false }); return; }
    api.getUserProfile(openId).then(res => {
      this.setData({ loading: false });
      if (res && res.success && res.user) {
        const u = res.user;
        const storedAvatar = wx.getStorageSync('avatarUrl') || '';
        this.setData({
          me: {
            avatarUrl: u.avatarUrl && /^https?:\/\//i.test(u.avatarUrl) ? u.avatarUrl : (storedAvatar || DEFAULT_AVATAR),
            nickName: u.customNickName || u.wxNickName || wx.getStorageSync('customNickName') || '',
            uniqueId: u.uniqueId || ''
          }
        });
      }
    }).catch(() => this.setData({ loading: false }));
  },

  openScoreDetail() {
    const comp = this.selectComponent('#scoreDetail');
    if (!comp) return;
    comp.open({ nickName: this.data.me.nickName || '玩家', detail: this.data.stats.scoreDetail || null });
  },

  // ─── 编辑信息（每行独立保存） ───
  openEditProfile() {
    this.setData({
      showEditProfile: true,
      editAvatarUrl: this.data.me.avatarUrl || '',
      editNickName: this.data.me.nickName || '',
      editUniqueId: this.data.me.uniqueId || '',
      editNickSaving: false,
      editIdSaving: false
    });
  },
  closeEditProfile() {
    this.setData({ showEditProfile: false });
  },
  onEditNickInput(e) {
    this.setData({ editNickName: e.detail.value });
  },
  onEditIdInput(e) {
    this.setData({ editUniqueId: e.detail.value });
  },
  saveEditNickName() {
    if (this.data.editNickSaving) return;
    const nickName = (this.data.editNickName || '').trim();
    if (!nickName) { wx.showToast({ title: '昵称不能为空', icon: 'none' }); return; }
    if (nickName.length > 10) { wx.showToast({ title: '昵称最多 10 字', icon: 'none' }); return; }
    if (nickName === this.data.me.nickName) { wx.showToast({ title: '昵称未修改', icon: 'none' }); return; }
    this.setData({ editNickSaving: true });
    api.updateUserProfile(this._openId, { customNickName: nickName }).then(() => {
      wx.setStorageSync('customNickName', nickName);
      this.setData({ editNickSaving: false, editNickName: nickName, 'me.nickName': nickName });
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    }).catch(err => {
      this.setData({ editNickSaving: false });
      wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
    });
  },
  saveEditUniqueId() {
    if (this.data.editIdSaving) return;
    const uniqueId = (this.data.editUniqueId || '').trim();
    if (!uniqueId) { wx.showToast({ title: 'ID 不能为空', icon: 'none' }); return; }
    if (uniqueId.length > 16) { wx.showToast({ title: 'ID 最多 16 位', icon: 'none' }); return; }
    if (uniqueId === this.data.me.uniqueId) { wx.showToast({ title: 'ID 未修改', icon: 'none' }); return; }
    this.setData({ editIdSaving: true });
    api.setUniqueId(this._openId, uniqueId).then(res => {
      const saved = (res && res.user && res.user.uniqueId) || uniqueId;
      this.setData({ editIdSaving: false, editUniqueId: saved, 'me.uniqueId': saved });
      wx.showToast({ title: 'ID 已更新', icon: 'success' });
    }).catch(err => {
      this.setData({ editIdSaving: false });
      wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
    });
  },

  onAvatarTap() {
    if (!wx.canIUse('button.open-type.chooseAvatar')) {
      wx.showToast({ title: '当前微信版本过低，请升级微信后再换头像', icon: 'none' });
    }
  },

  onChooseAvatar(e) {
    if (!e.detail || !e.detail.avatarUrl) return;
    const tempPath = e.detail.avatarUrl;
    const openId = this._openId || 'default';
    this.setData({ 'me.avatarUrl': tempPath, editAvatarUrl: tempPath });

    api.uploadAvatar(openId, tempPath).then((res) => {
      const url = (res && res.avatarUrl) || '';
      if (url) {
        wx.setStorageSync('avatarUrl', url);
        this.setData({ 'me.avatarUrl': url, editAvatarUrl: url });
      }
    }).catch(() => {
      wx.showToast({ title: '头像上传失败', icon: 'none' });
      const fs = wx.getFileSystemManager();
      const savedPath = wx.env.USER_DATA_PATH + '/avatar_' + openId + '.jpg';
      fs.saveFile({
        tempFilePath: tempPath,
        filePath: savedPath,
        success: () => {
          wx.setStorageSync('avatarUrl', savedPath);
          this.setData({ 'me.avatarUrl': savedPath, editAvatarUrl: savedPath });
        },
        fail: () => {
          wx.setStorageSync('avatarUrl', tempPath);
          this.setData({ editAvatarUrl: tempPath });
        }
      });
    });
  },

  // ─── 统计 / 角色 / 历史 ───
  loadStats() {
    const openId = this._openId;
    if (!openId) return;
    api.getUserStats(openId, openId).then(res => {
      if (res && res.success && res.stats) {
        const s = res.stats;
        this.setData({
          rank: s.rank || 0,
          stats: {
            totalGames: s.totalGames || 0,
            score: s.score != null ? s.score : 0,
            scoreDetail: s.scoreDetail || null,
            totalWinRate: s.totalWinRate || 0,
            goodWinRate: s.goodWinRate || 0,
            evilWinRate: s.evilWinRate || 0,
            mvpCount: s.mvpCount || 0,
            svpCount: s.svpCount || 0,
            titles: Array.isArray(s.titles) ? s.titles : []
          },
          summary: {
            totalWinRate: s.totalGames > 0 ? s.totalWinRate + '%' : '—',
            totalWins: s.totalWins,
            totalGames: s.totalGames,
            goodWinRate: s.goodGames > 0 ? s.goodWinRate + '%' : '—',
            evilWinRate: s.evilGames > 0 ? s.evilWinRate + '%' : '—'
          },
          roleStats: (s.roles || []).filter(r => r.games > 0).map(r => ({
            role: r.role,
            roleName: ROLE_NAMES[r.role] || r.role,
            emoji: ROLE_EMOJIS[r.role] || '🎴',
            side: CONFIG_EVIL_ROLES.includes(r.role) ? 'evil' : 'good',
            games: r.games,
            wins: r.wins,
            winRate: r.winRate + '%'
          }))
        });
      }
    }).catch(() => {});
  },

  loadHistory() {
    const openId = this._openId;
    if (!openId) return;
    api.getUserHistory(openId, 0).then(res => {
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

  noop() {}
});
