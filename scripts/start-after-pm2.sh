#!/bin/bash
cd /home/lighthouse/AVALON/AVALON
echo "=== Kill PM2 ==="
bash scripts/kill-pm2-permanent.sh
echo ""
echo "=== Start container ==="
docker start avalon-server
sleep 10
echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
