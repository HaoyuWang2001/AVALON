#!/bin/bash
# deploy-backend.sh —— 同步后端代码到服务器并重建 avalon-server 生产容器
#
# 与 test-backend.sh 互补：test=验证，deploy=上线。本脚本在【本地】运行，
# 通过 tar+ssh 将本地 server/ 同步到服务器 repo，再重建 avalon-server 容器，
# 并校验容器内关键代码与本地 md5 一致（防止旧镜像残留——曾因漏部署导致线上旧逻辑）。
#
# 用法:
#   bash deploy-backend.sh [options]
#
# 选项:
#   --skip-sync   跳过代码同步（仅重建+验证，用于已手动 scp 过的情况）
#   --no-verify   跳过部署后验证（md5 对比 + 健康日志）
#   -d/--dry-run  只打印将执行的命令，不实际执行
#   -s <host>     服务器地址（默认 lighthouse@haoyu-wang141.top）
#
# 环境: 需本机已配置 ssh 免密登录目标服务器，且服务器具备 docker + docker compose。

set -uo pipefail

HOST="lighthouse@haoyu-wang141.top"
REPO="/home/lighthouse/AVALON/AVALON"
SYNC=1
VERIFY=1
DRY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_REPO="$(dirname "$SCRIPT_DIR")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-sync) SYNC=0; shift ;;
    --no-verify) VERIFY=0; shift ;;
    -d|--dry-run) DRY=1; shift ;;
    -s) HOST="${2:-$HOST}"; shift 2 ;;
    *) echo "未知参数: $1"; exit 2 ;;
  esac
done

run() {
  if [[ "$DRY" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    echo "▶ $*"
    eval "$@"
  fi
}

echo "════════ 后端部署 ════════"
echo "目标: $HOST:$REPO"

# ─── 1) 同步代码 ───
if [[ "$SYNC" -eq 1 ]]; then
  echo ""
  echo "── [1/3] 同步 server/ → 服务器 (排除 node_modules/coverage/.tmp) ──"
  run "tar czf - --exclude=node_modules --exclude=coverage --exclude=.tmp -C '$LOCAL_REPO/server' . | ssh '$HOST' 'tar xzf - -C $REPO/server'"
  echo "── 同步 mysql/DDL.sql ──"
  run "scp -q '$LOCAL_REPO/mysql/DDL.sql' '$HOST:$REPO/mysql/DDL.sql'"
else
  echo "── [1/3] 跳过代码同步 (--skip-sync) ──"
fi

# ─── 2) 重建生产容器 ───
echo ""
echo "── [2/3] 重建 avalon-server 生产容器 ──"
run "ssh '$HOST' 'cd $REPO && docker compose up -d --build avalon-server'"

# ─── 3) 验证 ───
if [[ "$VERIFY" -eq 1 ]]; then
  echo ""
  echo "── [3/3] 部署后验证 ──"
  if [[ "$SYNC" -eq 1 || "$DRY" -eq 0 ]]; then
    local_md5=$(md5sum "$LOCAL_REPO/server/models/GameModel.js" | cut -d' ' -f1)
    if [[ "$DRY" -eq 1 ]]; then
      echo "[dry-run] 校验容器内 GameModel.js md5 == $local_md5"
    else
      remote_md5=$(ssh "$HOST" "docker exec avalon-server md5sum /app/models/GameModel.js | cut -d' ' -f1")
      if [[ "$local_md5" == "$remote_md5" ]]; then
        echo "✅ 容器内 GameModel.js md5 一致: $remote_md5"
      else
        echo "❌ md5 不一致! 本地=$local_md5 容器=$remote_md5"
        echo "   可能构建缓存/同步失败，请检查。"
        exit 4
      fi
    fi
  fi
  echo "── 容器健康日志 ──"
  run "ssh '$HOST' 'docker logs avalon-server --tail 10'"
fi

echo ""
echo "════════ 部署完成 ════════"
exit 0
