// pages/global-stats/global-stats.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { BOARD_TYPES, BOARD_TYPE_LABELS } = require('../../utils/constants.js');

// 角色统计固定展示（合并项取主角色数据）：梅林/派西维尔→merlin，刺客/莫甘娜→morgana
const ROLE_STATS = [
  { key: 'merlin',       label: '梅林/派西维尔', emoji: '🔮🛡️', source: 'merlin',       side: 'good' },
  { key: 'lancelotBlue', label: '蓝兰斯洛特',    emoji: '🎭',   source: 'lancelotBlue', side: 'good' },
  { key: 'morgana',      label: '刺客/莫甘娜',   emoji: '🗡️🌙', source: 'morgana',      side: 'evil' },
  { key: 'mordred',      label: '莫德雷德',      emoji: '🌑',   source: 'mordred',      side: 'evil' },
  { key: 'oberon',       label: '奥伯伦',        emoji: '👤',   source: 'oberon',       side: 'evil' },
  { key: 'minion',       label: '爪牙',          emoji: '🐺',   source: 'minion',       side: 'evil' },
  { key: 'lancelotRed',  label: '红兰斯洛特',    emoji: '🎭',   source: 'lancelotRed',  side: 'evil' }
];

const PLAYER_COUNTS = [5, 6, 7, 8, 9, 10, 11, 12];

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
  const boardType = g.boardType || 'standard';
  return {
    id: g.id,
    playerCount: g.playerCount,
    boardType,
    boardLabel: BOARD_TYPE_LABELS[boardType] || boardType,
    winner,
    durationText: formatDuration(g.durationSeconds),
    dateText: formatDate(g.endedAt || g.createdAt),
    winnerText: winner === 'good' ? '蓝方胜' : winner === 'evil' ? '红方胜' : '—',
    winnerClass: winner === 'good' ? 'win-good' : winner === 'evil' ? 'win-evil' : ''
  };
}

// 板型子行顺序（自定义板暂不独立子行，仅计入汇总）
const BOARD_SUB_ROWS = [
  { type: BOARD_TYPES.STANDARD, label: BOARD_TYPE_LABELS.standard },
  { type: BOARD_TYPES.NO_PERCIVAL, label: BOARD_TYPE_LABELS.noPercival },
  { type: BOARD_TYPES.EXPERT, label: BOARD_TYPE_LABELS.expert }
];

// 人数 × 板型 胜率统计：每行 = 汇总（全部板型）+ 板型子行（仅场次>0）
function buildCountStats(gameList) {
  const rate = (v, total) => total > 0 ? Math.round(v / total * 1000) / 10 + '%' : '—';
  return PLAYER_COUNTS.map(n => {
    const list = gameList.filter(g => g.playerCount === n);
    const total = list.length;
    const good = list.filter(g => g.winner === 'good').length;
    const evil = list.filter(g => g.winner === 'evil').length;
    const boards = BOARD_SUB_ROWS.map(b => {
      const bl = list.filter(g => g.boardType === b.type);
      const bt = bl.length;
      return {
        type: b.type, label: b.label, total: bt,
        goodRate: rate(bl.filter(g => g.winner === 'good').length, bt),
        evilRate: rate(bl.filter(g => g.winner === 'evil').length, bt)
      };
    }).filter(b => b.total > 0);
    return { count: n, total, goodRate: rate(good, total), evilRate: rate(evil, total), boards };
  });
}

Page({
  data: {
    themeClass: '',
    loading: true,
    stats: null,
    roleStats: [],
    gameList: [],
    countStats: [],
    detailModal: { show: false, title: '', games: [] },
    detailModalLoading: false
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
      // 固定展示全部角色（合并项取主角色数据；无对局显示 0 场 / —）
      const roleMap = {};
      (s.roles || []).forEach(r => { roleMap[r.role] = r; });
      const roleStats = ROLE_STATS.map(rs => {
        const r = roleMap[rs.source] || { games: 0, wins: 0 };
        return {
          role: rs.source,
          roleName: rs.label,
          emoji: rs.emoji,
          side: rs.side,
          games: r.games,
          wins: r.wins,
          winRate: r.games > 0 ? r.winRate + '%' : '—'
        };
      });
      const gameList = (res.games || []).map(mapGame);
      // 各人数胜率（汇总 + 板型子行：六人局-无派板 / 八人局-专家板 / X人局-标准板 独立统计）
      const countStats = buildCountStats(gameList);
      this.setData({ stats: s, roleStats, gameList, countStats });
    }).catch(() => this.setData({ loading: false }));
  },

  openGame(e) {
    const gameId = e.currentTarget.dataset.id;
    if (!gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
  },

  // 点击角色行：弹出含该角色（主角色）的全部对局
  openRoleGames(e) {
    const { role, name, emoji } = e.currentTarget.dataset;
    if (!role) return;
    this.setData({ detailModal: { show: true, title: `${emoji || ''} ${name || role}`.trim(), games: [] }, detailModalLoading: true });
    api.getRoleGames(role).then(res => {
      const games = (res && res.success && res.games ? res.games : []).map(mapGame);
      this.setData({ detailModalLoading: false, 'detailModal.games': games });
    }).catch(() => this.setData({ detailModalLoading: false }));
  },

  // 点击人数行：弹出该人数全部对局；点击板型子行：仅该板型（本地过滤）
  openCountGames(e) {
    const count = parseInt(e.currentTarget.dataset.count, 10);
    const board = e.currentTarget.dataset.board || '';
    const games = board
      ? this.data.gameList.filter(g => g.playerCount === count && g.boardType === board)
      : this.data.gameList.filter(g => g.playerCount === count);
    const boardLabel = board ? (BOARD_TYPE_LABELS[board] || board) : '';
    const title = `${count}人局${boardLabel ? ' · ' + boardLabel : ''}`;
    this.setData({ detailModal: { show: true, title, games }, detailModalLoading: false });
  },

  closeDetail() {
    this.setData({ 'detailModal.show': false });
  },

  noop() {}
});
