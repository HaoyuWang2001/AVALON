const WebSocket = require('ws');

/**
 * Create a single WebSocket client connected to the test server.
 * 与微信小程序 wx.connectSocket 相同的协议：发送/接收 JSON 帧 { type, ... }。
 * @param {number} port - Server port
 * @returns {Promise<{socket: WebSocket, send: Function, close: Function}>}
 */
function createClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timer);
      const client = {
        ws,
        connected: true,
        send(type, data = {}) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, ...data }));
          }
        },
        disconnect() {
          try { ws.close(); } catch (e) {}
          this.connected = false;
        }
      };
      resolve(client);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Wait for a specific message type within timeout.
 * @param {{ws: WebSocket}} client
 * @param {string} type - message.type
 * @param {number} timeoutMs
 * @returns {Promise<any>} 消息 payload
 */
function waitForEvent(client, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.ws.off('message', handler);
      reject(new Error(`Timeout waiting for event: ${type}`));
    }, timeoutMs);

    function handler(raw) {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }
      if (msg && msg.type === type) {
        clearTimeout(timer);
        client.ws.off('message', handler);
        resolve(msg);
      }
    }

    client.ws.on('message', handler);
  });
}

/**
 * Create N WebSocket clients connected to the server.
 * @param {number} port
 * @param {number} count
 * @returns {Promise<Array>}
 */
async function connectClients(port, count) {
  const clients = [];
  for (let i = 0; i < count; i++) {
    const client = await createClient(port);
    clients.push(client);
  }
  return clients;
}

/**
 * Disconnect all clients.
 * @param {Array} clients
 */
function disconnectAll(clients) {
  for (const client of clients) {
    if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.disconnect();
    }
  }
}

module.exports = {
  createClient,
  waitForEvent,
  connectClients,
  disconnectAll
};
