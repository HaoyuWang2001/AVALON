// 云函数：队伍投票
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, vote } = event; // vote: 'approve' 或 'reject'

  try {
    // 获取游戏状态
    const game = await db.collection('games').where({ roomId }).get();
    if (game.data.length === 0) {
      return { success: false, message: '游戏不存在' };
    }

    const gameState = game.data[0];

    // 检查游戏阶段是否为投票阶段
    if (gameState.currentPhase !== 'voting') {
      return { success: false, message: '当前不是投票阶段' };
    }

    // 检查玩家是否已经在游戏中
    const player = gameState.players.find(p => p.openId === openId);
    if (!player) {
      return { success: false, message: '你不在游戏中' };
    }

    // 检查是否已经投过票
    if (gameState.teamVotes && gameState.teamVotes[openId]) {
      return { success: false, message: '你已经投过票了' };
    }

    // 记录投票
    const newTeamVotes = {
      ...(gameState.teamVotes || {}),
      [openId]: vote
    };

    // 更新投票记录
    await db.collection('games').where({ roomId }).update({
      data: {
        teamVotes: newTeamVotes,
        updatedAt: db.serverDate()
      }
    });

    // 检查是否所有玩家都已投票
    const allPlayers = gameState.players.length;
    const votedPlayers = Object.keys(newTeamVotes).length;

    if (votedPlayers >= allPlayers) {
      // 所有玩家都已投票，统计结果
      const votes = Object.values(newTeamVotes);
      const approveVotes = votes.filter(v => v === 'approve').length;
      const rejectVotes = votes.filter(v => v === 'reject').length;

      // 判断投票结果
      if (approveVotes > rejectVotes) {
        // 投票通过，进入任务阶段
        await db.collection('games').where({ roomId }).update({
          data: {
            currentPhase: 'mission',
            missionVotes: {}, // 清空任务投票记录
            updatedAt: db.serverDate()
          }
        });

        return {
          success: true,
          message: '投票完成，队伍通过，进入任务阶段',
          data: {
            voteResult: 'approved',
            approveVotes,
            rejectVotes,
            nextPhase: 'mission'
          }
        };
      } else {
        // 投票否决，进入下一轮提名或更换队长
        const currentRound = gameState.currentRound;
        const failedNominations = (gameState.failedNominations || 0) + 1;

        let nextPhase = 'nomination';
        let newTeamLeaderIndex = gameState.teamLeaderIndex;
        let newRound = currentRound;

        // 如果连续5次提名被否决，坏人直接获胜
        if (failedNominations >= 5) {
          // 坏人胜利
          await db.collection('games').where({ roomId }).update({
            data: {
              currentPhase: 'gameOver',
              gameResult: {
                winner: 'evil',
                reason: '连续5次提名被否决'
              },
              updatedAt: db.serverDate()
            }
          });

          return {
            success: true,
            message: '投票完成，连续5次提名被否决，坏人胜利',
            data: {
              voteResult: 'rejected',
              approveVotes,
              rejectVotes,
              failedNominations,
              nextPhase: 'gameOver',
              winner: 'evil'
            }
          };
        }

        // 更换队长（顺时针下一个玩家）
        newTeamLeaderIndex = (gameState.teamLeaderIndex + 1) % allPlayers;

        await db.collection('games').where({ roomId }).update({
          data: {
            currentPhase: nextPhase,
            teamLeaderIndex: newTeamLeaderIndex,
            nominatedTeam: [], // 清空提名
            teamVotes: {}, // 清空投票
            failedNominations: failedNominations,
            updatedAt: db.serverDate()
          }
        });

        return {
          success: true,
          message: '投票完成，队伍被否决，更换队长',
          data: {
            voteResult: 'rejected',
            approveVotes,
            rejectVotes,
            failedNominations,
            nextPhase,
            newTeamLeaderIndex
          }
        };
      }
    } else {
      // 还有玩家未投票
      return {
        success: true,
        message: '投票已记录，等待其他玩家投票',
        data: {
          votedPlayers,
          totalPlayers: allPlayers
        }
      };
    }
  } catch (error) {
    console.error('投票失败:', error);
    return {
      success: false,
      message: '投票失败'
    };
  }
};