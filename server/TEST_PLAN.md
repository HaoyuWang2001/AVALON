# AVALON 后端端到端测试文档

## 1. 测试目标

在无真人用户条件下，由单人驱动自动化测试，端到端验证后端服务从创建房间到游戏结束的完整生命周期。

- 覆盖 5-12 人全部基础版型，对每个玩家数分别跑完整游戏流程。
- 覆盖单 Lancelot 变体配置（仅 lancelotBlue 或仅 lancelotRed）。
- 覆盖特殊规则：强制发车（流车阈值）、湖仙验人、兰斯洛特身份转换及其对投票选项的影响。
- 覆盖两条胜负路径：好人胜利（3 次任务成功 + 刺客刺杀阶段未命中梅林）与坏人胜利（3 次任务失败 或 刺杀命中梅林）。
- 覆盖 Socket.io 实时通信广播。
- 覆盖边界与并发场景。
- 使用独立测试数据库，绝不触碰生产数据。

## 2. 测试模式

### 2.1 环境拓扑

测试运行在腾讯云服务器上，复用已部署的 Docker 基础设施：

```
┌──────────────────────────────────────────────────┐
│                  腾讯云服务器                      │
│                                                    │
│  ┌──────────────┐       ┌───────────────────┐    │
│  │  MySQL 容器   │       │  生产后端容器        │    │
│  │  (avalon-     │       │  端口 8082         │    │
│  │   mysql)      │       │  DB=avalon_db      │    │
│  │  端口 3306    │       │  ← 测试不触碰       │    │
│  │               │       ├───────────────────┤    │
│  │  avalon_db    │       │  测试后端容器        │    │
│  │  avalon_db    │       │  (avalon-server-   │    │
│  │  _test ←─────┼───────┤   test)            │    │
│  │  (临时)       │       │  DB=avalon_db_test │    │
│  └──────────────┘       │  端口 0(随机)       │    │
│                         │  不对外暴露          │    │
│                         │  Jest 在容器内运行   │    │
│                         └───────────────────┘    │
│                                                    │
│  Docker 网络: avalon-net                           │
└──────────────────────────────────────────────────┘
```

### 2.2 仅 MySQL 模式

后端仅支持 MySQL 存储模式。内存存储模式已移除。若数据库初始化失败，服务直接退出。

### 2.3 gameId 与 roomId

| 标识符 | 生成时机 | 格式 | 用途 |
|--------|---------|------|------|
| `roomId` | 创建房间时 | 6 位数字字符串 | 房间操作 API |
| `gameId` | 游戏启动时（`POST /api/games/start`） | UUID | 游戏操作 API |

所有游戏类 API 使用 `gameId`，所有房间类 API 使用 `roomId`。

### 2.4 测试数据库生命周期

```
globalSetup:
  1. root 连接 MySQL
  2. DROP DATABASE IF EXISTS avalon_db_test
  3. CREATE DATABASE avalon_db_test
  4. GRANT ALL ON avalon_db_test.* TO avalon_test_user
  5. 执行建表 DDL（9 张表，含 role_configurations 种子数据）
  6. require('index.js') 启动测试后端（DB_NAME=avalon_db_test, PORT=0）
  7. 等待 listening，写 port 到临时文件

globalTeardown:
  1. server.close() + db.closePool()
  2. root 连接 MySQL
  3. DROP DATABASE IF EXISTS avalon_db_test
  4. 删除临时文件
```

## 3. 完整游戏状态与主流程

> 本章描述游戏正常运行时的完整状态与流程，是后续各测试阶段（§5）的设计依据。
> 各测试套件的**具体测试目标**由人工决定；本文档先固化规则本身。

### 3.1 阶段定义

| 阶段 | 说明 |
|------|------|
| roleReveal | 查看身份；生成首位车长；湖仙落位；角色互知信息在此固化 |
| discussion | 车长预选车队、指定发言顺序、轮流发言（计时仅前端）、车长总结发言 |
| submitNomination（动作） | 车长确定车队，调用后直接进入 teamVote，不单独停留 |
| teamVote | 全体玩家投票（approve/reject）；>半数发车，≤半数流车 |
| missionVote | 车上成员投 success/fail（判定见 §4.3），任务结果驱动进入下一轮 |
| lakeInspection（子阶段） | 湖仙验人；仅当湖仙激活且触发条件满足时插入，阻塞 |
| assassination | 好人 3 次任务成功后进入；刺客/莫甘娜开刀 |
| gameEnd | 游戏结束，房间重置 |

### 3.2 主流程状态机

```
roleReveal → discussion → [submitNomination] → teamVote
  ├─ 发车(>半数) → missionVote
  │     ├─ 成功≥3 → assassination →[assassinate]→ gameEnd
  │     ├─ 失败≥3 → gameEnd (evil)
  │     └─ 否则 → 轮次转换触发链 → discussion(下一轮, 号牌+1)
  └─ 流车(≤半数) → discussion(round 不变, 号牌+1, 流车数+1)
       └─ 流车数达 maxFailedNominations → 强制发车(见 3.4.1)
```

#### 轮次转换触发链（发车成功后、进入下一轮 discussion 前，顺序固定）

```
完成轮次 r ∈ [ladyOfTheLakeRound, 4] 且启用湖仙:
  ① 湖仙验人(阻塞 lakeInspection 子阶段) → 持有者验人/跳过 → 令牌传给被查验者
完成轮次 r ∈ [lancelotSwapRound, 4] 且存在兰斯洛特:
  ② 抽卡 1 张(不放回) → 抽中转则更新阵营(见 3.4.3)
→ 进入下一轮 discussion
```

