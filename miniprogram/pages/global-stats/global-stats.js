// pages/global-stats/global-stats.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { ROLE_NAMES, ROLE_EMOJIS, CONFIG_EVIL_ROLES } = require('../../utils/constants.js');

// 角色统计固定展示顺序（蓝方 → 红方）
const ROLE_ORDER = [
  'merlin', 'percival', 'loyal', 'lancelotBlue',
  'morgana', 'assassin', 'mordred', 'oberon', 'minion', 'lancelotRed'
];

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '小时' + (m > 0 ? m + '分钟' : '');
  if (m > 0) return m + '分钟';
  return '不足1分钟';
}

// 后端返回 UTC 字符串（'YYYY-MM-DD HH:mm:ss'，无时区），统一转换为北京时间(+8)
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

function mapGame(g) {
  const winner = g.gameResult && g.gameResult.winner;
  return {
    id: g.id,
    playerCount: g.playerCount,
    durationText: formatDuration(g.durationSeconds),
    dateText: formatDate(g.endedAt || g.createdAt),
    winnerText: winner === 'good' ? '蓝方胜' : winner === 'evil' ? '红方胜' : '—',
    winnerClass: winner === 'good' ? 'win-good' : winner === 'evil' ? 'win-evil' : ''
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
      // 固定展示全部角色（无对局的显示 0 场 / —）
      const roleMap = {};
      (s.roles || []).forEach(r => { roleMap[r.role] = r; });
      const roleStats = ROLE_ORDER.map(role => {
        const r = roleMap[role] || { games: 0, wins: 0 };
        return {
          role,
          roleName: ROLE_NAMES[role] || role,
          emoji: ROLE_EMOJIS[role] || '🎴',
          side: CONFIG_EVIL_ROLES.includes(role) ? 'evil' : 'good',
          games: r.games,
          wins: r.wins,
          winRate: r.games > 0 ? r.winRate + '%' : '—'
        };
      });
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
