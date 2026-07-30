#!/bin/bash
set -e
cd /home/lighthouse/AVALON/AVALON

echo "=== Restart avalon-server ==="
docker restart avalon-server
sleep 6

echo ""
echo "=== Container status ==="
docker-compose ps

echo ""
echo "=== Server logs ==="
docker logs avalon-server --tail 20

echo ""
echo "=== Health check ==="
curl -s http://localhost:8082/hello
echo ""
curl -s http://localhost:8082/api/health
