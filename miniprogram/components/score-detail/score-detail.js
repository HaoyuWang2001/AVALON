// 积分明细弹窗：展示某玩家的积分求和过程与公式
Component({
  options: { addGlobalClass: true },
  data: {
    show: false,
    nickName: '',
    detail: null
  },
  methods: {
    open(opts) {
      const o = opts || {};
      this.setData({
        show: true,
        nickName: o.nickName || '玩家',
        detail: o.detail || null
      });
    },
    close() {
      this.setData({ show: false });
      this.triggerEvent('close');
    },
    noop() {}
  }
});
