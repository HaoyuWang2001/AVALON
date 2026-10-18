/**
 * 一次性回填脚本：为存量 games 写入 board_type。
 *
 * 规则（与 utils/boardType.js 分类器一致，仅 expert 放宽）：
 *  - expert:     8人 且 红方含莫德雷德（旧专家局默认红方互知为「开」，属历史配置错误——
 *                回填按 expert 处理，并把快照 rules.evilKnowsEachOther 修正为 false）
 *  - noPercival: 分类器判定（历史上派西为强制角色，预期 0 条）
 *  - standard:   分类器判定（角色与该人数默认板一致）
 *  - custom:     其余
 *
 * 幂等：只更新 board_type='standard'（默认值）的行；重复执行无副作用。
 * 用法：docker exec avalon-server node scripts/backfill_board_type.js [--dry]
 */
const db = require('../config/db');
const { BOARD_TYPES, classifyBoard } = require('../utils/boardType');

async function main() {
  const dry = process.argv.includes('--dry');

  // playerCount 由 game_players 计数（games 无该列）
  const [games] = await db.query(
    `SELECT g.id, g.board_type, g.room_config_snapshot AS snapshot
     FROM games g
     WHERE g.board_type = ?`,
    [BOARD_TYPES.STANDARD]
  );
  console.log(`待处理对局：${games.length} 条`);

  const [countRows] = await db.query(
    `SELECT game_id, COUNT(*) AS pc FROM game_players GROUP BY game_id`
  );
  const pcMap = {};
  countRows.forEach(r => { pcMap[r.game_id] = r.pc; });

  let stats = { expert: 0, expertFixed: 0, noPercival: 0, standard: 0, custom: 0, skip: 0 };

  for (const g of games) {
    const pc = pcMap[g.id];
    if (!pc) { stats.skip++; continue; }

    let snapshot = null;
    try { snapshot = typeof g.snapshot === 'string' ? JSON.parse(g.snapshot) : g.snapshot; } catch (e) { snapshot = null; }

    // 8人且红方含莫德雷德 → expert（历史放宽口径），并修正快照红方互知
    const evil = (snapshot && snapshot.roles && snapshot.roles.evil) || [];
    if (pc === 8 && evil.includes('mordred')) {
      if (dry) { console.log(`[expert] ${g.id}`); }
      else {
        await db.query('UPDATE games SET board_type = ? WHERE id = ?', [BOARD_TYPES.EXPERT, g.id]);
        if (snapshot && snapshot.rules && snapshot.rules.evilKnowsEachOther === true) {
          const fixed = JSON.parse(JSON.stringify(snapshot));
          fixed.rules.evilKnowsEachOther = false;
          await db.query('UPDATE games SET room_config_snapshot = ? WHERE id = ?', [JSON.stringify(fixed), g.id]);
          stats.expertFixed++;
        }
      }
      stats.expert++;
      continue;
    }

    const boardType = snapshot
      ? classifyBoard(snapshot.roles || {}, (snapshot && snapshot.rules) || {}, pc)
      : BOARD_TYPES.STANDARD;
    if (boardType !== BOARD_TYPES.STANDARD) {
      if (dry) { console.log(`[${boardType}] ${g.id}`); }
      else {
        await db.query('UPDATE games SET board_type = ? WHERE id = ?', [boardType, g.id]);
      }
    }
    stats[boardType] = (stats[boardType] || 0) + 1;
  }

  console.log('回填结果：', stats, dry ? '（dry-run，未写入）' : '');
  process.exit(0);
}

main().catch(err => {
  console.error('回填失败：', err.message);
  process.exit(1);
});
