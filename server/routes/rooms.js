const express = require('express');
const { v4: uuidv4 } = require('uuid');

function createRouter(rooms) {
  const router = express.Router();
  
  function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

router.post('/create', (req, res) => {
  const { hostOpenId, hostNickName, hostAvatarUrl } = req.body;
  const roomId = generateRoomId();
  
  const room = {
    _id: roomId,
    hostOpenId,
    players: [{
      openId: hostOpenId,
      nickName: hostNickName || '房主',
      avatarUrl: hostAvatarUrl || '',
      seatNumber: 1,
      isHost: true
    }],
    readyPlayers: [],
    gameStarted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  rooms.set(roomId, room);
  
  res.json({
    success: true,
    roomId,
    room
  });
});

router.get('/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  res.json({ success: true, room });
});

router.post('/join', (req, res) => {
  const { roomId, userInfo, seatNumber, customNickName } = req.body;
  const openId = userInfo.openId;
  
  if (!seatNumber || seatNumber < 1 || seatNumber > 12) {
    return res.status(400).json({ success: false, message: '座位号无效' });
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  if (room.gameStarted) {
    return res.status(400).json({ success: false, message: '游戏已开始' });
  }
  
  if (room.players.length >= 12) {
    return res.status(400).json({ success: false, message: '房间已满' });
  }
  
  const occupiedSeats = room.players.map(p => p.seatNumber);
  if (occupiedSeats.includes(seatNumber)) {
    return res.status(400).json({ success: false, message: `${seatNumber}号座位已被占用` });
  }
  
  const alreadyJoined = room.players.some(p => p.openId === openId);
  if (alreadyJoined) {
    return res.json({ success: true, message: '已在房间中' });
  }
  
  const nickName = customNickName || userInfo.nickName || '匿名玩家';
  
  room.players.push({
    openId,
    nickName,
    avatarUrl: userInfo.avatarUrl || '',
    seatNumber,
    isHost: false
  });
  
  room.updatedAt = new Date();
  rooms.set(roomId, room);
  
  res.json({
    success: true,
    message: '加入房间成功',
    seatNumber,
    room
  });
});

router.post('/leave', (req, res) => {
  const { roomId, openId } = req.body;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  const playerIndex = room.players.findIndex(p => p.openId === openId);
  if (playerIndex === -1) {
    return res.json({ success: true, message: '玩家不在房间中' });
  }
  
  room.players.splice(playerIndex, 1);
  room.readyPlayers = room.readyPlayers.filter(id => id !== openId);
  
  if (room.players.length === 0) {
    rooms.delete(roomId);
  } else if (room.hostOpenId === openId && room.players.length > 0) {
    room.players[0].isHost = true;
    room.hostOpenId = room.players[0].openId;
  }
  
  room.updatedAt = new Date();
  rooms.set(roomId, room);
  
  res.json({ success: true, room });
});

router.post('/toggleReady', (req, res) => {
  const { roomId, openId, isReady } = req.body;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  if (isReady) {
    if (!room.readyPlayers.includes(openId)) {
      room.readyPlayers.push(openId);
    }
  } else {
    room.readyPlayers = room.readyPlayers.filter(id => id !== openId);
  }
  
  room.updatedAt = new Date();
  rooms.set(roomId, room);
  
  res.json({ success: true, room });
});

router.post('/updateSeatNumber', (req, res) => {
  const { roomId, openId, newSeatNumber } = req.body;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  if (newSeatNumber < 1 || newSeatNumber > 12) {
    return res.status(400).json({ success: false, message: '座位号无效' });
  }
  
  const occupiedSeats = room.players
    .filter(p => p.openId !== openId)
    .map(p => p.seatNumber);
  
  if (occupiedSeats.includes(newSeatNumber)) {
    return res.status(400).json({ success: false, message: '座位已被占用' });
  }
  
  const player = room.players.find(p => p.openId === openId);
  if (player) {
    player.seatNumber = newSeatNumber;
    room.updatedAt = new Date();
    rooms.set(roomId, room);
  }
  
  res.json({ success: true, room });
});

router.post('/kickPlayer', (req, res) => {
  const { roomId, playerId } = req.body;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  const playerIndex = room.players.findIndex(p => p.openId === playerId);
  if (playerIndex !== -1) {
    room.players.splice(playerIndex, 1);
    room.readyPlayers = room.readyPlayers.filter(id => id !== playerId);
    room.updatedAt = new Date();
    rooms.set(roomId, room);
  }
  
  res.json({ success: true, room });
});

module.exports = router;
}
