const express = require('express');
const db = require('../config/db');

function createRouter() {
  const router = express.Router();

  router.get('/:openId/currentRoom', async (req, res) => {
    try {
      const { openId } = req.params;
      const rows = await db.query(
        `SELECT p.room_id, r.game_started
         FROM players p
         JOIN rooms r ON r.id = p.room_id
         WHERE p.open_id = ?
         LIMIT 1`,
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
