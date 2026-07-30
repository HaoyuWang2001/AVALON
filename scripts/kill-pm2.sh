#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== Kill PM2 daemon (force) ==="
sudo kill -9 1118081 2>/dev/null || true
sleep 2
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 1

echo ""
echo "=== Port free? ==="
sudo ss -tlnp | grep 8082 && echo "STILL BUSY" || echo "Port 8082 free"

echo ""
echo "=== Start avalon-server ==="
docker start avalon-server
sleep 10

echo ""
echo "=== Logs ==="
docker logs avalon-server --tail 12

echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
