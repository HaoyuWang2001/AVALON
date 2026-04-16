# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在本代码库中工作提供指导。

## 项目概述

这是一个基于微信小程序和微信云开发的阿瓦隆(Avalon)桌游平台。使用原生微信小程序框架开发，支持5-10人实时在线游戏，包含角色分配、投票、聊天等功能。

## 开发环境设置

1. **安装微信开发者工具** - 开发与部署的必需工具。
2. **配置AppID** - 在 `project.config.json` 中配置你的微信小程序AppID。
3. **配置云环境** - 在 `app.js` 中设置云环境ID (`wx.cloud.init`)。
4. **部署云函数** - 在微信开发者工具中右键点击 `cloudfunctions` 目录，选择"创建并部署：云端安装依赖"，然后逐个上传云函数。
5. **创建数据库集合** - 在云开发控制台中创建集合：`rooms`, `games`, `chatMessages`。

## 常见任务

### 运行应用程序
- 在微信开发者工具中打开项目，点击"编译"在模拟器中预览。
- 使用"真机调试"进行多人游戏测试。

### 添加新页面
1. 在 `pages/` 目录下创建新目录（例如 `pages/newpage/`）。
2. 创建四个文件：`.js`, `.json`, `.wxml`, `.wxss`。
3. 将页面路径添加到 `app.json` 的 `pages` 数组中。

### 添加新云函数
1. 在 `cloudfunctions/` 目录下创建新目录（例如 `newFunction/`）。
2. 创建 `index.js`（入口文件）和 `package.json`（依赖配置）。
3. 在微信开发者工具中右键点击目录，选择"上传并部署"。

### 测试
- 未配置自动化测试框架；测试通过模拟器手动进行。
- 多人游戏测试需要使用不同微信账号的真实设备。

## 架构

### 高层结构
- **前端**：原生微信小程序（WXML/WXSS/JS）配合WeUI组件库。
- **后端**：微信云函数（无服务器）和云数据库。
- **实时更新**：数据库监听器（`db.collection().watch()`）同步客户端间的游戏状态。
- **服务层**：`services/api.js` 封装云函数调用。

### 关键目录
- `pages/` - 小程序页面：`index`（首页），`room`（房间页），`game`（游戏页），`user`（用户中心）。
- `cloudfunctions/` - 云函数：`createRoom`, `joinRoom`, `startGame`, `toggleReady` 等。
- `services/` - API服务层（`api.js`）。
- `utils/` - 共享工具：`constants.js`（游戏规则），`gameLogic.js`（游戏逻辑）。
- `images/` - 静态图片资源。

### 数据模型
- **rooms 集合**：房间元数据、玩家列表、准备状态。
- **games 集合**：游戏状态、玩家角色、当前阶段、投票结果。
- **chatMessages 集合**：游戏内聊天消息。

### 状态管理
- 通过 `setData` 管理本地组件状态。
- 实时数据库监听器实现跨客户端同步。
- 无全局状态管理库；状态从云数据库派生。

## 关键文件

- `app.js` - 应用入口点，包含云初始化。
- `app.json` - 应用配置（页面、窗口样式等）。
- `project.config.json` - 开发者工具配置（AppID、设置）。
- `services/api.js` - 统一的API客户端，用于调用云函数。
- `utils/constants.js` - 游戏常量（角色、阶段、玩家数量）。
- `utils/gameLogic.js` - 核心游戏逻辑工具。

## 重要注意事项

- **云资源配额**：微信云开发有使用限制；需监控数据库读写次数。
- **实时监听器**：优化以避免过度读取；考虑节流。
- **游戏类目**：微信对游戏类小程序有特定资质要求；确保正确选择类目。
- **网络处理**：实现健壮的错误处理以应对多人游戏会话中的网络中断。
- **安全性**：依赖微信内置的身份验证（`openId`）；无需额外的认证。
- **无传统构建系统**：无npm脚本、webpack或代码检查；依赖微信开发者工具进行编译和部署。

## 参考文档

- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [WeUI 文档](https://weui.io/)
- 项目 README.md 包含详细的设置说明和游戏流程。