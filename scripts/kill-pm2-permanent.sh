#!/bin/bash
echo "=== Check PM2 startup ==="
ls -la ~/.pm2/ 2>/dev/null | head -5
echo ""
echo "=== PM2 dump file ==="
cat ~/.pm2/dump.pm2 2>/dev/null | python3 -m json.tool 2>/dev/null | head -30 || echo "No dump file"
echo ""
echo "=== Systemd PM2 ==="
systemctl list-units --type=service --all 2>/dev/null | grep -i pm2 || echo "No PM2 systemd service"
echo ""
echo "=== Kill PM2 permanently ==="
pm2 kill 2>/dev/null || true
sudo kill -9 $(pgrep -f "^PM2") 2>/dev/null || true
pm2 unstartup 2>/dev/null || true
echo ""
echo "=== Remove PM2 dump ==="
rm -f ~/.pm2/dump.pm2 2>/dev/null || true
echo ""
echo "=== Kill 8082 ==="
sudo fuser -k 8082/tcp 2>/dev/null || true
sleep 3
echo ""
echo "=== Verify ==="
pgrep -f "^PM2" && echo "PM2 STILL ALIVE" || echo "PM2 dead"
sudo ss -tlnp | grep 8082 && echo "PORT BUSY" || echo "Port 8082 free"
