---
name: backend-deploy-test
description: Targeted backend test verification (changed suites only) before push; full suite + production deploy are handled automatically by GitHub Actions backend.yml on push to main
---

## When to use

Use this skill whenever the server-side code (`server/`, `mysql/DDL.sql`, `scripts/test-backend.sh`,
`scripts/deploy-backend.sh`) has changed. Workflow division of labor:

- **Manual (you)**: sync changed files to the server and run **targeted tests** — only the suites
  affected by your change — for quick pre-push verification.
- **Automated (GitHub Actions `backend.yml`)**: after you push to `main`, the full suite
  (`test-backend.sh all`) runs on the server's self-hosted runner, then the backend is deployed
  automatically. **Do NOT manually run `all` or manually deploy** in the normal flow.

Also use this skill to establish a new test-run baseline or to debug a failing CI/manual test run.

## Environment

- Server: `lighthouse@haoyu-wang141.top`
- Repo on server: `/home/lighthouse/AVALON/AVALON`
- Tests run **in the server itself** (host only needs `docker` + `docker compose`, no node).
- Test infra: `docker-compose.test.yml` (`test-backend` service) + `server/Dockerfile.test`
  (node:20-alpine + `npm ci`). Container connects to `avalon-mysql` on `avalon-net`, uses a
  dedicated test DB `avalon_db_test` (dropped/recreated every run by `globalSetup`).

## GitHub Actions flow (backend.yml)

- **Trigger**: push to `main` touching `server/**`, `mysql/**`, `docker-compose.yml`,
  `scripts/test-backend.sh`, `scripts/deploy-backend.sh`.
- **job `test`**: sync repo (`git fetch`×5 retry + `git reset --hard origin/main`) → `bash scripts/test-backend.sh all`.
- **job `deploy`** (needs test): `docker compose up -d --build avalon-server`.
- **Migrations are NOT applied by CI** — apply them manually BEFORE pushing code that depends on
  the new schema (see Deployment).
- Monitor with `gh run list --workflow backend.yml -L 3` or the repo's Actions tab.

## Workflow

### 1. Sync code to server (if changed)

```bash
scp -o ConnectTimeout=15 server/models/GameModel.js lighthouse@haoyu-wang141.top:/home/lighthouse/AVALON/AVALON/server/models/
# ... and any other changed files under server/__tests__, server/routes, scripts/, mysql/
```

Always `node --check <file>` locally before scp (JS) / `bash -n <file>` (shell). After scp, run
`node --check` on the server to verify.

### 2. Run TARGETED tests (frontground, real-time logging) — manual verification is suite-scoped

```bash
ssh lighthouse@haoyu-wang141.top "cd /home/lighthouse/AVALON/AVALON && bash scripts/test-backend.sh 09 08"
```

