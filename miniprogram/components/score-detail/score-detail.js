// 积分明细弹窗：展示某玩家的积分求和过程与公式
Component({
  options: { addGlobalClass: true },
  data: {
    show: false,
    nickName: '',
    detail: null,
    formulaOpen: false
  },
  methods: {
    open(opts) {
      const o = opts || {};
      this.setData({
        show: true,
        nickName: o.nickName || '玩家',
        detail: o.detail || null,
        formulaOpen: false
      });
    },
    close() {
      this.setData({ show: false, formulaOpen: false });
      this.triggerEvent('close');
    },
    toggleFormula() {
      this.setData({ formulaOpen: !this.data.formulaOpen });
    },
    noop() {}
  }
});
