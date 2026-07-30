#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== Pull + Rebuild ==="
git pull origin main
cd server && docker build -t avalon-server:prod . && cd ..

echo ""
echo "=== Down + Up ==="
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2
docker-compose down
docker-compose up -d

echo ""
echo "=== Wait 35s ==="
sleep 35

echo ""
echo "=== Logs ==="
docker logs avalon-server --tail 15

echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
