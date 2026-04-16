// 云函数：开始游戏
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 角色配置
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

// 随机打乱数组
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// 获取角色所属阵营
function getRoleSide(role) {
  const goodRoles = ['merlin', 'percival', 'loyal', 'lancelot', 'ladyOfTheLake'];
  const evilRoles = ['mordred', 'morgana', 'assassin', 'minion', 'oberon'];

  if (goodRoles.includes(role)) return 'good';
  if (evilRoles.includes(role)) return 'evil';
  return 'good';
}

exports.main = async (event, context) => {
  const { roomId } = event;

  try {
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    let players = room.data.players;
    const playerCount = players.length;

    if (playerCount < 5) {
      return { success: false, message: '至少需要5人才能开始游戏' };
    }

    const readyPlayers = room.data.readyPlayers || [];
    if (readyPlayers.length < players.length) {
      return { success: false, message: '还有玩家未准备' };
    }

    // 按座位号排序
    players = players.sort((a, b) => {
      const seatA = a.seatNumber || 99;
      const seatB = b.seatNumber || 99;
      return seatA - seatB;
    });

    // 分配角色
    const roles = ROLE_CONFIGS[playerCount] || ROLE_CONFIGS[5];
    const shuffledRoles = shuffleArray(roles);

    // 更新玩家角色
    const playersWithRoles = players.map((player, index) => ({
      ...player,
      role: shuffledRoles[index],
      side: getRoleSide(shuffledRoles[index])
    }));

    // 第一个队长为座位号1的玩家
    const teamLeaderIndex = 0;

    // 更新房间状态
    await db.collection('rooms').doc(roomId).update({
      data: {
        gameStarted: true,
        players: players,
        updatedAt: db.serverDate()
      }
    });

    // 更新游戏状态
    await db.collection('games').where({ roomId }).update({
      data: {
        players: playersWithRoles,
        currentPhase: 'roleReveal',
        currentRound: 1,
        teamLeaderIndex: teamLeaderIndex,
        nominatedTeam: [],
        teamVotes: {},
        missionVotes: {},
        missionResults: [],
        updatedAt: db.serverDate()
      }
    });

    return {
      success: true,
      message: '游戏开始成功',
      data: {
        playerCount,
        teamLeaderIndex,
        roles: shuffledRoles
      }
    };
  } catch (error) {
    console.error('开始游戏失败:', error);
    return {
      success: false,
      message: '开始游戏失败'
    };
  }
};
