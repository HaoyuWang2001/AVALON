#!/bin/bash
  
CONTAINER_NAME="mysql-avalon"

if ! docker info >/dev/null 2>&1; then
    echo "❌  Docker 权限不足"
    exit 1
fi

echo "🛑  停止 MySQL 容器..."
docker stop "$CONTAINER_NAME" >/dev/null 2>&1
docker rm "$CONTAINER_NAME" >/dev/null 2>&1

echo "✅  MySQL 已停止并删除"