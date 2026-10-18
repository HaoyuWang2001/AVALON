// pages/records/records.js
// 线下对局记录列表：记录中（继续记录/删除）+ 已完成（查看回放/编辑/删除）
const api = require('../../services/api.js');
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { BOARD_TYPE_LABELS } = require('../../utils/constants.js');

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'string' ? ts.replace(/-/g, '/') : ts);
  if (isNaN(d.getTime())) return '';
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    themeClass: '',
    loading: true,
    recording: [],
    completed: []
  },

  onLoad() {
    this.setData({ themeClass: getThemeClass() });
  },

  onShow() {
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return api.getOfflineRecords().then(res => {
      if (!res || !res.success) {
        this.setData({ loading: false });
        return;
      }
      const items = (res.records || []).map(r => ({
        id: r.id,
        isOwner: r.isOwner,
        status: r.status,
        boardLabel: BOARD_TYPE_LABELS[r.boardType] || r.boardType,
        playerCount: r.playerCount,
        seatsApproved: r.seats ? r.seats.approved : 0,
        seatsPending: r.seats ? r.seats.pending : 0,
        gameId: r.gameId,
        timeText: fmtTime(r.status === 'completed' ? r.completedAt : r.createdAt),
        mySeat: r.mySeat
      }));
      this.setData({
        loading: false,
        recording: items.filter(r => r.status === 'recording'),
        completed: items.filter(r => r.status === 'completed')
      });
    }).catch(() => this.setData({ loading: false }));
  },

  createRecord() {
    wx.navigateTo({ url: '/pages/configs/configs?mode=record' });
  },

  openRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/record-detail/record-detail?recordId=${id}` });
  },

  viewReplay(e) {
    const gameId = e.currentTarget.dataset.game;
    if (!gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '将连同已生成的对局与统计数据一并删除，不可恢复',
      confirmColor: '#DC2626',
      success: res => {
        if (!res.confirm) return;
        api.deleteOfflineRecord(id).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        }).catch(err => {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        });
      }
    });
  }
});