### 3.3 每轮详流程（discussion）

- 车长预选车队：任意人数/可空；本局玩家可见、**不入库**、可随时随意更改（内存态 + socket 广播）。
- 指定发言顺序：由车长选择，服务端跟踪当前发言人。
- 轮流发言：按序进行；若配置 `limits.speechTimeout`，由**前端倒计时**（服务端不下发 deadline、不强制打断；测试不覆盖计时）。
- 车长总结发言。
- 车长正式选车：`submitNomination`（动作）→ teamVote。

### 3.4 特殊规则

#### 3.4.1 强制发车

流车数达 `rules.maxFailedNominations` 后，下一车由**在任车主**强制发车：

- 跳过 discussion 与 teamVote，仅 submitNomination → missionVote。
- 任务结束后进入下一轮，流车数重置为 0。
- 游戏状态需暴露 `forcedSend` 标志供前端识别。

#### 3.4.2 湖仙（Lady of the Lake）

- 激活：`rules.ladyOfTheLake === true`；触发窗口为**完成轮次 r ∈ [ladyOfTheLakeRound, 4]** 的每次轮次转换。
- 落位：初始持有者 = 首位车长号牌 - 1（取模回绕到 N）。
- 验人：持有者选择一名**未当过湖仙**的在局玩家，获知其**当前阵营**（good/evil，不显示具体身份）；结果仅持有者可见。
- 传递：查验后令牌**传给被查验者**；可跳过（令牌不传递、继续持有）。
- 终止：当全部在局玩家都当过湖仙后，湖仙停止触发。

#### 3.4.3 兰斯洛特（Lancelot）

- 触发窗口：**完成轮次 r ∈ [lancelotSwapRound, 4]** 的每次轮次转换抽卡 1 张（不放回）。
- 卡组：默认 2 张转换 / 5 张不转（共 7 张）；窗口内最多抽 4 次，局内不会抽空；后续比例由房主配置。
- 单兰斯洛特：抽中转换卡 → 该兰斯洛特阵营翻转。
- 双兰斯洛特：蓝红两兰斯洛特**始终异侧**；抽中转换卡 → 同时互换（蓝→坏、红→好）。
- 转换效果：更新 `game_players.side`；**mission-fail 投票权限按当前阵营判定**（转换后 lancelotBlue 可投 fail、lancelotRed 不可投 fail）——即"投票选项变化"。
- 互知固化：对其他角色的知晓信息在 roleReveal 阶段**固化**，不随兰斯洛特转换更新。

#### 3.4.4 触发顺序

湖仙验人在前、兰斯洛特抽卡在后（见 §3.2 触发链）。

### 3.5 游戏内完整状态

- **DB 持久化**：`games`（phase/round/teamLeaderIndex/nominatedTeam/failedNominations/assassination/gameResult）、`game_players`（role/side，**side 可更新**）、`votes`、`mission_results`、`role_configurations`。
- **内存态（不入库，游戏结束清空）**：讨论态 `preTeam`/`speakingOrder`/`currentSpeaker`；湖仙 `holder`/`history`；`forcedSend` 标志。刷新可查（`getGameState` 合并返回）。

### 3.6 首位车长与湖仙落位

- 首位车长：`teamLeaderIndex = 当前时钟分钟 % 玩家人数`（开局即 roleReveal 阶段生成，此后流车/进入下一轮时号牌 +1 轮转）。
- 湖仙初始持有者 index = `(teamLeaderIndex - 1 + N) % N`（即首位车长号牌 - 1，取模回绕）。

## 4. 游戏规则与配置

### 4.1 角色配置

#### 标准配置（5-12 人）

| N | 角色数组 | good | evil |
|---|---------|------|------|
| 5 | merlin, percival, loyal, morgana, assassin | 3 | 2 |
| 6 | merlin, percival, loyal, loyal, morgana, assassin | 4 | 2 |
| 7 | merlin, percival, loyal, loyal, morgana, assassin, oberon | 4 | 3 |
| 8 | merlin, percival, loyal, loyal, loyal, morgana, assassin, minion | 5 | 3 |
| 9 | merlin, percival, loyal, loyal, loyal, loyal, morgana, assassin, mordred | 6 | 3 |
| 10 | merlin, percival, loyal, loyal, loyal, loyal, morgana, assassin, mordred, oberon | 6 | 4 |
| 11 | merlin, percival, loyal, loyal, loyal, loyal, lancelotBlue, morgana, mordred, oberon, lancelotRed | 7 | 4 |
| 12 | merlin, percival, loyal, loyal, loyal, loyal, lancelotBlue, morgana, assassin, mordred, oberon, lancelotRed | 7 | 5 |

#### 单 Lancelot 变体配置（10 人）

用于验证系统在仅有一个 Lancelot 角色时正常工作。通过 roomConfig 自定义传入，非默认配置。

| 变体 | 角色数组 | good | evil |
|------|---------|------|------|
| 仅 lancelotBlue | merlin, percival, loyal, loyal, loyal, lancelotBlue, morgana, assassin, mordred, oberon | 6 | 4 |
| 仅 lancelotRed | merlin, percival, loyal, loyal, loyal, lancelotRed, morgana, assassin, mordred, oberon | 5 | 5 |

#### 验证用扩展板子（套件 03）

用于角色视野/湖仙落位等针对性验证，通过 roomConfig 自定义传入：

