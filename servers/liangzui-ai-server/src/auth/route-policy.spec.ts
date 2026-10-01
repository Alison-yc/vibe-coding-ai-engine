import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Controller, Get, RequestMethod, type INestApplication, type Type } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLE_PERMISSIONS, type Permission } from '@ai-engine/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_POLICY_KEY, type AccessPolicy } from './access-policy';
import { createAuthHarness, testMeta } from './auth-test-kit';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AUTH_GLOBAL_GUARDS } from './global-guards';
import { PermissionsGuard } from './permissions.guard';

type ExpectedPolicy = 'public' | 'authenticated' | Permission;

/** 与 `.plan/21`「接口策略总表」一一对应；新增路由必须在这里登记策略。 */
const EXPECTED: Record<string, ExpectedPolicy> = {
  'GET /health': 'public',
  'POST /auth/guest': 'public',
  'POST /auth/verification-codes': 'public',
  'POST /auth/register': 'public',
  'POST /auth/login/password': 'public',
  'POST /auth/login/code': 'public',
  'POST /auth/password-resets': 'public',
  'GET /auth/me': 'authenticated',
  'POST /auth/logout': 'authenticated',
  'GET /models': 'chat:basic',
  'POST /chat/sessions': 'chat:basic',
  'GET /chat/sessions': 'chat:basic',
  'GET /chat/sessions/:sessionId': 'chat:basic',
  'PATCH /chat/sessions/:sessionId': 'chat:basic',
  'DELETE /chat/sessions/:sessionId': 'chat:basic',
  'GET /chat/sessions/:sessionId/messages': 'chat:basic',
  'POST /chat/sessions/:sessionId/stream': 'chat:basic',
  'POST /knowledge/datasets': 'knowledge:write',
  'GET /knowledge/datasets': 'knowledge:read',
  'GET /knowledge/datasets/:datasetId': 'knowledge:read',
  'DELETE /knowledge/datasets/:datasetId': 'knowledge:write',
  'GET /knowledge/datasets/:datasetId/documents': 'knowledge:read',
  'POST /knowledge/datasets/:datasetId/documents': 'knowledge:write',
  'POST /knowledge/datasets/:datasetId/documents/upload': 'knowledge:write',
  'GET /knowledge/documents/:documentId': 'knowledge:read',
  'DELETE /knowledge/documents/:documentId': 'knowledge:write',
  'POST /knowledge/documents/:documentId/reindex': 'knowledge:write',
  'POST /knowledge/datasets/:datasetId/split-preview': 'knowledge:read',
  'POST /knowledge/datasets/:datasetId/retrieve': 'knowledge:read',
  'POST /knowledge/datasets/:datasetId/answer': 'knowledge:read',
  'POST /workflows': 'workflow:write',
  'GET /workflows': 'workflow:read',
  'GET /workflows/runs/:runId': 'workflow:read',
  'GET /workflows/:workflowId/runs': 'workflow:read',
  'GET /workflows/:workflowId': 'workflow:read',
  'PATCH /workflows/:workflowId': 'workflow:write',
  'DELETE /workflows/:workflowId': 'workflow:write',
  'POST /workflows/:workflowId/validate': 'workflow:read',
  'POST /workflows/:workflowId/run': 'workflow:run',
  'POST /workflows/runs/:runId/stop': 'workflow:run',
  'POST /workflows/:workflowId/nodes/:nodeId/run': 'workflow:run',
  'GET /agent/tools': 'mcp:read',
  'POST /agent/:sessionId/stream': 'chat:file-access',
  'POST /agent/:sessionId/permissions/:approvalId': 'chat:file-access',
  'GET /mcp/servers': 'mcp:read',
  'GET /mcp/servers/:name/tools': 'mcp:read',
  'POST /mcp/servers/:name/reconnect': 'mcp:manage',
  'PATCH /mcp/servers/:name': 'mcp:manage',
  'GET /dev/observability/metrics': 'observability:read',
  'GET /': 'chat:tools',
  'GET /prompt': 'chat:tools',
  'POST /llm/translate': 'chat:tools',
};

type DiscoveredRoute = {
  key: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  policy: AccessPolicy | undefined;
};

const SRC_ROOT = join(__dirname, '..');

const findControllerFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findControllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });

const loadControllers = async (): Promise<Type[]> => {
  const controllers: Type[] = [];
  for (const file of findControllerFiles(SRC_ROOT)) {
    const exported = (await import(file)) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value === 'function' && Reflect.getMetadata('__controller__', value)) {
        controllers.push(value as Type);
      }
    }
  }
  return controllers;
};

const HTTP_METHODS: Partial<Record<RequestMethod, DiscoveredRoute['method']>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

const joinPath = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/');

const discoverRoutes = (controllers: Type[]): DiscoveredRoute[] =>
  controllers.flatMap((controller) => {
    const prefix = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const classPolicy = Reflect.getMetadata(ACCESS_POLICY_KEY, controller) as
      AccessPolicy | undefined;
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype).flatMap((name) => {
      const handler = prototype[name];
      if (typeof handler !== 'function') return [];
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (requestMethod === undefined) return [];
      const method = HTTP_METHODS[requestMethod];
      if (!method) throw new Error(`未支持的方法：${controller.name}.${name}`);
      const path = joinPath(prefix, String(Reflect.getMetadata(PATH_METADATA, handler) ?? ''));
      const policy =
        (Reflect.getMetadata(ACCESS_POLICY_KEY, handler) as AccessPolicy | undefined) ??
        classPolicy;
      return [{ key: `${method.toUpperCase()} ${path}`, method, path, policy }];
    });
  });

