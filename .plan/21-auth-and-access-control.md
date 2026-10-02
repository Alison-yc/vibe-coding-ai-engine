# 21 · 账号注册登录与权限管控

| 项       | 值                                              |
| -------- | ----------------------------------------------- |
| 阶段     | M6 · 账号与权限（增量里程碑）                   |
| 依赖     | 03、05、07、10、11、12、14-C、15、16、17        |
| 预计工期 | 9～12 天（6 个 CR 批次）                        |
| 状态     | 进行中                                          |
| 决策     | ADR-017（凭证与密码方案）；本文件「已确认决策」 |

## 子阶段状态

| 子阶段 | 内容                               | 所属批次  | 状态   |
| ------ | ---------------------------------- | --------- | ------ |
| 21-0   | 规划、ADR-017、路线图登记          | CR-AUTH-0 | 已完成 |
| 21-A   | 契约与数据层（7 张新表 + 归属列）  | CR-AUTH-1 | 已完成 |
| 21-B   | 认证服务与 `/auth/*` 接口          | CR-AUTH-2 | 已完成 |
| 21-C   | 前端登录态接入（不门控）           | CR-AUTH-3 | 已完成 |
| 21-D   | 服务端强制鉴权、资源隔离、前端门控 | CR-AUTH-4 | 已完成 |
| 21-E   | 加固、CI、打包验证                 | CR-AUTH-5 | 待 CR  |

## 目标

给现有 Web / 桌面双端加上账号体系：手机号或邮箱 + 验证码注册，密码或验证码登录。未登录用户以「访客」身份使用，只能简单对话（可切换模型）和访问设置页；知识库、工作流、文件访问、实用工具、MCP 管理需要登录。

本 plan 的首要目的是学习：**如何拆表与设计字段、认证与授权的区别、凭证如何安全存储、如何默认拒绝、如何防越权（IDOR）**。所以验证码不接真实短信 / 邮件服务，只做「静态验证码」，但保留完整的发码、过期、次数限制与一次性消费流程，后续接真实服务只需替换发送实现。

## 范围

**做**：

- 手机号 / 邮箱两种登录标识；验证码注册；密码登录与验证码登录；通过验证码重置密码；退出登录。
- 访客身份：首次打开自动签发，可对话、可切换已测评与扫描到的模型，注册时就地升级为正式账号并保留会话。
- 角色 `guest` / `user` / `admin`；权限码定义在 contracts，前后端共用。
- 现有会话、知识库、工作流按用户隔离。
- 双端（Web + Tauri sidecar）行为一致。

**不做**（见文末「后续规划」）：

- 真实短信 / 邮件发送；第三方登录（OAuth）；双因素认证。
- 访客对话限额。
- 后台动态配置权限（`role_permissions` 表）；用户管理后台页面。
- 登录已有账号时把访客会话合并进去。
- 桌面端系统钥匙串存储 token。

## 已确认决策（2026-10-02，用户确认）

| #   | 问题             | 决策                                                                               |
| --- | ---------------- | ---------------------------------------------------------------------------------- |
| 1   | 管理员怎么产生   | **第一个注册成功的用户自动成为 admin**，并在同一事务内认领迁移前已存在的无主数据   |
| 2   | 访客能否切换模型 | **能**。可切换范围与登录用户相同（ADR-015 的目录）；但访客无论选哪个模型都不开工具 |
| 3   | 访客对话是否限额 | **不限额**，列入「后续规划」                                                       |

## CR-AUTH-0 审查记录（2026-10-02）

对照现有 Controller、前端 `fetch`、内存 repository、E2E 和 sidecar 的 `NODE_ENV` 做了审查。下面几项会让后续批次做错，已写回本文件。

| 问题                                                                              | 处理                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 「6 处 fetch 全部收口」会把登录前的 `/health` 探测也收进去                        | `backend-connection.ts` 保持独立，不注入 token                                                         |
| 无库时对话目前走 `InMemoryChatRepository`，一刀切 503 会改变开发现状              | 写明这是预期：HTTP 入口依赖 PostgreSQL；单测仍构造内存实现，但必须做同样的归属过滤                     |
| 「E2E 全部 mock」不成立                                                           | 点名 `chat.spec.ts`、`theme-tokens.spec.ts`、`web-smoke.spec.ts`，被门控挡住时补模拟，不改成打真实后端 |
| 知识库 / 工作流只写了读、写、运行，`validate` 和 `split-preview` 会被误当成写操作 | 策略表按路由拆开                                                                                       |
| 静态码写在 `.env.example`，而 sidecar 固定 `NODE_ENV=production`                  | 不在 production 拒绝启动（否则 dmg 验收做不了）；改为每次校验成功打 warn，并记入风险                   |

同一前缀的策略以更具体的那一行优先。`retrieve`、`answer`、`split-preview`、`validate` 不改数据，不是写操作。

第二轮复审补齐：风险编号改为 R17～R20（首轮新增了 R20）；E2E 补模拟的接口统一写成 `/auth/guest` 与 `/auth/me`；验证命令补 `db:migrate` 与 platform 单测。**CR 通过（2026-10-02），CR-AUTH-1 转 `待开发`。**

## 现状与差距

