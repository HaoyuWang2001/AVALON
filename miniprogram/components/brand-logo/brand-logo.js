// 品牌徽标：1b5 / 1d5 两款随机（每次启动随机一次），按主题选择对应 PNG
const { getThemeClass } = require('../../utils/theme.js');

const THEMES = ['light', 'torch', 'aurora', 'steel'];
// 每次小程序启动随机二选一（模块级常量，所有实例一致）
const PICKED = Math.random() < 0.5 ? '1b5' : '1d5';

Component({
  properties: {
    size: { type: String, value: 'normal' }, // normal | mini
    theme: { type: String, value: '' }       // 传入页面 themeClass；空=亮色
  },
  data: {
    src: `/images/brand/logo-${PICKED}-light.png`
  },
  lifetimes: {
    attached() { this._refresh(); }
  },
  observers: {
    theme() { this._refresh(); }
  },
  methods: {
    _refresh() {
      const t = this.data.theme || getThemeClass();
      const key = THEMES.includes(t) ? t : 'light';
      this.setData({ src: `/images/brand/logo-${PICKED}-${key}.png` });
    }
  }
});
