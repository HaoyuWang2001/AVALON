#!/bin/bash
# test-backend.sh —— 服务器本机后端测试（在 avalon-server-test 容器内跑 jest，连本地 avalon-mysql 容器）
#
# 背景: 本仓库后端测试通过 docker-compose.test.yml 的 test-backend 服务运行（Dockerfile.test,
#       node:20-alpine + npm ci 含 jest）。容器内 NODE_ENV=test、DB_HOST=mysql，与线上 avalon_db 完全隔离
#       （每次运行 globalSetup 都会 DROP/CREATE avalon_db_test）。
#       在服务器本机执行，仅需 host 具备 docker + docker compose，无需 host 安装 node。
#
# 用法:
#   bash test-backend.sh [options] [suite...]           # 跑测试（强制先用最新代码构建测试镜像）
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
#   -d/--dry-run    只打印将执行的命令，不实际执行（含构建命令）
#   --              之后所有参数原样透传给 jest
#
# 环境覆盖（可选）: 设置 DB_* 环境变量会以 -e 传入容器，覆盖 docker-compose.test.yml 的默认值
#   （DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME/DB_ROOT_USER/DB_ROOT_PASS）
#
# 进度基准: 每次跑完（前台/后台）都会把 build 镜像耗时、每套件耗时、全量总数/总耗时写入
#           .test-baseline（本脚本同目录，TSV 多行）：
#             build_seconds  <构建秒数>
#             all    total  <总用例数> <总秒数>
#             suite  <套件名> <用例数> <秒数>
#           后台模式下据此估算"剩余用例/预计时长"；首次无基准则显示 --，跑完自动建立。
#
# 示例（新 agent context 复用）:
#   bash test-backend.sh all                            # 全部套件（前台，强制构建，实时打印，写 baseline）
#   bash test-backend.sh 04c_lake_confirm                # 单个套件（前台）
#   bash test-backend.sh -b 03_games_start               # 单个套件（后台 + 进度）
#   bash test-backend.sh -t 'T1[12]' 03_games_start      # 按用例名过滤
#   bash test-backend.sh -d 04c                          # dry-run 查看命令

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
DRY=0
PASSTHROUGH=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t) TNAME="${2:-}"; shift 2 ;;
    -b) BACKGROUND=1; shift ;;
    --timeout) TIMEOUT="${2:-60000}"; shift 2 ;;
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

# ---------- 构建测试镜像（强制，保证用最新代码；记录耗时写入 baseline） ----------
echo "🔨 构建测试镜像 avalon-server:test ..."
build_seconds=""
if [[ "$DRY" -eq 1 ]]; then
  echo "docker compose -f $COMPOSE_FILE build test-backend"
else
  build_start=$(date +%s)
  build_out=$(docker compose -f "$COMPOSE_FILE" build -q test-backend 2>&1); build_rc=$?
  if [[ "$build_rc" -ne 0 ]]; then echo "$build_out"; echo "❌ 构建失败"; exit 3; fi
  build_end=$(date +%s)
  build_seconds=$((build_end - build_start))
  echo "✅ 构建完成，耗时 ${build_seconds}s"
fi

# ---------- 组装 docker compose run 命令 ----------
JEST_ARGS=(npx jest)
if [[ "${#SUITES[@]}" -gt 0 ]]; then JEST_ARGS+=("${SUITES[@]}"); fi
if [[ -n "$TNAME" ]]; then JEST_ARGS+=(--testNamePattern "$TNAME"); fi
JEST_ARGS+=(--forceExit --detectOpenHandles --testTimeout "$TIMEOUT")
if [[ "$BACKGROUND" -eq 1 ]]; then
  # 后台：保留 verbose 全量日志（供每 60s 进度统计）
  JEST_ARGS+=(--verbose)
else
  # 前台：自定义 reporter（动态进度行 + 简洁 PASS/FAIL），不使用逐用例 verbose
  JEST_ARGS+=(--reporters=/app/__tests__/helpers/progressReporter.js)
