// Global teardown — stops the test server and cleans up

module.exports = async function globalTeardown() {
  const path = require('path');
  const fs = require('fs');

  const configFile = path.resolve(__dirname, '../../node_modules/.tmp/test-server.json');
  try {
    fs.unlinkSync(configFile);
  } catch (e) {
    // ignore
  }

  const serverDir = path.resolve(__dirname, '../..');
  try {
    const { server } = require(serverDir);
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
      console.log('\nTest server stopped.');
    }
  } catch (e) {
    // Server may not have been started
  }
};
