const request = require('supertest');
const express = require('express');

function createTestApp() {
  const app = express();
  app.use(express.json());
  
  const rooms = new Map();
  const games = new Map();
  
  const roomRoutes = require('../routes/rooms')(rooms);
  const gameRoutes = require('../routes/games')(rooms, games);
  
  app.use('/api/rooms', roomRoutes);
  app.use('/api/games', gameRoutes);
  
  return { app, rooms, games };
}

describe('游戏逻辑测试', () => {
  let app, rooms, games;
  
  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    rooms = testApp.rooms;
    games = testApp.games;
  });
  
  afterEach(() => {
    rooms.clear();
    games.clear();
  });
  
  describe('游戏启动', () => {
    test('成功启动5人游戏', async () => {
      const roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false },
        { openId: 'player3', nickName: '玩家3', avatarUrl: '', seatNumber: 3, isHost: false },
        { openId: 'player4', nickName: '玩家4', avatarUrl: '', seatNumber: 4, isHost: false },
        { openId: 'player5', nickName: '玩家5', avatarUrl: '', seatNumber: 5, isHost: false }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players,
        readyPlayers: players.map(p => p.openId),
        gameStarted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const response = await request(app)
        .post('/api/games/start')
        .send({ roomId });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.game).toBeDefined();
      expect(response.body.game.roomId).toBe(roomId);
      expect(response.body.game.players).toHaveLength(5);
      expect(response.body.game.currentPhase).toBe('roleReveal');
      expect(response.body.game.currentRound).toBe(1);
      expect(response.body.game.teamLeaderIndex).toBe(0);
      
      const game = games.get(roomId);
      expect(game).toBeDefined();
      expect(game.players.every(p => p.role)).toBe(true);
      expect(game.players.every(p => p.side)).toBe(true);
      
      const room = rooms.get(roomId);
      expect(room.gameStarted).toBe(true);
    });
    
    test('玩家不足5人时无法启动', async () => {
      const roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false },
        { openId: 'player3', nickName: '玩家3', avatarUrl: '', seatNumber: 3, isHost: false },
        { openId: 'player4', nickName: '玩家4', avatarUrl: '', seatNumber: 4, isHost: false }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players,
        readyPlayers: players.map(p => p.openId),
        gameStarted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const response = await request(app)
        .post('/api/games/start')
        .send({ roomId });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('至少需要5人');
    });
    
    test('有玩家未准备时无法启动', async () => {
      const roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false },
        { openId: 'player3', nickName: '玩家3', avatarUrl: '', seatNumber: 3, isHost: false },
        { openId: 'player4', nickName: '玩家4', avatarUrl: '', seatNumber: 4, isHost: false },
        { openId: 'player5', nickName: '玩家5', avatarUrl: '', seatNumber: 5, isHost: false }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players,
        readyPlayers: players.slice(0, 3).map(p => p.openId),
        gameStarted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const response = await request(app)
        .post('/api/games/start')
        .send({ roomId });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('还有玩家未准备');
    });
    
    test('房间不存在时返回404', async () => {
      const response = await request(app)
        .post('/api/games/start')
        .send({ roomId: 'nonexistent' });
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('房间不存在');
    });
  });
  
  describe('角色分配', () => {
    test('5人局角色分配正确', async () => {
      const roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false },
        { openId: 'player3', nickName: '玩家3', avatarUrl: '', seatNumber: 3, isHost: false },
        { openId: 'player4', nickName: '玩家4', avatarUrl: '', seatNumber: 4, isHost: false },
        { openId: 'player5', nickName: '玩家5', avatarUrl: '', seatNumber: 5, isHost: false }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players,
        readyPlayers: players.map(p => p.openId),
        gameStarted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const response = await request(app)
        .post('/api/games/start')
        .send({ roomId });
      
      expect(response.status).toBe(200);
      const game = games.get(roomId);
      
      const roles = game.players.map(p => p.role);
      const expectedRoles = ['merlin', 'percival', 'loyal', 'mordred', 'assassin'];
      
      expect(roles.sort()).toEqual(expectedRoles.sort());
      
      const sides = game.players.map(p => p.side);
      const goodCount = sides.filter(s => s === 'good').length;
      const evilCount = sides.filter(s => s === 'evil').length;
      
      expect(goodCount).toBe(3);
      expect(evilCount).toBe(2);
    });
    
    test('不同人数角色配置正确', async () => {
      const testCases = [
        { playerCount: 6, expectedRoles: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'assassin'] },
        { playerCount: 7, expectedRoles: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'] },
        { playerCount: 8, expectedRoles: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'] }
      ];
      
      for (const testCase of testCases) {
        const roomId = `room-${testCase.playerCount}`;
        const players = Array.from({ length: testCase.playerCount }, (_, i) => ({
          openId: `player${i + 1}`,
          nickName: `玩家${i + 1}`,
          avatarUrl: '',
          seatNumber: i + 1,
          isHost: i === 0
        }));
        
        rooms.set(roomId, {
          _id: roomId,
          hostOpenId: 'player1',
          players,
          readyPlayers: players.map(p => p.openId),
          gameStarted: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        const response = await request(app)
          .post('/api/games/start')
          .send({ roomId });
        
        expect(response.status).toBe(200);
        const game = games.get(roomId);
        
        const roles = game.players.map(p => p.role);
        expect(roles.sort()).toEqual(testCase.expectedRoles.sort());
        
        rooms.clear();
        games.clear();
      }
    });
  });
  
  describe('提名与投票', () => {
    let roomId, game;
    
    beforeEach(async () => {
      roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false },
        { openId: 'player3', nickName: '玩家3', avatarUrl: '', seatNumber: 3, isHost: false },
        { openId: 'player4', nickName: '玩家4', avatarUrl: '', seatNumber: 4, isHost: false },
        { openId: 'player5', nickName: '玩家5', avatarUrl: '', seatNumber: 5, isHost: false }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players,
        readyPlayers: players.map(p => p.openId),
        gameStarted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await request(app)
        .post('/api/games/start')
        .send({ roomId });
      
      game = games.get(roomId);
      game.currentPhase = 'teamSelection';
      games.set(roomId, game);
    });
    
    test('队长提交合法提名', async () => {
      const response = await request(app)
        .post('/api/games/submitNomination')
        .send({
          roomId,
          openId: 'player1',
          nominatedTeam: ['player1', 'player2', 'player3']
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.game.currentPhase).toBe('teamVote');
      expect(response.body.game.nominatedTeam).toEqual(['player1', 'player2', 'player3']);
    });
    
    test('非队长不能提交提名', async () => {
      const response = await request(app)
        .post('/api/games/submitNomination')
        .send({
          roomId,
          openId: 'player2',
          nominatedTeam: ['player1', 'player2', 'player3']
        });
      
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('只有队长才能提名');
    });
    
    test('提名人数必须符合当前回合要求', async () => {
      const response = await request(app)
        .post('/api/games/submitNomination')
        .send({
          roomId,
          openId: 'player1',
          nominatedTeam: ['player1', 'player2']
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('需要3人');
    });
    
    test('团队投票通过进入任务投票阶段', async () => {
      await request(app)
        .post('/api/games/submitNomination')
        .send({
          roomId,
          openId: 'player1',
          nominatedTeam: ['player1', 'player2', 'player3']
        });
      
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post('/api/games/castVote')
          .send({
            roomId,
            openId: `player${i}`,
            vote: 'approve'
          });
      }
      
      game = games.get(roomId);
      expect(game.currentPhase).toBe('missionVote');
    });
    
    test('团队投票未通过则更换队长', async () => {
      await request(app)
        .post('/api/games/submitNomination')
        .send({
          roomId,
          openId: 'player1',
          nominatedTeam: ['player1', 'player2', 'player3']
        });
      
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/games/castVote')
          .send({
            roomId,
            openId: `player${i}`,
            vote: 'reject'
          });
      }
      
      for (let i = 4; i <= 5; i++) {
        await request(app)
          .post('/api/games/castVote')
          .send({
            roomId,
            openId: `player${i}`,
            vote: 'approve'
          });
      }
      
      game = games.get(roomId);
      expect(game.currentPhase).toBe('teamSelection');
      expect(game.teamLeaderIndex).toBe(1);
      expect(game.failedNominations).toBe(1);
    });
    
    test('连续5次提名失败则坏人获胜', async () => {
      game.failedNominations = 4;
      games.set(roomId, game);
      
      await request(app)
        .post('/api/games/submitNomination')
        .send({
          roomId,
          openId: 'player1',
          nominatedTeam: ['player1', 'player2', 'player3']
        });
      
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post('/api/games/castVote')
          .send({
            roomId,
            openId: `player${i}`,
            vote: 'reject'
          });
      }
      
      game = games.get(roomId);
      expect(game.currentPhase).toBe('gameEnd');
      expect(game.gameResult.winner).toBe('evil');
      expect(game.gameResult.reason).toBe('连续5次提名被否决');
    });
  });
  
  describe('任务投票', () => {
    let roomId, game;
    
    beforeEach(async () => {
      roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true, role: 'merlin', side: 'good' },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false, role: 'percival', side: 'good' },
        { openId: 'player3', nickName: '玩家3', avatarUrl: '', seatNumber: 3, isHost: false, role: 'loyal', side: 'good' },
        { openId: 'player4', nickName: '玩家4', avatarUrl: '', seatNumber: 4, isHost: false, role: 'mordred', side: 'evil' },
        { openId: 'player5', nickName: '玩家5', avatarUrl: '', seatNumber: 5, isHost: false, role: 'assassin', side: 'evil' }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players: players.map(p => ({ ...p, isHost: p.openId === 'player1' })),
        readyPlayers: players.map(p => p.openId),
        gameStarted: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      game = {
        roomId,
        players,
        currentPhase: 'missionVote',
        currentRound: 1,
        teamLeaderIndex: 0,
        nominatedTeam: ['player1', 'player2', 'player3'],
        teamVotes: {},
        missionVotes: {},
        missionResults: [],
        failedNominations: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      games.set(roomId, game);
    });
    
    test('好人不能投失败票', async () => {
      const response = await request(app)
        .post('/api/games/castMissionVote')
        .send({
          roomId,
          openId: 'player1',
          vote: 'fail',
          playerRole: 'merlin'
        });
      
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('只有坏人才能破坏任务');
    });
    
    test('坏人可以投失败票', async () => {
      const response = await request(app)
        .post('/api/games/castMissionVote')
        .send({
          roomId,
          openId: 'player4',
          vote: 'fail',
          playerRole: 'mordred'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(game.missionVotes['player4']).toBe('fail');
    });
    
    test('任务成功时好人得一分', async () => {
      for (const player of game.players) {
        await request(app)
          .post('/api/games/castMissionVote')
          .send({
            roomId,
            openId: player.openId,
            vote: 'success',
            playerRole: player.role
          });
      }
      
      game = games.get(roomId);
      expect(game.missionResults).toHaveLength(1);
      expect(game.missionResults[0].success).toBe(true);
      expect(game.missionResults[0].failCount).toBe(0);
    });
    
    test('任务失败时记录失败次数', async () => {
      for (const player of game.players) {
        const vote = player.side === 'evil' ? 'fail' : 'success';
        await request(app)
          .post('/api/games/castMissionVote')
          .send({
            roomId,
            openId: player.openId,
            vote,
            playerRole: player.role
          });
      }
      
      game = games.get(roomId);
      expect(game.missionResults).toHaveLength(1);
      expect(game.missionResults[0].success).toBe(false);
      expect(game.missionResults[0].failCount).toBe(2);
    });
    
    test('好人完成3个任务获胜', async () => {
      game.missionResults = [
        { round: 1, success: true, failCount: 0, team: [] },
        { round: 2, success: true, failCount: 0, team: [] }
      ];
      games.set(roomId, game);
      
      for (const player of game.players) {
        await request(app)
          .post('/api/games/castMissionVote')
          .send({
            roomId,
            openId: player.openId,
            vote: 'success',
            playerRole: player.role
          });
      }
      
      game = games.get(roomId);
      expect(game.currentPhase).toBe('gameEnd');
      expect(game.gameResult.winner).toBe('good');
      expect(game.gameResult.reason).toBe('好人完成3个任务');
    });
    
    test('坏人完成3个任务获胜', async () => {
      game.missionResults = [
        { round: 1, success: false, failCount: 1, team: [] },
        { round: 2, success: false, failCount: 1, team: [] }
      ];
      game.currentRound = 3;
      games.set(roomId, game);
      
      for (const player of game.players) {
        const vote = player.side === 'evil' ? 'fail' : 'success';
        await request(app)
          .post('/api/games/castMissionVote')
          .send({
            roomId,
            openId: player.openId,
            vote,
            playerRole: player.role
          });
      }
      
      game = games.get(roomId);
      expect(game.currentPhase).toBe('gameEnd');
      expect(game.gameResult.winner).toBe('evil');
      expect(game.gameResult.reason).toBe('坏人完成3个任务');
    });
  });
  
  describe('游戏查询与结束', () => {
    test('查询游戏状态', async () => {
      const roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true, role: 'merlin', side: 'good' },
        { openId: 'player2', nickName: '玩家2', avatarUrl: '', seatNumber: 2, isHost: false, role: 'assassin', side: 'evil' }
      ];
      
      game = {
        roomId,
        players,
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
      
      const response = await request(app)
        .get(`/api/games/${roomId}?openId=player1`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.game.roomId).toBe(roomId);
      expect(response.body.playerRole).toBe('merlin');
    });
    
    test('查询不存在的游戏返回404', async () => {
      const response = await request(app)
        .get('/api/games/nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('游戏不存在');
    });
    
    test('结束游戏清理状态', async () => {
      const roomId = '123456';
      const players = [
        { openId: 'player1', nickName: '玩家1', avatarUrl: '', seatNumber: 1, isHost: true }
      ];
      
      rooms.set(roomId, {
        _id: roomId,
        hostOpenId: 'player1',
        players,
        readyPlayers: [],
        gameStarted: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      games.set(roomId, {
        roomId,
        players: [],
        currentPhase: 'gameEnd',
        currentRound: 1,
        teamLeaderIndex: 0,
        nominatedTeam: [],
        teamVotes: {},
        missionVotes: {},
        missionResults: [],
        failedNominations: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const response = await request(app)
        .post('/api/games/end')
        .send({ roomId });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(games.has(roomId)).toBe(false);
      
      const room = rooms.get(roomId);
      expect(room.gameStarted).toBe(false);
      expect(room.readyPlayers).toHaveLength(0);
    });
  });
});