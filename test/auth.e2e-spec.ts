import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../src/users/user-role.enum';
import { PASSWORD } from './utils/actors';
import { createE2eApp, resetDatabase } from './utils/e2e-app';

// Typed as unknown so asymmetric matchers do not leak `any` into the assertions.
const anyString: unknown = expect.any(String);

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (body: object) =>
    request(app.getHttpServer()).post('/auth/register').send(body);

  it('registers a user and returns an access token', async () => {
    const res = await register({
      email: 'ana@example.com',
      password: PASSWORD,
      role: UserRole.BUYER,
    }).expect(201);

    expect(res.body).toEqual({ accessToken: anyString });
  });

  it('rejects a duplicated email regardless of case', async () => {
    await register({
      email: 'ana@example.com',
      password: PASSWORD,
      role: UserRole.BUYER,
    }).expect(201);

    await register({
      email: 'ANA@Example.com',
      password: PASSWORD,
      role: UserRole.SELLER,
    }).expect(409);
  });

  it('rejects an invalid or non-whitelisted body', async () => {
    await register({ email: 'not-an-email', password: 'short' }).expect(400);
    await register({
      email: 'ana@example.com',
      password: PASSWORD,
      role: UserRole.BUYER,
      isAdmin: true,
    }).expect(400);
  });

  it('logs in with valid credentials and rejects a wrong password', async () => {
    await register({
      email: 'ana@example.com',
      password: PASSWORD,
      role: UserRole.BUYER,
    }).expect(201);

    const ok = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ana@example.com', password: PASSWORD })
      .expect(200);
    expect(ok.body).toEqual({ accessToken: anyString });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ana@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('returns the current user without the password hash', async () => {
    const registered = await register({
      email: 'ana@example.com',
      password: PASSWORD,
      role: UserRole.SELLER,
    }).expect(201);
    const { accessToken } = registered.body as { accessToken: string };

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);

    expect(res.body).toEqual({
      id: anyString,
      email: 'ana@example.com',
      role: UserRole.SELLER,
    });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects /auth/me without a valid token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth('not-a-jwt', { type: 'bearer' })
      .expect(401);
  });
});
