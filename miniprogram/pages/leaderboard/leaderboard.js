// pages/leaderboard/leaderboard.js
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { DEFAULT_AVATAR } = require('../../utils/constants.js');

Page({
  data: {
    themeClass: '',
    loading: true,
    players: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    loadingMore: false,
    showFormula: false
  },

  onLoad() {
    this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
    const tc = getThemeClass();
    this.setData({ themeClass: tc });
    this.loadPage(1);
  },

  onShow() {
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
  },

  onReachBottom() {
    this.loadMore();
  },

  onPullDownRefresh() {
    this.loadPage(1, false, true);
  },

  loadPage(page, append, fromPullDown) {
    if (this._fetching) {
      if (fromPullDown && wx.stopPullDownRefresh) wx.stopPullDownRefresh();
      return;
    }
    this._fetching = true;
    this.setData(append ? { loadingMore: true } : { loading: true });

    api.getLeaderboard(page, this.data.pageSize, this._openId).then(res => {
      this._fetching = false;
      if (fromPullDown && wx.stopPullDownRefresh) wx.stopPullDownRefresh();
      if (res && res.success) {
        const incoming = res.players || [];
        let players = incoming;
        if (append) {
          const seen = {};
          this.data.players.forEach(p => { seen[p.openId] = true; });
          players = this.data.players.concat(incoming.filter(p => !seen[p.openId]));
        }
        this.setData({
          loading: false,
          loadingMore: false,
          players,
          page: res.page,
          pageSize: res.pageSize,
          total: res.total,
          totalPages: res.totalPages
        });
        if (!append && wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      } else {
        this.setData({ loading: false, loadingMore: false });
      }
    }).catch(() => {
      this._fetching = false;
      if (fromPullDown && wx.stopPullDownRefresh) wx.stopPullDownRefresh();
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    });
  },

  loadMore() {
    if (this._fetching || this.data.loading || this.data.loadingMore) return;
    if (this.data.page >= this.data.totalPages) return;
    this.loadPage(this.data.page + 1, true);
  },

  openFormula() {
    this.setData({ showFormula: true });
  },
  closeFormula() {
    this.setData({ showFormula: false });
  },
  noop() {},

  onPlayerTap(e) {
    const { id, name, avatar, friend } = e.currentTarget.dataset;
    if (!id) return;
    const comp = this.selectComponent('#playerStats');
    if (!comp) return;
    comp.open({
      openId: id,
      nickName: name || '玩家',
      avatarUrl: avatar || DEFAULT_AVATAR,
      isFriend: friend === 'true' || friend === true,
      isSelf: id === this._openId
    });
  }
});
