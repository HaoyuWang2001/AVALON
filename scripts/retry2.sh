#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== MySQL logs (last 5 lines) ==="
docker logs mysql-avalon --tail 5

echo ""
echo "=== Force restart avalon-server ==="
docker restart avalon-server
sleep 8

echo ""
echo "=== Server log ==="
docker logs avalon-server --tail 10

echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
