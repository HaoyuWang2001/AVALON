#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== Kill old process on port 8082 ==="
sudo kill -9 1300175 2>/dev/null || true
sleep 2
echo "Port 8082 freed"

echo ""
echo "=== Start avalon-server container ==="
docker start avalon-server

echo ""
echo "=== Wait for startup ==="
sleep 5

echo ""
echo "=== Container status ==="
docker-compose ps

echo ""
echo "=== Health check ==="
curl -s http://localhost:8082/hello
echo ""
curl -s http://localhost:8082/api/health
