#!/bin/bash
  
CONTAINER_NAME="mysql-avalon"
DATA_DIR="/home/lighthouse/AVALON/mysql"
ROOT_PASS="" # 密码需自行补充
DB_NAME="avalon_db"

# 检查 Docker 权限
if ! docker info >/dev/null 2>&1; then
    echo "❌  错误：Docker 权限不足"
    exit 1
fi

# 创建数据目录
mkdir -p "$DATA_DIR"

# 停止并删除旧容器
docker stop "$CONTAINER_NAME" >/dev/null 2>&1
docker rm "$CONTAINER_NAME" >/dev/null 2>&1

# 启动 MySQL, 端口映射为 3307
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart always \
  -p 3307:3306 \
  -v "$DATA_DIR:/var/lib/mysql" \
  -e MYSQL_ROOT_PASSWORD="$ROOT_PASS" \
  -e MYSQL_DATABASE="$DB_NAME" \
  mysql:latest \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci