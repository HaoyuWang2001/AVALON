/**
 * 开发者手工维护玩家特殊头衔（users.titles）。
 *
 * 用法（容器内运行）：
 *   docker exec -i avalon-server node scripts/set-user-titles.js --dry-run --file - < titles.json
 *   docker exec -i avalon-server node scripts/set-user-titles.js --file - < titles.json
 *   docker exec -i avalon-server node scripts/set-user-titles.js --replace --file /tmp/titles.json
 *   docker exec -i avalon-server node scripts/set-user-titles.js --clear --file /tmp/titles.json
 *
 * titles.json：
 *   [{ "target": "rjdimo", "titles": ["奥博专家"] }, ...]
 *   target 为 users.unique_id（精确匹配）。
 *
 * 默认追加（去重、保留原顺序）；--replace 覆盖；--clear 清空。
 * --dry-run / --dry 只读预览，不写库。
 * 玩家/头衔数据只从文件读取，不写入代码仓库。
 */
const fs = require('fs');
const db = require('../config/db');

const MAX_TITLES = 3;
const MAX_TITLE_LEN = 8;

function usage() {
  console.log(`用法:
  node scripts/set-user-titles.js --file <path|-> [--dry-run] [--replace|--clear]

参数:
  --file <path|->  JSON 数组文件；- 表示从 stdin 读取
  --dry-run, --dry 只读预览
  --replace        覆盖该玩家的头衔
  --clear          清空该玩家的头衔（忽略 titles 字段）`);
}

function parseArgs(argv) {
  const opts = { file: null, dry: false, replace: false, clear: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') {
      opts.file = argv[++i];
      if (!opts.file) throw new Error('--file 缺少路径');
    } else if (arg === '--dry-run' || arg === '--dry') {
      opts.dry = true;
    } else if (arg === '--replace') {
      opts.replace = true;
    } else if (arg === '--clear') {
      opts.clear = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  if (!opts.file) throw new Error('缺少 --file <path|->');
  if (opts.replace && opts.clear) throw new Error('--replace 与 --clear 不能同时使用');
  return opts;
}

// users.titles（JSON 列）→ 字符串数组；兼容 mysql2 返回数组/字符串/Buffer
function parseTitles(v) {
  if (v === null || v === undefined) return [];
  if (Buffer.isBuffer(v)) v = v.toString('utf8');
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  if (!Array.isArray(v)) return [];
  return v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
}

function normalizeTitles(input) {
  if (!Array.isArray(input)) throw new Error('titles 必须是字符串数组');
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    if (typeof raw !== 'string') throw new Error('titles 只能包含字符串');
    const title = raw.trim();
    if (!title) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

function loadBatch(file) {
  const text = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`JSON 解析失败: ${e.message}`); }
  if (!Array.isArray(data) || data.length === 0) throw new Error('JSON 必须是非空数组');
  return data.map((item, i) => {
    const target = item && typeof item.target === 'string' ? item.target.trim() : '';
    if (!target) throw new Error(`第 ${i + 1} 项缺少 target`);
    const titles = item.titles === undefined ? [] : normalizeTitles(item.titles);
    return { target, titles };
  });
}

function validateWarnings(target, titles) {
  if (titles.length > MAX_TITLES) {
    console.log(`  ⚠ ${target}: 头衔数量 ${titles.length} 超过建议上限 ${MAX_TITLES}`);
  }
  titles.forEach(t => {
    if (t.length > MAX_TITLE_LEN) {
      console.log(`  ⚠ ${target}: 头衔「${t}」长度 ${t.length} 超过建议上限 ${MAX_TITLE_LEN}`);
    }
  });
}

function describe(row) {
  const name = row.custom_nick_name || row.wx_nick_name || '(无昵称)';
  return `${row.unique_id}（${name}）`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const batch = loadBatch(opts.file);

  const seenTargets = new Set();
  for (const item of batch) {
    if (seenTargets.has(item.target)) throw new Error(`target 重复: ${item.target}`);
    seenTargets.add(item.target);
    if (!opts.clear && item.titles.length === 0) {
      throw new Error(`${item.target}: 未提供头衔（清空请使用 --clear）`);
    }
  }

  await db.initPool();
  try {
    if (opts.dry) {
      const targets = batch.map(b => b.target);
      const rows = await db.query(
        `SELECT unique_id, custom_nick_name, wx_nick_name, titles
         FROM users WHERE unique_id IN (${targets.map(() => '?').join(',')})`,
        targets
      );
      const byId = new Map(rows.map(r => [r.unique_id, r]));
      const missing = targets.filter(t => !byId.has(t));
      if (missing.length) throw new Error(`未找到用户: ${missing.join(', ')}`);

      console.log('[dry-run] 预览（不写库）:');
      for (const item of batch) {
        const row = byId.get(item.target);
        const before = parseTitles(row.titles);
        let after;
        if (opts.clear) after = [];
        else if (opts.replace) after = item.titles;
        else after = Array.from(new Set([...before, ...item.titles]));
        console.log(`- ${describe(row)}: [${before.join(', ')}] → [${after.join(', ')}]`);
        validateWarnings(item.target, after);
      }
      console.log(`[dry-run] 共 ${batch.length} 人，未做任何修改`);
      return;
    }

    const result = await db.transaction(async (conn) => {
      const targets = batch.map(b => b.target);
      const [rows] = await conn.execute(
        `SELECT unique_id, custom_nick_name, wx_nick_name, titles
         FROM users WHERE unique_id IN (${targets.map(() => '?').join(',')}) FOR UPDATE`,
        targets
      );
      const byId = new Map(rows.map(r => [r.unique_id, r]));
      const missing = targets.filter(t => !byId.has(t));
      if (missing.length) throw new Error(`未找到用户: ${missing.join(', ')}`);

      const changes = [];
      for (const item of batch) {
        const row = byId.get(item.target);
        const before = parseTitles(row.titles);
        let after;
        if (opts.clear) after = [];
        else if (opts.replace) after = item.titles;
        else after = Array.from(new Set([...before, ...item.titles]));

        await conn.execute(
          'UPDATE users SET titles = ? WHERE unique_id = ?',
          [after.length ? JSON.stringify(after) : null, item.target]
        );
        changes.push({ row, before, after });
      }
      return changes;
    });

    console.log('[set-user-titles] 已提交:');
    for (const c of result) {
      console.log(`- ${describe(c.row)}: [${c.before.join(', ')}] → [${c.after.join(', ')}]`);
      validateWarnings(c.row.unique_id, c.after);
    }
    console.log(`[set-user-titles] 共更新 ${result.length} 人`);
  } finally {
    await db.closePool();
  }
}

main().catch(err => {
  console.error('[set-user-titles] 失败:', err && err.message ? err.message : err);
  process.exit(1);
});
