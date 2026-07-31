const express = require('express');
const { v4: uuidv4 } = require('uuid');

function createRouter(rooms) {
  const router = express.Router();
  
  function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

router.post('/create', (req, res) => {
  const { hostOpenId, hostNickName, hostAvatarUrl, hostWxNickName, roomConfig } = req.body;

  if (!hostOpenId) {
    return res.status(400).json({ success: false, message: '缺少房主信息' });
  }
  if (!roomConfig) {
    return res.status(400).json({ success: false, message: '缺少房间配置' });
  }
  if (!roomConfig.roles || !Array.isArray(roomConfig.roles.good) || !Array.isArray(roomConfig.roles.evil)) {
    return res.status(400).json({ success: false, message: '缺少角色配置' });
  }
  if (!roomConfig.rules || typeof roomConfig.rules !== 'object') {
    return res.status(400).json({ success: false, message: '缺少规则配置' });
  }

  const roomId = generateRoomId();
  
  const room = {
    _id: roomId,
    hostOpenId,
    players: [{
      openId: hostOpenId,
      nickName: hostNickName || '房主',
      wxNickName: hostWxNickName || '',
      avatarUrl: hostAvatarUrl || '',
      seatNumber: 1,
      isHost: true
    }],
    readyPlayers: [],
    gameStarted: false,
    roomConfig,
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
  const seat = (seatNumber == null) ? 0 : seatNumber;
  
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  if (room.gameStarted) {
    return res.status(400).json({ success: false, message: '游戏已开始' });
  }
  
  if (seat >= 1) {
    const occupiedSeats = room.players.map(p => p.seatNumber);
    if (occupiedSeats.includes(seat)) {
      return res.status(400).json({ success: false, message: `${seat}号座位已被占用` });
    }
  }
  
  const alreadyJoined = room.players.some(p => p.openId === openId);
  if (alreadyJoined) {
    return res.json({ success: true, message: '已在房间中' });
  }
  
  const nickName = customNickName || userInfo.nickName || '匿名玩家';
  
  room.players.push({
    openId,
    nickName,
    wxNickName: userInfo.wxNickName || '',
    avatarUrl: userInfo.avatarUrl || '',
    seatNumber: seat,
    isHost: false,
    isReady: false
  });
  
  room.updatedAt = new Date();
  rooms.set(roomId, room);
  
  res.json({
    success: true,
    message: '加入房间成功',
    seatNumber: seat,
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
  
  if (newSeatNumber >= 1) {
    const occupiedSeats = room.players
      .filter(p => p.openId !== openId)
      .map(p => p.seatNumber);
    if (occupiedSeats.includes(newSeatNumber)) {
      return res.status(400).json({ success: false, message: '座位已被占用' });
    }
  }
  
  const player = room.players.find(p => p.openId === openId);
  if (player) {
    player.seatNumber = newSeatNumber;
    player.isReady = false;
    room.updatedAt = new Date();
    rooms.set(roomId, room);
  }
  
  res.json({ success: true, room });
});

router.post('/kickPlayer', (req, res) => {
  const { roomId, playerId, mode } = req.body;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  if (mode === 'unseat') {
    const player = room.players.find(p => p.openId === playerId);
    if (player) {
      player.seatNumber = 0;
      player.isReady = false;
      room.readyPlayers = room.readyPlayers.filter(id => id !== playerId);
      room.updatedAt = new Date();
      rooms.set(roomId, room);
    }
  } else {
    room.players = room.players.filter(p => p.openId !== playerId);
    room.readyPlayers = room.readyPlayers.filter(id => id !== playerId);
    room.updatedAt = new Date();
    rooms.set(roomId, room);
  }
  
  res.json({ success: true, room });
});

router.post('/:roomId/disband', (req, res) => {
  const { roomId } = req.params;
  const { openId } = req.body;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ success: false, message: '房间不存在' });
  if (room.hostOpenId !== openId) return res.status(403).json({ success: false, message: '仅房主可解散房间' });
  rooms.delete(roomId);
  res.json({ success: true, message: '房间已解散' });
});

router.post('/:roomId/randomSeats', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ success: false, message: '房间不存在' });
  const seated = room.players.filter(p => p.seatNumber >= 1);
  if (seated.length === 0) return res.status(400).json({ success: false, message: '没有入座玩家' });
  const seatNumbers = seated.map(p => p.seatNumber).sort((a, b) => a - b);
  const shuffled = [...seated].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => { p.seatNumber = seatNumbers[i]; });
  room.updatedAt = new Date();
  rooms.set(roomId, room);
  res.json({ success: true, room, message: '座位已随机打乱' });
});

  return router;
}

module.exports = createRouter;
