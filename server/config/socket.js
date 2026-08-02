// WebSocket 引用持有者 — 解决循环依赖
// 在 server/index.js 中注册，在 routes 中使用
// 原生 ws 协议：消息均为 JSON 帧 { type, ... }（与微信小程序 wx.connectSocket 兼容）
let wss = null;

// 向指定房间的所有连接广播一条消息（序列化为 JSON {type,...}）
function broadcastToRoom(roomId, message) {
  if (!wss || !roomId) return;
  const text = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.roomId === roomId) {
      client.send(text);
    }
  });
}

module.exports = {
  getWSS: () => wss,
  setWSS: (server) => { wss = server; },
  // 兼容旧的 getIO/setIO 命名，供既有路由调用
  getIO: () => ({ to: (roomId) => ({ emit: (event, data) => broadcastToRoom(roomId, { type: event, ...data }) }) }),
  setIO: (server) => { wss = server; },
  broadcastToRoom,
  emitToRoom: (roomId, event, data) => broadcastToRoom(roomId, { type: event, ...data })
};
