# POST /api/rooms/create — 创建房间

## 接口

```
POST /api/rooms/create
Content-Type: application/json
```

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hostOpenId` | string | **是** | 房主唯一标识 |
| `hostNickName` | string | 否 | 房主昵称，默认 `"房主"` |
| `hostAvatarUrl` | string | 否 | 房主头像 URL，默认空串 |
| `roomConfig` | object | **是** | 房间配置，结构见下文 |

---

## `roomConfig` 完整结构

```json
{
  "roomConfig": {
    "roles": {
      "good": ["merlin", "percival", "loyal", "loyal", "loyal", "loyal"],
      "evil": ["morgana", "assassin", "mordred", "oberon"]
    },
    "rules": {
      "evilKnowsEachOther": true,
      "lancelotsKnowEachOther": true,
      "lancelotSwapRound": 2,
      "ladyOfTheLake": false,
      "ladyOfTheLakeRound": 2,
      "maxFailedNominations": 3,
      "oberonMustFailMission": false,
      "redLancelotMustFailMission": false,
      "voteVisibility": "anonymous",
      "missionFailDetail": "count"
    },
    "limits": {
      "speechTimeout": null,
      "roundTimeout": null,
      "voteTimeout": null
    },
    "meta": {
      "roomName": "张三的阿瓦隆局",
      "roomDescription": "欢迎所有玩家",
      "tags": ["标准局", "新手友好"]
    },
    "merlinVision": {
      "canSee": ["assassin", "morgana", "minion", "oberon", "lancelotRed", "lancelotBlue"],
      "canIdentify": ["lancelotRed", "lancelotBlue"]
    }
  }
}
```

---

## 1. `roles` — 角色配置

决定房间人数和角色构成。`good.length + evil.length` = 该房间的玩家总数。

```json
{
  "roles": {
    "good": ["merlin", "percival", "loyal", ...],
    "evil": ["morgana", "assassin", ...]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `good[]` | string[] | 好人角色列表 |
| `evil[]` | string[] | 坏人角色列表 |

### 合法角色名

```
好人: merlin, percival, loyal, lancelotBlue
坏人: mordred, morgana, assassin, minion, oberon, lancelotRed
```

> **后端校验**：仅校验 `roles` 字段是否存在、`good`/`evil` 是否为数组、是否非空。角色名合法性、人数范围等由**前端保证**。

---

## 2. `rules` — 游戏规则（10 个必须字段）

```json
{
  "rules": {
    "evilKnowsEachOther": true,
    "lancelotsKnowEachOther": true,
    "lancelotSwapRound": 2,
    "ladyOfTheLake": false,
    "ladyOfTheLakeRound": 2,
    "maxFailedNominations": 3,
    "oberonMustFailMission": false,
    "redLancelotMustFailMission": false,
    "voteVisibility": "anonymous",
    "missionFailDetail": "count"
  }
}
```

| # | 字段 | 类型 | 说明 |
|---|------|------|------|
| 1 | `evilKnowsEachOther` | boolean | 坏人是否互相知道对方具体身份 |
| 2 | `lancelotsKnowEachOther` | boolean | 蓝兰斯洛特和红兰斯洛特是否互知身份 |
| 3 | `lancelotSwapRound` | number | 兰斯洛特从第几轮开始抽取身份转换（0 = 不转换） |
| 4 | `ladyOfTheLake` | boolean | 是否启用湖中仙女机制 |
| 5 | `ladyOfTheLakeRound` | number | 湖中仙女从第几轮任务结束后开始验人 |
| 6 | `maxFailedNominations` | number | 最多流车 n 次，第 n+1 次为强制发车 |
| 7 | `oberonMustFailMission` | boolean | 奥伯伦完成任务时是否必须出失败票 |
| 8 | `redLancelotMustFailMission` | boolean | 红兰斯洛特完成任务时是否必须出失败票 |
| 9 | `voteVisibility` | `"public"` \| `"anonymous"` | 组队投票票型是否公开 |
| 10 | `missionFailDetail` | `"count"` \| `"binary"` | 任务失败时显示失败票数 / 仅知成败 |

### 字段间逻辑关系

```
lancelotSwapRound    ─── 仅当 roles 包含 lancelotBlue/lancelotRed 时生效
ladyOfTheLake        ─── 湖中仙女不是角色，是独立机制
oberonMustFailMission ─── 仅当 roles.evil 包含 oberon 时生效
redLancelotMustFailMission ─── 仅当 roles.evil 包含 lancelotRed 时生效
```

> **后端校验**：10 个字段必须全部存在。值合法性由前端保证。

---

## 3. `limits` — 时限控制（可选）

```json
{
  "limits": {
    "speechTimeout": null,
    "roundTimeout": null,
    "voteTimeout": null
  }
}
```

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `speechTimeout` | number \| null | `null` | 发言限时秒数，`null` = 不限时 |
| `roundTimeout` | number \| null | `null` | 任务投票超时秒数，超时后未投票者视为任务成功 |
| `voteTimeout` | number \| null | `null` | 组队投票超时秒数，超时后未投票者视为赞成票 |

> 整个 `limits` 对象可选。不传时所有值默认为 `null`。

---

## 4. `meta` — 房间展示信息（可选）

```json
{
  "meta": {
    "roomName": "张三的阿瓦隆局",
    "roomDescription": "欢迎所有玩家",
    "tags": ["标准局", "新手友好"]
  }
}
```

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `roomName` | string | `""` | 房间名称，用于大厅列表展示 |
| `roomDescription` | string | `""` | 房间描述 |
| `tags[]` | string[] | `[]` | 标签，前端用于搜索/筛选 |

> 整个 `meta` 对象可选。后端不校验内容，仅透传存储。

---

## 5. `merlinVision` — 梅林视野（可选）

```json
{
  "merlinVision": {
    "canSee": ["assassin", "morgana", "minion", "oberon", "lancelotRed", "lancelotBlue"],
    "canIdentify": ["lancelotRed", "lancelotBlue"]
  }
}
```

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `canSee[]` | string[] | `["assassin","morgana","minion","oberon","lancelotRed","lancelotBlue"]` | 梅林视野：能看到这些角色（知道存在和阵营） |
| `canIdentify[]` | string[] | `[]` | 梅林能分辨具体身份的名单（⊆ canSee，由前端保证） |

### 逻辑关系

```
canIdentify ⊆ canSee（逻辑上，后端不校验）

示例视野矩阵:
┌──────────────┬──────────┬──────────┐
│ 角色          │ 能看到?  │ 能分辨?  │
├──────────────┼──────────┼──────────┤
│ assassin     │    ✓     │    ✗     │  ← 看到坏人，不知道是刺客
│ morgana      │    ✓     │    ✗     │
│ oberon       │    ✓     │    ✗     │
│ lancelotRed  │    ✓     │    ✓     │  ← 看到且知道是红兰
│ lancelotBlue │    ✓     │    ✓     │
│ mordred      │    ✗     │    ✗     │  ← 莫德雷德对梅林不可见
│ minion       │    ✓     │    ✗     │
│ loyal        │    ✗     │    ✗     │  ← 好人不在梅林视野
└──────────────┴──────────┴──────────┘
```

> 整个 `merlinVision` 对象可选。不传时自动使用默认值。

---

## 完整字段层级图

```
roomConfig
├── roles ─────── 决定房间人数和角色构成
│   ├── good[] ── 好人角色
│   └── evil[] ── 坏人角色
│
├── rules ─────── 游戏规则开关（10条）
│   ├── 身份可见: evilKnowsEachOther, lancelotsKnowEachOther
│   ├── 特殊机制: ladyOfTheLake, ladyOfTheLakeRound, lancelotSwapRound
│   ├── 强制行为: oberonMustFailMission, redLancelotMustFailMission
│   ├── 投票规则: maxFailedNominations
│   └── 信息可见: voteVisibility, missionFailDetail
│
├── limits ────── 时限控制（3条）
│   ├── speechTimeout
│   ├── roundTimeout
│   └── voteTimeout
│
├── meta ──────── 房间展示
│   ├── roomName
│   ├── roomDescription
│   └── tags[]
│
└── merlinVision ─ 梅林视野自定义
    ├── canSee[] ── 能看到的人
    └── canIdentify[] ── 能分辨具体身份的人
```

---

## 返回结构（成功 200）

```json
{
  "success": true,
  "roomId": "835721",
  "room": {
    "_id": "835721",
    "hostOpenId": "oXXX",
    "gameStarted": false,
    "roomConfig": { ... },
    "createdAt": "2026-07-30T13:20:00.000Z",
    "updatedAt": "2026-07-30T13:20:00.000Z",
    "readyPlayers": [],
    "players": [
      {
        "openId": "oXXX",
        "nickName": "张三",
        "avatarUrl": "",
        "seatNumber": 1,
        "isHost": true,
        "isReady": false
      }
    ]
  }
}
```

## 错误返回

| 状态码 | 条件 |
|--------|------|
| `400` | `hostOpenId` 缺失 / `roomConfig` 缺失 / `roles` 缺失 / `rules` 缺失 / 规则字段不完整 / 角色名非法 |
| `500` | 数据库错误 |

---

## POST /api/rooms/:roomId/config — 修改房间配置

房主专属接口。仅游戏未开始时可用。

### 请求

```json
{
  "roomConfig": { ... }
}
```

### 返回

```json
{
  "success": true,
  "room": { ... },
  "message": "配置已更新"
}
```

### 错误

| 状态码 | 条件 |
|--------|------|
| `400` | 缺少配置 / 游戏已开始 / 配置校验失败 |
| `404` | 房间不存在 |
| `500` | 数据库错误 |
