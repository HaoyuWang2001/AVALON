const express = require('express');

function createRouter(rooms, games) {
  const router = express.Router();

  const ROLE_CONFIGS = {
    5: ['merlin', 'percival', 'loyal', 'mordred', 'assassin'],
    6: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'assassin'],
    7: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
    8: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
    9: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
    10: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion'],
    11: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion', 'lancelot'],
    12: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion', 'oberon', 'lancelot']
  };

  const TEAM_SIZES = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
    11: [3, 4, 4, 5, 5],
    12: [4, 5, 5, 6, 6]
  };

  function shuffleArray(array) {
    const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function getRoleSide(role) {
  const goodRoles = ['merlin', 'percival', 'loyal', 'lancelot', 'ladyOfTheLake'];
  const evilRoles = ['mordred', 'morgana', 'assassin', 'minion', 'oberon'];
  if (goodRoles.includes(role)) return 'good';
  if (evilRoles.includes(role)) return 'evil';
  return 'good';
}

router.post('/start', (req, res) => {
  const { roomId } = req.body;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }
  
  const playerCount = room.players.length;
  if (playerCount < 5) {
    return res.status(400).json({ success: false, message: '至少需要5人' });
  }
  
  if (room.readyPlayers.length < playerCount) {
    return res.status(400).json({ success: false, message: '还有玩家未准备' });
  }
  
  const players = room.players.sort((a, b) => a.seatNumber - b.seatNumber);
  
  const roles = ROLE_CONFIGS[playerCount] || ROLE_CONFIGS[5];
  const shuffledRoles = shuffleArray(roles);
  
  const playersWithRoles = players.map((player, index) => ({
    ...player,
    role: shuffledRoles[index],
    side: getRoleSide(shuffledRoles[index])
  }));
  
  const game = {
    roomId,
    players: playersWithRoles,
    currentPhase: 'roleReveal',
    currentRound: 1,
    teamLeaderIndex: 0,
    nominatedTeam: [],
    teamVotes: {},
    missionVotes: {},
    missionResults: [],
    failedNominations: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  games.set(roomId, game);
  
  room.gameStarted = true;
  room.updatedAt = new Date();
  rooms.set(roomId, room);
  
  res.json({
    success: true,
    game
  });
});

router.get('/:roomId', (req, res) => {
  const { roomId } = req.params;
  const { openId } = req.query;
  const game = games.get(roomId);
  
  if (!game) {
    return res.status(404).json({ success: false, message: '游戏不存在' });
  }
  
  let playerRole = null;
  if (openId) {
    const player = game.players.find(p => p.openId === openId);
    playerRole = player?.role || null;
  }
  
  res.json({
    success: true,
    game,
    playerRole
  });
});

router.post('/submitNomination', (req, res) => {
  const { roomId, openId, nominatedTeam } = req.body;
  const game = games.get(roomId);
  
  if (!game) {
    return res.status(404).json({ success: false, message: '游戏不存在' });
  }
  
  const currentLeader = game.players[game.teamLeaderIndex];
  if (currentLeader.openId !== openId) {
    return res.status(403).json({ success: false, message: '只有队长才能提名' });
  }
  
  const requiredSize = TEAM_SIZES[game.players.length]?.[game.currentRound - 1] || 3;
  if (nominatedTeam.length !== requiredSize) {
    return res.status(400).json({ success: false, message: `需要${requiredSize}人` });
  }
  
  game.nominatedTeam = nominatedTeam;
  game.currentPhase = 'teamVote';
  game.teamVotes = {};
  game.updatedAt = new Date();
  
  games.set(roomId, game);
  
  res.json({ success: true, game });
});

router.post('/castVote', (req, res) => {
  const { roomId, openId, vote } = req.body;
  const game = games.get(roomId);
  
  if (!game) {
    return res.status(404).json({ success: false, message: '游戏不存在' });
  }
  
  if (game.currentPhase !== 'teamVote') {
    return res.status(400).json({ success: false, message: '当前不是投票阶段' });
  }
  
  if (game.teamVotes[openId]) {
    return res.status(400).json({ success: false, message: '已投票' });
  }
  
  game.teamVotes[openId] = vote;
  
  const votedCount = Object.keys(game.teamVotes).length;
  const allPlayers = game.players.length;
  
  if (votedCount >= allPlayers) {
    const votes = Object.values(game.teamVotes);
    const approveCount = votes.filter(v => v === 'approve').length;
    const rejectCount = votes.filter(v => v === 'reject').length;
    
    if (approveCount > rejectCount) {
      game.currentPhase = 'missionVote';
      game.missionVotes = {};
    } else {
      game.failedNominations++;
      if (game.failedNominations >= 5) {
        game.currentPhase = 'gameEnd';
        game.gameResult = { winner: 'evil', reason: '连续5次提名被否决' };
      } else {
        game.teamLeaderIndex = (game.teamLeaderIndex + 1) % allPlayers;
        game.currentPhase = 'teamSelection';
        game.nominatedTeam = [];
        game.teamVotes = {};
      }
    }
  }
  
  game.updatedAt = new Date();
  games.set(roomId, game);
  
  res.json({ success: true, game });
});

router.post('/castMissionVote', (req, res) => {
  const { roomId, openId, vote, playerRole } = req.body;
  const game = games.get(roomId);
  
  if (!game) {
    return res.status(404).json({ success: false, message: '游戏不存在' });
  }
  
  if (game.currentPhase !== 'missionVote') {
    return res.status(400).json({ success: false, message: '当前不是任务投票阶段' });
  }
  
  if (vote === 'fail') {
    const isEvil = ['mordred', 'morgana', 'assassin', 'minion', 'oberon'].includes(playerRole);
    if (!isEvil) {
      return res.status(403).json({ success: false, message: '只有坏人才能破坏任务' });
    }
  }
  
  game.missionVotes[openId] = vote;
  
  const votedCount = Object.keys(game.missionVotes).length;
  const allPlayers = game.players.length;
  
  if (votedCount >= allPlayers) {
    const votes = Object.values(game.missionVotes);
    const failCount = votes.filter(v => v === 'fail').length;
    const success = failCount === 0 || (game.nominatedTeam.length > 1 && failCount === 1);
    
    game.missionResults.push({
      round: game.currentRound,
      success,
      failCount,
      team: game.nominatedTeam
    });
    
    const goodWins = game.missionResults.filter(r => r.success).length;
    
    if (goodWins >= 3) {
      game.currentPhase = 'gameEnd';
      game.gameResult = { winner: 'good', reason: '好人完成3个任务' };
    } else if (game.missionResults.length >= 5) {
      game.currentPhase = 'gameEnd';
      game.gameResult = { winner: 'evil', reason: '坏人完成3个任务' };
    } else {
      game.currentRound++;
      game.teamLeaderIndex = (game.teamLeaderIndex + 1) % allPlayers;
      game.currentPhase = 'teamSelection';
      game.nominatedTeam = [];
      game.teamVotes = {};
      game.missionVotes = {};
    }
  }
  
  game.updatedAt = new Date();
  games.set(roomId, game);
  
  res.json({ success: true, game });
});

router.post('/end', (req, res) => {
  const { roomId } = req.body;
  
  games.delete(roomId);
  
  const room = rooms.get(roomId);
  if (room) {
    room.gameStarted = false;
    room.players = room.players.map(p => ({ ...p, isHost: p.isHost }));
    room.readyPlayers = [];
    room.updatedAt = new Date();
    rooms.set(roomId, room);
  }
  
  res.json({ success: true });
});

  return router;
}

module.exports = createRouter;
