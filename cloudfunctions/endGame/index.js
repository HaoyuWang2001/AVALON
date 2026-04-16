// 云函数：结束游戏
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId, reason } = event;

  try {
    // 获取房间信息
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    // 更新房间状态
    await db.collection('rooms').doc(roomId).update({
      data: {
        gameStarted: false,
        readyPlayers: [], // 清空准备状态
        updatedAt: db.serverDate()
      }
    });

    // 获取游戏状态
    const game = await db.collection('games').where({ roomId }).get();
    if (game.data.length > 0) {
      const gameState = game.data[0];

      // 保存游戏记录到历史记录集合（如果存在）
      try {
        await db.collection('gameHistory').add({
          data: {
            roomId,
            players: gameState.players,
            missionResults: gameState.missionResults,
            gameResult: gameState.gameResult || { winner: 'unknown', reason: reason || '手动结束' },
            startedAt: gameState.createdAt,
            endedAt: db.serverDate(),
            createdAt: db.serverDate()
          }
        });
      } catch (historyError) {
        console.warn('保存游戏历史记录失败:', historyError);
        // 继续执行，不中断
      }

      // 更新游戏状态为结束
      await db.collection('games').where({ roomId }).update({
        data: {
          currentPhase: 'gameOver',
          gameResult: gameState.gameResult || { winner: 'unknown', reason: reason || '手动结束' },
          updatedAt: db.serverDate()
        }
      });

      // 可选：删除游戏记录（或者保留以供查看）
      // await db.collection('games').where({ roomId }).remove();
    }

    return {
      success: true,
      message: '游戏结束成功',
      data: {
        roomId,
        reason: reason || '手动结束'
      }
    };
  } catch (error) {
    console.error('结束游戏失败:', error);
    return {
      success: false,
      message: '结束游戏失败'
    };
  }
};