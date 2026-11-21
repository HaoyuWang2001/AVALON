// pages/me/me.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg, pickTheme, applyTheme } = require('../../utils/theme.js');
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
    champions: [],
    podium: [],
    championsLoaded: false,
    publicWinrate: true,
    compactGame: false,
    showWeirdSettings: false,
    loading: true
  },

  onLoad() {
    const tc = getThemeClass();
    this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
    this.setData({
      themeClass: tc,
      openId: this._openId,
      compactGame: !!wx.getStorageSync('avalon_compact_game')
    });
  },

  onShow() {
    if (!this._openId) {
      this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
      this.setData({ openId: this._openId });
    }
    this.loadProfile();
    this.loadStats();
    this.loadHistory();
    this.loadChampions();
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
  },

  onPullDownRefresh() {
    this.loadProfile();
    this.loadStats();
    this.loadHistory();
    this.loadChampions();
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
          },
          publicWinrate: u.publicWinrate !== 0
        });
      }
    }).catch(() => this.setData({ loading: false }));
  },

  // 修改昵称（限 10 字）
  editNickName() {
    const current = this.data.me.nickName || '';
    wx.showModal({
      title: '修改昵称', editable: true, placeholderText: '请输入昵称（≤10字）', content: current,
      success: (res) => {
        if (!res.confirm) return;
        const nickName = (res.content || '').trim();
        if (!nickName) { wx.showToast({ title: '昵称不能为空', icon: 'none' }); return; }
        if (nickName.length > 10) { wx.showToast({ title: '昵称最多 10 字', icon: 'none' }); return; }
        wx.setStorageSync('customNickName', nickName);
        this.setData({ 'me.nickName': nickName });
        api.updateUserProfile(this._openId, { customNickName: nickName }).then(() => {
          wx.showToast({ title: '已更新', icon: 'success' });
        }).catch(err => {
          wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
        });
      }
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
    this.setData({ 'me.avatarUrl': tempPath });

    api.uploadAvatar(openId, tempPath).then((res) => {
      const url = (res && res.avatarUrl) || '';
      if (url) {
        wx.setStorageSync('avatarUrl', url);
        this.setData({ 'me.avatarUrl': url });
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
          this.setData({ 'me.avatarUrl': savedPath });
        },
        fail: () => {
          wx.setStorageSync('avatarUrl', tempPath);
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
            totalWinRate: s.totalWinRate || 0,
            goodWinRate: s.goodWinRate || 0,
            evilWinRate: s.evilWinRate || 0,
            mvpCount: s.mvpCount || 0,
            svpCount: s.svpCount || 0,
            titles: Array.isArray(s.titles) ? s.titles : []
          },
          summary: {
            totalWinRate: s.totalWinRate,
            totalWins: s.totalWins,
            totalGames: s.totalGames,
            goodWinRate: s.goodWinRate + '%',
            evilWinRate: s.evilWinRate + '%'
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

  // ─── 胜率冠军（公开胜率前三禁关规则需要） ───
  loadChampions() {
    const openId = this._openId;
    if (!openId) return;
    api.getChampions(openId).then(res => {
      if (res && res.success && Array.isArray(res.champions)) {
        const champions = res.champions.map((c, i) => ({ ...c, rank: i + 1 }));
        const podium = [];
        if (champions[1]) podium.push(champions[1]);
        if (champions[0]) podium.push(champions[0]);
        if (champions[2]) podium.push(champions[2]);
        this.setData({ champions, podium, championsLoaded: true });
      }
    }).catch(() => {});
  },

  // ─── 功能入口 ───
  onChangeTheme() {
    pickTheme().then(picked => {
      if (picked === null) return;
      applyTheme(picked);
      this.setData({ themeClass: picked });
    });
  },

  showWeirdSettings() {
    this.setData({ showWeirdSettings: true });
  },
  closeWeirdSettings() {
    this.setData({ showWeirdSettings: false });
  },

  // 公开胜率开关：二次确认；胜率前三禁止关闭
  onPublicWinrateChange(e) {
    const openId = this._openId || getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    const val = !!e.detail.value;
    this.setData({ publicWinrate: val }); // 先同步开关视觉，取消/被禁止时回滚

    if (!val) {
      if (!this.data.championsLoaded) {
        wx.showModal({
          title: '请稍候',
          content: '榜单数据加载中，暂时无法关闭公开胜率，请稍后重试。',
          showCancel: false,
          confirmText: '知道了',
          success: () => this.setData({ publicWinrate: true })
        });
        return;
      }
      const inTop3 = (this.data.podium || []).some(p => p.openId === openId);
      if (inTop3) {
        wx.showModal({
          title: '无法关闭',
          content: '您当前位于胜率前三榜单，公开胜率不可关闭；需胜率掉出前三后方可关闭。',
          showCancel: false,
          confirmText: '知道了',
          success: () => this.setData({ publicWinrate: true })
        });
        return;
      }
    }

    wx.showModal({
      title: val ? '公开胜率' : '关闭公开胜率',
      content: val ? '确定公开你的胜率？其他玩家将可以看到。' : '确定关闭公开胜率？关闭后将不再出现在胜率榜。',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) { this.setData({ publicWinrate: !val }); return; }
        api.setPublicWinrate(openId, val).then(r => {
          if (r && r.success) {
            wx.showToast({ title: val ? '已公开胜率' : '已设为私密', icon: 'none' });
          } else {
            this.setData({ publicWinrate: !val });
            wx.showToast({ title: (r && r.message) || '设置失败', icon: 'none' });
          }
        }).catch(err => {
          this.setData({ publicWinrate: !val });
          wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' });
        });
      }
    });
  },

  // 松弛压缩版开关（本地存储，按设备）
  onCompactGameChange(e) {
    const val = !!e.detail.value;
    this.setData({ compactGame: val });
    try { wx.setStorageSync('avalon_compact_game', val ? 1 : 0); } catch (err) {}
    wx.showToast({ title: val ? '已开启松弛压缩版' : '已关闭松弛压缩版', icon: 'none' });
  },

  goToGlobalStats() {
    wx.navigateTo({ url: '/pages/global-stats/global-stats' });
  },
  goToFriends() {
    wx.navigateTo({ url: '/pages/friends/friends' });
  },
  goToLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' });
  },
  goToRecords() {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  noop() {}
});