| 现状（代码可确认）                                                                                                                  | 差距 / 本 plan 的处理                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 所有接口无身份概念；`http/setup-http.ts` 中 `enableCors()` 放行任意来源                                                             | 全局鉴权，默认拒绝；CORS 改为白名单                                                                                                                                                                                                           |
| `chat_sessions` / `datasets` / `workflows` 无归属列                                                                                 | 加 `owner_id`；查询一律带归属条件                                                                                                                                                                                                             |
| 业务请求分布在 6 个文件：`chat-api`（两处）、`knowledge-api`、`workflow-api`（两处）、`mcp-api`、`api/client`、`observability-page` | 改走统一请求函数并注入凭证；`FormData` 上传不设 `Content-Type`。`backend-connection.ts` 的 `/health` 探测保持独立：它发生在登录前，且目标地址可能尚未保存                                                                                     |
| 对话 / 工作流流式请求都是 `fetch` POST                                                                                              | 直接带 `Authorization` 头，无需 `EventSource` 特殊处理                                                                                                                                                                                        |
| Tauri 页面来源 `tauri://localhost`，后端在 `127.0.0.1` 动态端口                                                                     | 跨站 Cookie 不可靠，用 Bearer token（ADR-017）                                                                                                                                                                                                |
| `ErrorCodeSchema` 已有 `UNAUTHORIZED`、`RATE_LIMITED`                                                                               | 补 `FORBIDDEN` 等少量错误码                                                                                                                                                                                                                   |
| 生产环境强制 `DATABASE_URL`；开发不配库时 chat / knowledge / workflow 走内存 repository                                             | 鉴权表只放 PostgreSQL。development / production 无库时，非 Public 接口返回 503，内存 repository 不再作为 HTTP 入口。单测仍直接构造内存实现，但必须做同样的归属过滤。不提供 `AUTH_DISABLED` 之类开关；测试模块可以替换 Guard，那不是运行时后门 |
| E2E 多数用 `page.route` 模拟后端；`chat.spec.ts`、`theme-tokens.spec.ts`、`web-smoke.spec.ts` 不模拟接口                            | 已模拟的用例补 `/auth/guest` 与 `/auth/me`。未模拟的用例若被登录门控挡住，同样改为模拟，不改成依赖真实后端                                                                                                                                    |
| `scripts/rag-eval` 直接调用知识库接口                                                                                               | CR-AUTH-4 改为先登录再调用                                                                                                                                                                                                                    |
| `@nestjs/schedule` 已用于索引调度                                                                                                   | 复用它清理过期访客与会话                                                                                                                                                                                                                      |
| `commitlint.config.js` 的 scope 未包含 `auth`                                                                                       | CR-AUTH-1 第一个提交新增 `auth` scope                                                                                                                                                                                                         |

## 技术选型

**不新增任何运行时依赖。** 全部能力由现有依赖与 Node 内置模块完成。

| 能力                 | 技术                                                                     | 用在哪                                            |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| 建表、约束、迁移     | Drizzle `pgTable` / `uniqueIndex` / `primaryKey` / `check` + drizzle-kit | `servers/.../database/schema/auth.ts`，下一条迁移 |
| 密码哈希             | `node:crypto` `scrypt` + `timingSafeEqual`                               | `server/src/auth/password-hasher.ts`              |
| 会话 token           | `node:crypto` `randomBytes(32)` + `createHash('sha256')`                 | `server/src/auth/session-token.ts`                |
| 验证码哈希           | `createHash('sha256')`                                                   | `server/src/auth/verification.service.ts`         |
| 认证 / 授权          | NestJS `APP_GUARD`、`Reflector`、`SetMetadata`、`createParamDecorator`   | 全局 `AuthGuard` + `PermissionsGuard`             |
| 请求响应校验         | zod + 现有 `ZodValidationPipe`                                           | `packages/contracts/src/auth/*`                   |
| 并发安全的首个管理员 | PostgreSQL `pg_advisory_xact_lock`（Drizzle `sql` 模板，参数化）         | 注册事务                                          |
| 定时清理             | `@nestjs/schedule`（已有）                                               | `server/src/auth/auth-cleanup.scheduler.ts`       |
| 前端登录态           | `@tanstack/react-query`、`react-router`、i18next（已有）                 | `packages/app-core/src/auth/`                     |
| 端无关的凭证存储     | 新接口 `SecretStore`                                                     | `packages/platform` 定义，两个壳各实现一次        |

暂不引入、需要时先补 ADR 的候选：`@nestjs/throttler`（更细限流）、Tauri keyring / stronghold 插件（钥匙串）、nodemailer 与云短信 SDK（真实发码）、`jose`（JWT）。

### 新增环境变量（写入 `.env.example`）

| 变量                            | 默认                                                            | 说明                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_VERIFICATION_MODE`        | `static`                                                        | 当前只有 `static`；后续扩展 `sms` / `email`                                                                                                                                                                                      |
| `AUTH_STATIC_VERIFICATION_CODE` | `246810`                                                        | 6 位数字。写进 `.env.example` 即视为公开。sidecar 的 `NODE_ENV=production`（`sidecar.rs`），因此不能在 production 拒绝静态模式，否则 dmg 无法验收。production 下每次校验成功打一条 warn，不含验证码。真实短信 / 邮件再关闭此模式 |
| `AUTH_SESSION_TTL_DAYS`         | `7`                                                             | 注册用户 token 滑动有效期                                                                                                                                                                                                        |
| `AUTH_GUEST_TTL_DAYS`           | `30`                                                            | 访客 token 有效期与清理阈值                                                                                                                                                                                                      |
| `CORS_ORIGINS`                  | `http://localhost:5173,http://localhost:1420,tauri://localhost` | 逗号分隔白名单；端口与 `01` 约定一致                                                                                                                                                                                             |

## 角色与权限

权限码以 `as const` 定义在 `packages/contracts/src/auth/permissions.ts`，同时导出 `ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]>`。**后端是唯一执行者，前端只用它决定显示什么。**

| 权限码               | guest | user | admin | 说明                                           |
| -------------------- | :---: | :--: | :---: | ---------------------------------------------- |
| `chat:basic`         |  ✅   |  ✅  |  ✅   | 纯对话、自己的会话 CRUD                        |
| `chat:model-switch`  |  ✅   |  ✅  |  ✅   | 决策 2：访客也可切换                           |
| `chat:tools`         |  ❌   |  ✅  |  ✅   | 日期 / 计算 / UUID / 天气等实用工具与 MCP 工具 |
| `chat:rag`           |  ❌   |  ✅  |  ✅   | 对话挂载知识库                                 |
| `chat:file-access`   |  ❌   |  ✅  |  ✅   | 文件工具、审批、旧 `/agent/*` 接口             |
| `knowledge:read`     |  ❌   |  ✅  |  ✅   |                                                |
| `knowledge:write`    |  ❌   |  ✅  |  ✅   | 建库、上传、删除、重建索引                     |
| `workflow:read`      |  ❌   |  ✅  |  ✅   |                                                |
| `workflow:write`     |  ❌   |  ✅  |  ✅   |                                                |
| `workflow:run`       |  ❌   |  ✅  |  ✅   | 运行、停止、单节点调试                         |
| `mcp:read`           |  ❌   |  ✅  |  ✅   | MCP 列表与 `/agent/tools`                      |
| `mcp:manage`         |  ❌   |  ❌  |  ✅   | MCP 是整台服务共享的配置                       |
| `observability:read` |  ❌   |  ❌  |  ✅   | `/dev/observability/*`                         |

