#!/bin/bash
echo "=== Test without LIMIT ==="
docker exec avalon-server node -e "
const db = require('./config/db');
(async () => {
  try {
    await db.initPool();
    
    // Test without LIMIT placeholders
    const messages = await db.query(
      'SELECT id, content FROM messages WHERE room_id = ? ORDER BY created_at DESC',
      ['123456']
    );
    console.log('Without LIMIT OK, rows:', messages.length);
    
    // Test with LIMIT as integer
    const messages2 = await db.query(
      'SELECT id, content FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 50',
      ['123456']
    );
    console.log('Hardcoded LIMIT OK, rows:', messages2.length);
    
    console.log('ALL OK');
  } catch(e) {
    console.log('ERROR:', e.message);
  }
  process.exit(0);
})().catch(e => { console.log(e); process.exit(1); });
" 2>&1
