// components/player-stats/player-stats.js
// 玩家胜率信息底部弹窗（公共组件）
// 用法：page 里 this.selectComponent('#playerStats').open({ openId, nickName, avatarUrl, isFriend, isSelf })
const api = require('../../services/api.js');
const { ROLE_NAMES, ROLE_EMOJIS } = require('../../utils/constants.js');

Component({
  options: { addGlobalClass: true },
  data: {
    show: false,
    openId: '',
    nickName: '',
    avatarUrl: '',
    isFriend: false,
    isSelf: false,
    loading: false,
    rateVisible: false,
    stats: null,
    roles: []
  },
  methods: {
    open(opts) {
      const o = opts || {};
      this.setData({
        show: true,
        openId: o.openId || '',
        nickName: o.nickName || '玩家',
        avatarUrl: o.avatarUrl || '',
        isFriend: !!o.isFriend,
        isSelf: !!o.isSelf,
        loading: true,
        rateVisible: false,
        stats: null,
        roles: []
      });
      if (!o.openId) { this.setData({ loading: false }); return; }
      const viewer = getApp().globalData.openId || wx.getStorageSync('openId') || '';
      api.getUserStats(o.openId, viewer).then(res => {
        const s = (res && res.success && res.stats) || null;
        const roles = (s && Array.isArray(s.roles))
          ? s.roles.filter(r => r.games > 0).sort((a, b) => b.games - a.games).slice(0, 3).map(r => ({
              roleName: ROLE_NAMES[r.role] || r.role,
              emoji: ROLE_EMOJIS[r.role] || '🎴',
              winRate: r.winRate + '%'
            }))
          : [];
        this.setData({
          loading: false,
          rateVisible: !!(s && s.rateVisible),
          stats: s ? {
            totalGames: s.totalGames,
            totalWinRate: s.totalGames > 0 ? s.totalWinRate + '%' : '—',
            goodWinRate: s.goodGames > 0 ? s.goodWinRate + '%' : '—',
            evilWinRate: s.evilGames > 0 ? s.evilWinRate + '%' : '—'
          } : null,
          roles
        });
      }).catch(() => this.setData({ loading: false }));
    },
    close() {
      this.setData({ show: false });
      this.triggerEvent('close');
    },
    noop() {},
    goDetail() {
      const openId = this.data.openId;
      if (!openId) return;
      this.setData({ show: false });
      wx.navigateTo({ url: `/pages/friend-detail/friend-detail?openId=${openId}` });
    }
  }
});