| N | 角色数组 | good | evil | 说明 |
|---|---------|------|------|------|
| 10 | merlin, percival, loyal×4, morgana, assassin, mordred, lancelotRed | 6 | 4 | 单兰斯洛特（红）；睁眼狼=morgana/assassin/mordred |
| 9 | merlin, percival, loyal×3, lancelotBlue, morgana, assassin, mordred | 6 | 3 | 单兰斯洛特（蓝） |

### 4.2 队伍大小

| N | R1 | R2 | R3 | R4 | R5 |
|---|----|----|----|----|----|
| 5 | 2 | 3 | 2 | 3 | 3 |
| 6 | 2 | 3 | 4 | 3 | 4 |
| 7 | 2 | 3 | 3 | 4 | 4 |
| 8 | 3 | 4 | 4 | 5 | 5 |
| 9 | 3 | 4 | 4 | 5 | 5 |
| 10 | 3 | 4 | 4 | 5 | 5 |
| 11 | 3 | 4 | 5 | 6 | 6 |
| 12 | 3 | 4 | 5 | 6 | 6 |

### 4.3 投票规则

#### 队伍投票（castVote）

全体 N 人参与投票（approve/reject）。
- approve > 半数（发车）→ 进入任务投票阶段 missionVote
- approve ≤ 半数（流车）→ leader 号牌 +1 轮转，回 discussion（round 不变，流车数 +1）；流车数达阈值触发强制发车（见 §3.4.1）

#### 任务投票（castMissionVote）

仅被提名的任务队成员参与投票（success/fail）。仅**当前阵营为 evil** 的成员可投 fail
（兰斯洛特发生身份转换后，按 `game_players.side` 当前阵营判定，而非角色名）。

任务失败判定（**一张坏票即失败**，除保护轮外）：

```
基础规则（5-6 人局全部轮次 + 7+ 人局非保护轮次）：
  failCount >= 1 → 任务失败（一张坏票即失败）
  failCount === 0 → 任务成功

保护轮规则（7+ 人局第 4 轮，称为"保护轮"）：
  playerCount >= 7 && currentRound === 4 && failCount >= 2 → 任务失败
  playerCount >= 7 && currentRound === 4 && failCount < 2  → 任务成功
```

> 说明：仅 ≥7 人局第 4 轮是保护轮（需 2 张坏票才失败）。其余所有轮次 —— 含 5-6 人局
> 的全部轮次、以及 7+ 人局的第 1/2/3/5 轮 —— 均为 1 张坏票即任务失败。

### 4.4 胜负条件

| 结果 | 条件 |
|------|------|
| 好人胜 | 3 次任务成功 → 进入刺杀阶段 → 刺客未命中梅林 → gameEnd (good) |
| 坏人胜 | 3 次任务失败 → gameEnd (evil) |
| 坏人胜 | 刺杀命中梅林 → gameEnd (evil) |

### 4.5 刺杀梅林机制

#### 刺杀者

- **有 assassin 的对局**：仅 role === 'assassin' 的玩家可发起刺杀。
- **无 assassin 的对局**（11 人标准配置）：仅 role === 'morgana' 的玩家可发起刺杀。

#### 时机

游戏任意非 gameEnd 阶段均可发起。

#### 流程

```
1. 刺客（或莫甘娜）调用 assassinate API，指定目标
2. 游戏强制进入 assassination 阶段（无论之前在哪个阶段）
3. 判定结果：
   - 命中（target.role === 'merlin'）→ gameEnd, winner='evil'
   - 未命中（target.role !== 'merlin'）→ gameEnd, winner='good'
4. 无论结果如何，执行刺杀后必定进入 gameEnd
```

#### 次数

当前：一次刺杀即结束游戏（命中 → 坏人胜，未命中 → 好人胜）。

> **后续扩展**（暂未实现）：房间配置中增加"允许多次开刀"选项。启用后，刺客可多次尝试直到刺中梅林；未命中时游戏留在 assassination 阶段，刺客可再次发起。

### 4.6 房间配置字段（roomConfig）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `roles.good` / `roles.evil` | string[] | — | 各阵营角色列表 |
| `rules.evilKnowsEachOther` | bool | true | 坏人互认：睁眼狼（morgana/assassin/minion/mordred）互知身份；oberon 互隐；**不含 lancelotRed** |
| `rules.evilsKnowRedLancelot` | bool | true | **睁眼狼是否知道红兰斯洛特身份（可选）** |
| `rules.oberonKnowsRedLancelot` | bool | true | **奥伯伦是否知道红兰斯洛特身份（可选）** |
| `rules.merlinKnowsLancelotSide` | bool | true | **梅林能否分辨蓝/红兰各自阵营（兰斯洛特恒可见；可选）** |
| `rules.lancelotsKnowEachOther` | bool | false | 蓝↔红兰斯洛特互认（初始角色，reveal 固化） |
| `rules.lancelotSwapRound` | int | 2 | 兰斯洛特转换激活轮（**仅 1-4**；第 x 轮结束、第 x+1 轮开始触发；0/5 拒绝） |
| `rules.lancelotSwapForce` | string? | — | 兰斯洛特抽卡确定性控制（测试/观战用）：`'switch'`/`'keep'`，缺省随机 2/7 |
| `rules.ladyOfTheLake` | bool | false | 湖仙启用 |
| `rules.ladyOfTheLakeRound` | int | 2 | 湖仙激活轮 |
| `rules.maxFailedNominations` | int | 3 | 流车阈值（触发强制发车） |
| `rules.oberonMustFailMission` / `rules.lancelotMustFail` | bool | false | 奥伯伦/（任意当前为 evil 的）兰斯洛特必须投失败 |
| `rules.voteVisibility` | enum | public | 投票可见性 public/anonymous |
| `rules.missionFailDetail` | enum | count | 任务失败详情 count/binary |
| `merlinVision.canSee` | string[] | [assassin,morgana,minion,oberon,lancelotRed] | 梅林可见的坏人角色（**除莫德雷德**） |
| `merlinVision.canIdentify` | string[] | [] | 梅林可识别具体身份的角色 |
| `limits.speechTimeout` / `roundTimeout` / `voteTimeout` | int? | null | 超时秒数（null=不限；发言计时仅前端） |
| `meta.roomName` / `roomDescription` / `tags` | — | — | 房间元信息 |
| `spectator.allow` | bool | true | 允许观战 |
| `spectator.max` | int | 0 | 观战上限（0=不限） |

