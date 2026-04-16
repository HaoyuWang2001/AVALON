// 云函数：创建房间
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  // 生成6位随机房间号
  const roomId = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // 创建房间记录
    await db.collection('rooms').add({
      data: {
        _id: roomId,
        hostOpenId: openId,
        players: [],
        readyPlayers: [],
        gameStarted: false,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      }
    });

    // 创建游戏记录
    await db.collection('games').add({
      data: {
        roomId: roomId,
        players: [],
        currentPhase: 'waiting',
        currentRound: 0,
        missionResults: [],
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      }
    });

    return {
      success: true,
      roomId: roomId,
      message: '房间创建成功'
    };
  } catch (error) {
    console.error('创建房间失败:', error);
    return {
      success: false,
      message: '房间创建失败'
    };
  }
};