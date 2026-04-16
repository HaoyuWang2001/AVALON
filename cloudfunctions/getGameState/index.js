// 云函数：获取游戏状态
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId } = event;

  try {
    // 获取游戏状态
    const game = await db.collection('games').where({ roomId }).get();
    if (game.data.length === 0) {
      return { success: false, message: '游戏不存在' };
    }

    const gameState = game.data[0];

    // 获取房间信息
    const room = await db.collection('rooms').doc(roomId).get();
    const roomInfo = room.data;

    // 根据当前用户openId，确定是否返回敏感信息（如角色信息）
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    // 找到当前玩家在游戏中的信息
    const player = gameState.players.find(p => p.openId === openId);

    // 如果玩家不在游戏中，只返回公开信息
    if (!player) {
      // 返回公开的游戏状态（不包含玩家角色等敏感信息）
      const publicState = {
        roomId: gameState.roomId,
        currentPhase: gameState.currentPhase,
        currentRound: gameState.currentRound,
        missionResults: gameState.missionResults,
        nominatedTeam: gameState.nominatedTeam,
        voteResults: gameState.voteResults,
        missionVoteResults: gameState.missionVoteResults,
        players: gameState.players.map(p => ({
          openId: p.openId,
          nickName: p.nickName,
          avatarUrl: p.avatarUrl,
          // 不返回role和side
        })),
        totalPlayers: gameState.players.length,
        // 其他公开字段...
      };

      return {
        success: true,
        gameState: publicState,
        roomInfo,
        message: '获取游戏状态成功（旁观者）'
      };
    }

    // 玩家在游戏中，返回完整信息（包括自己的角色）
    // 但需要过滤其他玩家的敏感信息
    const filteredPlayers = gameState.players.map(p => {
      if (p.openId === openId) {
        // 返回自己的完整信息
        return p;
      } else {
        // 返回其他玩家的公开信息
        return {
          openId: p.openId,
          nickName: p.nickName,
          avatarUrl: p.avatarUrl,
          side: p.side, // 阵营信息是公开的
          // 不返回具体角色
        };
      }
    });

    const fullState = {
      ...gameState,
      players: filteredPlayers
    };

    return {
      success: true,
      gameState: fullState,
      roomInfo,
      message: '获取游戏状态成功'
    };
  } catch (error) {
    console.error('获取游戏状态失败:', error);
    return {
      success: false,
      message: '获取游戏状态失败'
    };
  }
};