> 新增 `evilsKnowRedLancelot` / `oberonKnowsRedLancelot` 为**可选字段**（缺省按上述默认），仅当出现时校验布尔。前端 `getRoomConfig()` 需补充发送这两个字段（后端完成后适配）。

## 5. 测试阶段

### 阶段 0：健康检查 — `01_health.test.js`

| 用例 | 断言 |
|------|------|
| `GET /hello` | 200，文本 "hello" |
| `GET /api/health` | 200，`database.initialized === true`，`database.connected === true` |
| 响应格式 | `content-type` 匹配 `json` |

### 阶段 1：房间生命周期 — `02_rooms.test.js`

覆盖 13 组功能，每组独立房间：

| 组 | 用例（编号） | 断言 |
|------|------|------|
| 创建房间 | 02.1-4 | 6 位码/房主入座 1 号/isHost；缺 roomConfig 400；无效角色 400；已在其他房间再创建 400 |
| 加入房间 | 02.5-12 | 指定座位；**默认座位 0（等待区）**；观战 -1；重复座位 400；已在本房间(success+消息)；已在其他房间 400；不存在 404；游戏已开始 400 |
| 获取详情 | 02.13-14 | roomConfig 往返/players 结构/readyPlayers/activeGameId=null；404 |
| 离开房间 | 02.15-17 | 非房主可离开；**房主禁离开 400（房间恒有房主）**；房主仍在→房间保留 |
| 解散房间 | 02.18-19 | 房主解散清场；非房主 403 |
| 入座/换座 | 02.20-26 | 0↔1..n↔-1 互转；换占用 400；禁座被拒 400；观战满 400；不允许观战 400；换座重置 ready |
| 踢人 | 02.27-29 | room 移除；unseat→0+重置 ready；非房主 403 |
| 禁座 | 02.30-32 | 禁→上座被拒；解禁→可上座；非房主 403 |
| 转让房主 | 02.33-34 | 转让生效(isHost 变更)；非房主 403 |
| 更改配置 | 02.35-38 | 更新生效；非房主 403；游戏开始后 400；缩容挤出溢出玩家+无效配置 400 |
| 随机座位 | 02.39-41 | 满座随机（座位/玩家集合不变）；非房主 403；未满 400（后端维护） |
| 开始游戏 | 02.42-43 | 房主开局成功；**非房主 403** |
| 列表/统计/清理 | 02.44-46 | 列表 playerCount/readyCount；stats 结构；cleanup(hours=0) 删未开始房间 |

> 观战上限来自 `roomConfig.spectator = { allow, max }`（`max=0` 不限）；授权相关端点（kick/ban/config/start）均校验房主。

### 阶段 2：游戏启动、角色分配与视野 — `03_games_start.test.js`

#### A 开局校验（单测）

| 用例 | 断言 |
|------|------|
| T1 未全 ready | 有人未 ready → start 失败 |
| T2 不存在 room | start 失败 |
| T3 advancePhase | roleReveal → discussion（无鉴权；房主或固定倒计时触发），第二次调用失败 |

#### B 基础开局/状态（参数化全部 10 块板：标准 5-12 + 自定义 10 人/9 人）

| 用例 | 断言 |
|------|------|
| T4 开局成功 | `gameId` 为 UUID |
| T5 玩家状态 | `players.length === N`；每人 openId/nickName/seatNumber/isHost/role/side；座位 1..N 唯一 |
| T6 首位车长 | `teamLeaderIndex === 当前分钟 % N`（容差 ±1，start 前记录分钟 m） |
| T7 每玩家有 role | role 为合法字符串 |
| T8 每玩家 side | `side ∈ {good, evil}` |
| T9 玩家数 | `players.length === roles.good+roles.evil` 数量 |
| T10 getGameState | 无 openId 全量（含全部 role/side）；有 openId 他人 role/side **隐藏** + `game.vision` 结构 |

#### C 角色视野（按板可验性）

| 用例 | 参数/功能 | 板子 | 断言 |
|------|-----------|------|------|
| T11 | `evilKnowsEachOther=true` | 全部 10 板 | 睁眼狼互知身份（morgana/assassin/minion/mordred），oberon 互隐，**不含 lancelotRed** |
| T12 | `evilKnowsEachOther=false` | 全部 10 板 | 睁眼狼视角仅自己 |
| T13 | 派西维尔 | 全部 10 板 | percival 视角 = {自己, merlin, morgana}（不区分身份） |
| T14 | `merlinVision.canSee` + 兰斯洛特恒可见 | 全部 10 板 | merlin 视角 = 自己 + canSee 角色（除莫德雷德，无身份）+ 兰斯洛特（默认可辨阵营） |
| T14b | `merlinKnowsLancelotSide=false` | 含兰斯洛特板 | 梅林看到兰斯洛特但不辨阵营（无 role/side） |
| T15 | `merlinVision.canIdentify=[assassin]` | 自定义 10 人 | assassin 显示具体身份 |
| T16 | `ladyOfTheLake=true` | 自定义 10 人 | `lakeHolderOpenId === players[(首车主 seat-1) mod N]` |
| T17/T18 | `evilsKnowRedLancelot` true/false | 含 lancelotRed 的板（自定义10、标准11/12） | 睁眼狼视角含/不含红兰身份 |
| T19/T20 | `oberonKnowsRedLancelot` true/false | 含 oberon+lancelotRed 的板（标准12） | oberon 视角含/不含红兰身份 |
| T21/T22 | `lancelotsKnowEachOther` true/false | 双兰板（标准11/12） | 蓝↔红互见/互不见（初始角色） |

