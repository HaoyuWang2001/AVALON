#!/bin/bash
echo "=== Add wx_nick_name column ==="
docker exec mysql-avalon mysql -u avalon_user -pavalon_pass_2024 -e "ALTER TABLE players ADD COLUMN wx_nick_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'WeChat nickname';" avalon_db 2>&1 || echo "Column may already exist"
echo "Done"
