# 小程序真机预览（重新打包 → 生成预览码）

前端（`miniprogram/`）代码有改动后，可通过 `miniprogram-ci` 自动重新打包并在微信生成**真机预览二维码**，手机扫码即可打开小程序（连生产后端 `https://haoyu-wang141.top:8082`）。正式版/体验版上传由人工在微信开发者工具完成，不在本流程内。

> 对应的 opencode skill：`miniprogram-preview`。

## 架构说明（重要）

- **开发机**（本仓库所在机器）处于内网 NAT：出口公网 IP 与域名解析 IP 不一致，**在开发机上起的静态服务公网不可达**。
- **生产服务器** `114.132.51.227` 是 `haoyu-wang141.top` 的实际宿主，二维码**必须由生产服务器对外提供**。
- 生产机无 `node`，用 Python 自带的 `http.server` 在 8099 端口提供静态页面。

```
开发机(内网)
  npm run preview   -> 编译 + 生成 .preview/mp-preview.png
  npm run preview:push -> scp 推送
        ↓
生产机 114.132.51.227:8099  (/home/lighthouse/preview-qr/)
  python3 -m http.server 8099
        ↓
http://haoyu-wang141.top:8099/  （其他设备打开，手机微信扫码）
```

## 前置条件

1. 上传密钥位于 `.keys/private.key`（`chmod 600`，已被 `.gitignore` 忽略，不会入库）；缺失时可设环境变量 `MP_PRIVATE_KEY` 指定路径。
2. `miniprogram` 目录已安装 `miniprogram-ci`。
3. 生产服务器 8099 静态服务运行中，且防火墙放行 8099 入站。
4. AppID `wxb021f21838eb4ced` 对应的上传密钥有效；服务器出口 IP 已在微信公众平台 CI 「IP 白名单」内。

## 操作步骤

```bash
cd miniprogram
npm run preview          # 1) 编译并生成真机预览码 -> .preview/mp-preview.png（约 25 分钟有效）
npm run preview:push     # 2) 推送到生产服务器
```

然后：

- 在**电脑或另一台手机**打开 `http://haoyu-wang141.top:8099/`
- 用**预览手机微信**「扫一扫」扫描页面上的二维码即可真机预览

二维码过期后，重复执行上面的两条命令即可刷新（页面会展示最新图片）。

## 生产静态服务（如需重启）

```bash
ssh lighthouse@114.132.51.227
cd /home/lighthouse/preview-qr
nohup python3 -m http.server 8099 --bind 0.0.0.0 > server.log 2>&1 &
```

校验：`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8099/`

注意：页面文件必须命名为 **`index.html`**（Python `http.server` 仅将其作为目录首页；否则会显示目录列表）。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| `-10008 invalid ip: <IP>` | 服务器出口 IP 未加入微信 CI IP 白名单。公众平台 → 开发 → 开发设置 → 小程序代码上传/预览 → IP 白名单，加入报错中的 IP（出口 IP 可能变化，用 `curl ifconfig.me` 核对）。 |
| `-80057 ... invalid file: scripts/miniprogram-preview.js ...` | `scripts/` 位于小程序工程内被一起打包。确保 `ci.Project` 的 `ignores` 含 `scripts/**/*`。 |
| `project.preview is not a function` | miniprogram-ci v2 API 用 `ci.preview({ project, ... })`，非实例方法。 |
| 网页显示目录列表 | 将生产目录的 HTML 文件改名为 `index.html`。 |
| 页面打不开 | 确认生产防火墙放行 8099、静态服务在运行、访问的是 `haoyu-wang141.top:8099`（而非开发机）。 |

## 安全说明

- 上传私钥 `.keys/private.key` 严禁提交/打印；`.gitignore` 已覆盖 `.keys/`、`*.key`、`.preview/`。
- `scripts/preview-push.js` 仅推送生成的二维码图片，不涉及密钥传输。
