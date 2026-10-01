import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createAuthHarness } from './auth-test-kit';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

const password = 'correct-horse';
const nextPassword = 'new-password-2';
const code = '246810';
const email = 'User@Example.com';

describe('AuthController', () => {
  let app: INestApplication;
  let repoUserAgent: () => string | null | undefined;
  let repoClient: () => string | undefined;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'));
    const harness = createAuthHarness();
    repoUserAgent = () => harness.repo.sessions[0]?.userAgent;
    repoClient = () => harness.repo.sessions[0]?.client;
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: harness.auth }, AuthGuard],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  const http = () => request(app.getHttpServer());

  it('拒绝非法注册参数，未带 token 时不能读取当前身份', async () => {
    await http()
      .post('/auth/register')
      .send({ type: 'email', identifier: 'not-an-email' })
      .expect(400);
    await http().get('/auth/me').expect(401);
  });

  it('走通访客、注册升级、me、退出、两种登录和重置密码', async () => {
    const guest = await http()
      .post('/auth/guest')
      .set('user-agent', 'u'.repeat(300))
      .set('x-client', 'desktop')
      .expect(200);
    expect(guest.body.user.roles).toEqual(['guest']);
    expect(repoUserAgent()).toHaveLength(256);
    expect(repoClient()).toBe('desktop');

    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'register' })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ expiresInSec: 300, resendAfterSec: 60 }));

    const registered = await http()
      .post('/auth/register')
      .set('authorization', `Bearer ${guest.body.token}`)
      .send({ type: 'email', identifier: email, password, code, displayName: '甲' })
      .expect(200);
    expect(registered.body.user.id).toBe(guest.body.user.id);
    expect(registered.body.user.roles).toEqual(['user', 'admin']);
    expect(registered.body.token).not.toBe(guest.body.token);

    const me = await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${registered.body.token}`)
      .expect(200);
    expect(me.body.identities[0].identifier).toBe('u***@example.com');
    expect(JSON.stringify(me.body)).not.toContain('user@example.com');

    await http()
      .post('/auth/logout')
      .set('authorization', `Bearer ${registered.body.token}`)
      .expect(204);
    await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${registered.body.token}`)
      .expect(401);

    const byPassword = await http()
      .post('/auth/login/password')
      .send({ type: 'email', identifier: email, password })
      .expect(200);

    vi.advanceTimersByTime(61_000);
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'login' })
      .expect(200);
    const byCode = await http()
      .post('/auth/login/code')
      .send({ type: 'email', identifier: email, code })
      .expect(200);

    vi.advanceTimersByTime(61_000);
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'reset_password' })
      .expect(200);
    await http()
      .post('/auth/password-resets')
      .send({ type: 'email', identifier: email, code, password: nextPassword })
      .expect(204);
    await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${byPassword.body.token}`)
      .expect(401);
    await http().get('/auth/me').set('authorization', `Bearer ${byCode.body.token}`).expect(401);
    const restored = await http()
      .post('/auth/login/password')
      .send({ type: 'email', identifier: email, password: nextPassword })
      .expect(200);
    expect(restored.body.user.id).toBe(guest.body.user.id);
    expect(JSON.stringify(registered.body)).not.toContain(password);
    expect(JSON.stringify(restored.body)).not.toContain(nextPassword);
  });
});
