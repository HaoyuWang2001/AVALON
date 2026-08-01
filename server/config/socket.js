// Socket.io 引用持有者 — 解决循环依赖
// 在 server/index.js 中注册，在 routes 中使用
let io = null;
module.exports = {
  getIO: () => io,
  setIO: (s) => { io = s; }
};
