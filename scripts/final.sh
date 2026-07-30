#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== Git pull ==="
git pull origin main

echo ""
echo "=== Rebuild ==="
cd server && docker build -q -t avalon-server:prod . && cd ..

echo ""
echo "=== Redeploy ==="
docker-compose down
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2
docker-compose up -d

echo ""
echo "=== Wait 30s ==="
sleep 30

echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
echo ""
echo "=== Hello ==="
curl -s http://localhost:8082/hello
