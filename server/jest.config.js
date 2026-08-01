module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/__tests__/helpers/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/helpers/globalTeardown.js',
  setupFiles: ['<rootDir>/__tests__/helpers/setupRequest.js'],
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/helpers/'
  ],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  maxWorkers: 1,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