设置页的语言、后端地址、指针拖尾都只存在本机 KV，不涉及服务端权限，访客可用。

**模型能力与权限取交集**：一轮对话最终可用的能力 = `capabilities(modelId)`（ADR-015）∩ 当前用户的权限。访客切到 `gemma4:e2b` 后，模型本身支持工具，但访客没有 `chat:tools`，所以工具仍然关闭。这个交集必须在服务端计算，不能依赖前端隐藏按钮。

**为什么权限码不建表**：角色到权限的映射随代码演进，放在代码里能被类型检查与单测锁住；数据库只存「谁拥有哪个角色」。需要后台动态配置时再加 `role_permissions`，属于后续规划。

## 数据库设计

新表放在 `servers/liangzui-ai-server/src/database/schema/auth.ts`，由 `schema/index.ts` 导出。迁移由 `pnpm --filter liangzui-ai-server db:generate` 生成，不手写 SQL 字符串。时间列统一 `timestamp(..., { withTimezone: true })`，与现有表一致。枚举类列用 `text` + `check` 约束，与现有 `status` 列的风格一致，同时练习 CHECK 约束。

### 新增 7 张表

#### ① `users` · 账号本体

| 字段            | 类型        | 约束 / 默认                                        | 说明                                                                       |
| --------------- | ----------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`            | uuid        | PK，`defaultRandom()`                              |                                                                            |
| `kind`          | text        | not null，check `guest`/`registered`               | 访客也是一行用户，注册时就地升级，会话不丢                                 |
| `display_name`  | text        | null                                               |                                                                            |
| `password_hash` | text        | null                                               | `scrypt$N$r$p$saltB64$hashB64`；参数随哈希存储，便于将来升级参数；访客为空 |
| `status`        | text        | not null，默认 `active`，check `active`/`disabled` |                                                                            |
| `last_login_at` | timestamptz | null                                               |                                                                            |
| `created_at`    | timestamptz | not null，默认 now                                 |                                                                            |
| `updated_at`    | timestamptz | not null，默认 now                                 |                                                                            |

#### ② `user_identities` · 登录标识

| 字段          | 类型        | 约束                                         | 说明                     |
| ------------- | ----------- | -------------------------------------------- | ------------------------ |
| `id`          | uuid        | PK                                           |                          |
| `user_id`     | uuid        | not null，FK → `users.id`，级联删除          |                          |
| `type`        | text        | not null，check `email`/`phone`              |                          |
| `identifier`  | text        | not null                                     | **规范化后存储**（见下） |
| `verified_at` | timestamptz | null                                         | 验证码通过的时间         |
| `created_at`  | timestamptz | not null                                     |                          |
| 索引          |             | `UNIQUE(type, identifier)`；`INDEX(user_id)` |                          |

规范化规则写在 contracts，前后端共用：

- 邮箱：`trim()` + 转小写，再用 zod `.email()` 校验。
- 手机号：只支持中国大陆 11 位（`^1[3-9]\d{9}$`），可带 `+86` 前缀，统一存为 `+86` + 11 位。不引入 libphonenumber。

学习点：为什么不在 `users` 上放 `email` / `phone` 两列——一个人可同时绑定两种标识，可空列的唯一约束也容易出边界问题；不先规范化，`A@x.com` 与 `a@x.com` 会被当成两个账号。

#### ③ `verification_codes` · 验证码

| 字段            | 类型        | 约束                                                | 说明                                        |
| --------------- | ----------- | --------------------------------------------------- | ------------------------------------------- |
| `id`            | uuid        | PK                                                  |                                             |
| `type`          | text        | not null，check `email`/`phone`                     |                                             |
| `identifier`    | text        | not null                                            | 规范化后                                    |
| `purpose`       | text        | not null，check `register`/`login`/`reset_password` | 注册用的码不能拿去登录                      |
| `code_hash`     | text        | not null                                            | `sha256(purpose:identifier:code)`，不存明文 |
| `expires_at`    | timestamptz | not null                                            | 签发后 5 分钟                               |
| `consumed_at`   | timestamptz | null                                                | 一次性                                      |
| `attempt_count` | integer     | not null，默认 0                                    | 达到 5 次作废                               |
| `created_at`    | timestamptz | not null                                            |                                             |
| 索引            |             | `INDEX(type, identifier, purpose, created_at)`      | 查「最新一条」与发送频率                    |

静态模式下记录照常写入、照常受过期和次数约束，只是「发送」是空操作。6 位码哈希可被离线穷举，真正的防护是 5 分钟过期 + 5 次上限，因此不额外引入 pepper 密钥。

#### ④ `auth_sessions` · 登录会话

| 字段           | 类型        | 约束                                  | 说明                                              |
| -------------- | ----------- | ------------------------------------- | ------------------------------------------------- |
| `id`           | uuid        | PK                                    |                                                   |
| `user_id`      | uuid        | not null，FK → `users.id`，级联删除   |                                                   |
| `token_hash`   | text        | not null，UNIQUE                      | token 原文只在签发响应里出现一次；库里只有 sha256 |
| `client`       | text        | not null，check `web`/`desktop`       |                                                   |
| `user_agent`   | text        | null                                  | 截断到 256 字符                                   |
| `created_at`   | timestamptz | not null                              |                                                   |
| `last_seen_at` | timestamptz | not null                              | 最多每 5 分钟更新一次，避免每个请求都写库         |
| `expires_at`   | timestamptz | not null                              | 注册用户滑动续期；访客固定 30 天                  |
| `revoked_at`   | timestamptz | null                                  | 退出登录、重置密码时写入                          |
| 索引           |             | `INDEX(user_id)`；`INDEX(expires_at)` |                                                   |

#### ⑤ `roles` · 角色

| 字段         | 类型        | 约束     | 说明                       |
| ------------ | ----------- | -------- | -------------------------- |
| `id`         | uuid        | PK       |                            |
| `key`        | text        | UNIQUE   | `guest` / `user` / `admin` |
| `name`       | text        | not null |                            |
| `created_at` | timestamptz | not null |                            |

三行数据由迁移预置（练习「迁移里放种子数据」）。

#### ⑥ `user_roles` · 用户与角色（多对多）

| 字段         | 类型        | 约束                                     |
| ------------ | ----------- | ---------------------------------------- |
| `user_id`    | uuid        | FK → `users.id`，级联删除                |
| `role_id`    | uuid        | FK → `roles.id`，限制删除                |
| `granted_at` | timestamptz | not null                                 |
| 主键         |             | `PRIMARY KEY(user_id, role_id)` 复合主键 |

#### ⑦ `auth_events` · 审计与防爆破

| 字段              | 类型        | 约束                                                                                            | 说明                    |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `id`              | uuid        | PK                                                                                              |                         |
| `user_id`         | uuid        | null，FK → `users.id`，删除时置空                                                               |                         |
| `type`            | text        | not null，check `code_sent`/`register`/`login_success`/`login_failed`/`logout`/`password_reset` |                         |
| `identifier_hash` | text        | null                                                                                            | 不存明文邮箱 / 手机号   |
| `created_at`      | timestamptz | not null                                                                                        |                         |
| 索引              |             | `INDEX(type, identifier_hash, created_at)`                                                      | 查「15 分钟内失败几次」 |

### 现有表改造

| 表              | 新增列                                                | 说明 |
| --------------- | ----------------------------------------------------- | ---- |
| `chat_sessions` | `owner_id uuid null` FK → `users.id` 级联删除，加索引 |      |
| `datasets`      | 同上                                                  |      |
| `workflows`     | 同上                                                  |      |

子表（`chat_messages`、`chat_inputs`、`agent_permissions`、`documents`、`chunks`、`workflow_runs`、`workflow_node_runs`）**不加**归属列，通过父表判断归属。学习点：归属只放在聚合根上，避免多处冗余不同步。

`owner_id` 本期保持可空：迁移时既有数据没有主人，查询一律带 `owner_id = 当前用户`，无主数据对任何人都不可见，直到被首个管理员认领。是否在之后加 `NOT NULL` 属于后续规划。

### 首个管理员与老数据认领（决策 1）

注册事务内：

1. `SELECT pg_advisory_xact_lock(<固定常量>)`，用 Drizzle `sql` 模板执行，把并发注册串行化。
2. 查询是否已存在拥有 `admin` 角色的用户。
3. 不存在：授予 `admin` + `user`，并 `UPDATE chat_sessions / datasets / workflows SET owner_id = 新用户 WHERE owner_id IS NULL`。
4. 已存在：只授予 `user`。

学习点：「先查后写」在并发下必然有竞态，必须用锁或唯一约束兜住；本场景没有天然的唯一列可约束，所以用 advisory lock。

## 认证流程

### token 生命周期

- token = `randomBytes(32)` 的 base64url；库里存 sha256。
- 传输：`Authorization: Bearer <token>`（ADR-017）。
- 注册用户 7 天滑动续期；访客 30 天。
- 退出登录 = 写 `revoked_at`，前端随即重新申请访客身份。
- 重置密码会注销该用户的所有会话。
- 流式请求只在开始时校验一次 token；生成过程中退出登录不会打断本轮生成，属于已知行为。

### 访客

1. 前端启动时 `SecretStore` 中没有 token → `POST /auth/guest`。
2. 服务端创建 `users(kind=guest)` + `user_roles(guest)` + `auth_sessions`，返回 token。
3. 请求已带有效访客 token 时再次调用，返回同一身份，不重复建用户。
4. 定时任务每天清理 `last_seen_at` 超过 `AUTH_GUEST_TTL_DAYS` 的访客，会话、消息随级联删除。

### 注册

1. `POST /auth/verification-codes`（purpose=`register`）：无论标识是否已注册都返回同样的响应，防止探测账号是否存在。
2. `POST /auth/register`：校验码 → 标识未被占用（否则 `IDENTIFIER_TAKEN`）→ 哈希密码。
   - 请求带访客 token：**就地升级**该访客（`kind→registered`、写密码与标识、角色 `guest→user`），会话保留。
   - 不带：新建用户。
   - 两种情况都执行上面的「首个管理员」逻辑，并签发新 token、注销旧访客 token。

### 登录

- `POST /auth/login/password`：账号不存在时也执行一次假哈希比对，避免通过响应时间区分；失败统一返回 `INVALID_CREDENTIALS`。
- `POST /auth/login/code`：purpose=`login`。
- 登录已有账号时，当前访客的会话不合并，留在访客身份下等待过期清理。

### 密码

- scrypt 参数：`N=16384, r=8, p=1, keylen=64`，盐 16 字节。
- 密码规则写在 contracts：长度 8～72。
- 比对用 `timingSafeEqual`。
- 选 scrypt 而非 argon2 / bcrypt 的理由见 ADR-017。

### 限流（数据库计数，不引入 throttler）

| 场景       | 规则                                      |
| ---------- | ----------------------------------------- |
| 发验证码   | 同一标识 60 秒内 1 次、24 小时内 10 次    |
| 校验验证码 | 单个码最多 5 次，超过作废                 |
| 密码登录   | 同一标识 15 分钟内失败 5 次即锁定 15 分钟 |

本机应用的来源 IP 基本都是 127.0.0.1，按 IP 限流没有意义，只按标识计数。

## 授权

三层，缺一不可：

1. **接口层**（全局 Guard）
   - `AuthGuard`：解析 Bearer → 按哈希查 `auth_sessions` → 校验过期、注销、用户状态 → `request.principal = { userId, kind, roles, permissions, sessionId }`。
   - `PermissionsGuard`：读取装饰器。`@Public()` 只用于 `/health` 与 `/auth/guest`、发码、注册、登录、重置密码；`@RequirePermissions(...)` 声明所需权限。
   - **没有任何声明的路由一律拒绝**。配套「路由策略完整性测试」：遍历所有 Controller 路由，任一路由缺少显式策略即失败。
   - `@CurrentPrincipal()` 参数装饰器取当前身份。
2. **资源层**（repository）
   - `chat_sessions` / `datasets` / `workflows` 的读写全部带 `owner_id = principal.userId`；子表经父表 join 或先校验父资源归属。
   - 他人资源返回 **404**，不返回 403，避免泄露资源是否存在。
   - 审批接口 `/agent/:sessionId/permissions/:approvalId` 同样先校验会话归属。
3. **业务参数层**（service）
   - 对话流：`fileAccess=true` 需要 `chat:file-access`；`datasetIds` 非空需要 `chat:rag`；实用工具与 MCP 工具候选需要 `chat:tools`。否则伪造参数返回 403，工具意图路由直接跳过。
   - 修改会话 `modelId` 需要 `chat:model-switch`（访客也有此权限）。stream 时再按 ADR-015 校验 `modelId`，并与权限取交集。

### 接口策略总表

| 接口                                                                                                                                                           | 策略                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /health`                                                                                                                                                  | Public                                                                        |
| `POST /auth/guest`、`POST /auth/verification-codes`、`POST /auth/register`、`POST /auth/login/password`、`POST /auth/login/code`、`POST /auth/password-resets` | Public                                                                        |
| `GET /auth/me`、`POST /auth/logout`、`GET /auth/sessions`、`DELETE /auth/sessions/:sessionId`                                                                  | 任意有效 token（含访客）；注销只作用于自己的会话，他人会话 404                |
| `GET /models`                                                                                                                                                  | `chat:basic`                                                                  |
| `/chat/sessions*`（含 stream）                                                                                                                                 | `chat:basic` + 归属；改 `modelId` 另需 `chat:model-switch`；stream 再走参数层 |
| `GET /knowledge/**`、`POST .../retrieve`、`POST .../answer`、`POST .../split-preview`                                                                          | `knowledge:read` + 归属                                                       |
| `POST/DELETE /knowledge/**`（建库、上传、删除、重建索引）                                                                                                      | `knowledge:write` + 归属                                                      |
| `GET /workflows/**`、`POST .../validate`                                                                                                                       | `workflow:read` + 归属                                                        |
| `POST/PATCH/DELETE /workflows/**`（创建、更新、删除）                                                                                                          | `workflow:write` + 归属                                                       |
| `POST .../run`、`POST .../stop`、`POST .../nodes/:nodeId/run`                                                                                                  | `workflow:run` + 归属                                                         |
| `/agent/:sessionId/stream`、`POST .../permissions/:approvalId`                                                                                                 | `chat:file-access` + 归属                                                     |
| `GET /agent/tools`、`GET /mcp/servers*`                                                                                                                        | `mcp:read`                                                                    |
| `PATCH /mcp/servers/:name`、`POST .../reconnect`                                                                                                               | `mcp:manage`                                                                  |
| `GET /dev/observability/metrics`                                                                                                                               | `observability:read`                                                          |
| `POST /llm/translate`、`GET /`、`GET /prompt`                                                                                                                  | `chat:tools`（登录用户）                                                      |

