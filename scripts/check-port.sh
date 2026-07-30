#!/bin/bash
echo "=== Port 8082 usage ==="
sudo lsof -i :8082 2>/dev/null || sudo ss -tlnp 2>/dev/null | grep 8082 || echo "No tools available"

echo ""
echo "=== PM2 processes ==="
pm2 list 2>/dev/null || echo "No PM2"

echo ""
echo "=== Docker containers ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
