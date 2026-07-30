// Remote test config - targets a deployed server
// Usage: TEST_SERVER_URL=https://haoyu-wang141.top:8082 npm run test:remote
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  setupFiles: ['./__tests__/helpers/setupRemote.js'],
};
