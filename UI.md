# 阿瓦隆小程序 UI 设计规范

## 设计理念

极简主义 + 现代圆角风格，以紫色为主色调，营造神秘、高端的阿瓦隆游戏氛围。

---

## 1. 色彩系统

### 主色调（紫色系）

| 名称 | 色值 | 用途 |
|------|------|------|
| 主色 | `#7C3AED` | 主要按钮、强调元素 |
| 主色浅 | `#A78BFA` | 次要强调、hover状态 |
| 主色深 | `#5B21B6` | 按下状态、深色强调 |
| 渐变起 | `#8B5CF6` | 渐变起点 |
| 渐变止 | `#6D28D9` | 渐变终点 |

### 中性色

| 名称 | 色值 | 用途 |
|------|------|------|
| 背景色 | `#F9FAFB` | 页面背景 |
| 卡片背景 | `#FFFFFF` | 卡片、容器 |
| 边框色 | `#E5E7EB` | 分割线、边框 |
| 占位文字 | `#9CA3AF` | 次要文字 |
| 正文文字 | `#374151` | 主要文字 |
| 标题文字 | `#111827` | 标题文字 |

### 功能色

| 名称 | 色值 | 用途 |
|------|------|------|
| 成功 | `#10B981` | 好人阵营、成功状态 |
| 危险 | `#EF4444` | 坏人阵营、危险操作 |
| 警告 | `#F59E0B` | 警告提示 |
| 信息 | `#3B82F6` | 信息提示 |

### 角色专属色

| 角色 | 色值 | 用途 |
|------|------|------|
| 好人阵营 | `#10B981` | 正面、好人标识 |
| 坏人阵营 | `#EF4444` | 负面、坏人标识 |
| 梅林 | `#FBBF24` | 梅林角色 |
| 莫甘娜 | `#EC4899` | 莫甘娜角色 |
| 刺客 | `#DC2626` | 刺客角色 |
| 派西维尔 | `#6366F1` | 派西维尔角色 |

---

## 2. 圆角系统

| 尺寸 | 值 | 用途 |
|------|------|------|
| 小 | `8rpx` | 标签、徽章、小按钮 |
| 中 | `16rpx` | 按钮、输入框、卡片内元素 |
| 大 | `24rpx` | 卡片、模态框 |
| 超大 | `32rpx` | 大容器、重要卡片 |
| 全圆 | `50%` | 头像、圆形按钮 |

---

## 3. 阴影系统

| 名称 | 值 | 用途 |
|------|------|------|
| 轻微 | `0 2rpx 8rpx rgba(0,0,0,0.04)` | 卡片默认阴影 |
| 标准 | `0 4rpx 16rpx rgba(0,0,0,0.08)` | 悬浮卡片 |
| 强调 | `0 8rpx 24rpx rgba(124,58,237,0.15)` | 主按钮悬浮、强调元素 |
| 深色 | `0 12rpx 32rpx rgba(0,0,0,0.12)` | 模态框、弹出层 |

---

## 4. 字体系统

