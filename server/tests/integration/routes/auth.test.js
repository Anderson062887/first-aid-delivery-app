import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../../src/app.js';
import User from '../../../src/models/User.js';
import { authCookie } from '../../helpers/auth.js';
import { createUser, createAdminUser } from '../../helpers/fixtures.js';

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
    let adminCookie;

    beforeEach(async () => {
      const admin = await createAdminUser(User);
      adminCookie = authCookie(admin);
    });

    it('should create new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Cookie', adminCookie)
        .send({
          name: 'New User',
          email: 'newuser@example.com',
          password: 'Password123',
          roles: ['rep']
        })
        .expect(201);

      expect(res.body.name).toBe('New User');
      expect(res.body.email).toBe('newuser@example.com');
      expect(res.body.roles).toContain('rep');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should reject unauthenticated requests', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Intruder',
          email: 'intruder@example.com',
          password: 'Password123',
          roles: ['admin']
        })
        .expect(401);

      const created = await User.findOne({ email: 'intruder@example.com' });
      expect(created).toBeNull();
    });

    it('should reject non-admin users', async () => {
      const rep = await createUser(User, { roles: ['rep'] });

      await request(app)
        .post('/api/auth/register')
        .set('Cookie', authCookie(rep))
        .send({
          name: 'Intruder',
          email: 'intruder@example.com',
          password: 'Password123',
          roles: ['admin']
        })
        .expect(403);

      const created = await User.findOne({ email: 'intruder@example.com' });
      expect(created).toBeNull();
    });

    it('should reject invalid roles', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Cookie', adminCookie)
        .send({
          name: 'Bad Roles',
          email: 'badroles@example.com',
          password: 'Password123',
          roles: ['superuser']
        })
        .expect(400);

      expect(res.body.error).toMatch(/Invalid roles/);
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
        .set('Cookie', adminCookie)
        .send({
          name: 'Duplicate',
          email: 'existing@example.com',
          password: 'Password123'
        })
        .expect(400);

      expect(res.body.error).toBe('Email already in use');
    });

    it('should reject missing required fields', async () => {
      await request(app)
        .post('/api/auth/register')
        .set('Cookie', adminCookie)
        .send({ name: 'Test', email: 'test@example.com' })
        .expect(400);
    });
  });
});
