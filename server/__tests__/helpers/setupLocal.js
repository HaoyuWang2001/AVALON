// Local test setup — starts the Express server in-memory mode and sets up supertest

// Set dummy DB env vars so the server falls back to memory mode gracefully
if (!process.env.DB_HOST) process.env.DB_HOST = '127.0.0.1';
if (!process.env.DB_PORT) process.env.DB_PORT = '3307';
if (!process.env.DB_USER) process.env.DB_USER = 'avalon_user';
if (!process.env.DB_PASS) process.env.DB_PASS = 'test_dummy_pass';
if (!process.env.DB_NAME) process.env.DB_NAME = 'avalon_db';
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // random port

const { setRequest } = require('./testHelper');

// We need to start the server manually since index.js auto-starts.
// Monkey-patch to intercept the server and set up supertest.
const http = require('http');

module.exports = async function setupLocal() {
  return new Promise((resolve, reject) => {
    // Clear module cache for index.js
    delete require.cache[require.resolve('../../index')];

    const appModule = require('../../index');
    const { app } = appModule;

    // Wait for the server to be ready
    const checkReady = setInterval(() => {
      try {
        const addr = app.settings._serverAddress;
        if (addr) {
          clearInterval(checkReady);
          const supertest = require('supertest');
          const req = supertest(app);
          setRequest(req);
          resolve({ port: addr.port });
        }
      } catch (e) {
        // Server not ready yet
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkReady);
      reject(new Error('Server failed to start within 10 seconds'));
    }, 10000);
  });
};