```wxss
font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

| 层级 | 字号 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| 大标题 | `48rpx` | `700` | `1.3` | 页面标题 |
| 副标题 | `36rpx` | `600` | `1.4` | 区块标题 |
| 正文大 | `32rpx` | `500` | `1.5` | 主要内容 |
| 正文 | `28rpx` | `400` | `1.5` | 一般文字 |
| 辅助 | `24rpx` | `400` | `1.4` | 次要信息 |
| 最小 | `22rpx` | `400` | `1.4` | 标签、徽章 |

---

## 5. 间距系统

| 名称 | 值 | 用途 |
|------|------|------|
| `xs` | `8rpx` | 紧凑间距 |
| `sm` | `16rpx` | 小间距 |
| `md` | `24rpx` | 标准间距 |
| `lg` | `32rpx` | 大间距 |
| `xl` | `48rpx` | 区块间距 |
| `xxl` | `64rpx` | 页面边距 |

---

## 6. 组件设计

### 6.1 按钮

```wxss
/* 主按钮 */
.btn-primary {
  background: linear-gradient(135deg, #8B5CF6, #6D28D9);
  color: white;
  border-radius: 16rpx;
  font-size: 32rpx;
  font-weight: 600;
  padding: 24rpx 48rpx;
  box-shadow: 0 4rpx 16rpx rgba(124,58,237,0.3);
  transition: all 0.2s ease;
}

.btn-primary:active {
  transform: scale(0.98);
  box-shadow: 0 2rpx 8rpx rgba(124,58,237,0.2);
}

/* 次要按钮 */
.btn-secondary {
  background: #F3F4F6;
  color: #374151;
  border-radius: 16rpx;
  font-size: 32rpx;
  font-weight: 500;
  padding: 24rpx 48rpx;
  transition: all 0.2s ease;
}

/* 成功按钮 */
.btn-success {
  background: linear-gradient(135deg, #34D399, #10B981);
  color: white;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(16,185,129,0.3);
}

/* 危险按钮 */
.btn-danger {
  background: linear-gradient(135deg, #F87171, #EF4444);
  color: white;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(239,68,68,0.3);
}

/* 幽灵按钮 */
.btn-ghost {
  background: transparent;
  color: #7C3AED;
  border: 2rpx solid #7C3AED;
  border-radius: 16rpx;
}
```

**按钮尺寸变体：**
- 大按钮：`padding: 28rpx 56rpx; font-size: 36rpx;`
- 标准按钮：`padding: 24rpx 48rpx; font-size: 32rpx;`
- 小按钮：`padding: 16rpx 32rpx; font-size: 28rpx;`
- 迷你按钮：`padding: 10rpx 20rpx; font-size: 24rpx; border-radius: 8rpx;`

---

### 6.2 卡片

```wxss
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx;
  margin: 24rpx 0;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
  border: 1rpx solid rgba(0,0,0,0.04);
}

.card-elevated {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx;
  margin: 24rpx 0;
  box-shadow: 0 8rpx 24rpx rgba(124,58,237,0.1);
}

.card-interactive {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx;
  transition: all 0.2s ease;
}

.card-interactive:active {
  transform: scale(0.99);
  background: #F9FAFB;
}
```

---

### 6.3 头像

```wxss
.avatar {
  border-radius: 50%;
  border: 3rpx solid #7C3AED;
}

.avatar-lg {
  width: 140rpx;
  height: 140rpx;
  border-width: 4rpx;
}

.avatar-md {
  width: 100rpx;
  height: 100rpx;
}

.avatar-sm {
  width: 72rpx;
  height: 72rpx;
}

.avatar-xs {
  width: 48rpx;
  height: 48rpx;
}
```

---

### 6.4 标签/徽章

```wxss
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 20rpx;
  border-radius: 100rpx;
  font-size: 24rpx;
  font-weight: 500;
}

.badge-primary {
  background: rgba(124,58,237,0.1);
  color: #7C3AED;
}

.badge-success {
  background: rgba(16,185,129,0.1);
  color: #10B981;
}

.badge-danger {
  background: rgba(239,68,68,0.1);
  color: #EF4444;
}
```

---

### 6.5 输入框

```wxss
.input {
  background: #F9FAFB;
  border: 2rpx solid #E5E7EB;
  border-radius: 16rpx;
  padding: 24rpx;
  font-size: 32rpx;
  transition: all 0.2s ease;
}

.input:focus {
  border-color: #7C3AED;
  background: #FFFFFF;
  box-shadow: 0 0 0 4rpx rgba(124,58,237,0.1);
}

.input::placeholder {
  color: #9CA3AF;
}
```

---

### 6.6 列表项

```wxss
.list-item {
  display: flex;
  align-items: center;
  padding: 28rpx;
  background: #FFFFFF;
  border-radius: 16rpx;
  margin: 12rpx 0;
  transition: all 0.2s ease;
}

.list-item:active {
  background: #F9FAFB;
}

.list-item-divider {
  border-bottom: 1rpx solid #E5E7EB;
  border-radius: 0;
  margin: 0;
}
```

---

## 7. 页面布局

### 页面容器

```wxss
.page {
  min-height: 100vh;
  background: #F9FAFB;
  padding: 24rpx;
}

.page-header {
  padding: 32rpx 0 48rpx;
}

.page-title {
  font-size: 48rpx;
  font-weight: 700;
  color: #111827;
}

.page-subtitle {
  font-size: 28rpx;
  color: #6B7280;
  margin-top: 8rpx;
}

.page-content {
  padding-bottom: 120rpx;
}
```

### 安全区域

```wxss
.safe-area-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
```

---

## 8. 动画规范

### 过渡时长

| 类型 | 时长 |
|------|------|
| 快速 | `150ms` |
| 标准 | `200ms` |
| 慢速 | `300ms` |

### 缓动函数

```wxss
/* 标准 */
transition: all 0.2s ease;

/* 弹性 */
transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

/* 平滑 */
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 9. 图标规范

- 图标库：优先使用系统图标或 Iconify 图标库
- 图标尺寸：`40rpx`（标准）、`48rpx`（大）、`32rpx`（小）
- 图标颜色：跟随文字颜色或使用主题色 `#7C3AED`

---

## 10. 应用示例

### 首页设计

- 顶部：Logo + 标题，极简风格
- 中部：主操作按钮（大圆角卡片式）
- 底部：版本信息，超淡灰色

### 房间页设计

- 玩家列表：圆角卡片，带头像和状态指示器
- 准备状态：紫色渐变徽章
- 按钮：全宽大按钮，圆角24rpx

### 游戏页设计

- 玩家卡片：圆角+微妙阴影
- 投票按钮：大面积触摸区域
- 结果展示：渐变背景卡片

### 用户页设计

- 头部卡片：用户信息+统计
- 菜单项：圆角列表，点击反馈
- 底部版权：超淡文字

---

## 11. 全局样式模板 (app.wxss)

```wxss
/* ==================== 变量定义 ==================== */
page {
  --primary: #7C3AED;
  --primary-light: #A78BFA;
  --primary-dark: #5B21B6;
  --gradient-start: #8B5CF6;
  --gradient-end: #6D28D9;
  --bg-page: #F9FAFB;
  --bg-card: #FFFFFF;
  --border-color: #E5E7EB;
  --text-muted: #9CA3AF;
  --text-body: #374151;
  --text-title: #111827;
  --success: #10B981;
  --danger: #EF4444;
  --warning: #F59E0B;
  --radius-sm: 8rpx;
  --radius-md: 16rpx;
  --radius-lg: 24rpx;
  --radius-xl: 32rpx;
  --shadow-sm: 0 2rpx 8rpx rgba(0,0,0,0.04);
  --shadow-md: 0 4rpx 16rpx rgba(0,0,0,0.08);
  --shadow-primary: 0 8rpx 24rpx rgba(124,58,237,0.15);

  font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg-page);
  color: var(--text-body);
  line-height: 1.5;
}

/* ==================== 基础组件 ==================== */
.container {
  padding: 24rpx;
}

.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 32rpx;
  margin: 24rpx 0;
  box-shadow: var(--shadow-sm);
}

.btn {
  border-radius: var(--radius-md);
  font-size: 32rpx;
  font-weight: 600;
  padding: 24rpx 48rpx;
  transition: all 0.2s ease;
}

.btn-primary {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  color: white;
  box-shadow: var(--shadow-primary);
}

.btn-secondary {
  background: #F3F4F6;
  color: var(--text-body);
}

.btn-success {
  background: linear-gradient(135deg, #34D399, var(--success));
  color: white;
}

.btn-danger {
  background: linear-gradient(135deg, #F87171, var(--danger));
  color: white;
}

/* ==================== 文字样式 ==================== */
.title {
  font-size: 48rpx;
  font-weight: 700;
  color: var(--text-title);
}

.subtitle {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--text-title);
}

.text-muted {
  color: var(--text-muted);
  font-size: 28rpx;
}

.text-center {
  text-align: center;
}

/* ==================== 布局工具 ==================== */
.flex {
  display: flex;
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.flex-col {
  display: flex;
  flex-direction: column;
}

/* ==================== 间距工具 ==================== */
.mt-1 { margin-top: 8rpx; }
.mt-2 { margin-top: 16rpx; }
.mt-3 { margin-top: 24rpx; }
.mt-4 { margin-top: 32rpx; }

.mb-1 { margin-bottom: 8rpx; }
.mb-2 { margin-bottom: 16rpx; }
.mb-3 { margin-bottom: 24rpx; }
.mb-4 { margin-bottom: 32rpx; }

.p-1 { padding: 8rpx; }
.p-2 { padding: 16rpx; }
.p-3 { padding: 24rpx; }
.p-4 { padding: 32rpx; }
```