- **Only pass the suites affected by your change** — this is the whole point of the manual step
  (full `all` runs are GitHub Actions' job, not yours).
  Typical mapping: friends/history → `08 09`; RoomModel/create/join → `02 06`; game start/vision →
  `03 03b`; game flow → `04 04a 04b`; socket → `05`; avatar upload → `02b`; misc logic → `07`.
- **Always run frontground** (`no `-b``) so jest output streams in real time — do NOT background +
  `sleep`+poll. Set the bash tool timeout to `600000` ms (force build ~1-60s + targeted suites).
- **Force builds latest code every run** (there is no separate `build` subcommand anymore).
- Options: `-b` background + 60s progress, `-t <pattern>` test-name filter,
  `--timeout <ms>` jest testTimeout, `-d` dry-run (prints build + jest commands only).

### Test suites (16 total, ~434 cases — authoritative counts live in `scripts/.test-baseline`)

| Suite | File | ~Cases | ~Time |
|-------|------|--------|-------|
| 01_health | 01_health.test.js | 3 | <1s |
| 02_rooms | 02_rooms.test.js | 49 | 7s |
| 02b_avatar_upload | 02b_avatar_upload.test.js | 6 | <1s |
| 03_games_start | 03_games_start.test.js | 130 | 44s |
| 03b_lancelot_variant | 03b_lancelot_variant.test.js | 8 | 8s |
| 04_games_flow | 04_games_flow.test.js | 38 | 103s |
| 04a_games_flow_good | 04a_games_flow_good.test.js | 10 | 41s |
| 04b_games_flow_evil | 04b_games_flow_evil.test.js | 51 | 67s |
| 04c_lake_confirm | 04c_lake_confirm.test.js | 2 | 6s |
| 04d_teamvote_result | 04d_teamvote_result.test.js | 4 | 8s |
| 04e_identity_mark | 04e_identity_mark.test.js | 6 | 7s |
| 04f_crown | 04f_crown.test.js | 5 | 10s |
| 05_socket | 05_socket.test.js | 10 | <1s |
| 06_edge_cases | 06_edge_cases.test.js | 40 | 23s |
| 07_game_logic | 07_game_logic.test.js | 49 | <1s |
| 08_friends | 08_friends.test.js | 17 | ~3s |
| 09_user_history | 09_user_history.test.js | 2 | ~2s |

(Authoritative timing/counts live in `scripts/.test-baseline` on the server — always check it, not this table.)

### 3. Interpret the output — IMPORTANT

- **Expected error stack spam is now silenced.** `server/__tests__/helpers/globalSetup.js` overrides
  `console.error = () => {}` when `NODE_ENV=test`, so the many intentional error-path tests
  (invalid role, occupied seat, good-player-cannot-fail, etc.) no longer flood stdout. You should
  only see jest `PASS`/`FAIL` lines, per-test `✓/✕ name (ms)`, and startup logs.
- **Green = targeted suites passed:** end of log shows `Test Suites: X passed` + `Tests: N passed`.
- A failing assertion shows the API response/message inline (jest's diff), so failures remain
  debuggable even with server errors silenced.

### 4. Baseline file (`scripts/.test-baseline`) — progress estimation

Written after every successful run (frontground or `-b`). TSV, one record per line:

```
build_seconds   <seconds to build test image>
all     total   <total tests>   <total seconds>
suite   <name>  <cases>         <seconds>
```

- `-b` mode sums the matched `suite` rows to estimate remaining tests / ETA, plus `build_seconds`.
- Fast suites (`01_health`, `05_socket`, `07_game_logic`) may store `0` seconds; totals in the
  `all` row are authoritative.
- 04_games_flow occasionally flakes with `Duplicate entry 'NNNNNN' for key 'rooms.PRIMARY'`
  (6-digit room-id collision among ~1000 rooms in one run). Re-run the suite — it is not a code bug.

### 5. Commit + push → CI takes over

1. After targeted tests pass, commit and push to `main`.
2. GitHub Actions `backend.yml` runs the **full** suite (`test-backend.sh all`) then auto-deploys.
3. Monitor: `gh run list --workflow backend.yml -L 3`; on failure, fetch logs with
   `gh run view <run-id> --log-failed` and debug (or re-run the suite manually on the server).
4. **Concurrency guard**: CI runs `all` right after your push — do NOT start a manual server test at
   that moment (`.test-backend.lock` conflict). Targeted manual tests are for **before** push only.

## Deployment (production)

**Primary (normal path)**: GitHub Actions `backend.yml` deploy job — push to `main` builds and
deploys automatically (`docker compose up -d --build avalon-server`). No manual action needed.

**Manual fallback (emergency / CI down)**:

```bash
cd /home/haoyu/AVALON && bash scripts/deploy-backend.sh
```

- tars `server/` → server repo, syncs `mysql/DDL.sql`, rebuilds `avalon-server`, verifies the
  container's `GameModel.js` md5 matches local. Options: `--skip-sync`, `--no-verify`, `-d` dry-run.
- Only use this when CI is broken or you need to bypass the full test gate for an emergency hotfix.

**DB migrations are NOT auto-applied (by either CI or deploy-backend.sh).** Apply migration SQL
manually on the server — and do it **BEFORE pushing code that depends on the new schema**, so the
CI-deployed container never runs against a missing column/table:

```bash
ssh lighthouse@haoyu-wang141.top "docker exec -i avalon-mysql mysql -uavalon_user -pavalon_pass_2024 avalon_db < /home/lighthouse/AVALON/AVALON/mysql/<migration>.sql"
```

Existing migrations: `migration_teamvote_reveal.sql`, `migration_lake_confirm.sql`,
`migration_identity_marks.sql`, `migration_friends.sql`.

After deploy, check `docker logs avalon-server --tail 20` for "🚀 AVALON 游戏服务器启动成功".

## Troubleshooting

- **Lock exists** (`scripts/.test-backend.lock`): a test run is active (or crashed with lock
  leftover). Check `pgrep -af jest`, wait or delete the lock.
- **CI `all` vs manual test concurrency**: if CI is running the full suite on the server, a manual
  targeted run will block on the lock. Wait for CI to finish, or run targeted tests only before push.
- **Residual test container:** `docker ps -a | grep test-backend-run` → `docker stop` it (contains
  the jest process).
- **Build always takes ~0s when no server code changed** (`COPY . .` layer cached) — expected; it
  still copies the freshest `server/` context.
- Frontend changes (`miniprogram/`) do NOT need this skill — use the `miniprogram-preview` skill.
