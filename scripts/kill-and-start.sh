#!/bin/bash
echo "=== Kill 8082 process and parent too ==="
PID=$(sudo fuser 8082/tcp 2>/dev/null)
if [ -n "$PID" ]; then
  echo "PID on port 8082: $PID"
  PPID=$(ps -o ppid= -p $PID 2>/dev/null | tr -d ' ')
  echo "Parent PID: $PPID"
  ps -o pid,ppid,comm,args -p $PID,$PPID 2>/dev/null
  echo "Killing parent $PPID..."
  sudo kill -9 $PPID 2>/dev/null
  sudo kill -9 $PID 2>/dev/null
fi
sleep 3

echo ""
echo "=== Check PM2 ==="
pm2 list 2>/dev/null || echo "No PM2"
pgrep -af "PM2" 2>/dev/null && echo "PM2 daemon found!" || echo "No PM2 daemon"

echo ""
echo "=== Start avalon-server ==="
cd /home/lighthouse/AVALON/AVALON
docker start avalon-server
sleep 10

echo ""
echo "=== Logs ==="
docker logs avalon-server --tail 10

echo ""
echo "=== Health ==="
curl -s http://localhost:8082/api/health
