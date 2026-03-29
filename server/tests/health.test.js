import request from 'supertest';
import app from '../src/app.js';

describe('Health Check', () => {
  it('should return ok', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
