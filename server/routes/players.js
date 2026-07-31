const express = require('express');

function createRouter(rooms) {
  const router = express.Router();

  router.get('/:openId/currentRoom', (req, res) => {
    const { openId } = req.params;
    let foundRoom = null;

    for (const [roomId, room] of rooms) {
      const player = room.players.find(p => p.openId === openId);
      if (player) {
        foundRoom = { roomId, gameStarted: room.gameStarted || false };
        break;
      }
    }

    res.json({ success: true, room: foundRoom });
  });

  return router;
}

module.exports = createRouter;
