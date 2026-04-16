// 云函数：更新座位号
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, newSeatNumber } = event;

  if (!newSeatNumber || newSeatNumber < 1 || newSeatNumber > 12) {
    return { success: false, message: '座位号无效，请选择1-12号' };
  }

  try {
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    if (room.data.gameStarted) {
      return { success: false, message: '游戏已开始，无法修改座位' };
    }

    const occupiedSeats = room.data.players
      .filter(p => p.openId !== openId)
      .map(p => p.seatNumber);

    if (occupiedSeats.includes(newSeatNumber)) {
      return { success: false, message: `${newSeatNumber}号座位已被占用` };
    }

    await db.runTransaction(async transaction => {
      const roomDoc = transaction.collection('rooms').doc(roomId);
      const players = room.data.players;
      const playerIndex = players.findIndex(p => p.openId === openId);

      if (playerIndex === -1) {
        throw new Error('玩家不在房间中');
      }

      players[playerIndex].seatNumber = newSeatNumber;

      await roomDoc.update({
        data: {
          players: players,
          updatedAt: db.serverDate()
        }
      });

      const gameQuery = transaction.collection('games').where({ roomId });
      const gameRes = await gameQuery.get();
      if (gameRes.data.length > 0) {
        const gamePlayers = gameRes.data[0].players;
        const gamePlayerIndex = gamePlayers.findIndex(p => p.openId === openId);
        if (gamePlayerIndex !== -1) {
          gamePlayers[gamePlayerIndex].seatNumber = newSeatNumber;
          await gameQuery.update({
            data: {
              players: gamePlayers,
              updatedAt: db.serverDate()
            }
          });
        }
      }
    });

    return {
      success: true,
      message: '座位号已更新',
      newSeatNumber: newSeatNumber
    };
  } catch (error) {
    console.error('更新座位号失败:', error);
    return {
      success: false,
      message: '更新座位号失败'
    };
  }
};
