#!/bin/bash
# test-backend.sh —— 服务器本机后端测试（在 avalon-server-test 容器内跑 jest，连本地 avalon-mysql 容器）
#
# 背景: 本仓库后端测试通过 docker-compose.test.yml 的 test-backend 服务运行（Dockerfile.test,
#       node:20-alpine + npm ci 含 jest）。容器内 NODE_ENV=test、DB_HOST=mysql，与线上 avalon_db 完全隔离
#       （每次运行 globalSetup 都会 DROP/CREATE avalon_db_test）。
#       在服务器本机执行，仅需 host 具备 docker + docker compose，无需 host 安装 node。
#
# 用法:
#   bash test-backend.sh [options] [suite...]
#
# 参数 suite: 测试文件名模式（jest testMatch），可多个，例如
#       01_health 02_rooms 03_games_start 03b_lancelot_variant 04_games_flow
#       04a_games_flow_good 04b_games_flow_evil 04c_lake_confirm 05_socket 06_edge_cases 07_game_logic
#       传 all 或留空 = 跑全部套件
#
# 选项:
#   -t <pattern>    jest --testNamePattern（按用例名过滤）
#   -b             后台运行：nohup 写日志 + 每 60s 输出 通过/失败/跳过/已完成/剩余/预计时长
#   --timeout <ms>  jest testTimeout（默认 60000）
#   --verbose       jest --verbose
#   --no-build      不重新构建测试镜像（默认构建，保证代码最新；构建含 npm ci 较慢）
#   -d/--dry-run    只打印将执行的命令，不实际执行
#   --              之后所有参数原样透传给 jest
#
# 环境覆盖（可选）: 设置 DB_* 环境变量会以 -e 传入容器，覆盖 docker-compose.test.yml 的默认值
#   （DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME/DB_ROOT_USER/DB_ROOT_PASS）
#
# 进度基准: 每次跑完会把 <suites>、用例总数、耗时写入 .test-baseline（本脚本同目录）。
#           后台模式下据此估算"剩余用例/预计时长"；首次无基准则显示 --，跑完自动建立。
#
# 示例（新 agent context 复用）:
#   bash test-backend.sh 04c_lake_confirm            # 单个套件（前台）
#   bash test-backend.sh -b 03_games_start           # 单个套件（后台 + 进度）
#   bash test-backend.sh all                         # 全部套件
#   bash test-backend.sh -t 'T1[12]' 03_games_start  # 按用例名过滤
#   bash test-backend.sh -d 04c                      # dry-run 查看命令

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$REPO_DIR/docker-compose.test.yml"
LOCK_FILE="$SCRIPT_DIR/.test-backend.lock"
BASELINE_FILE="$SCRIPT_DIR/.test-baseline"

# ---------- 参数解析 ----------
SUITES=()
TNAME=""
BACKGROUND=0
TIMEOUT=60000
VERBOSE=0
BUILD=1
DRY=0
PASSTHROUGH=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t) TNAME="${2:-}"; shift 2 ;;
    -b) BACKGROUND=1; shift ;;
    --timeout) TIMEOUT="${2:-60000}"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    --no-build) BUILD=0; shift ;;
    -d|--dry-run) DRY=1; shift ;;
    --) shift; PASSTHROUGH+=("$@"); break ;;
    *) SUITES+=("$1"); shift ;;
  esac
done

if [[ "${#SUITES[@]}" -eq 0 || "${SUITES[0]}" == "all" ]]; then
  SUITES=()
fi

# ---------- 前置检查 ----------
if [[ "$DRY" -eq 0 ]]; then
  if [[ -e "$LOCK_FILE" ]]; then
    echo "❌ 已有测试在运行（锁文件 $LOCK_FILE 存在），请等待完成或手动删除。"
    exit 2
  fi
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "❌ 找不到 $COMPOSE_FILE"
    exit 2
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ 本机无 docker 命令。请确认在服务器本机运行（haoyu-wang141.top）。"
    exit 2
  fi
fi

# ---------- 构建测试镜像（保证代码最新） ----------
if [[ "$BUILD" -eq 1 ]]; then
  echo "🔨 构建测试镜像 avalon-server:test ..."
  if [[ "$DRY" -eq 1 ]]; then
    echo "docker compose -f $COMPOSE_FILE build test-backend"
  else
    docker compose -f "$COMPOSE_FILE" build test-backend || { echo "❌ 构建失败"; exit 3; }
  fi
fi

# ---------- 组装 docker compose run 命令 ----------
JEST_ARGS=(npx jest)
if [[ "${#SUITES[@]}" -gt 0 ]]; then JEST_ARGS+=("${SUITES[@]}"); fi
if [[ -n "$TNAME" ]]; then JEST_ARGS+=(--testNamePattern "$TNAME"); fi
JEST_ARGS+=(--forceExit --detectOpenHandles --testTimeout "$TIMEOUT")
if [[ "$VERBOSE" -eq 1 || "$BACKGROUND" -eq 1 ]]; then JEST_ARGS+=(--verbose); fi
if [[ "${#PASSTHROUGH[@]}" -gt 0 ]]; then JEST_ARGS+=("${PASSTHROUGH[@]}"); fi

