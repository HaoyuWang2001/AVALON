---
name: backend-deploy-test
description: Deploy the AVALON backend via Docker Compose and run the Jest test suite
---

## When to use

Use this skill whenever the server-side code has changed and needs to be deployed and verified. This
includes changes under `server/`, `docker-compose.yml`, `mysql/DDL.sql`, or `.env.example`.

## Deployment (Docker Compose)

The server runs in two containers on `haoyu-wang141.top`:

| Container | Image | Port |
|-----------|-------|------|
| `avalon-mysql` | mysql:8.0 | 3307:3306 |
| `avalon-server` | avalon-server:prod (built from `./server/Dockerfile`) | 8082:8082 |

### Standard deploy

```bash
cd /home/lighthouse/AVALON
git pull

# If MySQL data dir needs migration from old named-volume setup (first time only):
mkdir -p data/mysql
docker compose stop avalon-mysql
docker cp mysql-avalon:/var/lib/mysql/. ./data/mysql/
docker rm mysql-avalon

# Rebuild server image and restart both services
docker compose up -d --build
```

### First-run: create `users` table

The `DDL.sql` init script runs only on a fresh MySQL data directory. If the database already
exists, create the `users` table manually:

```bash
docker exec -i avalon-mysql mysql -u avalon_user -pavalon_pass_2024 avalon_db <<'SQL'
CREATE TABLE IF NOT EXISTS users (
  open_id VARCHAR(64) NOT NULL,
  wx_nick_name VARCHAR(100) DEFAULT '',
  custom_nick_name VARCHAR(50) DEFAULT '',
  avatar_url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
```

### Verify deployment

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"  # both should be Up / healthy
docker logs avalon-server --tail 30                  # should show "HTTPS 模式已启用" + "数据库连接正常"
```

## Running the test suite

### Prerequisites

Tests run in **memory mode** by default — no MySQL or Docker needed locally. The server
auto-detects that MySQL is unavailable and falls back to in-memory `Map` storage.

Ensure dependencies are installed:

```bash
cd server
npm install  # includes jest, supertest in devDependencies
```

### Run tests

```bash
npm test
# or: npx jest --forceExit --detectOpenHandles
# verbose: npm run test:verbose
```

### Tests against a remote deployed server

```bash
npm run test:remote -- TEST_SERVER_URL=https://haoyu-wang141.top:8082
```

### Test suite structure

```
server/__tests__/
├── 01_health.test.js        # GET /hello, GET /api/health
├── 02_rooms.test.js         # Room CRUD: create, join, leave, kick, seat, ready
├── 03_games.test.js         # Game lifecycle: start, state, end, restart
├── 04_messages.test.js      # Chat: send, list, latest, validation
├── 05_edge_cases.test.js    # Full rooms, duplicate joins, bad starts, rapid cycles
├── 06_game_logic.test.js    # Pure unit tests: GameModel static helpers (no server)
└── helpers/
    ├── testHelper.js        # Centralized API wrappers (createRoom, joinRoom, etc.)
    ├── globalSetup.js       # Boots Express server once before all tests
    ├── globalTeardown.js    # Stops server after all tests
    ├── setupRequest.js      # Configures supertest agent
    └── setupRemote.js       # Remote server config
```

### Known coverage gaps

| Area | Status |
|------|--------|
| Room management (CRUD) | Covered |
| Messaging (send/list) | Covered |
| Edge cases & validation | Covered |
| Game logic static helpers | Covered (unit tests) |
| Game nomination/voting flow | **Not covered** — blocked by roleReveal phase; no API to auto-advance |
| Game mission execution | **Not covered** |
| Assassin shot / win condition | **Not covered** |
| Socket.io realtime events | **Not covered** — `socket.io-client` declared but unused |
| `/api/users/*` endpoints | **Not covered** — no tests exist yet |
| CI/CD pipeline | **None** — tests run manually via `npm test` |

### Interpreting results

- `npm test` prints a coverage summary. Current baseline: ~25% statements (only touched files
  are reported; untested source files are omitted from the report because `collectCoverageFrom`
  is not configured).
- All 78 tests should pass. Any failures typically indicate a regression in route handlers,
  validation, or the `GameModel` static helpers.
- If a test fails, re-run with `--verbose` to see which assertion failed.
