#!/bin/bash
echo "=== Check parent process ==="
ps -o pid,ppid,comm,args -p 1118081 2>/dev/null || echo "Parent 1118081 gone"

echo ""
echo "=== Check if systemd service ==="
systemctl status avalon-server 2>/dev/null && echo "Found service!" || echo "No avalon-server service"

echo ""
echo "=== Kill tree ==="
sudo kill -9 1118081 1308091 2>/dev/null; sleep 2

echo ""
echo "=== Verify port free ==="
sudo ss -tlnp | grep 8082 && echo "STILL OCCUPIED" || echo "Port 8082 free"
