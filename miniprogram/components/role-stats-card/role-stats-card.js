// components/role-stats-card/role-stats-card.js
// 角色胜率卡片（公共组件，自带角色对局弹窗）
// 用法：<role-stats-card roles="{{roleStats}}" summary="{{summary}}" games="{{historyList}}" />
// roles item: { role, roleName, emoji, side, games, wins, winRate }
// summary: { totalWinRate, totalWins, totalGames, goodWinRate, evilWinRate }
// games: 该用户的全部历史对局（用于按角色过滤弹窗）
Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: '角色胜率' },
    roles: { type: Array, value: [] },
    summary: { type: Object, value: null },
    games: { type: Array, value: [] }
  },
  data: {
    modalShow: false,
    modalTitle: '',
    modalGames: [],
    swiperIndex: 0
  },
  methods: {
    onSwiperChange(e) {
      this.setData({ swiperIndex: e.detail.current });
    },
    onRoleTap(e) {
      const role = e.currentTarget.dataset.role;
      const name = e.currentTarget.dataset.name;
      if (!role) return;
      const list = (this.data.games || []).filter(g => g.role === role);
      this.setData({ modalShow: true, modalTitle: name || role, modalGames: list });
    },
    closeModal() {
      this.setData({ modalShow: false });
    },
    noop() {}
  }
});
