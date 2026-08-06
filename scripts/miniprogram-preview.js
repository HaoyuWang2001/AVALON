#!/usr/bin/env node
// 微信小程序自动预览：生成真机预览二维码
// 用法: npm run preview  (在 miniprogram 目录执行)
// 输出: .preview/mp-preview.png  (真机预览二维码)
const path = require('path');
const fs = require('fs');
const ci = require('miniprogram-ci');

const APPID = 'wxb021f21838eb4ced';
const projectPath = path.resolve(__dirname, '..');
const privateKeyPath =
  process.env.MP_PRIVATE_KEY || path.resolve(__dirname, '../../.keys/private.key');
const outputDest = path.resolve(__dirname, '../../.preview/mp-preview.png');

(async () => {
  if (!fs.existsSync(privateKeyPath)) {
    console.error(`[preview] 未找到上传密钥: ${privateKeyPath}`);
    console.error('[preview] 请将上传密钥放到 .keys/private.key 或设置环境变量 MP_PRIVATE_KEY');
    process.exit(1);
  }

  const project = new ci.Project({
    appid: APPID,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*', 'package-lock.json', '__tests__/**/*', 'scripts/**/*']
  });

  console.log('[preview] 开始编译并生成真机预览码...');
  await ci.preview({
    project,
    desc: '自动预览',
    setting: {
      es6: true,
      minify: true,
      minifyWXML: true,
      minifyWXSS: true,
      postcss: true
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: outputDest,
    onProgressUpdate: (info) => {
      if (info && info.status) console.log(`[preview] ${info.status}`);
    }
  });

  console.log(`[preview] 预览码已生成: ${outputDest}`);
  console.log('[preview] 用手机微信扫码即可真机预览；二维码约 25 分钟有效。');
})().catch((err) => {
  console.error('[preview] 预览失败:', err && err.message ? err.message : err);
  process.exit(1);
});
