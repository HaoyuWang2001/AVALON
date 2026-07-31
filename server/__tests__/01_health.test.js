const { apiGet } = require('./helpers/testHelper');

describe('01 — Health & Connectivity', () => {
  describe('GET /hello', () => {
    it('should return "hello"', async () => {
      const res = await apiGet('/hello');
      expect(res.status).toBe(200);
      expect(res.text).toBe('hello');
    });
  });

  describe('GET /api/health', () => {
    it('should return health status with database connected', async () => {
      const res = await apiGet('/api/health');
      expect(res.status).toBe(200);
      const body = res.body;
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('server', 'avalon-server');
      expect(body).toHaveProperty('database');
      expect(body.database.initialized).toBe(true);
      expect(body.database.connected).toBe(true);
    });

    it('should return JSON response', async () => {
      const res = await apiGet('/api/health');
      expect(res.headers['content-type']).toMatch(/json/);
    });
  });
});
