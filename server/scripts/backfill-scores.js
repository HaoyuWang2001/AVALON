// 全量重算计分（在容器内运行）：node scripts/backfill-scores.js
const db = require('../config/db');
const ScoreModel = require('../models/ScoreModel');

(async () => {
  try {
    await db.initPool();
    const res = await ScoreModel.backfillAll();
    console.log('[backfill-scores] 完成:', JSON.stringify(res));
    await db.closePool();
    process.exit(0);
  } catch (err) {
    console.error('[backfill-scores] 失败:', err && err.message);
    process.exit(1);
  }
})();
