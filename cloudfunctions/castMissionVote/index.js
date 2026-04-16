// 云函数：任务投票
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, vote } = event; // vote: 'success' 或 'fail'

  try {
    // 获取游戏状态
    const game = await db.collection('games').where({ roomId }).get();
    if (game.data.length === 0) {
      return { success: false, message: '游戏不存在' };
    }

    const gameState = game.data[0];

    // 检查游戏阶段是否为任务阶段
    if (gameState.currentPhase !== 'mission') {
      return { success: false, message: '当前不是任务阶段' };
    }

    // 检查玩家是否在提名的队伍中
    if (!gameState.nominatedTeam || !gameState.nominatedTeam.includes(openId)) {
      return { success: false, message: '你不在本次任务的队伍中' };
    }

    // 检查是否已经投过票
    if (gameState.missionVotes && gameState.missionVotes[openId]) {
      return { success: false, message: '你已经投过票了' };
    }

    // 检查坏人是否可以投失败票
    const player = gameState.players.find(p => p.openId === openId);
    if (vote === 'fail' && player.side !== 'evil') {
      return { success: false, message: '只有坏人可以投失败票' };
    }

    // 记录投票
    const newMissionVotes = {
      ...(gameState.missionVotes || {}),
      [openId]: vote
    };

    // 更新投票记录
    await db.collection('games').where({ roomId }).update({
      data: {
        missionVotes: newMissionVotes,
        updatedAt: db.serverDate()
      }
    });

    // 检查是否所有任务成员都已投票
    const missionPlayers = gameState.nominatedTeam.length;
    const votedPlayers = Object.keys(newMissionVotes).length;

    if (votedPlayers >= missionPlayers) {
      // 所有任务成员都已投票，统计结果
      const votes = Object.values(newMissionVotes);
      const failVotes = votes.filter(v => v === 'fail').length;

      // 判断任务是否成功（根据游戏逻辑）
      const playerCount = gameState.players.length;
      const round = gameState.currentRound;

      let missionSuccess = failVotes === 0;

      // 第4回合（7人及以上）需要2个失败票才失败
      if (playerCount >= 7 && round === 4) {
        missionSuccess = failVotes < 2;
      }

      // 更新任务结果
      const newMissionResults = [
        ...(gameState.missionResults || []),
        {
          round,
          success: missionSuccess,
          failVotes,
          votes: newMissionVotes
        }
      ];

      // 检查游戏是否结束
      const successfulMissions = newMissionResults.filter(r => r.success).length;
      const failedMissions = newMissionResults.filter(r => !r.success).length;

      let nextPhase = 'nomination';
      let newRound = round;
      let gameResult = null;

      if (successfulMissions >= 3) {
        // 好人胜利
        nextPhase = 'assassinPhase'; // 进入刺客阶段
        gameResult = {
          winner: 'good',
          reason: '完成3个任务'
        };
      } else if (failedMissions >= 3) {
        // 坏人胜利
        nextPhase = 'gameOver';
        gameResult = {
          winner: 'evil',
          reason: '破坏3个任务'
        };
      } else {
        // 游戏继续，进入下一回合
        nextPhase = 'nomination';
        newRound = round + 1;
        // 更换队长（顺时针下一个玩家）
        const newTeamLeaderIndex = (gameState.teamLeaderIndex + 1) % playerCount;

        await db.collection('games').where({ roomId }).update({
          data: {
            currentPhase: nextPhase,
            currentRound: newRound,
            teamLeaderIndex: newTeamLeaderIndex,
            nominatedTeam: [],
            teamVotes: {},
            missionVotes: {},
            missionResults: newMissionResults,
            failedNominations: 0, // 重置失败提名计数
            updatedAt: db.serverDate()
          }
        });

        return {
          success: true,
          message: missionSuccess ? '任务成功！' : '任务失败！',
          data: {
            missionSuccess,
            failVotes,
            successfulMissions,
            failedMissions,
            nextRound: newRound,
            nextPhase,
            newTeamLeaderIndex
          }
        };
      }

      // 处理游戏结束或刺客阶段
      if (nextPhase === 'assassinPhase') {
        // 进入刺客阶段
        await db.collection('games').where({ roomId }).update({
          data: {
            currentPhase: nextPhase,
            missionResults: newMissionResults,
            updatedAt: db.serverDate()
          }
        });
      } else {
        // 游戏结束
        await db.collection('games').where({ roomId }).update({
          data: {
            currentPhase: nextPhase,
            missionResults: newMissionResults,
            gameResult: gameResult,
            updatedAt: db.serverDate()
          }
        });
      }

      return {
        success: true,
        message: missionSuccess ? '任务成功！' : '任务失败！',
        data: {
          missionSuccess,
          failVotes,
          successfulMissions,
          failedMissions,
          nextPhase,
          gameResult
        }
      };
    } else {
      // 还有玩家未投票
      return {
        success: true,
        message: '任务投票已记录，等待其他玩家投票',
        data: {
          votedPlayers,
          totalMissionPlayers: missionPlayers
        }
      };
    }
  } catch (error) {
    console.error('任务投票失败:', error);
    return {
      success: false,
      message: '任务投票失败'
    };
  }
};