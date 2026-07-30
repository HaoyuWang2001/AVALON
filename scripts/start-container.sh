#!/bin/bash
cd /home/lighthouse/AVALON/AVALON
docker start avalon-server
sleep 10
echo "=== Logs ==="
docker logs avalon-server --tail 8
echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
