#!/bin/bash
set -e

cd /home/lighthouse/AVALON/AVALON

echo "=============================================="
echo "  AVALON Docker 部署 (服务器端构建)"
echo "=============================================="

echo ""
echo "=== 1) 拉取最新代码 ==="
git pull origin main

echo ""
echo "=== 2) 构建 Docker 镜像 ==="
cd server
docker build -t avalon-server:prod .
cd ..

echo ""
echo "=== 3) 停止旧服务 ==="
docker-compose down 2>/dev/null || true

echo ""
echo "=== 4) 启动服务 ==="
docker-compose up -d

echo ""
echo "⏳ 等待 MySQL 就绪 (约 30 秒)..."
sleep 30

echo ""
echo "=== 5) 容器状态 ==="
docker-compose ps

echo ""
echo "=== 6) 健康检查 ==="
echo "Hello:"
curl -s http://localhost:8082/hello || echo "等待中..."
echo ""
echo "Health:"
curl -s http://localhost:8082/api/health || echo "等待中..."

echo ""
echo "=============================================="
echo "  部署完成！"
echo "  URL: https://114.132.51.227:8082"
echo "=============================================="
