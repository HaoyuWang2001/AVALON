// 云函数：发送聊天消息
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { roomId, content, type = 'text' } = event;

  try {
    // 验证消息内容
    if (!content || content.trim().length === 0) {
      return { success: false, message: '消息内容不能为空' };
    }

    if (content.length > 500) {
      return { success: false, message: '消息内容过长' };
    }

    // 获取用户信息（从房间或游戏记录）
    let userInfo = { nickName: '未知用户', avatarUrl: '' };

    // 尝试从房间获取用户信息
    const room = await db.collection('rooms').doc(roomId).get();
    if (room.data) {
      const player = room.data.players.find(p => p.openId === openId);
      if (player) {
        userInfo = {
          nickName: player.nickName || '未知用户',
          avatarUrl: player.avatarUrl || ''
        };
      }
    }

    // 保存消息到数据库
    const result = await db.collection('chatMessages').add({
      data: {
        roomId,
        openId,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        content: content.trim(),
        type, // 'text', 'system', 'action' 等
        createdAt: db.serverDate(),
        timestamp: Date.now()
      }
    });

    return {
      success: true,
      message: '消息发送成功',
      data: {
        messageId: result._id,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    console.error('发送消息失败:', error);
    return {
      success: false,
      message: '消息发送失败'
    };
  }
};