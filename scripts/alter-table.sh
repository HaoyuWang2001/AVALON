#!/bin/bash
docker exec mysql-avalon mysql -u avalon_user -pavalon_pass_2024 -e "ALTER TABLE rooms ADD COLUMN room_config JSON NULL COMMENT 'room config';" avalon_db 2>&1
echo "Done"