RUN_ARGS=(-f "$COMPOSE_FILE" run --rm test-backend)
for v in DB_HOST DB_PORT DB_USER DB_PASS DB_NAME DB_ROOT_USER DB_ROOT_PASS; do
  if [[ -n "${!v:-}" ]]; then RUN_ARGS+=(-e "$v=${!v}"); fi
done

CMD=(docker compose "${RUN_ARGS[@]}" "${JEST_ARGS[@]}")
SUITE_KEY="$(printf '%s ' "${SUITES[@]}" | sed 's/ $//')"; [[ -z "$SUITE_KEY" ]] && SUITE_KEY="all"

echo "▶ 命令: ${CMD[*]}"

if [[ "$DRY" -eq 1 ]]; then
  exit 0
fi

# ---------- 执行 ----------
if [[ "$BACKGROUND" -eq 0 ]]; then
  touch "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
  "${CMD[@]}"
  code=$?
  echo ""
  echo "⏹ 测试结束，退出码: $code"
  exit "$code"
fi

# ---------- 后台执行 + 每 60s 进度汇报 ----------
LOG_FILE="/tmp/test-backend-$(date +%s).log"
echo "📄 日志: $LOG_FILE"
nohup "${CMD[@]}" > "$LOG_FILE" 2>&1 &
TEST_PID=$!

# 读取基准
total_hint=""
base_seconds=""
if [[ -f "$BASELINE_FILE" ]]; then
  while IFS=$'\t' read -r key t sec; do
    if [[ "$key" == "$SUITE_KEY" ]]; then total_hint="$t"; base_seconds="$sec"; fi
  done < "$BASELINE_FILE"
fi

start_ts=$(date +%s)
last_completed=0
last_report_ts=$start_ts

echo "⏳ 后台测试已启动 (PID=$TEST_PID, suites=$SUITE_KEY)"

while kill -0 "$TEST_PID" 2>/dev/null; do
  sleep 60
  now=$(date +%s)
  passed=$(grep -cE '^\s*✓' "$LOG_FILE" 2>/dev/null || echo 0)
  failed=$(grep -cE '^\s*✕' "$LOG_FILE" 2>/dev/null || echo 0)
  skipped=$(grep -cE '^\s*○' "$LOG_FILE" 2>/dev/null || echo 0)
  completed=$((passed + failed + skipped))
  elapsed=$((now - start_ts))

  remaining_str="--"
  eta_str="--"
  if [[ -n "$total_hint" ]] && [[ "$total_hint" -gt 0 ]]; then
    remaining=$((total_hint - completed)); [[ $remaining -lt 0 ]] && remaining=0
    remaining_str="$remaining"
    if [[ "$completed" -gt 0 ]]; then
      avg_per=$(awk -v e="$elapsed" -v c="$completed" 'BEGIN{printf "%.2f", e/c}')
      eta=$(awk -v a="$avg_per" -v r="$remaining" 'BEGIN{printf "%d", a*r}')
      eta_str="${eta}s"
    fi
  fi

  echo "[t+${elapsed}s] passed=$passed failed=$failed skipped=$skipped completed=$completed 剩余=$remaining_str 预计还需=${eta_str}"

  # 若长时间无新完成用例（可能挂起），给出提示
  if [[ "$completed" -eq "$last_completed" ]] && [[ $((now - last_report_ts)) -ge 120 ]]; then
    echo "  ⚠ 最近 60s 无新增完成用例（可能阻塞/慢连接），tail 日志: $LOG_FILE"
  fi
  last_completed=$completed
  last_report_ts=$now
done

wait "$TEST_PID"
code=$?

# 解析最终汇总
echo ""
echo "════════ 最终汇总 ════════"
grep -E "Tests:|Test Suites:|Time:" "$LOG_FILE" | tail -20
echo "退出码: $code"

# 写入基准（从 jest 汇总解析 total 与耗时）
if [[ "$code" -eq 0 ]] || true; then
  total=$(grep -oE 'Tests:[[:space:]]*[0-9]+ (passed|failed|skipped)[^0-9]*' "$LOG_FILE" | grep -oE '[0-9]+ total|[0-9]+' | tail -1)
  # 汇总形如: Tests: 110 skipped, 20 passed, 130 total
  total=$(grep -E '^Tests:' "$LOG_FILE" | grep -oE '[0-9]+ total' | grep -oE '^[0-9]+' | tail -1)
  time_s=$(grep -E '^Time:' "$LOG_FILE" | grep -oE '[0-9.]+ s' | grep -oE '^[0-9.]+' | tail -1)
  if [[ -n "$total" && -n "$time_s" ]]; then
    printf '%s\t%s\t%s\n' "$SUITE_KEY" "$total" "$time_s" > "$BASELINE_FILE.tmp"
    mv "$BASELINE_FILE.tmp" "$BASELINE_FILE"
    echo "📌 已更新基准: $SUITE_KEY total=$total ${time_s}s"
  fi
fi

exit "$code"
