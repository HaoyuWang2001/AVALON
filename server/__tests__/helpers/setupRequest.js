const { setRequest } = require('./testHelper');
const supertest = require('supertest');
const path = require('path');
const fs = require('fs');

const configFile = path.resolve(__dirname, '../../node_modules/.tmp/test-server.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const port = config.port;

const request = supertest(`http://localhost:${port}`);
setRequest(request);
