#!/bin/bash
# cleanup-test-data.sh —— 清理手动测试产生的生产库残留数据
#
# 背景: 自动化 jest 测试已用 avalon_db_test 隔离，不碰生产库。手动端到端测试
#       （真机/驱动脚本连生产 API）会写入 avalon_db，需定期清理残留。
#
# 约定:
#   - 机器人 openId 统一用 bot_ 前缀（驱动脚本 ai-http.js 生成 bot_d1..d12 等）
#   - 手动测试固定使用房间 000000（保留不删）
#   - 真实微信用户 openId 均为 ovrr0x 前缀（白名单，永不删）
#
# 清理范围:
#   1. 测试/机器人用户: bot_ / reveal_ / wx_test_ / 纯数字 openId
#   2. 遗留游戏: status=abandoned + active 且 12 小时无更新（卡死）→ 级联清子表
#   3. 房间: 000000 与真实房间(612136)保留，其余仅列出供人工确认（不自动删）
#
# 用法（在服务器 haoyu-wang141.top 本机执行）:
#   bash scripts/cleanup-test-data.sh           # dry-run：打印待删清单（北京时间），不删除
#   bash scripts/cleanup-test-data.sh --apply   # 二次确认(y/n)后实际删除
#
# 环境: 服务器本机 docker + avalon-mysql 容器

set -uo pipefail

MYSQL="docker exec -i avalon-mysql mysql -uroot -pavalon_root_2024 avalon_db"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

echo "════════ 测试数据清理 ════════"
echo "模式: $([ "$APPLY" -eq 1 ] && echo 'APPLY（实际删除）' || echo 'dry-run（仅预览）')"
echo ""

# ── 1. 待删测试/机器人用户 ──
echo "── [1] 待删测试/机器人用户 ──"
$MYSQL -e "SET time_zone='+08:00';
  SELECT open_id, COALESCE(NULLIF(custom_nick_name,''), NULLIF(wx_nick_name,''), '(无昵称)') AS nick,
         current_room_id, updated_at
  FROM users
  WHERE open_id LIKE 'bot\\\\_%' OR open_id LIKE 'reveal\\\\_%'
     OR open_id LIKE 'wx\\\\_test\\\\_%' OR open_id REGEXP '^[0-9]+\$'
  ORDER BY updated_at;" 2>&1 | grep -vE "Warning:|Using a password on the command line interface"

# ── 2. 待删遗留游戏 ──
echo ""
echo "── [2] 待删遗留游戏（abandoned + active 12h 无更新，级联清子表）──"
$MYSQL -e "SET time_zone='+08:00';
  SELECT id, status, current_phase, current_round,
         CONVERT_TZ(updated_at,'+00:00','+08:00') AS updated_bj
  FROM games
  WHERE status='abandoned' OR (status='active' AND updated_at < DATE_SUB(NOW(), INTERVAL 12 HOUR))
  ORDER BY updated_at;" 2>&1 | grep -vE "Warning:|Using a password on the command line interface"

# ── 3. 保留房间以外（仅列出，不自动删）──
echo ""
echo "── [3] 非保留房间（仅列出供人工确认，不自动删）──"
echo "   保留: 000000(固定测试房) + 真实房间(当前 612136)"
$MYSQL -e "SET time_zone='+08:00';
  SELECT id, owner_id, game_started, CONVERT_TZ(updated_at,'+00:00','+08:00') AS updated_bj
  FROM rooms WHERE id NOT IN ('000000','612136') ORDER BY updated_at;" 2>&1 | grep -vE "Warning:|Using a password on the command line interface"

# ── 执行 ──
if [[ "$APPLY" -eq 1 ]]; then
  echo ""
  echo "── 确认删除以上列出的用户与游戏？(y/N) ──"
  read -r ans
  if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    echo "已取消，未删除任何数据。"
    exit 0
  fi
  $MYSQL -e "DELETE FROM users WHERE open_id LIKE 'bot\\\\_%' OR open_id LIKE 'reveal\\\\_%'
       OR open_id LIKE 'wx\\\\_test\\\\_%' OR open_id REGEXP '^[0-9]+\$';" 2>&1 | grep -vE "Warning:|Using a password on the command line interface"
  $MYSQL -e "DELETE FROM games WHERE status='abandoned' OR (status='active' AND updated_at < DATE_SUB(NOW(), INTERVAL 12 HOUR));" 2>&1 | grep -vE "Warning:|Using a password on the command line interface"
  echo "✅ 已删除测试用户与遗留游戏（房间未改动）"
else
  echo ""
  echo "dry-run 完成：以上为待删清单。确认无误后执行: bash scripts/cleanup-test-data.sh --apply"
fi
