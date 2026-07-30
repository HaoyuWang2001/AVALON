#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== 1) Kill any process on 8082 + PM2 ==="
sudo kill -9 $(pgrep -f "^PM2" | head -1) 2>/dev/null || true
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 3

echo ""
echo "=== 2) Git pull ==="
git pull origin main

echo ""
echo "=== 3) Rebuild Docker ==="
cd server && docker build -t avalon-server:prod . && cd ..

echo ""
echo "=== 4) Redeploy ==="
docker-compose down 2>/dev/null || true
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2
docker-compose up -d

echo ""
echo "=== 5) Wait 30s ==="
sleep 30

echo ""
echo "=== 6) Status ==="
docker-compose ps

echo ""
echo "=== 7) Health ==="
curl -s http://localhost:8082/api/health
echo ""
curl -s http://localhost:8082/hello
