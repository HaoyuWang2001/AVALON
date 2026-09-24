// pages/global-stats/global-stats.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { ROLE_NAMES, ROLE_EMOJIS, CONFIG_EVIL_ROLES } = require('../../utils/constants.js');

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '小时' + (m > 0 ? m + '分钟' : '');
  if (m > 0) return m + '分钟';
  return '不足1分钟';
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 结束方式副行：仅红方胜显示（刀梅林 / 三红车）
function winnerSubText(gameResult) {
  const reason = (gameResult && gameResult.reason) || '';
  if (reason.indexOf('刺杀命中') >= 0) return '刀梅林';
  if (reason.indexOf('完成3个任务') >= 0) return '三红车';
  return '';
}

function mapGame(g) {
  const winner = g.gameResult && g.gameResult.winner;
  return {
    id: g.id,
    playerCount: g.playerCount,
    durationText: formatDuration(g.durationSeconds),
    dateText: formatDate(g.endedAt || g.createdAt),
    winnerText: winner === 'good' ? '蓝方胜' : winner === 'evil' ? '红方胜' : '—',
    winnerClass: winner === 'good' ? 'win-good' : winner === 'evil' ? 'win-evil' : '',
    winnerSub: winner === 'evil' ? winnerSubText(g.gameResult) : ''
  };
}

Page({
  data: {
    themeClass: '',
    loading: true,
    stats: null,
    roleStats: [],
    gameList: [],
    roleModal: { show: false, roleName: '', emoji: '', games: [] },
    roleModalLoading: false
  },

  onLoad() {
    this.setData({ themeClass: getThemeClass() });
    this.loadStats();
  },

  onShow() {
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
  },

  onPullDownRefresh() {
    this.loadStats().finally(() => wx.stopPullDownRefresh());
  },

  loadStats() {
    this.setData({ loading: true });
    return api.getGlobalStats().then(res => {
      this.setData({ loading: false });
      if (!res || !res.success) return;
      const s = res.stats || {};
      const roleStats = (s.roles || []).map(r => ({
        role: r.role,
        roleName: ROLE_NAMES[r.role] || r.role,
        emoji: ROLE_EMOJIS[r.role] || '🎴',
        side: CONFIG_EVIL_ROLES.includes(r.role) ? 'evil' : 'good',
        games: r.games,
        wins: r.wins,
        winRate: r.winRate + '%'
      }));
      const gameList = (res.games || []).map(mapGame);
      this.setData({ stats: s, roleStats, gameList });
    }).catch(() => this.setData({ loading: false }));
  },

  openGame(e) {
    const gameId = e.currentTarget.dataset.id;
    if (!gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
  },

  // 点击角色行：弹出含该角色的全部对局
  openRoleGames(e) {
    const { role, name, emoji } = e.currentTarget.dataset;
    if (!role) return;
    this.setData({ roleModal: { show: true, roleName: name || role, emoji: emoji || '🎴', games: [] }, roleModalLoading: true });
    api.getRoleGames(role).then(res => {
      const games = (res && res.success && res.games ? res.games : []).map(mapGame);
      this.setData({ roleModalLoading: false, 'roleModal.games': games });
    }).catch(() => this.setData({ roleModalLoading: false }));
  },

  closeRoleGames() {
    this.setData({ 'roleModal.show': false });
  },

  noop() {}
});
