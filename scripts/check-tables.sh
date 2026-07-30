#!/bin/bash
echo "=== Tables in avalon_db ==="
docker exec mysql-avalon mysql -u avalon_user -pavalon_pass_2024 -e "SHOW TABLES;" avalon_db

echo ""
echo "=== Row counts ==="
docker exec mysql-avalon mysql -u avalon_user -pavalon_pass_2024 -e "
SELECT 'rooms' as tbl, COUNT(*) FROM rooms UNION ALL
SELECT 'players', COUNT(*) FROM players UNION ALL
SELECT 'games', COUNT(*) FROM games UNION ALL
SELECT 'game_players', COUNT(*) FROM game_players UNION ALL
SELECT 'votes', COUNT(*) FROM votes UNION ALL
SELECT 'messages', COUNT(*) FROM messages UNION ALL
SELECT 'role_configs', COUNT(*) FROM role_configurations;
" avalon_db
