#!/bin/bash
cd /home/lighthouse/AVALON/AVALON
docker rm -f avalon-server 2>/dev/null
sleep 2
fuser -k 8082/tcp 2>/dev/null
sleep 3
docker compose up -d avalon-server
sleep 5
docker logs avalon-server --tail 3
