#!/bin/bash
echo "=== What is on port 8082? ==="
sudo ss -tlnp | grep 8082

echo ""
echo "=== Process details ==="
PID=$(sudo fuser 8082/tcp 2>/dev/null)
if [ -n "$PID" ]; then
  ps aux | grep $PID | grep -v grep
  echo ""
  echo "=== Process parent ==="
  ps -o pid,ppid,comm -p $PID 2>/dev/null
  PPID=$(ps -o ppid= -p $PID 2>/dev/null | tr -d ' ')
  if [ -n "$PPID" ]; then
    echo "Parent process:"
    ps -o pid,ppid,comm -p $PPID 2>/dev/null
  fi
fi

echo ""
echo "=== PM2 resurrect? ==="
pm2 list 2>/dev/null || echo "No PM2"

echo ""
echo "=== Systemd services (8082) ==="
systemctl list-units --type=service --all 2>/dev/null | grep -i avalon || echo "No avalon systemd"

echo ""
echo "=== All Docker containers ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
