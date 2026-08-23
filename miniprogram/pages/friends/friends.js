// pages/friends/friends.js
const api = require('../../services/api.js');
const { DEFAULT_AVATAR, ROLE_NAMES } = require('../../utils/constants.js');

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '小时' + (m > 0 ? m + '分钟' : '');
  if (m > 0) return m + '分钟';
  return '不足1分钟';
}

Page({
  data: {
    me: { openId: '', uniqueId: '', avatarUrl: DEFAULT_AVATAR, nickName: '' },
    needSetupId: false,
    setupIdValue: '',
    setupBusy: false,
    // 搜索
    searchKeyword: '',
    searching: false,
    searchResult: null,      // {openId, nickName, avatarUrl, uniqueId, isFriend, hasPending}
    searchError: '',
    // 列表
    tab: 'friends',           // 'friends' | 'requests'
    friends: [],
    requestCount: 0,
    requests: [],
    loadingFriends: false,
    loadingRequests: false
  },

  onLoad() {
    this._openId = getApp().globalData.openId || wx.getStorageSync('openId') || '';
  },

  onShow() {
    this.loadMe();
    this.loadFriends();
    this.loadRequests();
  },

  onPullDownRefresh() {
    this.loadMe();
    this.loadFriends();
    this.loadRequests();
    wx.stopPullDownRefresh();
  },

  // ─── 我的ID ───
  loadMe() {
    const openId = this._openId;
    if (!openId) return;
    api.getUserProfile(openId).then(res => {
      if (res && res.success && res.user) {
        const u = res.user;
        this.setData({
          me: {
            openId: u.openId,
            uniqueId: u.uniqueId || '',
            avatarUrl: u.avatarUrl || DEFAULT_AVATAR,
            nickName: u.customNickName || u.wxNickName || '玩家'
          },
          needSetupId: !u.uniqueId
        });
      }
    }).catch(() => {});
  },

  copyMyId() {
    if (!this.data.me.uniqueId) return;
    wx.setClipboardData({ data: this.data.me.uniqueId });
  },

  onSetupIdInput(e) {
    this.setData({ setupIdValue: e.detail.value });
  },

  submitSetupId() {
    if (this.data.setupBusy) return;
    const id = (this.data.setupIdValue || '').trim();
    if (!id) {
      wx.showToast({ title: '请输入ID', icon: 'none' });
      return;
    }
    this.setData({ setupBusy: true });
    api.setUniqueId(this._openId, id).then(res => {
      this.setData({ setupBusy: false, needSetupId: false, setupIdValue: '' });
      this.loadMe();
      wx.showToast({ title: '设置成功', icon: 'success' });
    }).catch(err => {
      this.setData({ setupBusy: false });
      wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' });
    });
  },

  closeSetupId() {
    // 未设置ID时好友功能不可用，不允许跳过
    wx.showToast({ title: '请先设置ID', icon: 'none' });
  },

  // ─── 搜索 ───
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value, searchResult: null, searchError: '' });
  },

  doSearch() {
    const kw = (this.data.searchKeyword || '').trim();
    if (!kw) return;
    if (this.data.searching) return;
    this.setData({ searching: true, searchResult: null, searchError: '' });
    api.searchUser(this._openId, kw).then(res => {
      this.setData({ searching: false });
      if (res && res.success) {
        if (res.isSelf) {
          this.setData({ searchError: '这是你自己的ID' });
        } else if (res.found) {
          this.setData({ searchResult: res.user });
        } else {
          this.setData({ searchError: '未找到该ID用户' });
        }
      }
    }).catch(err => {
      this.setData({ searching: false });
      this.setData({ searchError: (err && err.message) || '搜索失败' });
    });
  },

  sendRequestFromSearch() {
    const target = this.data.searchResult;
    if (!target) return;
    api.sendFriendRequest(this._openId, target.openId).then(res => {
      if (res && res.success) {
        this.setData({ 'searchResult.hasPending': true });
        wx.showToast({ title: '申请已发送', icon: 'success' });
      }
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '申请失败', icon: 'none' });
    });
  },

  // ─── 好友列表 ───
  loadFriends() {
    if (!this._openId) return;
    this.setData({ loadingFriends: true });
    api.getFriends(this._openId).then(res => {
      this.setData({
        loadingFriends: false,
        friends: (res && res.friends) || []
      });
    }).catch(() => this.setData({ loadingFriends: false }));
  },

  goFriendDetail(e) {
    const openId = e.currentTarget.dataset.id;
    if (!openId) return;
    wx.navigateTo({ url: `/pages/friend-detail/friend-detail?openId=${openId}` });
  },

  // ─── 申请列表 ───
  loadRequests() {
    if (!this._openId) return;
    this.setData({ loadingRequests: true });
    api.getFriendRequests(this._openId).then(res => {
      const requests = (res && res.requests) || [];
      this.setData({
        loadingRequests: false,
        requests,
        requestCount: requests.length
      });
    }).catch(() => this.setData({ loadingRequests: false }));
  },

  respond(e) {
    const { id, accept } = e.currentTarget.dataset;
    const isAccept = accept === 'true';
    if (isAccept) {
      wx.showModal({
        title: '添加好友',
        content: '确定同意该好友申请吗？',
        success: (r) => {
          if (r.confirm) this._doRespond(id, true);
        }
      });
    } else {
      this._doRespond(id, false);
    }
  },

  _doRespond(requestId, accept) {
    api.respondFriendRequest(requestId, this._openId, accept).then(res => {
      if (res && res.success) {
        wx.showToast({ title: accept ? '已添加' : '已拒绝', icon: 'success' });
        this.loadRequests();
        this.loadFriends();
      }
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    });
  },

  // ─── tab 切换 ───
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === 'friends') this.loadFriends();
    else this.loadRequests();
  }
});
