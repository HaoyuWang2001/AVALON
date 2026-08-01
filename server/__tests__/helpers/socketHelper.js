const { io: Client } = require('socket.io-client');

/**
 * Create a single Socket.io client connected to the test server.
 * @param {number} port - Server port
 * @returns {Promise<import('socket.io-client').Socket>}
 */
function createClient(port) {
  return new Promise((resolve, reject) => {
    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      timeout: 5000,
      forceNew: true
    });

    const timer = setTimeout(() => {
      client.close();
      reject(new Error('Socket connection timeout'));
    }, 5000);

    client.on('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Wait for a specific event on the client within timeout.
 * @param {import('socket.io-client').Socket} client
 * @param {string} event
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function waitForEvent(client, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);

    function handler(data) {
      clearTimeout(timer);
      client.off(event, handler);
      resolve(data);
    }

    client.on(event, handler);
  });
}

/**
 * Create N Socket.io clients connected to the server.
 * @param {number} port
 * @param {number} count
 * @returns {Promise<import('socket.io-client').Socket[]>}
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
 * @param {import('socket.io-client').Socket[]} clients
 */
function disconnectAll(clients) {
  for (const client of clients) {
    if (client.connected) {
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
