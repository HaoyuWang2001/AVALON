// 云函数：获取聊天消息
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId, limit = 50, beforeTime } = event;

  try {
    let query = db.collection('chatMessages')
      .where({ roomId })
      .orderBy('timestamp', 'desc')
      .limit(limit);

    // 如果有 beforeTime 参数，获取更早的消息
    if (beforeTime) {
      query = query.where({
        timestamp: db.command.lt(beforeTime)
      });
    }

    const result = await query.get();

    // 按时间升序返回（最早的在前）
    const messages = result.data.reverse();

    return {
      success: true,
      message: '获取消息成功',
      data: {
        messages,
        hasMore: messages.length >= limit,
        count: messages.length
      }
    };
  } catch (error) {
    console.error('获取消息失败:', error);
    return {
      success: false,
      message: '获取消息失败'
    };
  }
};