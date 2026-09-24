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
    privateReason: '',
    requested: false,
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
        privateReason: '',
        requested: false,
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
        // 未公开胜率 / 未达到最小统计局数 两种情况分开
        let privateReason = '';
        if (s && !s.rateVisible) {
          privateReason = (s.publicWinrate === 0)
            ? '该玩家未公开胜率'
            : `该玩家未达到最小统计局数（${s.threshold} 局）`;
        }
        this.setData({
          loading: false,
          rateVisible: !!(s && s.rateVisible),
          privateReason,
          requested: !!(s && s.friendRequestPending),
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
    },
    addFriend() {
      if (this.data.isFriend || this.data.requested) return;
      const target = this.data.openId;
      const me = getApp().globalData.openId || wx.getStorageSync('openId');
      if (!target || !me) return;
      api.sendFriendRequest(me, target).then(res => {
        if (res && res.success) {
          this.setData({ requested: true });
          wx.showToast({ title: '申请已发送', icon: 'success' });
        } else {
          wx.showToast({ title: (res && res.message) || '申请失败', icon: 'none' });
        }
      }).catch(err => {
        const msg = (err && err.message) || '申请失败';
        if (/已发送过申请|等待对方处理|已是好友/.test(msg)) this.setData({ requested: true });
        wx.showToast({ title: msg, icon: 'none' });
      });
    }
  }
});
