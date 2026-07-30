#!/bin/bash
echo "=== Test rooms list ==="
curl -s http://localhost:8082/api/rooms
echo ""
echo "=== Test messages get ==="
curl -s "http://localhost:8082/api/messages/000000"
echo ""
echo "=== Server errors (last 10) ==="
docker logs avalon-server --tail 20 | grep -i error
