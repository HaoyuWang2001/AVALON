const express = require('express');
const { v4: uuidv4 } = require('uuid');

function createRouter(messages) {
  const router = express.Router();
  
  router.post('/send', (req, res) => {
    const { roomId, openId, nickName, content, type = 'text' } = req.body;
    
    const message = {
      _id: uuidv4(),
      roomId,
      openId,
      nickName,
      content,
      type,
      createdAt: new Date()
    };
    
    if (!messages.has(roomId)) {
      messages.set(roomId, []);
    }
    
    const roomMessages = messages.get(roomId);
    roomMessages.push(message);
    
    if (roomMessages.length > 200) {
      roomMessages.shift();
    }
    
    res.json({ success: true, message });
  });

  router.get('/:roomId', (req, res) => {
    const { roomId } = req.params;
    const { limit = 50, beforeTime } = req.query;
    
    let roomMessages = messages.get(roomId) || [];
    
    if (beforeTime) {
      roomMessages = roomMessages.filter(m => 
        new Date(m.createdAt).getTime() < new Date(beforeTime).getTime()
      );
    }
    
    roomMessages = roomMessages.slice(-parseInt(limit));
    
    res.json({ success: true, messages: roomMessages });
  });

  return router;
}

module.exports = createRouter;
