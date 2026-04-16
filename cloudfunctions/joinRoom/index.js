// 云函数：加入房间
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, userInfo, seatNumber, customNickName } = event;

  if (!seatNumber || seatNumber < 1 || seatNumber > 12) {
    return { success: false, message: '座位号无效，请选择1-12号' };
  }

  try {
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    if (room.data.gameStarted) {
      return { success: false, message: '游戏已开始，无法加入' };
    }

    if (room.data.players.length >= 12) {
      return { success: false, message: '房间已满' };
    }

    const occupiedSeats = room.data.players.map(p => p.seatNumber);
    if (occupiedSeats.includes(seatNumber)) {
      return { success: false, message: `${seatNumber}号座位已被占用` };
    }

    const alreadyJoined = room.data.players.some(p => p.openId === openId);
    if (alreadyJoined) {
      return { success: true, message: '已在房间中' };
    }

    const nickName = customNickName || userInfo.nickName || '匿名玩家';

    await db.runTransaction(async transaction => {
      const roomDoc = transaction.collection('rooms').doc(roomId);
      await roomDoc.update({
        data: {
          players: _.push({
            openId: openId,
            nickName: nickName,
            avatarUrl: userInfo.avatarUrl || '',
            seatNumber: seatNumber,
            isHost: false
          }),
          updatedAt: db.serverDate()
        }
      });

      const gameQuery = transaction.collection('games').where({ roomId });
      const gameRes = await gameQuery.get();
      if (gameRes.data.length > 0) {
        await gameQuery.update({
          data: {
            players: _.push({
              openId: openId,
              nickName: nickName,
              avatarUrl: userInfo.avatarUrl || '',
              seatNumber: seatNumber,
              role: null,
              side: null
            }),
            updatedAt: db.serverDate()
          }
        });
      }
    });

    return {
      success: true,
      message: '加入房间成功',
      seatNumber: seatNumber
    };
  } catch (error) {
    console.error('加入房间失败:', error);
    return {
      success: false,
      message: '加入房间失败'
    };
  }
};
