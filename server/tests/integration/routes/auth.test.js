import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../../src/app.js';
import User from '../../../src/models/User.js';

describe('Auth API', () => {
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and set cookie', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        passwordHash,
        roles: ['rep'],
        active: true
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'secret123' })
        .expect(200);

      expect(res.body.email).toBe('test@example.com');
      expect(res.body.name).toBe('Test User');
      expect(res.body.roles).toContain('rep');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=');
    });

    it('should normalize email to lowercase', async () => {
      const passwordHash = await bcrypt.hash('password', 10);
      await User.create({
        name: 'Test',
        email: 'test@example.com',
        passwordHash,
        active: true
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'TEST@EXAMPLE.COM', password: 'password' })
        .expect(200);

      expect(res.body.email).toBe('test@example.com');
    });

    it('should reject invalid password', async () => {
      const passwordHash = await bcrypt.hash('correct', 10);
      await User.create({
        name: 'Test',
        email: 'test@example.com',
        passwordHash,
        active: true
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })
        .expect(401);

      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject inactive user', async () => {
      const passwordHash = await bcrypt.hash('password', 10);
      await User.create({
        name: 'Inactive',
        email: 'inactive@example.com',
        passwordHash,
        active: false
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inactive@example.com', password: 'password' })
        .expect(401);

      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject missing email or password', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' })
        .expect(400);

      await request(app)
        .post('/api/auth/login')
        .send({ password: 'password' })
        .expect(400);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password' })
        .expect(401);

      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info when authenticated', async () => {
      const passwordHash = await bcrypt.hash('password', 10);
      await User.create({
        name: 'Me User',
        email: 'me@example.com',
        passwordHash,
        roles: ['admin'],
        active: true
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'me@example.com', password: 'password' });

      const cookie = loginRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.email).toBe('me@example.com');
      expect(res.body.roles).toContain('admin');
    });

    it('should return null when not authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(200);

      expect(res.body).toBeNull();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear auth cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(res.body.ok).toBe(true);
      const cookies = res.headers['set-cookie'];
      const tokenCookie = cookies.find(c => c.startsWith('token='));
      expect(tokenCookie).toContain('token=;');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should create new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email: 'newuser@example.com',
          password: 'password123',
          roles: ['rep']
        })
        .expect(201);

      expect(res.body.name).toBe('New User');
      expect(res.body.email).toBe('newuser@example.com');
      expect(res.body.roles).toContain('rep');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should reject duplicate email', async () => {
      await User.create({
        name: 'Existing',
        email: 'existing@example.com',
        passwordHash: 'hash',
        active: true
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate',
          email: 'existing@example.com',
          password: 'password'
        })
        .expect(400);

      expect(res.body.error).toBe('Email already in use');
    });

    it('should reject missing required fields', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@example.com' })
        .expect(400);
    });
  });
});
