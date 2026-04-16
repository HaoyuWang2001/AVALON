// 云函数：提交提名
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, nominatedPlayers } = event;

  try {
    // 获取游戏状态
    const game = await db.collection('games').where({ roomId }).get();
    if (game.data.length === 0) {
      return { success: false, message: '游戏不存在' };
    }

    const gameState = game.data[0];

    // 检查游戏阶段是否为提名阶段
    if (gameState.currentPhase !== 'nomination') {
      return { success: false, message: '当前不是提名阶段' };
    }

    // 检查当前用户是否是队长
    const currentLeader = gameState.players[gameState.teamLeaderIndex];
    if (!currentLeader || currentLeader.openId !== openId) {
      return { success: false, message: '只有队长可以提名队伍' };
    }

    // 检查提名的玩家数量是否符合当前回合要求
    // 需要引入游戏逻辑计算队伍人数
    const playerCount = gameState.players.length;
    const round = gameState.currentRound;

    // 简单的队伍人数检查（实际应从游戏逻辑获取）
    const teamSizes = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5]
    };

    const requiredSize = (teamSizes[playerCount] || teamSizes[5])[round - 1] || 2;

    if (nominatedPlayers.length !== requiredSize) {
      return {
        success: false,
        message: `本回合需要提名 ${requiredSize} 名玩家，当前提名了 ${nominatedPlayers.length} 名`
      };
    }

    // 检查提名的玩家是否都在游戏中
    const validPlayers = nominatedPlayers.every(playerOpenId =>
      gameState.players.some(p => p.openId === playerOpenId)
    );

    if (!validPlayers) {
      return { success: false, message: '提名的玩家不在游戏中' };
    }

    // 检查是否重复提名同一玩家
    const uniquePlayers = new Set(nominatedPlayers);
    if (uniquePlayers.size !== nominatedPlayers.length) {
      return { success: false, message: '不能重复提名同一玩家' };
    }

    // 更新提名队伍
    await db.collection('games').where({ roomId }).update({
      data: {
        nominatedTeam: nominatedPlayers,
        currentPhase: 'voting', // 进入投票阶段
        teamVotes: {}, // 清空之前的投票
        updatedAt: db.serverDate()
      }
    });

    return {
      success: true,
      message: '提名成功',
      data: {
        nominatedPlayers,
        requiredSize
      }
    };
  } catch (error) {
    console.error('提交提名失败:', error);
    return {
      success: false,
      message: '提交提名失败'
    };
  }
};