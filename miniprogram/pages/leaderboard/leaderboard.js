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
    jumpTo: ''
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

  loadPage(page) {
    this.setData({ loading: true });
    api.getLeaderboard(page, this.data.pageSize, this._openId).then(res => {
      if (res && res.success) {
        this.setData({
          loading: false,
          players: res.players || [],
          page: res.page,
          pageSize: res.pageSize,
          total: res.total,
          totalPages: res.totalPages
        });
        if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      } else {
        this.setData({ loading: false });
      }
    }).catch(() => this.setData({ loading: false }));
  },

  prevPage() {
    if (this.data.page > 1) this.loadPage(this.data.page - 1);
  },

  nextPage() {
    if (this.data.page < this.data.totalPages) this.loadPage(this.data.page + 1);
  },

  onJumpInput(e) {
    this.setData({ jumpTo: e.detail.value });
  },

  jumpPage() {
    const n = parseInt(this.data.jumpTo, 10);
    if (!n || n < 1 || n > this.data.totalPages) {
      wx.showToast({ title: `请输入 1-${this.data.totalPages}`, icon: 'none' });
      return;
    }
    this.setData({ jumpTo: '' });
    this.loadPage(n);
  },

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
