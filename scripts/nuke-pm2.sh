#!/bin/bash
echo "=== Kill PM2 daemon and all its children ==="
sudo kill -9 $(pgrep -f "PM2" | head -1) 2>/dev/null || true
sleep 2

echo ""
echo "=== Kill any 8082 process ==="
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2

echo ""
echo "=== Verify ==="
sudo ss -tlnp | grep 8082 && echo "BUSY!" || echo "Port 8082 free"

echo ""
echo "=== Start container ==="
cd /home/lighthouse/AVALON/AVALON
docker start avalon-server
sleep 8

echo ""
echo "=== Logs ==="
docker logs avalon-server --tail 8

echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
