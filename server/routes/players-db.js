const express = require('express');
const db = require('../config/db');

function createRouter() {
  const router = express.Router();

  router.get('/:openId/currentRoom', async (req, res) => {
    try {
      const { openId } = req.params;
      const rows = await db.query(
        `SELECT u.current_room_id as room_id, r.game_started
         FROM users u
         LEFT JOIN rooms r ON u.current_room_id = r.id
         WHERE u.open_id = ?`,
        [openId]
      );

      if (rows.length > 0) {
        res.json({
          success: true,
          room: { roomId: rows[0].room_id, gameStarted: rows[0].game_started === 1 }
        });
      } else {
        res.json({ success: true, room: null });
      }
    } catch (error) {
      console.error('查询当前房间错误:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = createRouter;
