#!/bin/bash
echo "=== Test db.query with LIMIT inside container ==="
docker exec avalon-server node -e "
const db = require('./config/db');
(async () => {
  try {
    await db.initPool();
    console.log('Pool ready');
    
    // Test like getByRoom
    const messages = await db.query(
      'SELECT id, content FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?',
      ['123456', 50]
    );
    console.log('Messages query OK, rows:', messages.length);
    
    // Test like getActiveRooms
    const rooms = await db.query(
      'SELECT r.id, COUNT(p.id) as cnt FROM rooms r LEFT JOIN players p ON r.id = p.room_id WHERE r.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) GROUP BY r.id LIMIT ?',
      [50]
    );
    console.log('Rooms query OK, rows:', rooms.length);
    
    console.log('ALL OK');
  } catch(e) {
    console.log('ERROR:', e.message);
    console.log('Code:', e.code);
  }
  process.exit(0);
})().catch(e => { console.log(e); process.exit(1); });
" 2>&1