## API 契约（`packages/contracts/src/auth/`）

| 文件             | 内容                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `identity.ts`    | `IdentityTypeSchema`、`normalizeEmail`、`normalizePhone`、`IdentifierInputSchema`                                                                                  |
| `password.ts`    | `PasswordSchema`（8～72）                                                                                                                                          |
| `requests.ts`    | `SendCodeRequest`、`RegisterRequest`、`PasswordLoginRequest`、`CodeLoginRequest`、`ResetPasswordRequest`                                                           |
| `responses.ts`   | `AuthSessionResponse { token, expiresAt, user }`、`MeResponse { user, identities(脱敏), roles, permissions }`、`SendCodeResponse { expiresInSec, resendAfterSec }` |
| `permissions.ts` | `PermissionSchema`、`RoleKeySchema`、`ROLE_PERMISSIONS`                                                                                                            |

`common/errors.ts` 的 `ErrorCodeSchema` 新增：`FORBIDDEN`、`INVALID_CREDENTIALS`、`VERIFICATION_CODE_INVALID`、`IDENTIFIER_TAKEN`。前端三语映射同步补齐。

脱敏规则：邮箱 `a***@x.com`，手机 `+86 138****0000`。

## 前端

### 平台层

- `packages/platform/src/types.ts` 新增 `SecretStore { get, set, remove }` 与 `Platform.secrets`，常量 `AUTH_TOKEN_STORAGE_KEY = 'auth.token'`。
- Web 壳、Tauri 壳本期都用 localStorage 实现；将来 Tauri 换钥匙串，`app-core` 零改动。
- `createMemoryKeyValueStore` 同风格补 `createMemorySecretStore` 供测试使用。

