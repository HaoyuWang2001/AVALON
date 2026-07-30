#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== Kill process on 8082 ==="
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 2

echo ""
echo "=== Verify port free ==="
sudo ss -tlnp | grep 8082 && echo "STILL OCCUPIED!" || echo "Port 8082 is free"

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
