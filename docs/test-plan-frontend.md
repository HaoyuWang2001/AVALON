# AVALON 前端手动测试用例文档

## 1. 测试目标

在微信开发者工具模拟器中，手动验证前端各阶段 UI 与游戏流程。无自动化前端测试框架，依赖手动 + AI 机器人（`ai-http.js`）驱动多玩家场景。

- 覆盖完整游戏生命周期（含轮次循环、流车回环、强制车、刺杀阶段、湖仙/兰斯等特殊环节）。
- 覆盖阶段状态机 UI：roleReveal / preNominate / speakingOrder / discussion / teamVote / missionVote / lake / lancelot / assassination / gameEnd。
- 覆盖流程路径：三好车刺杀、三坏车获胜、流车强制车、刺客主动刺杀。
- 湖仙验人、兰斯洛特转换等特殊环节由房间配置决定，按配置对局覆盖。

## 2. 生命周期

### 2.1 生命周期总览图

```
   roleReveal
      |
      | all players confirm identity
      v
   ROUND LOOP (round 1..5):
   [preNominate*] -> [speakingOrder*] -> [discussion] -> [teamVote*] --approve--> [missionVote]
        ^                                                                 |             |
        |                                                                 |             |
        +---- reject (next leader, round unchanged) ----------------------+             |
                                                                                        |
                                                            +------mission result ------+
                                                            |
                                                            v
                                             +--------------+--------------+
                                             |              |              |
                                             v              v              v
                                       3 successes     3 fails      < 3 both
                                             |              |              |
                                             v              v              v
                                      [assassination]  [gameEnd]      next round
                                             |        (evil wins)        
                                             v                             
                                       [gameEnd] 
                                     (good/evil wins)
```

> 图示说明：`[teamVote]` 处 reject → 流车（下一位车主，round 不变）回 `[preNominate]`；approve → 发车成功进入 `[missionVote]`。`[missionVote]` 三出口分别对应累计成功/失败/继续循环。

### 2.2 特殊环节（a-d）

| 环节 | 触发条件 | 插入位置 | 说明 |
|------|---------|---------|------|
| **a) 强制车** | 流车数达 `maxFailedNominations` | 替代预选/发言序 | 直接进入 discussion，按钮显示"强制发车"，发车后跳过 teamVote 直达 missionVote |
| **b) 刺客随时开刀** | 刺客（或莫甘娜）任意阶段点"开始刺杀" | 任意阶段 | 从"查看身份"弹窗进入刺杀阶段；刺杀阶段仅刺客可选目标 |
| **c) 湖仙验人** | 配置启用且完成轮次达 `ladyOfTheLakeRound` | missionVote 成功后、下一轮前 | 插入 lake 阶段（湖仙必验、令牌传递） |
| **d) 兰斯洛特转换** | 配置启用且存在兰斯洛特 | 轮次转换时 | 插入 lancelot 阶段（自动抽卡、全员确认） |

### 2.3 轮次循环说明

- 每轮内：`[预选] → [发言序] → [讨论] → [队伍投票]` 可能因流车重复多次（每次由下一位车主发起）。
- 发车成功 → `[任务投票]` → 按累计成功/失败数分支。
- 5 轮必出结果（每轮非成即败，累计 3 次即达标），不存在"5 轮后平局"情况。

## 3. 测试环境与准备

### 3.1 环境

| 项 | 值 |
|----|-----|
| 工具 | 微信开发者工具（模拟器） |
| 后端 | `https://haoyu-wang141.top:8082/api` |
| 前端目录 | `miniprogram/` |
| 每次前端代码改动后 | 重新编译 |

### 3.2 基准配置（5 人局）

| 项 | 值 |
|----|-----|
| 角色 | good: merlin, percival, loyal / evil: morgana, assassin |
| 队伍大小 | R1=2, R2=3, R3=2, R4=3, R5=3 |
| 不适用功能 | 湖仙验人（≥10人启用）、兰斯洛特（11/12人）、奥伯伦/莫德雷德（≥7/9人）、保护轮R4双败（≥7人） |

### 3.3 AI 机器人命令速查