### `app-core`

| 位置                            | 内容                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `api/http.ts`                   | 统一请求函数：注入 Bearer；`FormData` 不设 `Content-Type`；401 → 清 token → 重新申请访客 → 失效 `['auth','me']`          |
| 上表 6 个业务文件里的 `fetch`   | 改走 `api/http.ts`（单独一个 `refactor` 提交）。`backend-connection.ts` 不改入此函数                                     |
| `auth/auth-api.ts`              | `/auth/*` 调用，响应经 contracts schema 校验                                                                             |
| `auth/auth-provider.tsx`        | 启动时保证有 token；`useQuery(['auth','me'])`                                                                            |
| `auth/use-auth.ts`              | `useAuth()`、`useCan(permission)`                                                                                        |
| `auth/require-permission.tsx`   | 路由守卫：无权限 → `/login?redirect=原路径`                                                                              |
| `pages/login-page.tsx`          | 密码登录 / 验证码登录两个 tab                                                                                            |
| `pages/register-page.tsx`       | 邮箱 / 手机切换；发码按钮 60 秒倒计时；密码与确认                                                                        |
| `pages/reset-password-page.tsx` | 验证码重置密码                                                                                                           |
| 导航栏                          | 知识库、工作流对访客显示锁图标，点击进入登录页；底部账号入口（登录按钮 / 头像菜单 / 退出）                               |
| 对话页                          | 访客：隐藏文件访问开关与知识库挂载，**保留模型选择**；顶部提示「登录后解锁知识库、文件访问与工具」                       |
| 设置页                          | 访客：只渲染本地设置卡片，MCP 与工具卡片换成登录引导，且不请求 `/mcp/*`、`/agent/tools`；普通用户 MCP 只读；admin 可管理 |
| i18n                            | 新命名空间 `auth.json`，`zh-CN` / `ja-JP` / `en-US` 三份 key 树全等                                                      |

`redirect` 参数只接受以 `/` 开头的站内路径，防止开放重定向。

## 安全要点（对应 `.cursor/rules/80`）

