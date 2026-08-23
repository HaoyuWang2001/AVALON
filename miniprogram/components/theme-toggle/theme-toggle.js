// components/theme-toggle/theme-toggle.js — 主题切换按钮（可插拔）
// 用法：页面 json 注册后，wxml 放 <theme-toggle bind:change="onThemeChange" />；
//      页面 js 里 onThemeChange(e){ this.setData({ themeClass: e.detail.themeClass }); }
const { pickTheme, applyTheme } = require('../../utils/theme.js');

Component({
  methods: {
    async onTap() {
      const picked = await pickTheme();
      if (picked === null) return;
      applyTheme(picked);
      this.triggerEvent('change', { themeClass: picked });
    }
  }
});
