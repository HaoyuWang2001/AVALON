#!/bin/bash
set -e

echo "=== 1) Pull latest code ==="
cd /home/lighthouse/AVALON/AVALON
git pull origin main

echo ""
echo "=== 2) Setup .env ==="
if [ ! -f .env ]; then
  cp .env.docker .env
  echo ".env created from template - remember to edit passwords!"
else
  echo ".env already exists"
fi

echo ""
echo "=== 3) Create docker dir ==="
mkdir -p docker

echo ""
echo "=== 4) Stop old services ==="
pm2 stop avalon-server 2>/dev/null && echo "PM2 stopped" || echo "No PM2 process"
pm2 delete avalon-server 2>/dev/null || true
docker stop mysql-avalon 2>/dev/null && echo "Old MySQL container stopped" || echo "No old MySQL container"
docker rm mysql-avalon 2>/dev/null || true

echo ""
echo "=== 5) Environment ==="
docker --version
docker-compose --version 2>/dev/null || docker compose version 2>/dev/null

echo ""
echo "=== 6) Files ==="
ls -la
