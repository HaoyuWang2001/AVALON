const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const rooms = new Map();
const games = new Map();
const messages = new Map();

const roomRoutes = require('./routes/rooms')(rooms);
const gameRoutes = require('./routes/games')(rooms, games);
const messageRoutes = require('./routes/messages')(messages);

app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinRoom', (data) => {
    const { roomId, playerId } = data;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerId = playerId;
    io.to(roomId).emit('playerJoined', { playerId });
  });

  socket.on('leaveRoom', (data) => {
    const { roomId, playerId } = data;
    socket.leave(roomId);
    io.to(roomId).emit('playerLeft', { playerId });
  });

  socket.on('roomUpdate', (data) => {
    io.to(data.roomId).emit('roomUpdated', data);
  });

  socket.on('gameUpdate', (data) => {
    io.to(data.roomId).emit('gameUpdated', data);
  });

  socket.on('message', (data) => {
    io.to(data.roomId).emit('newMessage', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8086;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io, rooms, games, messages };