| 风险               | 措施                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 越权访问（IDOR）   | 归属过滤 + 404；每类资源都有「B 读 A」测试                                                                                                                                                |
| 参数伪造开权限     | 服务端按权限 ∩ 模型能力计算，伪造 `fileAccess` / `datasetIds` 返回 403                                                                                                                    |
| 凭证泄露           | token、验证码只存哈希；日志不打印密码、token、验证码、完整标识（打印长度与哈希）                                                                                                          |
| 静态验证码公开     | `.env.example` 中的码视为人人皆知，可注册、登录、重置任意账号。本期接受，README 与 production warn 写明；不在 production 拒绝启动，否则 sidecar（`NODE_ENV=production`）无法完成 dmg 验收 |
| 账号探测           | 发码响应统一；登录失败统一文案；假哈希消除时间差                                                                                                                                          |
| 暴力破解           | 码 5 次作废；密码 15 分钟 5 次锁定                                                                                                                                                        |
| SQL 注入           | 只用 Drizzle 参数化 API 与 `sql` 模板                                                                                                                                                     |
| XSS 窃取 token     | 维持禁用原始 HTML 渲染；Tauri CSP 已收紧；短有效期 + 退出即注销                                                                                                                           |
| CORS               | 白名单 `CORS_ORIGINS`                                                                                                                                                                     |
| 开放重定向         | `redirect` 只接受站内路径                                                                                                                                                                 |
| 一键关闭鉴权的后门 | 不提供 `AUTH_ENFORCEMENT=off` 之类开关；无库即 503                                                                                                                                        |

## 实施步骤（按 CR 批次）

每个批次内的测试与安全用例随实现一起提交，不留到后续批次。

### CR-AUTH-0 · 规划与决策

- **包含**：本文件；ADR-017 与风险 R17～R20；`19` 登记 M6 批次；`README` 当前执行点与进度表。
- **不包含**：任何代码与配置改动。
- **通过条件**：用户评审通过。

已通过（2026-10-02）。两轮审查共修订 6 项，见上文「CR-AUTH-0 审查记录」。

### CR-AUTH-1 · 契约与数据层

- **包含**：`commitlint.config.js` 新增 `auth` scope（本批次第一个提交）；contracts `auth/*` 与错误码扩展及其单测；`schema/auth.ts` 七张表；三张表 `owner_id`；角色种子；迁移；`AuthRepository`（只含数据访问）；`RUN_DB_INTEGRATION` 集成测试。
- **不包含**：HTTP 接口、Guard、密码哈希。
- **提交边界**：contracts；schema + 迁移；repository + 集成测试。
- **注意**：`DatabaseLifecycle` 只在 `SIDECAR_MODE` 下自动 `migrate()`，开发机要手动 `db:migrate`，否则新表不存在而报错。
- **通过条件**：
  - 空库执行全部迁移成功，三条角色种子存在。
  - 唯一约束（同类型同标识）、CHECK 约束、复合主键、级联删除、`set null` 各有一条会失败的反例测试。
  - 规范化函数覆盖大小写邮箱、带 `+86` 与不带前缀的手机号、非法输入。

已通过（2026-10-02）。CR-AUTH-1 审查记录：

- 空库重建：临时库执行全部迁移成功，17 张表，`guest` / `user` / `admin` 三条种子存在，集成测试在该库上通过；验证后已删除临时库。
- 角色种子是在生成的 `0007` 迁移末尾手工追加的 `INSERT … ON CONFLICT DO NOTHING`，后续重新生成迁移时不要覆盖。
- 修订：`ErrorCodeSchema` 新增了 `FORBIDDEN`，但 `ApiErrorFilter` 未把 403 映射过去，已补映射与用例。
- 修订：`PasswordSchema` 注释误把 bcrypt 的 72 字节截断归到 scrypt，已改为说明上限用于约束哈希输入开销。

### CR-AUTH-2 · 认证服务

- **包含**：`PasswordHasher`、`SessionTokenService`、`VerificationService` + `StaticVerificationCodeSender`（实现 `VerificationCodeSender` 接口）、`AuthService`、`AuthController`（guest / 发码 / 注册 / 两种登录 / 重置密码 / logout / me）、限流、`auth_events`、首个管理员 advisory lock、环境变量校验。
- **不包含**：全局 Guard（本批次只有 `/auth/me`、`/auth/logout` 局部使用 `AuthGuard`）。
- **提交边界**：哈希与 token；验证码；AuthService + Controller；首个管理员与老数据认领。
- **通过条件**：
  - 用 curl 走通「访客 → 发码 → 注册（升级）→ me → 退出 → 密码登录 → 验证码登录 → 重置密码」。
  - 单测：哈希正确 / 错误 / 格式被篡改；码过期 / 已消费 / 用途不符 / 超次数；token 过期 / 注销 / 用户禁用；发码频率限制；登录锁定。
  - 并发两个注册请求只产生一个 admin（集成测试）。
  - 日志断言：抓取 pino 输出，不含密码、token、验证码原文。

已通过（2026-10-02）。CR-AUTH-2 审查记录：

- curl 验收：构建产物指向临时空库，走通「访客 → 发码 → 注册升级 → me → 退出 → 密码登录 → 验证码登录 → 重置密码」；旧访客 token、退出后的 token、重置前的 token 均返回 401，旧密码 401、新密码 200；服务端日志中未出现密码、验证码、邮箱与 token。验证后已删除临时库。
- scrypt 实测：Apple M1 单次中位数 30ms，低于 ADR-017 的 150ms 上限，参数不调。
- 修订：验证码尝试次数原为先读后写，并发猜码可越过 5 次上限；改为带上限条件的原子自增，消费也改为条件更新。集成测试直接并发 12 次自增，断言恰好 5 次成功；已确认旧实现下该测试变红。
- 修订：注册时携带已失效的访客 token 会先消耗验证码再返回 401；改为按新用户注册。
- 修订：`auth-test-kit.ts` 位于 `src` 会进入构建产物，去掉其中对 `vitest` 的引用。

### CR-AUTH-3 · 前端登录态接入

- **包含**：`SecretStore` 接口与两端实现；`api/http.ts` 及 6 处 fetch 迁移；`AuthProvider`、`useAuth`、`useCan`；登录 / 注册 / 重置密码页；导航账号入口；`auth.json` 三语。
- **不包含**：页面门控与锁图标（后端尚未强制，应用照常可用）。
- **提交边界**：platform 接口；请求函数重构（行为不变）；auth 状态与页面；i18n。
- **通过条件**：Web 与 Tauri 都能注册、登录、退出；刷新保持登录态；app-core 单测与现有 E2E 全绿；app-core 中搜不到 `localStorage`。

已通过（2026-10-02）。CR-AUTH-3 审查记录：