const toExpected = (policy: AccessPolicy | undefined): ExpectedPolicy | undefined => {
  if (!policy) return undefined;
  if (policy.kind !== 'permissions') return policy.kind;
  expect(policy.permissions).toHaveLength(1);
  return policy.permissions[0];
};

const fillParams = (path: string) =>
  path.replace(/:(\w+)/g, (_match, name: string) =>
    name === 'name' ? 'filesystem' : '00000000-0000-4000-8000-000000000000',
  );

const LIFECYCLE_HOOKS = new Set(['then', 'onModuleInit', 'onApplicationBootstrap']);

/** 控制器依赖一律换成空壳：本测试只关心请求能否越过 Guard。 */
const stubDependency = () =>
  new Proxy(
    {},
    {
      get: (_target, property) =>
        typeof property === 'string' && !LIFECYCLE_HOOKS.has(property)
          ? () => undefined
          : undefined,
    },
  );

@Controller('route-policy-probe')
class UndeclaredPolicyController {
  @Get()
  probe() {
    return 'leaked';
  }
}

describe('路由访问策略', () => {
  let routes: DiscoveredRoute[];
  let app: INestApplication;
  const tokens = { guest: '', user: '', admin: '' };

  beforeAll(async () => {
    const controllers = await loadControllers();
    routes = discoverRoutes(controllers);

    const harness = createAuthHarness();
    const module = await Test.createTestingModule({
      controllers: [...controllers, UndeclaredPolicyController],
      providers: [{ provide: AuthService, useValue: harness.auth }, ...AUTH_GLOBAL_GUARDS],
    })
      .useMocker(stubDependency)
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.init();

    tokens.guest = (await harness.auth.issueGuest(testMeta())).token;
    for (const [role, identifier] of [
      ['admin', 'first@example.com'],
      ['user', 'second@example.com'],
    ] as const) {
      await harness.auth.sendCode({ type: 'email', identifier, purpose: 'register' });
      const session = await harness.auth.register(
        { type: 'email', identifier, password: 'correct-horse', code: harness.config.staticCode },
        testMeta(),
      );
      expect(session.user.roles).toContain(role);
      tokens[role] = session.token;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('自动发现的 Controller 覆盖全部源码目录', () => {
    const owners = findControllerFiles(SRC_ROOT).map((file) => relative(SRC_ROOT, file));
    expect(owners.length).toBeGreaterThanOrEqual(10);
    expect(routes.length).toBe(Object.keys(EXPECTED).length);
  });

  it('每条路由都显式声明策略，且与策略总表一致', () => {
    const missing = routes.filter((route) => !route.policy).map((route) => route.key);
    expect(missing).toEqual([]);
    const actual = Object.fromEntries(routes.map((route) => [route.key, toExpected(route.policy)]));
    expect(actual).toEqual(EXPECTED);
  });

  it('全局 Guard 由 AuthModule 注册，且认证先于授权', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[];
    expect(providers).toEqual(expect.arrayContaining(AUTH_GLOBAL_GUARDS));
    expect(AUTH_GLOBAL_GUARDS).toEqual([
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ]);
  });

  it('无 token 访问任一非公开路由返回 401', async () => {
    const failures: string[] = [];
    for (const route of routes) {
      if (EXPECTED[route.key] === 'public') continue;
      const response = await request(app.getHttpServer())[route.method](fillParams(route.path));
      if (response.status !== 401) failures.push(`${route.key} → ${response.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('未声明策略的路由即使带有效 token 也被拒绝', async () => {
    const response = await request(app.getHttpServer())
      .get('/route-policy-probe')
      .set('authorization', `Bearer ${tokens.admin}`);
    expect(response.status).toBe(403);
    expect(response.text).not.toContain('leaked');
  });

  it('伪造或失效的 token 一律 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/chat/sessions')
      .set('authorization', 'Bearer forged-token');
    expect(response.status).toBe(401);
  });

  it.each(['guest', 'user', 'admin'] as const)('%s 访问缺少权限的路由返回 403', async (role) => {
    const granted = new Set<string>(ROLE_PERMISSIONS[role]);
    const denied = routes.filter((route) => {
      const policy = EXPECTED[route.key];
      return policy !== 'public' && policy !== 'authenticated' && !granted.has(policy!);
    });
    if (role === 'admin') expect(denied).toEqual([]);
    else expect(denied.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const route of denied) {
      const response = await request(app.getHttpServer())
        [route.method](fillParams(route.path))
        .set('authorization', `Bearer ${tokens[role]}`);
      if (response.status !== 403 || response.body.code !== 'FORBIDDEN') {
        failures.push(`${route.key} → ${response.status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('访客只能用对话类与身份接口', () => {
    const guestAllowed = routes
      .filter((route) => {
        const policy = EXPECTED[route.key];
        return (
          policy !== 'public' &&
          (policy === 'authenticated' ||
            (ROLE_PERMISSIONS.guest as readonly string[]).includes(policy!))
        );
      })
      .map((route) => route.key)
      .sort();
    expect(guestAllowed.every((key) => /^\w+ \/(chat|models|auth)\b/.test(key))).toBe(true);
  });
});
