#!/bin/bash
set -e

SERVER="lighthouse@114.132.51.227"
REMOTE_DIR="/home/lighthouse/AVALON/AVALON"
IMAGE="avalon-server:prod"
TAR_FILE="/tmp/avalon-server-prod.tar.gz"

echo "=============================================="
echo "  AVALON Docker 部署脚本"
echo "  目标: ${SERVER}"
echo "=============================================="

# ─── 1) Local build ────────────────────────────
echo ""
echo "🔨 本地构建 Docker 镜像..."
cd "$(dirname "$0")/../server"
docker build -t "${IMAGE}" .
cd "$(dirname "$0")/.."
echo "✅ 镜像构建完成"

# ─── 2) Save and compress ──────────────────────
echo ""
echo "📦 打包镜像..."
docker save "${IMAGE}" | gzip > "${TAR_FILE}"
echo "   文件: ${TAR_FILE}（$(du -h "${TAR_FILE}" | cut -f1)）"

# ─── 3) Upload to server ───────────────────────
echo ""
echo "📤 上传到服务器..."
scp "${TAR_FILE}" "${SERVER}:${REMOTE_DIR}/docker/"
echo "✅ 上传完成"

# ─── 4) Remote deploy ──────────────────────────
echo ""
echo "🚀 远程部署..."
ssh "${SERVER}" << 'REMOTE_EOF'
  set -e
  cd /home/lighthouse/AVALON/AVALON

  echo ""
  echo "📥 加载 Docker 镜像..."
  docker load < docker/avalon-server-prod.tar.gz
  echo "✅ 镜像加载完成"

  echo ""
  echo "🛑 停止旧服务..."
  docker-compose down 2>/dev/null || true

  echo ""
  echo "🚀 启动新服务..."
  docker-compose up -d
  echo "⏳ 等待服务就绪..."
  sleep 8

  echo ""
  echo "📊 容器状态:"
  docker-compose ps

  echo ""
  echo "🏥 健康检查:"
  curl -s http://localhost:8082/hello 2>/dev/null || echo "  服务未就绪，请稍后重试"
  echo ""
  curl -s http://localhost:8082/api/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  健康接口暂未就绪"
REMOTE_EOF

# ─── 5) Cleanup local temp file ────────────────
rm -f "${TAR_FILE}"

echo ""
echo "=============================================="
echo "  ✅ 部署完成"
echo "  URL: https://114.132.51.227:8082"
echo "=============================================="