- 修订：服务端会话已失效时退出，`/auth/logout` 的 401 与 `logout` 自身各重置一次 `me`，被取消的旧 queryFn 不会中止，会并发签发两个访客。访客签发改为按 platform 单飞；新增用例断言只签发一次，已确认旧实现下变红。
- 修订：导航账号入口用例要等完「登录 → 写 token → 重取 me」整条链路，全量运行时默认 1 秒等待偶发超时，放宽到 5 秒。
- 遗留：Tauri 桌面端未实跑登录 / 注册 / 退出，已挂到 README「并行保留」；2 条既有 E2E 失败见下方自检记录，后续单独修。
- 留给 CR-AUTH-4：后端启动时不可达会使 `me` 停在 `unavailable`，目前要等设置页保存后台地址或刷新才会重取，前端门控落地时需要补自动恢复；已登录用户再次登录时旧会话只在本地被覆盖，服务端按 TTL 过期。

CR-AUTH-3 自检记录：

- 提交：platform 接口 → 请求函数重构（行为不变）→ AuthProvider / `useAuth` / `useCan` → `auth.json` 三语 → 登录、注册、重置页与导航账号入口 → 验证码输入行布局修正。另有一个独立的 `test(workflow)` 提交，修正拖拽用例在 jsdom 下缺 Pointer Capture 与 `elementFromPoint`（本批次之前就已失败）。
- 设计取舍：登录类接口以 `anonymous` 发送，不带 token，因此其 401（如 `INVALID_CREDENTIALS`）不会触发会话失效处理；注册携带访客 token，以便原地升级。401 处理只清理确实被拒的 token，避免迟到的 401 冲掉刚登录的新 token。`X-Client` 来自 `capabilities.client`（web / desktop）。
- 单测：`http`、`auth-api`、`AuthProvider`、`safeRedirect`、三个页面与导航入口共 50 余条；变异自检：去掉「只清被拒 token」判断、去掉 `//` 拦截，对应用例均变红。全仓 `test:cov` 737 条通过；`format:check`、`lint`、`typecheck`、`build` 通过；app-core 中无 `localStorage`。
- 浏览器实测（Web，真实后端 + 临时空库，验证后已删库）：访客签发 → 发码与 60 秒倒计时 → 注册（访客原地升级，首个用户获得 `user,admin`，邮箱脱敏显示）→ 刷新保持登录 → 退出换回新访客、旧 token 401 → 错误密码统一提示 → 密码登录 → 验证码登录 → `redirect=//evil.example` 落到 `/chat`。
- 未验证：Tauri 壳只做了 `secrets` 与 `client` 单测，未在桌面打包版中实跑登录，CR 时需人工走一遍。
- 已知遗留（本批次之前已失败，与登录态无关，按约定后续单独修）：E2E `chat.spec` 中「新建」按钮出现两个导致 strict 选择器冲突；`workflow.spec` 拖入节点后计数为 27。其余 8 条 E2E 通过。`sec:sca` 报告的 27 个依赖漏洞为既有依赖，本批次未新增依赖。

### CR-AUTH-4 · 强制鉴权与资源隔离（必须单独 CR）

- **包含**：全局 `AuthGuard` + `PermissionsGuard`；所有路由标注策略；路由策略完整性测试；chat / knowledge / workflow / agent repository 归属过滤；对话参数层权限 ∩ 模型能力；CORS 白名单；前端门控（路由守卫、锁图标、对话页与设置页访客态）；`scripts/rag-eval` 先登录再调用；现有 E2E 补 `/auth/guest` 与 `/auth/me` 模拟；新增访客 / 登录两条 E2E。
- **不包含**：设备管理、清理任务。
- **提交边界**：Guard 与装饰器；各模块归属过滤（每模块一个提交）；对话参数层；前端门控；脚本与 E2E。
- **通过条件**：
  - 无 token 调用任一受保护接口 → 401；访客调用知识库 / 工作流 / MCP 管理 → 403。
  - 用户 B 读、改、删用户 A 的会话 / 知识库 / 文档 / 工作流 / 运行记录 / 审批 → 404。
  - 访客伪造 `fileAccess: true`、非空 `datasetIds` → 403；访客切换到 `gemma4:e2b` 能对话但工具候选为空。
  - **自检**：注释掉全局 Guard 注册，完整性测试与越权测试必须变红。
  - `pnpm ci:local` 全绿。

已通过（2026-10-02）。CR-AUTH-4 审查记录：

- 修订：后端 `dev/observability/metrics` 只对 `observability:read`（管理员）开放，前端 `/dev/observability` 原先只判断 `devTools`，普通用户与访客进入后只能看到 403。路由改为再套 `RequirePermission`，新增路由用例，已确认去掉门控后变红。
- 确认：Guard 默认拒绝且认证先于授权；完整性测试自动发现全部 Controller；审批、Agent 流、工作流运行与单节点运行都带 `ownerId`；SSE 在写响应头前完成 404 / 403 预检；参数层先校验会话归属，再判权限与数据集归属，最后与模型能力取交集；CORS 不接受 `*`；本批次新增代码无日志输出。
- 接受：停止他人的运行返回 `{ accepted: false }`，与停止不存在的运行响应一致，不泄露存在性，不改为 404。
- 遗留：同自检记录，`sec:sca` 既有依赖漏洞、2 条既有 E2E 失败、`rag-eval` 未实跑、Tauri 走查。

CR-AUTH-4 自检记录（2026-10-02）：

- 提交：全局 Guard 与路由策略 → CORS 白名单 → 会话归属 → 工作流归属 → 知识库归属 → 对话参数层 → 前端门控 → RAG 评测登录与 E2E 门控。
- 变异自检：清空 Bearer、把访客 mock 改成 admin 权限，对应用例变红。此前各提交已分别确认去掉 Guard、归属 join、参数层校验和前端门控后变红。
- `pnpm ci:local`：`format:check`、`lint`、`test:cov`（144 文件 / 785 条）、`sec:sast`、`build`、`rust:check` 通过。`sec:sca` 仍因既有 27 个依赖漏洞失败（3 low / 15 moderate / 9 high），本批次未改 lockfile，与 CR-AUTH-3 记录相同。Semgrep 另有 2 条 `pool.render` 的 audit 误报，不阻断。
- E2E：新增访客锁定、登录重定向、设置页登录引导，以及已登录进入知识库、设置页 MCP 只读。现有用例补 `/auth/guest` 与 `/auth/me` 模拟。`chat.spec` 两个「新建」按钮、`workflow.spec` 拖入后 27 个节点仍是本批次之前的失败。
- 未验证：`pnpm rag-eval` 需要本机已注册账号与 Ollama，只做了客户端单测，未对真实后端实跑。Tauri 桌面端登录走查仍挂在 README「并行保留」。

