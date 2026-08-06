---
name: miniprogram-preview
description: Repackage the AVALON WeChat mini-program and generate a real-device preview QR (真机预览) via miniprogram-ci, then publish it to the production server so it can be scanned from a phone. Use when the frontend (miniprogram/) code has changed and the user wants to preview it on a real device, or says "预览", "真机预览", "重新打包", "小程序预览".
---

# Mini-program Real-Device Preview

## When to use

Use whenever the mini-program frontend (everything under `miniprogram/`) has changed and the user wants a
**real-device WeChat preview** (真机预览): repackage → generate preview QR → make it scannable from a phone.
Formal release (上传体验版/正式版) is done manually by the user and is out of scope.

## Architecture (important)

- The **dev box** where this repo lives is behind NAT (public egress differs from the domain IP) — the QR
  static server **must** run on the **production server** (`114.132.51.227`, which `haoyu-wang141.top`
  resolves to). Serving it from the dev box is NOT externally reachable.
- Production has no `node`; it serves the QR via `python3 -m http.server 8099`.

## Prerequisites

- Upload key present at `.keys/private.key` (chmod 600, gitignored). Missing → set `MP_PRIVATE_KEY` env.
- `miniprogram-ci` installed in `miniprogram/` (devDependency).
- Production static server running on port 8099 and firewall allows inbound 8099.
- Miniprogram AppID `wxb021f21838eb4ced` and its upload key must match the WeChat MP account; the server's
  outbound IP must be in the MP "IP 白名单" for CI (see Troubleshooting).

## Workflow

Run from the repo root / `miniprogram`:

```bash
cd miniprogram
npm run preview         # 1) compile + generate preview QR -> .preview/mp-preview.png (~25 min valid)
npm run preview:push    # 2) scp the QR to production (lighthouse@114.132.51.227:/home/lighthouse/preview-qr/)
```

Then the user opens `http://haoyu-wang141.top:8099/` on any other device and scans the QR with the phone's
WeChat (「扫一扫」). The mini-program will connect to the backend at `https://haoyu-wang141.top:8082`.

Repeat `npm run preview && npm run preview:push` any time to refresh the QR.

## Production static server

Run in `/home/lighthouse/preview-qr/` (contains `index.html` + `mp-preview.png`):

```bash
cd /home/lighthouse/preview-qr
nohup python3 -m http.server 8099 --bind 0.0.0.0 > server.log 2>&1 &
```

Verify it is up:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8099/
```

Note: `index.html` must be named exactly `index.html` (Python's server only auto-serves that as the
directory index; otherwise users see a directory listing).

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `-10008 invalid ip: <IP>` | Server outbound IP not in WeChat MP CI IP 白名单. In 微信公众平台 → 开发 → 开发设置 → 小程序代码上传/预览 → IP 白名单, add the IP WeChat reports (it can change; re-check `curl ifconfig.me`). |
| `-80057 ... invalid file: scripts/miniprogram-preview.js ... #!/usr/bin/env node` | The `scripts/` dir is inside the miniprogram project and gets bundled. Keep `scripts/**/*` in the `ignores` list of `ci.Project`. |
| `project.preview is not a function` | miniprogram-ci v2 API: use `ci.preview({ project, ... })`, not the instance method. |
| Browser shows directory listing | Rename the HTML file to `index.html` in the production serving dir. |
| Phone can't open / page unreachable | Confirm 8099 is open in the production firewall, the static server is running, and you are opening `http://haoyu-wang141.top:8099/` (not the dev box). |

## Security

- The upload private key (`.keys/private.key`) must never be committed or logged; `.gitignore` covers
  `.keys/`, `*.key`, and `.preview/`.
- `scripts/preview-push.js` only copies the generated PNG — it never transmits the key.
