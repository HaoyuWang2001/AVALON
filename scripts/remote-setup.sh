#!/bin/bash
set -e

cd /home/lighthouse/AVALON/AVALON

echo "=== 1) Pull latest code ==="
git pull origin main

echo ""
echo "=== 2) Create docker dir ==="
mkdir -p docker

echo ""
echo "=== 3) Check .env ==="
if [ ! -f .env ]; then
  cp .env.docker .env
  echo "Created .env from template"
else
  echo ".env exists"
fi

echo ""
echo "=== 4) Stop old services ==="
pm2 stop avalon-server 2>/dev/null || true
pm2 delete avalon-server 2>/dev/null || true
docker stop mysql-avalon 2>/dev/null || true
docker rm mysql-avalon 2>/dev/null || true
echo "Old services cleaned up"

echo ""
echo "=== 5) Docker version ==="
docker --version

echo ""
echo "=== 6) Server ready ==="
echo "Done!"
