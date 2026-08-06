# AVALON 功能待办 / TODO

## 待办：投票超时自动投"同意"（voteTimeout）

### 需求
加入投票超时时间，超时到达后未投玩家自动投"同意"
（teamVote→approve，missionVote→success），保证挂机时游戏可推进。

### 现状调研（2026-08 完成）
- `roomConfig.limits.voteTimeout` 仅有配置存储（建房可选），**后端/前端均未使用**
- 后端无定时器机制；`games` 表无阶段开始时间列
- 投票推进逻辑位于 `GameModel.castVote`（:844，teamVote→missionVote/流车）与
  `castMissionVote`（:1000，任务结算→lake/lancelot/assassination）

### 推荐实现方案（后续实施参考）
1. DB：`games` 加列 `phase_started_at DATETIME NULL`（DDL + 迁移 migration_vote_timeout.sql）
2. 进入 teamVote/missionVote 时 `UPDATE phase_started_at=NOW()`
3. 后端定时扫描（~5s）+ 惰性检查（getState/投票入口）：
   - phase∈{teamVote,missionVote} 且 距开始 >= voteTimeout → 未投者自动投"同意"
   - teamVote→approve；missionVote→success（任务成员）
4. 抽公共函数复用"全投后推进"逻辑，API 与自动投票共用
5. voteTimeout 从 configRoom.limits.voteTimeout 读，null 则禁用
6. 完成后 emitGame 广播；前端可选投票倒计时（复用发言计时器广播模式）

### 待决策点
- [ ] missionVote 坏人超时：统一 success 还是自动 fail？
- [ ] 是否前端显示投票剩余秒数
- [ ] 定时扫描间隔
