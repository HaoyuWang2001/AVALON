// 云函数：切换准备状态
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, userOpenId, isReady } = event;

  // 使用传入的userOpenId或当前用户的openId
  const targetOpenId = userOpenId || openId;

  try {
    // 获取房间信息
    const room = await db.collection('rooms').doc(roomId).get();
    if (!room.data) {
      return { success: false, message: '房间不存在' };
    }

    if (room.data.gameStarted) {
      return { success: false, message: '游戏已开始，无法更改准备状态' };
    }

    const readyPlayers = room.data.readyPlayers || [];

    let newReadyPlayers;
    if (isReady) {
      // 设置为准备状态
      if (!readyPlayers.includes(targetOpenId)) {
        newReadyPlayers = _.push(targetOpenId);
      } else {
        return { success: true, message: '已经是准备状态' };
      }
    } else {
      // 取消准备状态
      if (readyPlayers.includes(targetOpenId)) {
        newReadyPlayers = _.pull(targetOpenId);
      } else {
        return { success: true, message: '已经是未准备状态' };
      }
    }

    // 更新房间
    await db.collection('rooms').doc(roomId).update({
      data: {
        readyPlayers: newReadyPlayers,
        updatedAt: db.serverDate()
      }
    });

    return {
      success: true,
      message: isReady ? '已准备' : '已取消准备'
    };
  } catch (error) {
    console.error('切换准备状态失败:', error);
    return {
      success: false,
      message: '操作失败'
    };
  }
};