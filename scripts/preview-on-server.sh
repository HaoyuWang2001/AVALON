#!/bin/bash
# preview-on-server.sh —— 服务器端生成真机预览码
#
# 前置：agent 已完成 git pull 拉取最新 miniprogram 代码（本脚本不负责拉取）。
# 流程：avalon-server 容器内跑 miniprogram-ci preview（编译+上传微信，出口 IP 固定
#       114.132.51.227，白名单仅需配一次）→ cp 二维码到 8099 静态目录 →
#       刷新 index.html 时间戳强制浏览器重新加载。
#
# 一次性前置（首次）：scp preview/ 与 .keys/private.key 到服务器
#   scp -r preview/ lighthouse@<host>:/home/lighthouse/AVALON/preview/
#   scp .keys/private.key  lighthouse@<host>:/home/lighthouse/AVALON/.keys/private.key
#
# 用法: bash scripts/preview-on-server.sh
set -e

REPO=/home/lighthouse/AVALON/AVALON
PREVIEW=/home/lighthouse/AVALON/preview
KEYS=/home/lighthouse/AVALON/.keys
QR_DIR=/home/lighthouse/preview-qr

if [ ! -d "$PREVIEW" ]; then echo "❌ 缺少 $PREVIEW（先 scp preview/）"; exit 1; fi
if [ ! -f "$KEYS/private.key" ]; then echo "❌ 缺少 $KEYS/private.key（先 scp 上传密钥）"; exit 1; fi

# 容器内跑 miniprogram-ci preview（编译 + 上传微信，固定 IP）
# miniprogram-preview.js 内部路径基于 __dirname(/preview) 的上层：../miniprogram=/,/miniprogram、
# ../.keys=/./.keys、../.preview=/./.preview —— 故 .keys 与 .preview 挂载到容器根目录对齐
mkdir -p "$PREVIEW/.preview"
echo "🔨 容器内编译并上传微信..."
docker run --rm \
  -v "$REPO/miniprogram":/miniprogram \
  -v "$PREVIEW":/preview \
  -v "$KEYS":/.keys:ro \
  -v "$PREVIEW/.preview":/.preview \
  -w /preview \
  avalon-server:prod \
  node miniprogram-preview.js

# cp 二维码到 8099 静态目录
cp "$PREVIEW/.preview/mp-preview.png" "$QR_DIR/mp-preview.png"

# 强制刷新：更新 index.html 时间戳，绕过浏览器缓存
TS=$(date +%s)
sed -i "s/mp-preview.png?t=[0-9]*/mp-preview.png?t=$TS/" "$QR_DIR/index.html"

echo "✅ 预览码已更新: http://haoyu-wang141.top:8099/  (t=$TS)"
