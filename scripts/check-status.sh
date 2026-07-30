#!/bin/bash
echo "=== Container ==="
docker ps --format "table {{.Names}}\t{{.Status}}" | head -3
echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
echo ""
echo "=== Hello ==="
curl -s http://localhost:8082/hello
