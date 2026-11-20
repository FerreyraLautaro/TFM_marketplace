import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../../src/users/user-role.enum';

export const PASSWORD = 'super-secret-1';

export interface Actor {
  id: string;
  token: string;
}

export async function registerActor(
  app: INestApplication<App>,
  email: string,
  role: UserRole,
): Promise<Actor> {
  const server = app.getHttpServer();
  const registered = await request(server)
    .post('/auth/register')
    .send({ email, password: PASSWORD, role })
    .expect(201);
  const { accessToken } = registered.body as { accessToken: string };
  const me = await request(server)
    .get('/auth/me')
    .auth(accessToken, { type: 'bearer' })
    .expect(200);
  return { id: (me.body as { id: string }).id, token: accessToken };
}