> **确定性（首位车长）**：`teamLeaderIndex = 当前时钟分钟 % N`。测试在 startGame 前记录分钟 `m`，
> 断言 `teamLeaderIndex ∈ { m % N, (m+1) % N }`（容差 ±1，容忍跨分钟竞态）。
> **视野**：`getGameState(gameId, openId)` 返回 `game.vision.seen`（自己恒可见；其余按角色+配置）。

### 阶段 2b：单 Lancelot 变体 — `03b_lancelot_variant.test.js`

使用自定义 roomConfig 创建 10 人房间，验证仅有一个 Lancelot 时系统正常工作。

| 变体 | roomConfig roles.good | roomConfig roles.evil | 断言 |
|------|----------------------|----------------------|------|
| 仅 lancelotBlue | merlin, percival, loyal×3, lancelotBlue | morgana, assassin, mordred, oberon | 角色分配正确；getRoleSide('lancelotBlue') === 'good'；完整游戏流程跑通 |
| 仅 lancelotRed | merlin, percival, loyal×3 | lancelotRed, morgana, assassin, mordred, oberon | 角色分配正确；getRoleSide('lancelotRed') === 'evil'；完整游戏流程跑通 |

每个变体执行完整游戏流程（好人胜利路径），验证：
- 所有玩家被正确分配角色
- lancelotBlue/lancelotRed 的 side 正确
- 队伍提名、投票、任务投票全流程正常
- 刺杀阶段正常执行

### 阶段 3：通用游戏机制 — `04_games_flow.test.js`

与好人/坏人胜利路径无关的通用机制（26 用例，按目标选板）：

| 用例 | 参数/规则 | 断言 |
|------|-----------|------|
| 04-1 好人必须投成功（参数化全部 good 玩家） | `side:good` | 当前阵营 good 者投 `fail` 被拒 |
| 04-2/04-3 必败强制 | `lancelotMustFail` / `oberonMustFailMission` | 对应角色投 `success` 被拒、fail 可投 |
| 04-4/04-5/04-6 转换 | `lancelotSwapRound` + `lancelotSwapForce` | 单兰翻转/双兰互换/未抽中不变（单兰+双兰） |
| 04-7 转换后 fail 权限 | 当前阵营 | 变坏蓝兰可 fail、变好红兰只能 success |
| 04-8/04-9 任务判定 | 0/≥1 坏票 | 0→成功；普通轮 ≥1 坏票（1、2 均验）→失败 |
| 04-10/04-11/04-12 保护轮 | 7+ R4 / 5-6 R4 | R4≥7：1 坏票成功、≥2 坏票失败；5-6 R4：≥1 失败 |
| 04-13/04-14 状态机 | 流车/发车成功 | 流车：leader+1、round 不变、流车数+1；发车成功：round+1、leader+1、流车数=0 |
| 04-15 强制发车 | `forcedCar` + `maxFailedNominations` | 达阈值→`forcedCar=true` 直接 missionVote→下一轮、流车数0 |
| 04-16/04-18 转换边界 | swapRound 1/2/3/4 | 第 x 轮结束才触发；流车不触发；swapRound 非法值 400 |
| 04-19a/b/c 必败拆分 | `lancelotMustFail` + 转换 | evil 兰必须 fail / 可自选 / 变好必须 success |
| 04-20 视野固化 | 转换后 | 视野与 reveal 时一致（`game_visions` 冻结） |
| 04-21 视野结构 | 各角色 | 平民空、派=梅林+莫甘娜、梅林 canSee、睁眼狼含 role+canIdentity |
| 04-22/23/24 投票可见性 | `voteVisibility` + P14 | 结束后逐人/聚合；投票中玩家仅自己、观众无 |
| 04-25/26 失败详情 | `missionFailDetail` | binary 无 failCount；count 含 failCount |

> **确定性**：兰斯洛特抽卡用 `rules.lancelotSwapForce = 'switch'/'keep'` 强制抽中/未抽中（服务端在独立进程，
> 无法用 jest mock 控制，故经配置注入）。

### 阶段 3a：好人胜利完整流程 — `04a_games_flow_good.test.js`（参数化 10 板：标准 5-12 + 自定义 9/10；兰板 keep 确定性）

对每个 N，完整走完一局好人胜。房间由 `createRoomAndStartGame(N)` 创建，使用**按人数的标准角色板**
（5-12 人见 §4.1；11 人板无 assassin，由 morgana 行使刺杀）。

