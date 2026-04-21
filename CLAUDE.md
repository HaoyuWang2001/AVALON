# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在本代码库中工作提供指导。

## 项目概述

这是一个基于微信小程序和Express后端的阿瓦隆(Avalon)桌游平台。使用原生微信小程序框架开发，支持5-12人实时在线游戏，包含角色分配、投票、聊天等功能。

## 开发环境设置

1. **安装微信开发者工具** - 开发与部署的必需工具。
2. **配置AppID** - 在 `project.config.json` 中配置你的微信小程序AppID。
3. **启动后端服务** - 进入 `server` 目录，运行 `npm install` 和 `npm run dev` 启动Express + Socket.io服务器。
4. **修改API配置** - 在 `miniprogram/services/api.js` 中配置后端API地址（默认指向 `https://haoyu-wang141.top:8082`）。
5. **前端运行** - 在微信开发者工具中打开 `miniprogram` 目录，点击编译运行。

## 常见任务

### 运行应用程序
- 在微信开发者工具中打开项目，点击"编译"在模拟器中预览。
- 使用"真机调试"进行多人游戏测试。

### 添加新页面
1. 在 `pages/` 目录下创建新目录（例如 `pages/newpage/`）。
2. 创建四个文件：`.js`, `.json`, `.wxml`, `.wxss`。
3. 将页面路径添加到 `app.json` 的 `pages` 数组中。

### 添加新API端点
1. 在 `server/routes/` 目录下创建新路由文件，或扩展现有路由。
2. 在路由文件中添加新的端点处理逻辑。
3. 在 `server/index.js` 中注册路由（如为新文件）。
4. 在 `miniprogram/services/api.js` 中添加对应的API方法。

### 测试
- 未配置自动化测试框架；测试通过模拟器手动进行。
- 多人游戏测试需要使用不同微信账号的真实设备。

## 架构

### 高层结构
- **前端**：原生微信小程序（WXML/WXSS/JS）配合WeUI组件库。
- **后端**：Express + Socket.io 后端服务，使用内存存储（Map对象）。
- **实时更新**：Socket.io 实时通信实现玩家状态同步。
- **服务层**：`services/api.js` 封装HTTP API调用。

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