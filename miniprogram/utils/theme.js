// utils/theme.js — 主题切换工具（与 styles/themes.wxss 配套）
// 用法（任意页面接入暗黑主题）：
//   1) 根 <view class="page {{themeClass}}">
//   2) js: const { getThemeClass, getThemeBg, applyTheme } = require('../../utils/theme.js');
//      onLoad: const tc = getThemeClass(); this.setData({ themeClass: tc });
//      onShow: wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
//   3) 切换按钮：用 components/theme-toggle（bind:change 回调里 setData themeClass）

const STORAGE_KEY = 'avalon_theme';

// 主题 key → 页面元素背景色（亮色用 '' 表示默认）
const THEME_BG = {
  '': '#F5F5F5',
  torch: '#14110E',
  aurora: '#0F0B1A',
  steel: '#171A1F'
};

const THEME_ORDER = ['torch', 'aurora', 'steel', ''];
const THEME_LABELS = ['🔥 烛光殿堂', '🌌 暗夜圆桌', '⚔️ 锻造钢铁', '☀️ 亮色'];

// 读取当前主题 key（'' = 亮色）
function getThemeClass() {
  const t = wx.getStorageSync(STORAGE_KEY);
  return Object.prototype.hasOwnProperty.call(THEME_BG, t) ? t : '';
}

function getThemeBg(theme) {
  return Object.prototype.hasOwnProperty.call(THEME_BG, theme) ? THEME_BG[theme] : THEME_BG[''];
}

// 应用主题：写入 storage + 同步页面元素背景（wx.setBackgroundColor 需在页面 onShow 后再调）
function applyTheme(theme) {
  wx.setStorageSync(STORAGE_KEY, theme);
  wx.setBackgroundColor({ backgroundColor: getThemeBg(theme) });
  return theme;
}

// 弹出主题选择 actionSheet；取消返回 null
function pickTheme() {
  return new Promise((resolve) => {
    wx.showActionSheet({
      itemList: THEME_LABELS,
      success: (res) => {
        resolve(THEME_ORDER[res.tapIndex] !== undefined ? THEME_ORDER[res.tapIndex] : null);
      },
      fail: () => resolve(null)
    });
  });
}

module.exports = { getThemeClass, getThemeBg, applyTheme, pickTheme, THEME_BG };
