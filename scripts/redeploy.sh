#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== 1) Pull latest ==="
git pull origin main

echo ""
echo "=== 2) Rebuild image ==="
cd server && docker build -t avalon-server:prod . && cd ..

echo ""
echo "=== 3) Restart ==="
docker-compose down
docker-compose up -d

echo ""
echo "⏳ Waiting for ready (30s)..."
sleep 30

echo ""
echo "=== 4) Status ==="
docker-compose ps

echo ""
echo "=== 5) Logs ==="
docker logs avalon-server --tail 15

echo ""
echo "=== 6) Health ==="
curl -s http://localhost:8082/api/health
