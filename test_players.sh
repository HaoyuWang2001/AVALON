#!/bin/bash
# AVALON 多人模拟测试脚本
# 用法: bash test_players.sh <roomId> [action]
# 
# actions:
#   join      - 模拟4个玩家加入房间并入座准备
#   vote      - 模拟所有玩家投赞成票 (需要gameId)
#   mission   - 模拟所有玩家投任务成功 (需要gameId)
#   full      - 加入+准备 (默认)
#   reset     - 重置测试玩家状态

BASE="https://haoyu-wang141.top:8082/api"

ROOM_ID="${1:-}"
ACTION="${2:-full}"
GAME_ID="${3:-}"

PLAYERS=(
  "test_p2|玩家2|2"
  "test_p3|玩家3|3"
  "test_p4|玩家4|4"
  "test_p5|玩家5|5"
)

echo "========================================"
echo "  AVALON 测试脚本"
echo "  房间: ${ROOM_ID}"
echo "  动作: ${ACTION}"
echo "========================================"

join_players() {
  echo ""
  echo ">>> 模拟玩家加入..."
  for p in "${PLAYERS[@]}"; do
    IFS='|' read -r openId nick seat <<< "$p"
    echo -n "  ${nick} (${openId}) 座位${seat}: "
    curl -sk -X POST "${BASE}/rooms/join" \
      -H 'Content-Type: application/json' \
      -d "{\"roomId\":\"${ROOM_ID}\",\"userInfo\":{\"openId\":\"${openId}\",\"nickName\":\"${nick}\"},\"seatNumber\":${seat}}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('success') else d.get('message','FAIL'))" 2>/dev/null
  done
}

ready_players() {
  echo ""
  echo ">>> 模拟玩家准备..."
  for p in "${PLAYERS[@]}"; do
    IFS='|' read -r openId nick seat <<< "$p"
    echo -n "  ${nick}: "
    curl -sk -X POST "${BASE}/rooms/toggleReady" \
      -H 'Content-Type: application/json' \
      -d "{\"roomId\":\"${ROOM_ID}\",\"openId\":\"${openId}\",\"isReady\":true}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('已准备' if d.get('success') else d.get('message','FAIL'))" 2>/dev/null
  done
}

cast_votes() {
  if [ -z "$GAME_ID" ]; then
    echo "需要 gameId 参数: bash test_players.sh $ROOM_ID vote <gameId>"
    return
  fi
  echo ""
  echo ">>> 模拟投票 (全部赞成)..."
  for p in "${PLAYERS[@]}"; do
    IFS='|' read -r openId nick seat <<< "$p"
    echo -n "  ${nick}: "
    curl -sk -X POST "${BASE}/games/castVote" \
      -H 'Content-Type: application/json' \
      -d "{\"gameId\":\"${GAME_ID}\",\"openId\":\"${openId}\",\"vote\":\"approve\"}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('投了赞成' if d.get('success') else d.get('message','FAIL'))" 2>/dev/null
  done
}

cast_missions() {
  if [ -z "$GAME_ID" ]; then
    echo "需要 gameId 参数: bash test_players.sh $ROOM_ID mission <gameId>"
    return
  fi
  echo ""
  echo ">>> 模拟任务投票 (全部成功)..."
  for p in "${PLAYERS[@]}"; do
    IFS='|' read -r openId nick seat <<< "$p"
    echo -n "  ${nick}: "
    curl -sk -X POST "${BASE}/games/castMissionVote" \
      -H 'Content-Type: application/json' \
      -d "{\"gameId\":\"${GAME_ID}\",\"openId\":\"${openId}\",\"vote\":\"success\",\"playerRole\":\"loyal\"}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('投了成功' if d.get('success') else d.get('message','FAIL'))" 2>/dev/null
  done
}

reset_players() {
  echo ""
  echo ">>> 重置测试玩家..."
  for p in "${PLAYERS[@]}"; do
    IFS='|' read -r openId nick seat <<< "$p"
    echo -n "  ${nick}: "
    curl -sk -X POST "${BASE}/rooms/leave" \
      -H 'Content-Type: application/json' \
      -d "{\"roomId\":\"${ROOM_ID}\",\"openId\":\"${openId}\"}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('已离开' if d.get('success') else d.get('message','FAIL'))" 2>/dev/null
  done
}

show_room() {
  echo ""
  echo ">>> 当前房间状态..."
  curl -sk "${BASE}/rooms/${ROOM_ID}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('success') and d.get('room'):
  r=d['room']
  players=r.get('players',[])
  print(f'  房主: {r.get(\"ownerId\",\"?\")}')
  print(f'  游戏中: {r.get(\"gameStarted\",False)}')
  print(f'  玩家数: {len(players)}')
  for p in players:
    status='已准备' if p.get('isReady') else '未准备'
    host=' (房主)' if p.get('isHost') else ''
    print(f'    座位{p.get(\"seatNumber\",\"?\")}: {p.get(\"nickName\",\"?\")} {status}{host}')
else:
  print('  房间不存在或获取失败')
" 2>/dev/null
}

case "$ACTION" in
  join)
    join_players
    show_room
    ;;
  ready)
    ready_players
    show_room
    ;;
  vote)
    cast_votes
    ;;
  mission)
    cast_missions
    ;;
  reset)
    reset_players
    show_room
    ;;
  full)
    join_players
    ready_players
    show_room
    echo ""
    echo ">>> 现在可以在小程序中点击 [开始游戏]"
    echo ">>> 开始游戏后，用以下命令模拟投票:"
    echo "    bash test_players.sh ${ROOM_ID} vote <gameId>"
    echo "    bash test_players.sh ${ROOM_ID} mission <gameId>"
    ;;
  *)
    echo "用法: bash test_players.sh <roomId> [join|ready|vote|mission|full|reset] [gameId]"
    ;;
esac
