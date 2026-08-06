#!/usr/bin/env node
// 临时静态服务：把最新预览二维码暴露到 HTTP，方便其他设备打开后扫码
// 用法: npm run qr:serve  (或 QR_PORT=8099 node scripts/qr-server.js)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.QR_PORT, 10) || 8099;
const IMG_PATH = path.resolve(__dirname, '../../.preview/mp-preview.png');

const PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>小程序预览码</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0b0b0f; font-family:-apple-system,'PingFang SC',sans-serif; }
  .box { text-align:center; color:#fff; }
  h1 { font-size:18px; margin:0 0 6px; }
  p { color:#9a9aa5; font-size:13px; margin:8px 0 0; }
  img { width:320px; height:320px; border-radius:12px; background:#fff; padding:12px; box-sizing:border-box; }
</style>
</head>
<body>
  <div class="box">
    <h1>AVALON 小程序 · 真机预览码</h1>
    <img src="/preview.png?t=${Date.now()}" alt="preview qr">
    <p>用手机微信「扫一扫」打开预览（约 25 分钟有效）</p>
    <p id="tip" style="color:#e3e3ec;"></p>
  </div>
  <script>
    const tip = document.getElementById('tip');
    fetch('/status').then(r => r.json()).then(d => {
      if (d.exists) {
        tip.textContent = '更新时间: ' + d.updatedAt;
        setTimeout(() => location.reload(), 30000);
      } else {
        tip.textContent = '尚未生成预览码，请先在服务器执行 npm run preview';
        setTimeout(() => location.reload(), 10000);
      }
    }).catch(() => {});
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
    return;
  }

  if (url === '/status') {
    let exists = false;
    let updatedAt = '';
    if (fs.existsSync(IMG_PATH)) {
      exists = true;
      updatedAt = fs.statSync(IMG_PATH).mtime.toLocaleString('zh-CN');
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ exists, updatedAt }));
    return;
  }

  if (url === '/preview.png') {
    if (!fs.existsSync(IMG_PATH)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('尚未生成预览码，请先执行 npm run preview');
      return;
    }
    const buf = fs.readFileSync(IMG_PATH);
    let type = 'image/png';
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      type = 'image/jpeg';
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[qr-server] 预览码服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`[qr-server] 在其他设备打开 http://<服务器IP或域名>:${PORT}/ 即可查看并扫码`);
});
