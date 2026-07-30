// Sets up the supertest request agent for local mode.
// Reads the port from the temp file written by globalSetup.js.

const path = require('path');
const fs = require('fs');

const configFile = path.resolve(__dirname, '../../node_modules/.tmp/test-server.json');
let port = null;
let mode = 'unknown';

try {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  port = config.port;
  mode = config.mode;
} catch (e) {
  console.warn('⚠ No test server config found. Falling back to port 8082.');
}

const serverUrl = port ? `http://localhost:${port}` : 'http://localhost:8082';
const supertest = require('supertest');
const { setRequest } = require('./testHelper');
setRequest(supertest(serverUrl));

console.log(`Test agent ready: ${serverUrl} (mode: ${mode})`);
