// Remote test setup — sets TEST_SERVER_URL from env
// This file is referenced by jest.config.remote.js

const TEST_SERVER_URL = process.env.TEST_SERVER_URL;

if (!TEST_SERVER_URL) {
  console.error('\n❌ TEST_SERVER_URL environment variable is required for remote tests.');
  console.error('   Usage: TEST_SERVER_URL=https://your-server:8082 npm run test:remote\n');
  process.exit(1);
}

console.log(`\n🌐 Testing against remote server: ${TEST_SERVER_URL}\n`);

const { setRequest } = require('./testHelper');
const supertest = require('supertest');
setRequest(supertest(TEST_SERVER_URL));