```
createRoomAndStartGame(N) → advancePhase(gameId)   // roleReveal → discussion
→ 循环:
    leader = players[teamLeaderIndex]
    teamSize = TEAM_SIZES[N][currentRound-1]
    submitNomination(gameId, leader.openId, team)   // 正式选车 → teamVote
    全员 castVote: 多数 approve
    仅任务队成员 castMissionVote: 全投 success
    若 7+ 人且 R4，验证双重失败规则不触发（全投 success 时 failCount=0）
    → mission success
    若 successCount >= 3 → assassination 阶段
→ assassination 阶段:
    找到刺客角色玩家（assassin 或 11 人时的 morgana）
    刺客刺杀 → 选非梅林目标 → 未命中
    → gameEnd, winner='good'
→ endGame(gameId)
```

关键断言：
- `currentPhase === 'gameEnd'`
- `gameResult.winner === 'good'`
- `missionResults.filter(success).length >= 3`

> 说明：标准 11/12 人板含兰斯洛特，轮次转换时抽卡自动发生（§3.4.3），因全员投 success 不受影响；
> 若房间配置启用湖仙，轮次转换时需先驱动 `lakeInspection` 子阶段（§3.4.2）后再继续。

### 阶段 3b：坏人胜利路径 — `04b_games_flow_evil.test.js`（参数化 10 板；兰板 keep 确定性）

**路径 1：3 次任务失败**
```
createRoomAndStartGame(N) → advancePhase   // roleReveal → discussion
→ 循环:
    leader 提名尽量包含坏人角色（普通轮至少 1 名即失败；7+ 保护轮需 ≥2 名）
    全员 castVote('approve')
    任务队成员 castMissionVote: evil 投 fail, good 投 success
    若 7+ 人且 R4，需 >=2 个 evil 在队伍中投 fail 才能使任务失败
    → mission 失败
    若 failMissionCount >= 3 → gameEnd, winner='evil'
```

**路径 2：刺杀命中梅林（任意阶段发起）**
```
createRoomAndStartGame(N) → advancePhase
→ 找到刺客角色玩家（assassin 或 11 人时的 morgana）
→ 找到 merlin 角色玩家
→ 刺客在 discussion 阶段直接发起刺杀梅林
→ 游戏强制进入 assassination 阶段 → 命中 → gameEnd, winner='evil'
```

**边界：**
- 好人玩家发起刺杀被拒（非刺客/非莫甘娜）
- 游戏结束后刺杀被拒
- 11 人局验证莫甘娜可发起刺杀

### 阶段 3c：特殊规则针对性 E2E（目标用例示例，具体套件目标由人工决定）

针对独立流程构造完整端到端用例：

- **强制发车**：连续流车至 `maxFailedNominations`，验证下一车由在任车主强制提交、跳过 teamVote 直接 missionVote，且流车数重置。
- **湖仙验人**：激活轮次正确性；持有者验人返回目标**当前阵营**且仅持有者可见；不可查已当过湖仙者；每轮一次；令牌传给被查验者；全员当过湖仙后停止。
- **兰斯洛特（1 个）**：仅 lancelotBlue 或仅 lancelotRed 时，抽中转换卡则阵营翻转，mission-fail 投票选项随之变化。
- **兰斯洛特（2 个）**：蓝红始终异侧；抽中转换卡则同时互换（蓝→坏、红→好）。
- **兰斯洛特转换后投票选项**：转换后 lancelotBlue 可投 fail、lancelotRed 不可投 fail（权限按当前阵营）。

> **确定性（兰斯洛特抽卡）**：抽卡是随机（默认 2 转/5 不转）。针对性测试用
> `rules.lancelotSwapForce = 'switch'/'keep'` 强制抽中/未抽中转换卡。

### 阶段 4：消息系统 — `06_messages.test.js`

| 用例 | 断言 |
|------|------|
| 发送 text | `success:true`，`message.content` 正确 |
| 发送 system/action | `success:true` |
| 内容超长（>1000 字） | 400 |
| 无效消息类型 | 400 |
| 拉取消息 | `messages.length >= 3` |
| limit 参数 | `messages.length <= limit` |
| 时间顺序 | 按创建时间升序 |
| latest 端点 | 返回最新 N 条 |
| 缺少参数 | 400 |

### 阶段 4b：Socket.io 实时通信 — `07_socket.test.js`

| 用例 | 断言 |
|------|------|
| 多客户端连接 | 3 个 client 均 `connected === true` |
| joinRoom 广播 | 已在房间内的其他 client 收到 `playerJoined`（观察者须先入房） |
| roomUpdate 广播 | 房间内 client 收到 `roomUpdated` |
| gameUpdate 广播 | 房间内 client 收到 `gameUpdated` |
| message 广播 | 房间内 client 收到 `newMessage` |
| leaveRoom 广播 | 其他 client 收到 `playerLeft` |
| disconnect | 断开后 `connected === false` |

### 阶段 5：边界与并发 — `08_edge_cases.test.js`

| 用例 | 断言 |
|------|------|
| 满员拒绝 | 12 人满，第 13 人被拒 |
| 重复加入 | 同 openId 再 join 返回"已在房间中" |
| 不足 5 人 start | 失败 |
| 未全 ready start | 失败 |
| 不存在房间 | get/join/start 均 404 或失败 |
| 不存在游戏 | getGameState 404 |
| 无效 vote 值 | 失败 |
| advancePhase 不存在游戏 | 失败 |
| assassinate 不存在游戏 | 失败 |
| 非刺客发起刺杀 | 失败 |
| 好人发起刺杀 | 失败 |
| 非队长提名 | 失败 |
| 非 teamVote 阶段投票 | 失败 |
| 游戏结束后刺杀 | 失败 |
| 快速循环 | 5 次 create-join-leave 无泄漏 |

### 阶段 6：单元测试 — `09_game_logic.test.js`

