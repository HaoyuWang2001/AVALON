#!/bin/bash

CONTAINER_NAME="mysql-avalon"
# 设置AVALON_HOME变量，如果没有设置则使用默认值
AVALON_HOME="${AVALON_HOME:-/home/lighthouse/AVALON}"
DATA_DIR="$AVALON_HOME/mysql"
ROOT_PASS="<your_root_password_here>"
AVALON_USER_PASS="<your_avalon_user_password_here>"

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

# 启动 MySQL 8.0 容器，端口映射为 3307
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart always \
  -p 3307:3306 \
  -v "$DATA_DIR:/var/lib/mysql" \
  -e MYSQL_ROOT_PASSWORD="$ROOT_PASS" \
  -e MYSQL_DATABASE="avalon_db" \
  -e MYSQL_USER="avalon_user" \
  -e MYSQL_PASSWORD="$AVALON_USER_PASS" \
  mysql:latest \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --log-bin-trust-function-creators=1

echo "✅ MySQL容器已启动，数据存储在: $DATA_DIR"
echo "📊 查看日志: docker logs $CONTAINER_NAME"