// 云函数：踢出玩家
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, targetOpenId } = event;

  try {
    // 获取房间信息
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    // 检查操作者是否是房主
    const operator = room.data.players.find(p => p.openId === openId);
    if (!operator || !operator.isHost) {
      return { success: false, message: '只有房主可以踢出玩家' };
    }

    // 检查目标玩家是否在房间中
    const targetIndex = room.data.players.findIndex(p => p.openId === targetOpenId);
    if (targetIndex === -1) {
      return { success: false, message: '目标玩家不在房间中' };
    }

    // 不能踢出自己
    if (targetOpenId === openId) {
      return { success: false, message: '不能踢出自己' };
    }

    const newPlayers = room.data.players.filter(p => p.openId !== targetOpenId);

    // 更新房间，移除目标玩家
    await db.collection('rooms').doc(roomId).update({
      data: {
        players: newPlayers,
        updatedAt: db.serverDate()
      }
    });

    // 如果游戏已经开始，还需要从游戏记录中移除玩家
    if (room.data.gameStarted) {
      await db.collection('games').where({ roomId }).update({
        data: {
          players: _.pull({
            openId: targetOpenId
          }),
          updatedAt: db.serverDate()
        }
      });
    }

    return {
      success: true,
      message: '踢出玩家成功'
    };
  } catch (error) {
    console.error('踢出玩家失败:', error);
    return {
      success: false,
      message: '踢出玩家失败'
    };
  }
};