```bash
# 在 server 目录下运行
node scripts/ai-http.js <cmd> --key=value ...

# 房间与开局
create  --openId=bot_host --count=5          # 建房+4bot入座+全部准备
ready   --room=ROOM --openId=bot_x
start   --room=ROOM --openId=HOST_ID         # 房主开局
state   --game=GAME --openId=OPENID          # 查看状态

# 阶段推进（车主用）
confirm     --game=GAME --openId=bot_x       # 确认身份
prenominate --game=GAME --openId=bot_x --team=a,b,c   # 提交预选
order       --game=GAME --openId=bot_x --order=asc    # 选发言方向
nominate    --game=GAME --openId=bot_x --team=a,b --forced=0  # 确认发车
teamvote    --game=GAME --openId=bot_x --vote=approve  # 队伍投票
missionvote --game=GAME --openId=bot_x --vote=success --role=loyal  # 任务投票

# 刺杀
startAssassination（前端 role-modal 按钮）   # 进入刺杀阶段
assassinate  --game=GAME --openId=bot_x --target=bot_y  # 刺杀目标
```

> 说明：`startAssassination` 为前端按钮（刺客打开"查看身份"弹窗可见）；bot 侧可直接用 `assassinate`（需先进入刺杀阶段）。

## 4. 测试用例

> 每用例一句话描述。需 bot 配合的用例标注"bot 命令"。

### A. 开局与身份（roleReveal）

- **A1** 蒙版点击后查看身份页（含角色视野）。
- **A2** 身份弹窗（含角色视野；刺客/莫甘娜含"开始刺杀"按钮）。
- **A3** 全员确认身份后进入首轮 preNominate。
- **A4** 仅启用湖仙的对局存在湖仙标签。
- **A5** 房主标签与"我"标签始终存在。
- **A6** 历史记录：可查看车次/湖仙/兰斯记录。

### B. 预选·发言序·讨论

- **B1** 预选车复选框选人/取消（不限人数）。
- **B2** 发言顺序选升序/降序。
- **B3** 讨论阶段所有人可见预选车与发言顺序。
- **B4** 讨论阶段车主限人数选人，点提交确认发车。
- **B5** 若配置 speechTimeout，房主可对发言计时（开始/暂停/重置）。

### C. 队伍投票

- **C1** 投票按钮可用，仅单次点击，点击后隐藏。
- **C2** 他人未完成投票则等待。
- **C3** 投票过程可见全部玩家是否已投。
- **C4** 投票结束可见全部玩家票型。

### D. 任务投票

- **D1** 成功/失败按钮可用，仅单次点击。
- **D2** 他人未完成则等待。
- **D3** 非任务队玩家不可见任务队是否已投及票型。
- **D4** 全部投票后展示任务成功/失败，按配置展示失败票数。

### E. 刺杀

- **E1** 刺客（无刺客则莫甘娜）随时点击按钮进入刺杀阶段。
- **E2** 刺杀阶段全体玩家可见睁眼狼及其身份。
- **E3** 睁眼狼讨论后确定目标，刺客点玩家→点开刀按钮。
- **E4** 【扩展·未实现】多次开刀：刺客依次开刀直到刺中梅林（结果以首次为准）。

### J. 分支与游戏

- **J1** 发车成功：轮次+1（或游戏结束）。
- **J2** 发车失败（流车）：轮次不变、index+1、车主更改。
- **J3** 强制车：跳过预选/发言序直接进入讨论；车主提交后跳过投票直接进任务。
- **J4** 好人获胜。
- **J5** 坏人获胜。
- **J6** 湖仙验人：达配置轮次后每轮验人，选择玩家获取当前阵营{good,evil}。
- **J7** 兰斯洛特转换：达配置轮次后自动翻转判定，全员查看确认后进入下一阶段。
## 5. 核心回归路径

> 通过数个测试流程覆盖 §4 全部用例。通用用例（任意流程均可覆盖）与流程矩阵如下。

### 5.1 通用用例（任何流程均可覆盖）

A1 A2 A3 A5 A6 B1 B2 B3 C1 C2 C3 D1 D2 D3

### 5.2 测试流程（覆盖全部用例）

| 流程 | 场景 | 覆盖用例 |
|------|------|---------|
| 流程1 | 标准局·好人胜（三好车 + 刺错梅林） | 通用 + B4 C4 D4 J1 J4 |
| 流程2 | 坏人胜（三坏车直接获胜） | 通用 + J5 |
| 流程3 | 流车 → 强制车 | 通用 + B4 J2 J3 |
| 流程4 | 刺客主动开刀 | 通用 + E1 E2 E3 |
| 流程5 | 湖仙配置局 | A4 J6 |
| 流程6 | 兰斯配置局 | J7 |
| 流程7 | 计时器配置局 | B5 |

> E4（多次开刀）为扩展·未实现，暂不列入覆盖。