| 用例 | 断言 |
|------|------|
| getRoleConfiguration | 每个 N 返回恰好 N 个角色 |
| 角色包含 | 所有配置含 merlin + percival |
| evil 数量 | 所有配置 evil >= 2 |
| 5 人精确配置 | `['merlin','percival','loyal','morgana','assassin']` |
| lancelot 对 | 11/12 人含 lancelotBlue + lancelotRed |
| assassin 存在 | 10/12 人含 assassin，11 人不含 |
| getRoleSide | 10 个角色正确分类 |
| getTeamSize | 5/8/12 人全表验证 |
| shuffleArray | 长度不变、元素不变、不修改原数组 |

## 6. 测试基础设施

### 6.1 文件清单

| 文件 | 用途 |
|------|------|
| `server/.env.test` | 测试环境变量 |
| `server/Dockerfile.test` | 测试容器镜像（含 devDependencies） |
| `docker-compose.test.yml` | 测试编排（avalon-net 外部网络） |
| `scripts/init-test-user.sql` | 一次性创建 avalon_test_user |
| `server/__tests__/helpers/globalSetup.js` | 创建测试库 + DDL + 启动后端 |
| `server/__tests__/helpers/globalTeardown.js` | 关停后端 + 删除测试库 |
| `server/__tests__/helpers/setupRequest.js` | 读 port + 创建 supertest agent |
| `server/__tests__/helpers/testHelper.js` | API 调用封装 + 工作流辅助 |
| `server/__tests__/helpers/socketHelper.js` | Socket.io 客户端封装 |
| `server/jest.config.js` | Jest 配置 |

### 6.2 测试辅助函数

`testHelper.js` 提供：

| 函数 | 说明 |
|------|------|
| `makeUserId()` | 生成唯一测试用户 ID |
| `makeNickName(userId)` | 生成测试昵称 |
| `createRoom(hostId, hostNick)` | 创建房间（使用最小自定义 roomConfig） |
| `createRoomWithConfig(hostId, hostNick, roomConfig)` | 创建房间（自定义 roomConfig） |
| `buildMinimalRoomConfig()` | 最小自定义房间配置（11 角色，含 assassin；房间类用例使用） |
| `buildStandardRoomConfig(playerCount)` | 按人数返回标准角色板（5-12 人，与 role_configurations 一致） |
| `buildCustomBoard10()` | 自定义 10 人板（单红兰：merlin,percival,loyal×4,morgana,assassin,mordred,lancelotRed） |
| `buildCustomBoard9()` | 自定义 9 人板（单蓝兰：merlin,percival,loyal×3,lancelotBlue,morgana,assassin,mordred） |
| `withConfigOverrides(base, overrides)` | 在基础配置上覆盖 rules/merlinVision/ladyOfTheLake 等（深拷贝） |
| `buildLancelotVariantConfig(variant)` | 构建单 Lancelot 变体（blue/red）的 roomConfig |
| `createLancelotGame(variant)` | 创建 10 人单 Lancelot 变体局并启动（blue/red） |
| `joinRoom(roomId, userId, seat, nick)` | 加入房间 |
| `toggleReady(roomId, userId, isReady)` | 切换准备 |
| `leaveRoom(roomId, userId)` | 退出房间 |
| `startGame(roomId)` | 启动游戏，返回 `{ gameId, game }` |
| `getGameState(gameId, openId?)` | 获取游戏状态 |
| `advancePhase(gameId)` | 推进 roleReveal → discussion |
| `submitNomination(gameId, openId, team)` | 正式选车（discussion → teamVote） |
| `castVote(gameId, openId, vote)` | 队伍投票（全员） |
| `castMissionVote(gameId, openId, vote, role)` | 任务投票（仅任务队；按当前阵营判定） |
| `assassinate(gameId, killerOpenId, targetOpenId)` | 刺杀梅林（刺客或莫甘娜发起） |
| `endGame(gameId)` | 结束游戏 |
| `sendMessage(roomId, openId, nick, content, type)` | 发送消息 |
| `getMessages(roomId, limit, beforeTime?)` | 拉取消息 |
| `createRoomWithPlayers(n, roomConfig?)` | 创建 N 人房间并全 ready（可选自定义 roomConfig） |
| `createRoomAndStartGame(n)` | 创建 N 人房间 + 启动游戏（使用**按人数的标准角色板**，11 人无 assassin、莫甘娜开刀），返回含 gameId 和玩家角色 |

> 规划中（随新流程 §3 实现后补充）：`setSpeakingOrder` / `advanceSpeaker` / `preTeam` /
> `lakeInspect` / `lakePass` 及兰斯洛特抽卡控制 `lancelotSwapForce('switch'|'keep')`（经 `rules.lancelotSwapForce` 注入配置）。

### 6.3 测试文件清单

| 文件 | 阶段 | 参数化 |
|------|------|--------|
| `01_health.test.js` | 0 | — |
| `02_rooms.test.js` | 1 | — |
| `03_games_start.test.js` | 2 | 5-12 |
| `03b_lancelot_variant.test.js` | 2b | 2 变体 |
| `04_games_flow.test.js` | 3（通用机制） | — |
| `04a_games_flow_good.test.js` | 3a | 10 板 |
| `04b_games_flow_evil.test.js` | 3b | 10 板 |
| `06_messages.test.js` | 4 | — |
| `07_socket.test.js` | 4b | — |
| `08_edge_cases.test.js` | 5 | — |
| `09_game_logic.test.js` | 6 | — |

## 7. 执行方式

### 7.1 前置条件

