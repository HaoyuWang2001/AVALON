// 云函数：离开房间
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId } = event;

  try {
    // 获取房间信息
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    // 检查玩家是否在房间中
    const playerIndex = room.data.players.findIndex(p => p.openId === openId);
    if (playerIndex === -1) {
      return { success: false, message: '你不在该房间中' };
    }

    const isHost = room.data.players[playerIndex].isHost;
    const newPlayers = room.data.players.filter(p => p.openId !== openId);

    // 如果玩家是房主，需要转移房主给其他玩家
    let hostTransfer = {};
    if (isHost && newPlayers.length > 0) {
      // 将房主转移给第一个玩家
      newPlayers[0].isHost = true;
      hostTransfer = { 'players.0.isHost': true };
    }

    // 更新房间，移除该玩家
    await db.collection('rooms').doc(roomId).update({
      data: {
        players: newPlayers,
        updatedAt: db.serverDate(),
        ...hostTransfer
      }
    });

    // 如果游戏已经开始，还需要从游戏记录中移除玩家
    if (room.data.gameStarted) {
      await db.collection('games').where({ roomId }).update({
        data: {
          players: _.pull({
            openId: openId
          }),
          updatedAt: db.serverDate()
        }
      });

      // 如果游戏开始后玩家离开，可能需要结束游戏或其他处理
      // 这里简单记录玩家离开，具体游戏逻辑由前端处理
    }

    return {
      success: true,
      message: '离开房间成功'
    };
  } catch (error) {
    console.error('离开房间失败:', error);
    return {
      success: false,
      message: '离开房间失败'
    };
  }
};