fi
if [[ "${#PASSTHROUGH[@]}" -gt 0 ]]; then JEST_ARGS+=("${PASSTHROUGH[@]}"); fi

RUN_ARGS=(-f "$COMPOSE_FILE" run --rm)
for v in DB_HOST DB_PORT DB_USER DB_PASS DB_NAME DB_ROOT_USER DB_ROOT_PASS; do
  if [[ -n "${!v:-}" ]]; then RUN_ARGS+=(-e "$v=${!v}"); fi
done
# 预估时长/用例数（来自 baseline 各套件）传给 reporter 显示：name:sec:count
SUITE_TIMES=""
if [[ -f "$BASELINE_FILE" ]]; then
  while IFS=$'\t' read -r a b c d; do
    if [[ "$a" == "suite" && -n "$d" && "$d" != "0" ]]; then
      SUITE_TIMES="${SUITE_TIMES}${SUITE_TIMES:+,}${b}:${d}:${c}"
    fi
  done < "$BASELINE_FILE"
fi
if [[ -n "$SUITE_TIMES" ]]; then
  RUN_ARGS+=(-e "SUITE_TIMES=$SUITE_TIMES")
fi
RUN_ARGS+=(test-backend)

CMD=(docker compose "${RUN_ARGS[@]}" "${JEST_ARGS[@]}")
SUITE_KEY="$(printf '%s ' "${SUITES[@]}" | sed 's/ $//')"; [[ -z "$SUITE_KEY" ]] && SUITE_KEY="all"

echo "▶ 命令: ${CMD[*]}"

if [[ "$DRY" -eq 1 ]]; then
  exit 0
fi

# ---------- 解析 jest 日志写入 baseline（前台/后台共用） ----------
# 格式: build_seconds / all total / suite <name> <count> <sec>，TSV 多行
write_baseline() {
  local log="$1"
  local build_sec="$2"
  local is_all="$3"
  local total time_s
  total=$(grep -E '^Tests:' "$log" | grep -oE '[0-9]+ total' | grep -oE '^[0-9]+' | tail -1)
  time_s=$(grep -E '^Time:' "$log" | grep -oE '[0-9.]+ s' | grep -oE '^[0-9.]+' | tail -1)
  if [[ -z "$total" || -z "$time_s" ]]; then
    echo "⚠ baseline 跳过：日志缺少 Tests:/Time: 汇总"
    return 0
  fi
  # 逐套件解析两种 PASS 行：
  #   前台自定义 reporter: PASS 02_rooms.test.js 7.3s (predict ~7.3s) TOTAL 49
  #   后台默认 reporter:   PASS __tests__/02_rooms.test.js (7.281 s)
  local cur=""
  local -A s_sec s_cnt
  while IFS= read -r line; do
    if [[ "$line" =~ ^PASS[[:space:]]+([a-zA-Z0-9_]+)\.test\.js[[:space:]]+([0-9.]+)s[[:space:]]*(\(.*\))?[[:space:]]*TOTAL[[:space:]]+([0-9]+) ]]; then
      cur="${BASH_REMATCH[1]}"; s_sec["$cur"]="${BASH_REMATCH[2]}"; s_cnt["$cur"]="${BASH_REMATCH[4]}"
    elif [[ "$line" =~ ^PASS[[:space:]]+__tests__/(.+)\.test\.js[[:space:]]*\(([0-9.]+)[[:space:]]*s\) ]]; then
      cur="${BASH_REMATCH[1]}"; s_sec["$cur"]="${BASH_REMATCH[2]}"; s_cnt["$cur"]=0
    elif [[ "$line" =~ ^PASS[[:space:]]+__tests__/(.+)\.test\.js[[:space:]]*$ ]]; then
      cur="${BASH_REMATCH[1]}"; s_sec["$cur"]="0"; s_cnt["$cur"]=0
    elif [[ -n "$cur" && "$line" =~ ^[[:space:]]*(✓|✕|○) ]]; then
      s_cnt["$cur"]=$(( ${s_cnt["$cur"]:-0} + 1 ))
    fi
  done < "$log"
  local TMP="$BASELINE_FILE.tmp.$$"
  {
    printf 'build_seconds\t%s\n' "${build_sec:-0}"
    # 仅全量运行时更新 all 行；部分套件保留旧 all（全量基准）
    if [[ "$is_all" == "1" ]]; then
      printf 'all\ttotal\t%s\t%s\n' "$total" "$time_s"
    elif [[ -f "$BASELINE_FILE" ]]; then
      grep $'^all\t' "$BASELINE_FILE" 2>/dev/null || true
    fi
    for s in "${!s_sec[@]}"; do
      printf 'suite\t%s\t%s\t%s\n' "$s" "${s_cnt[$s]:-0}" "${s_sec[$s]}"
    done | sort -t $'\t' -k4 -n
    # 保留旧文件中本次未运行的 suite 行（合并式，避免部分运行清空其他套件时长）
    if [[ -f "$BASELINE_FILE" ]]; then
      while IFS=$'\t' read -r a b c d; do
        if [[ "$a" == "suite" && -z "${s_sec[$b]:-}" ]]; then
          printf 'suite\t%s\t%s\t%s\n' "$b" "$c" "$d"
        fi
      done < "$BASELINE_FILE"
    fi
  } > "$TMP"
  mv "$TMP" "$BASELINE_FILE"
  echo "📌 已更新基准: build=${build_sec}s all total=$total ${time_s}s"
}