### CR-AUTH-5 · 加固与交付

- **包含**：访客与过期会话清理定时任务；`GET/DELETE /auth/sessions` 设备管理与设置页「登录设备」卡片；Semgrep 规则禁止日志字段含 `password` / `token` / `verificationCode`（附规则自测）；CI 环境变量与 Postgres job 跑新集成测试；dmg 打包后验证 sidecar 自动迁移与完整登录流程；README 补账号说明。
- **通过条件**：`pnpm ci:local` 与远端 CI 全绿；打包版走通访客 → 注册 → 知识库 → 退出；随后执行 M6 集成 Review。

CR-AUTH-5 自检记录（2026-10-02）：

- 提交：过期会话与长期未活动访客的每日清理、`GET/DELETE /auth/sessions` → 设置页登录设备 → Semgrep 敏感日志字段规则 → CI 认证环境变量与 README 账号说明。
- 变异自检：内存仓库的访客清理直接返回 0 时，清理用例变红。
- 登录设备只返回自己的有效会话，响应里没有 token。注销他人会话返回 404。注销当前设备时响应 `current: true`，前端随之退出。
- 验证：`pnpm test:integration` 5 个文件 / 16 条通过，含登录设备列表和注销他人设备 404。`pnpm ci:local` 里 `format:check`、`lint`、`test:cov`（145 文件 / 790 条）、`sec:sast` 通过，随后单独跑了 `build`。`sec:sca` 仍因既有 27 个依赖漏洞失败（3 low / 15 moderate / 9 high），本批次未改 lockfile。Semgrep 的 2 条 `pool.render` audit 不阻断。
- 未验证：dmg 打包后的 sidecar 自动迁移与完整登录走查仍要人工做，挂在 README「并行保留」。远端 CI 要等推送后才看得到。本批次未改 Rust，没有重跑 `rust:check`。

CR-AUTH-5 审查记录（2026-10-02）：代码审查通过，交付验证未完成。

- 修订：无数据库时定时清理原先每天抛 503，改为直接跳过，并补单测。
- 修订：`ScheduleModule.forRoot()` 从 `KnowledgeModule` 移到 `AppModule`，认证清理任务不再隐式依赖知识库模块。
- 修订：访客清理的 `not exists` 子查询原先只有内存仓库测试，现补真实 Postgres 集成用例，在事务内造数据并回滚，不污染开发库。把条件改成 `<` 后用例变红。
- 修订：Semgrep 敏感日志规则原先用 `[\s\S]*?`，会跨语句命中后面的 `{ token }`，改为 `[^;]*?`，并补跨语句反例。旧正则下自测变红。
- 修订：访客不再显示「登录设备」卡片，也不请求 `/auth/sessions`。去掉门控后访客用例变红。
- 确认：注销当前设备后 `logout()` 会吞掉 `/auth/logout` 的 401，再清 token 并换新访客。设备列表只返回本人未注销、未过期的会话，没有 token。CI 集成 job 的认证环境变量齐全。
- 验证：`pnpm test:integration` 5 个文件 / 17 条，`lint`、`typecheck`、`format:check`、`test:cov`（790 条）、`sec:sast`、`sec:sast:test`（12/12）、`build` 通过。`sec:sca` 同自检记录。
- 未完成（阻塞 21-E 关闭）：远端 CI 需推送后确认；dmg 实包 sidecar 自动迁移与访客 → 注册 → 知识库 → 退出走查需人工执行。两项通过后 21-E 才算完成，再进入 M6 集成 Review。

## 验收标准（DoD）

- [ ] 7 张新表与 3 个归属列可从空库迁移重建，约束均有反例测试
- [ ] 第一个注册用户是 admin 且认领了老数据；并发注册不会产生两个 admin
- [ ] 访客可对话、可切换模型、可用设置页本地项；其余功能在前端被锁、在后端被拒
- [ ] 访客注册后原会话仍在
- [ ] 所有路由都有显式策略，完整性测试守住
- [ ] 越权访问一律 404；参数伪造一律 403
- [ ] 库里没有明文密码、token、验证码；日志也没有
- [ ] 验证码过期、一次性、次数上限、发送频率全部生效
- [ ] Web 与 dmg 行为一致；三语 key 全等
- [ ] `scripts/rag-eval` 在鉴权开启后仍可运行

## 验证命令

```bash
pnpm --filter @ai-engine/contracts test
# 生成迁移后必须本地执行一次：自动迁移只在 SIDECAR_MODE 下发生（database.providers.ts）
pnpm --filter liangzui-ai-server db:generate
pnpm --filter liangzui-ai-server db:migrate
RUN_DB_INTEGRATION=true pnpm --filter liangzui-ai-server test
pnpm --filter @ai-engine/platform test
pnpm --filter @ai-engine/app-core test
pnpm test:e2e
pnpm ci:local
```

## 风险与备选

| 风险                                  | 应对                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| 6 处 fetch 迁移引入回归               | 单独 refactor 提交，行为不变，先跑全量单测与 E2E                                           |
| 强制鉴权后某条链路漏带 token 导致 401 | CR-AUTH-3 先完成全量接入；CR-AUTH-4 的 E2E 覆盖四个页面主路径                              |
| localStorage 中的 token 可被 XSS 读取 | 维持无原始 HTML 渲染与 CSP；后续可换 Tauri 钥匙串（ADR-017 代价）                          |
| 访客接口可被反复调用造出大量访客行    | 已带有效 token 时复用身份；每日清理；本机应用影响有限                                      |
| 无库时 HTTP 对话不可用                | 预期行为。开发与 dmg 都要有 PostgreSQL；单测不走 HTTP，直接构造带归属过滤的内存 repository |

## 后续规划（本期范围外）

- 访客对话限额（按每日消息数计数）。
- 真实短信 / 邮件发送：新增 `VerificationCodeSender` 实现即可。
- `role_permissions` 表与用户管理后台。
- 登录时合并访客会话。
- Tauri 钥匙串存储 token。
- `owner_id` 改为 `NOT NULL`。
- OAuth、双因素认证。
