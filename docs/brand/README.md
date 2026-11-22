# 品牌徽标

## 最终方案
- 两款设计随机展示（每次启动随机二选一，当前会话内一致）：
  - `1b5`：厚环印章 + 八向射线 + 中心点
  - `1d5`：细环 + 四角菱形 + 交叉细剑
- 每个主题色单独生成 PNG（`miniprogram/images/brand/`，192×192 透明底）：
  - `light`：亮色紫
  - `torch`：烛光金
  - `aurora`：暗夜亮紫
  - `steel`：钢铁银蓝
- 组件 `components/brand-logo` 按 `theme` 属性（页面 themeClass）选择对应 PNG，`size` 支持 `normal`(96rpx) / `mini`(46rpx)
- 设计源文件：本目录 `logo-{1b5,1d5}-{light,torch,aurora,steel}.svg`（512 矢量，原创设计）
