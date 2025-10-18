const request = require('supertest');
const app = require('../app');

describe('API Endpoints', () => {
  const sessionId = 'test123';

  it('POST /intro stores intro in cache', async () => {
    const res = await request(app)
      .post('/intro')
      .send({ sessionId, date: '2025-08-06' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('content');
  });

  it('POST /main stores main in cache', async () => {
    const res = await request(app)
      .post('/main')
      .send({ sessionId, date: '2025-08-06' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /outro stores outro in cache', async () => {
    const res = await request(app)
      .post('/outro')
      .send({ sessionId, date: '2025-08-06' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /compose combines all sections', async () => {
    const res = await request(app)
      .post('/compose')
      .send({ sessionId });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('script');
  });

  it('POST /clear-session clears cache', async () => {
    const res = await request(app)
      .post('/clear-session')
      .send({ sessionId });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/cleared/);
  });
});
