#!/bin/bash
cd /home/lighthouse/AVALON/AVALON
echo "=== Rebuild ==="
cd server && docker build -t avalon-server:prod . && cd ..
echo "=== Redeploy ==="
docker-compose down
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2
docker-compose up -d
echo "Waiting 30s..."
sleep 30
echo "=== Health ==="
curl -s http://localhost:8082/api/health
