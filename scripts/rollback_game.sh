#!/bin/bash
# rollback_game.sh —— 将指定游戏回退到第 1 轮发车前（preNominate / round1）
#
# 用法:
#   ./rollback_game.sh <GAME_ID> [TEAM_LEADER_INDEX=7] [LAKE_HOLDER_OPEN_ID=bot_d6]
#
# 说明:
#   - 清空该局的 votes/game_cars/mission_results/lake_history/lancelot_swap_history
#   - 重置 games 到 preNominate/round1/初始车长/初始湖仙持有者，清确认标记
#   - 兰斯还原: 仅当 lancelot_swap_history 曾存在 switched=1（抽中过转换）时，
#     才把 lancelotBlue→good、lancelotRed→evil 还原（与"清除转换历史"保持一致）；
#     未发生过转换则不动 side（与 maybeLancelotSwap 的运行时语义一致）
#
# 依赖: 需在服务器本机执行（内部调用 docker exec avalon-mysql）

set -euo pipefail

GAME_ID="${1:?用法: $0 <GAME_ID> [TEAM_LEADER_INDEX] [LAKE_HOLDER_OPEN_ID]}"
TEAM_LEADER_INDEX="${2:-7}"
LAKE_HOLDER_OPEN_ID="${3:-bot_d6}"

docker exec -i avalon-mysql mysql -uavalon_user -pavalon_pass_2024 avalon_db <<SQL
-- 兰斯还原（必须在删除 lancelot_swap_history 之前执行，否则判断恒为 false）
UPDATE game_players SET side='good'
WHERE game_id='${GAME_ID}' AND role='lancelotBlue'
  AND EXISTS (SELECT 1 FROM lancelot_swap_history WHERE game_id='${GAME_ID}' AND switched=1);
UPDATE game_players SET side='evil'
WHERE game_id='${GAME_ID}' AND role='lancelotRed'
  AND EXISTS (SELECT 1 FROM lancelot_swap_history WHERE game_id='${GAME_ID}' AND switched=1);

DELETE FROM lancelot_swap_history WHERE game_id='${GAME_ID}';
DELETE FROM lake_history WHERE game_id='${GAME_ID}';
DELETE FROM mission_results WHERE game_id='${GAME_ID}';
DELETE FROM game_cars WHERE game_id='${GAME_ID}';
DELETE FROM votes WHERE game_id='${GAME_ID}';
UPDATE games SET
  current_phase='preNominate', current_round=1, team_leader_index=${TEAM_LEADER_INDEX},
  failed_nominations=0, nominated_team=NULL, pre_nominated_team=NULL,
  speaking_order='asc', discussion_set=FALSE, lancelot_result=NULL,
  lake_holder_open_id='${LAKE_HOLDER_OPEN_ID}', assassination=NULL, game_result=NULL,
  status='active', ended_at=NULL, updated_at=NOW()
WHERE id='${GAME_ID}';
UPDATE game_players SET reveal_confirmed=FALSE, lancelot_confirmed=FALSE, lake_confirmed=FALSE WHERE game_id='${GAME_ID}';
SELECT current_phase, current_round, team_leader_index, failed_nominations FROM games WHERE id='${GAME_ID}';
SQL