1. MySQL 容器（`avalon-mysql`）运行中，在 `avalon-net` 网络。
2. 一次性创建测试用户：

```bash
docker exec -i avalon-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} \
  < scripts/init-test-user.sql
```

### 7.2 运行测试

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

### 7.3 清理

```bash
docker compose -f docker-compose.test.yml down
```

### 7.4 本地开发（需本地 MySQL）

```bash
cd server
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_ROOT_PASS=... DB_NAME=avalon_db_test
npm test
```

## 8. API 接口索引

### 房间 API（`/api/rooms`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/create` | 创建房间 |
| GET | `/:roomId` | 获取房间 |
| GET | `/` | 列表 |
| POST | `/join` | 加入 |
| POST | `/leave` | 退出 |
| POST | `/toggleReady` | 准备 |
| POST | `/updateSeatNumber` | 换座 |
| POST | `/kickPlayer` | 踢人 |
| POST | `/:roomId/disband` | 解散 |
| POST | `/:roomId/randomSeats` | 随机座位 |
| PUT | `/:roomId/config` | 更新配置 |

### 游戏 API（`/api/games`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/start` | 启动游戏 → 返回 gameId（含首位车长/湖仙落位） |
| GET | `/:gameId` | 获取状态（合并内存态：preTeam/发言序/湖仙/forcedSend；带 openId 返回玩家视角 `game.vision`，他人 role/side 隐藏；启用湖仙返回 `lakeHolderOpenId`） |
| POST | `/:gameId/advancePhase` | 推进 roleReveal → discussion |
| POST | `/setSpeakingOrder` | 车长指定发言顺序（仅车长；内存态） |
| POST | `/advanceSpeaker` | 推进当前发言人（前端触发；内存态） |
| POST | `/preTeam` | 更新车长预点车（仅车长；任意人数，不入库） |
| POST | `/submitNomination` | 正式选车（discussion → teamVote） |
| POST | `/castVote` | 队伍投票（全员） |
| POST | `/castMissionVote` | 任务投票（仅任务队） |
| POST | `/:gameId/assassinate` | 刺杀梅林（仅刺客/莫甘娜；强制进入刺杀阶段；执行后 gameEnd） |
| POST | `/:gameId/lake/inspect` | 湖仙验人（仅持有者；返回目标当前阵营） |
| POST | `/:gameId/lake/pass` | 传递湖仙令牌（默认被查验者/下一位） |
| POST | `/end` | 结束游戏 |
| GET | `/stats/summary` | 统计 |
| GET | `/history/:roomId` | 历史 |
| GET | `/recent/games` | 最近 |

### 消息 API（`/api/messages`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/send` | 发送（≤1000 字） |
| GET | `/:roomId` | 拉取（分页） |
| GET | `/:roomId/latest` | 最新 N 条 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/hello` | 存活探测 |
| GET | `/api/users/:openId` | 获取/创建用户 |
| GET | `/api/players/:openId/currentRoom` | 当前房间 |

### Socket.io 事件

| 方向 | 事件 | 说明 |
|------|------|------|
| C→S | `joinRoom` | 加入房间 |
| S→C | `playerJoined` | 广播加入 |
| C→S | `leaveRoom` | 离开房间 |
| S→C | `playerLeft` | 广播离开 |
| C→S | `roomUpdate` | 房间更新 |
| S→C | `roomUpdated` | 广播更新 |
| C→S | `gameUpdate` | 游戏更新 |
| S→C | `gameUpdated` | 广播更新 |
| C→S | `message` | 发送消息 |
| S→C | `newMessage` | 广播消息 |
| C→S | `preTeam` | 预点车变更（房间可见，不入库） |
| S→C | `preTeamUpdated` | 广播预点车 |
| S→C | `speakerChanged` | 广播当前发言人 |
| S→C | `lakeUpdated` | 广播湖仙状态（持有者/已用） |
| S→C | `forcedSend` | 广播强制发车状态 |

## 9. 刺杀机制详细设计

### 9.1 刺杀者判定

```
查找游戏中 role === 'assassin' 的玩家:
  ├─ 存在 → 仅该玩家可发起刺杀
  └─ 不存在 → 查找 role === 'morgana' 的玩家:
       ├─ 存在 → 仅该玩家可发起刺杀
       └─ 不存在 → 无刺杀者（理论上不应发生）
```

### 9.2 assassinate API 行为

```
POST /api/games/:gameId/assassinate
请求体: { killerOpenId, targetOpenId }

校验:
  1. 游戏存在
  2. currentPhase !== 'gameEnd'
  3. killerOpenId 是刺杀者（assassin 或 11 人局的 morgana）

执行:
  1. 强制 currentPhase = 'assassination'（无论之前在哪个阶段）
  2. 查询 targetOpenId 的角色
  3. 命中（role === 'merlin'）:
     → currentPhase = 'gameEnd'
     → gameResult = { winner: 'evil', reason: '刺杀命中梅林' }
  4. 未命中:
     → currentPhase = 'gameEnd'
     → gameResult = { winner: 'good', reason: '刺杀未命中梅林' }
```

### 9.3 好人 3 次任务成功后的处理

```
castMissionVote 中 successCount >= 3:
  → currentPhase = 'assassination'（自动进入刺杀阶段）
  → 等待刺客调用 assassinate API
```

### 9.4 后续扩展（暂未实现）

| 选项 | 说明 |
|------|------|
| 多次开刀 | 房间配置 `rules.allowMultiStab`。启用后：未命中时 game 不结束，留在 assassination 阶段，刺客可再次发起。命中时才 gameEnd。 |