# ---------- 执行（前台：tee 实时打印 + 写日志；后台：nohup + 进度） ----------
LOG_FILE="/tmp/test-backend-$(date +%s).log"

if [[ "$BACKGROUND" -eq 0 ]]; then
  touch "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
  "${CMD[@]}" 2>&1 | tee "$LOG_FILE"
  code=${PIPESTATUS[0]}
  echo ""
  echo "⏹ 测试结束，退出码: $code"
  if [[ "$code" -eq 0 ]]; then
    write_baseline "$LOG_FILE" "$build_seconds" "$([ "$SUITE_KEY" = "all" ] && echo 1 || echo 0)"
  fi
  exit "$code"
fi

# ---------- 后台执行 + 每 60s 进度汇报 ----------
echo "📄 日志: $LOG_FILE"
nohup "${CMD[@]}" > "$LOG_FILE" 2>&1 &
TEST_PID=$!

# 读取基准（多行）：build_seconds + 命中的 suite 行求和；all 兜底
build_hint=""
all_total=""; all_seconds=""
suites_count=0; suites_time=0
if [[ -f "$BASELINE_FILE" ]]; then
  while IFS=$'\t' read -r a b c d; do
    case "$a" in
      build_seconds) build_hint="$b" ;;
      all) all_total="$c"; all_seconds="$d" ;;
      suite)
        for s in "${SUITES[@]}"; do
          if [[ "$b" == *"$s"* ]]; then
            suites_count=$((suites_count + ${c:-0}))
            suites_time=$(awk -v t="$suites_time" -v x="${d:-0}" 'BEGIN{printf "%.2f", t+x}')
          fi
        done
        ;;
    esac
  done < "$BASELINE_FILE"
fi
total_hint=""
base_seconds=""
if [[ "${#SUITES[@]}" -eq 0 ]]; then
  total_hint="$all_total"; base_seconds="$all_seconds"
else
  total_hint="$suites_count"; base_seconds="$suites_time"
fi
if [[ -n "$build_hint" ]]; then
  base_seconds=$(awk -v t="$base_seconds" -v b="$build_hint" 'BEGIN{printf "%.2f", t+b}')
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

if [[ "$code" -eq 0 ]]; then
  write_baseline "$LOG_FILE" "$build_seconds" "$([ "$SUITE_KEY" = "all" ] && echo 1 || echo 0)"
fi

exit "$code"
