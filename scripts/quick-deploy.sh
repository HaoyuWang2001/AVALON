#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON
echo "=== Pull + Rebuild ==="
git pull origin main
cd server && docker build -q -t avalon-server:prod . && cd ..

echo "=== Restart ==="
docker-compose down
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2
docker-compose up -d
sleep 28
echo "=== Health ==="
curl -s http://localhost:8082/api/health
