---
name: backend-deploy-test
description: Run the AVALON backend Jest test suite on the server and deploy the backend via Docker Compose
---

## When to use

Use this skill whenever the server-side code (`server/`, `mysql/DDL.sql`, `scripts/test-backend.sh`,
`scripts/deploy-backend.sh`) has changed and needs to be verified and/or deployed. Also use it to
establish a new test-run baseline or to debug a failing test run.

## Environment

- Server: `lighthouse@haoyu-wang141.top`
- Repo on server: `/home/lighthouse/AVALON/AVALON`
- Tests run **in the server itself** (host only needs `docker` + `docker compose`, no node).
- Test infra: `docker-compose.test.yml` (`test-backend` service) + `server/Dockerfile.test`
  (node:20-alpine + `npm ci`). Container connects to `avalon-mysql` on `avalon-net`, uses a
  dedicated test DB `avalon_db_test` (dropped/recreated every run by `globalSetup`).

## Workflow

### 1. Sync code to server (if changed)

```bash
scp -o ConnectTimeout=15 server/models/GameModel.js lighthouse@haoyu-wang141.top:/home/lighthouse/AVALON/AVALON/server/models/
# ... and any other changed files under server/__tests__, server/routes, scripts/, mysql/
```

Always `bash -n <file>` locally before scp. After scp, run `bash -n` on the server to verify.

### 2. Run tests (frontground, real-time logging) — REQUIRED way

```bash
ssh lighthouse@haoyu-wang141.top "cd /home/lighthouse/AVALON/AVALON && bash scripts/test-backend.sh all"
```

- **Always run frontground** (`no `-b``) so jest output streams in real time — do NOT background +
  `sleep`+poll. Set the bash tool timeout to `600000` ms (force build ~1-60s + full suite ~313s).
- **Force builds latest code every run** (there is no separate `build` subcommand anymore).
- `test-backend.sh all` = all suites. Run a subset with e.g. `bash scripts/test-backend.sh 04d 04`.

Options: `-b` background + 60s progress (uses baseline for ETA), `-t <pattern>` test-name filter,
`--timeout <ms>` jest testTimeout, `-d` dry-run (prints build + jest commands only).

### Test suites (394 total)

| Suite | File | ~Cases | ~Time |
|-------|------|--------|-------|
| 01_health | 01_health.test.js | 3 | <1s |
| 02_rooms | 02_rooms.test.js | 49 | 7s |
| 03_games_start | 03_games_start.test.js | 130 | 44s |
| 03b_lancelot_variant | 03b_lancelot_variant.test.js | 8 | 8s |
| 04_games_flow | 04_games_flow.test.js | 38 | 103s |
| 04a_games_flow_good | 04a_games_flow_good.test.js | 10 | 41s |
| 04b_games_flow_evil | 04b_games_flow_evil.test.js | 51 | 67s |
| 04c_lake_confirm | 04c_lake_confirm.test.js | 2 | 6s |
| 04d_teamvote_result | 04d_teamvote_result.test.js | 4 | 8s |
| 05_socket | 05_socket.test.js | 10 | <1s |
| 06_edge_cases | 06_edge_cases.test.js | 40 | 23s |
| 07_game_logic | 07_game_logic.test.js | 49 | <1s |

(Authoritative timing/counts live in `scripts/.test-baseline` — always check it, not this table.)

### 3. Interpret the output — IMPORTANT

- **Expected error stack spam is now silenced.** `server/__tests__/helpers/globalSetup.js` overrides
  `console.error = () => {}` when `NODE_ENV=test`, so the many intentional error-path tests
  (invalid role, occupied seat, good-player-cannot-fail, etc.) no longer flood stdout. You should
  only see jest `PASS`/`FAIL` lines, per-test `✓/✕ name (ms)`, and startup logs.
- **Green = all passed:** end of log shows `Test Suites: X passed` + `Tests: N passed` + `Time:`.
  Current baseline: **394 passed / 12 suites / ~313s**.
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
- Fast suites (`01_health`, `05_socket`, `07_game_logic`) may store `0` seconds (jest omits their
  timing); totals in the `all` row are authoritative.
- 06_rooms note: `04_games_flow` occasionally flakes with `Duplicate entry 'NNNNNN' for key
  'rooms.PRIMARY'` (6-digit room-id collision among ~1000 rooms in one run). Re-run the suite — it
  is not a code bug.

## Deployment (production)

```bash
cd /home/haoyu/AVALON && bash scripts/deploy-backend.sh
```

- tars `server/` → server repo, syncs `mysql/DDL.sql`, rebuilds `avalon-server`, verifies the
  container's `GameModel.js` md5 matches local. Options: `--skip-sync`, `--no-verify`, `-d` dry-run.
- **DB migrations are NOT auto-applied.** Run migration SQL manually on the server:
  ```bash
  ssh lighthouse@haoyu-wang141.top "docker exec -i avalon-mysql mysql -uavalon_user -pavalon_pass_2024 avalon_db < /home/lighthouse/AVALON/AVALON/mysql/<migration>.sql"
  ```
  Existing migrations: `migration_teamvote_reveal.sql`, `migration_lake_confirm.sql`,
  `migration_identity_marks.sql`.
- After deploy, check `docker logs avalon-server --tail 20` for "🚀 AVALON 游戏服务器启动成功".

## Troubleshooting

- **Lock exists** (`scripts/.test-backend.lock`): a test run is active (or crashed with lock
  leftover). Check `pgrep -af jest`, wait or delete the lock.
- **Residual test container:** `docker ps -a | grep test-backend-run` → `docker stop` it (contains
  the jest process).
- **Build always takes ~0s when no server code changed** (`COPY . .` layer cached) — expected; it
  still copies the freshest `server/` context.
- Frontend changes (`miniprogram/`) do NOT need this skill — use the `miniprogram-preview` skill.
