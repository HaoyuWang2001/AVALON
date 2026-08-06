#!/usr/bin/env node
// 把最新生成的预览码推送到生产服务器并输出访问地址
// 用法: npm run preview:push  （需先执行 npm run preview）
const { execSync } = require('child_process');
const path = require('path');

const LOCAL_QR = path.resolve(__dirname, '../.preview/mp-preview.png');
const PROD_HOST = 'lighthouse@114.132.51.227';
const PROD_DIR = '/home/lighthouse/preview-qr';
const URL = 'http://haoyu-wang141.top:8099/';

try {
  execSync(`scp -o BatchMode=yes ${LOCAL_QR} ${PROD_HOST}:${PROD_DIR}/mp-preview.png`, {
    stdio: 'inherit'
  });
  console.log(`[push] 预览码已更新到生产服务器`);
  console.log(`[push] 打开 ${URL} 用手机微信扫码预览`);
} catch (err) {
  console.error('[push] 推送失败:', err.message);
  process.exit(1);
}
