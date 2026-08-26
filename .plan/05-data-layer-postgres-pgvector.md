# 05 · 数据层：Docker + PostgreSQL + pgvector + Drizzle

| 项       | 值                            |
| -------- | ----------------------------- |
| 阶段     | M1 · 模型能力与数据层         |
| 依赖     | 02、03                        |
| 预计工期 | 2～3 天（含 Docker 入门时间） |
| 状态     | 已完成                        |

## 目标

用 Docker 跑起带 pgvector 的 PostgreSQL，用 Drizzle 建立 schema 与迁移体系，替换现有 `MemoryVectorStore`（进程重启就丢数据的临时方案）。

**你没用过 Docker，所以这个 plan 会把 Docker 部分写得比其他 plan 更细。** 只需要掌握四个概念：镜像、容器、卷、compose。不需要学 Dockerfile 多阶段构建、不需要学 K8s。

## 为什么需要 Docker

| 方案                           | 问题                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| Postgres.app / homebrew 安装   | pgvector 扩展要自己编译安装；版本升级容易搞坏；换机器要从头来一遍           |
| **Docker + pgvector 官方镜像** | 一条命令起环境，`docker-compose.yml` 入库后完全可复现；删了重建不影响宿主机 |

附带收益：Docker 是后端岗位的常见要求，`docker-compose.yml` 在仓库里本身就是能力证明。

## 第一部分：Docker 环境

### 需要理解的四个概念

| 概念           | 一句话                         | 在本项目里                       |
| -------------- | ------------------------------ | -------------------------------- |
| 镜像 image     | 打包好的软件模板，只读         | `pgvector/pgvector:pg17`         |
| 容器 container | 镜像跑起来的实例               | 名为 `ai-engine-postgres` 的进程 |
| 卷 volume      | 容器外的持久化存储             | 数据库文件，容器删了数据还在     |
| compose        | 用一个 yaml 描述并启动多个容器 | `docker/docker-compose.yml`      |

### 安装

```bash
brew install --cask docker      # 或从 docker.com 下载 Docker Desktop
open -a Docker                  # 启动，等菜单栏鲸鱼图标变稳定
docker --version                # 验证
```

### compose 文件设计要点

| 配置              | 值                                   | 为什么                                                                                                                    |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| image             | `pgvector/pgvector:pg17`             | 官方预装 pgvector 的镜像，省去自己编译。**镜像 tag 写死，不用 `latest`**，否则某天 `docker compose pull` 会静默升级大版本 |
| ports             | `5432:5432`                          | 宿主机能用 psql/GUI 直连                                                                                                  |
| volumes（数据）   | `./data:/var/lib/postgresql/data`    | 数据落在 `docker/data/`，**必须加入 .gitignore**                                                                          |
| volumes（初始化） | `./init:/docker-entrypoint-initdb.d` | 里面的 `.sql` 在**首次**创建数据库时自动执行                                                                              |
| healthcheck       | `pg_isready`                         | 让 `docker compose up --wait` 能真正等到数据库可用，而不是容器一起来就返回                                                |
| restart           | `unless-stopped`                     | 重启电脑后自动恢复                                                                                                        |

初始化 SQL（`docker/init/01-extensions.sql`）只做一件事：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**注意**：初始化脚本只在数据卷为空时执行一次。如果改了脚本要生效，必须 `docker compose down -v` 删卷重建（会丢数据）。这是最容易困惑的 Docker 行为，记住它能省几小时。

### 常用命令备忘

```bash
cd docker
docker compose up -d --wait      # 启动并等健康检查通过
docker compose ps                # 看状态
docker compose logs -f postgres  # 看日志
docker compose stop              # 停止（保留数据）
docker compose down              # 删容器（保留数据卷）
docker compose down -v           # 删容器和数据卷（数据全丢，慎用）
docker compose exec postgres psql -U ai_engine -d ai_engine   # 进 psql
```

## 第二部分：Schema 设计

### 表清单

| 表                   | 用途             | 关键字段                                                                   |
| -------------------- | ---------------- | -------------------------------------------------------------------------- |
| `datasets`           | 知识库           | id, name, embedding_model, chunk_config(jsonb)                             |
| `documents`          | 文档             | id, dataset_id, name, source_type, status, error                           |
| `chunks`             | 文档切片         | id, document_id, content, embedding vector(768), metadata(jsonb), position |
| `chat_sessions`      | 会话             | id, title, agent_type, model_id, dataset_ids                               |
| `chat_messages`      | 消息             | id, session_id, role, parts(jsonb), seq                                    |
| `chat_inputs`        | 待处理输入队列   | id, session_id, content, delivery, status                                  |
| `workflows`          | 工作流           | id, name, graph(jsonb), version                                            |
| `workflow_runs`      | 运行记录         | id, workflow_id, status, inputs, outputs, started_at                       |
| `workflow_node_runs` | 节点运行记录     | id, run_id, node_id, status, inputs, outputs, elapsed_ms, error            |
| `agent_permissions`  | 已保存的权限决定 | id, session_id, tool, resource, effect                                     |

### 三个设计决策

**1. `chat_messages.parts` 用 jsonb，不拆表。**
消息 part 的结构是 discriminated union（text / reasoning / tool / citation），拆表要么建多张表加 union 查询，要么建一张宽表塞一堆可空列。jsonb 直接存 `MessagePart[]`，读写都是整条消息粒度，没有单独查某个 part 的需求。schema 校验交给契约层的 zod。

**2. `chat_inputs` 是独立的队列表（durable inbox）。**
借鉴 opencode。用户输入先落这张表，再触发 Agent 执行。进程崩溃重启后能恢复未处理的输入。如果直接"收到请求就开始跑"，崩溃就丢消息。

**3. 向量维度用契约层常量，不写字面量 768。**
`vector(768)` 在迁移文件里是字面量（SQL 没法引用 TS 常量），所以要在 Drizzle schema 定义处引用 `EMBEDDING_DIMENSION`，并加一个启动时的自检：查询 `information_schema` 确认实际列维度与常量一致，不一致就拒绝启动。换 embedding 模型时这个自检会立刻报警，而不是等到检索结果全是乱的。

### 向量索引

| 索引类型 | 何时用                                            |
| -------- | ------------------------------------------------- |
| 不建索引 | 切片数 < 1000。全表扫描更快且召回 100% 精确       |
| HNSW     | 切片数 > 1000。查询快、召回好，但建索引慢、占内存 |
| IVFFlat  | 数据量极大时。本项目达不到                        |

**第一阶段不建向量索引。** 个人知识库几百个切片，顺序扫描是毫秒级。等 `18` 的评测数据显示检索变慢了再加 HNSW，并且要对比加索引前后的召回率差异——这个对比本身就是很好的项目素材。

距离算子选 `<=>`（余弦距离），因为 nomic-embed-text 输出的是归一化向量。

### 技术选型增量

- `drizzle-orm` `0.45.x`：锁定小版本；`vector()` 与 `cosineDistance()` 走官方 pg-core，不另装 `pgvector` npm 适配器。
- `pg` `8.x` + `@types/pg`：Node 驱动。连接串只读 `DATABASE_URL`。
- `drizzle-kit` `0.31.x`：只使用 `generate` + `migrate`，不用 `push`。

## 第三部分：Drizzle 接入

### 为什么是 Drizzle

| 候选                | 评估                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Drizzle**（选中） | 对 pgvector 有一等支持（`vector()` 列类型、`cosineDistance()` 函数）；生成的 SQL 与写的代码几乎一一对应，学得到真东西；类型推导好 |
| Prisma              | 生态最成熟，但 vector 类型要走 `Unsupported` + raw query 绕行，正是本项目最核心的场景                                             |
| TypeORM             | NestJS 官方文档默认搭配，但装饰器式 entity 与契约层的 zod schema 风格割裂                                                         |
| 裸 pg + 手写 SQL    | 学得最多，但迁移管理要自己造，不划算                                                                                              |

### 关键约定

- schema 定义在 `servers/.../src/database/schema/`，按领域分文件。
- 迁移用 `drizzle-kit generate` 生成，**产物提交入库**，且**不允许手改已提交的迁移文件**（会导致别人的数据库状态与迁移历史不一致）。
- 不用 `drizzle-kit push`（直接同步 schema 不留迁移记录），只用 `generate` + `migrate`。
- Repository 层封装查询，Service 不直接写 Drizzle 查询。这样换 ORM 或加缓存时影响面可控。
- 集成测试用事务回滚隔离：每个测试开事务、跑断言、回滚。比每次清库快得多。

### 存储 schema 与契约 schema 故意不复用

`documents` 表有 `error`、`status`、`created_at` 等内部字段，API 响应不该全暴露。Service 层显式做转换。多写一层映射代码换来的是：改数据库不影响 API 契约。

## 实施步骤

1. 安装 Docker Desktop，`docker --version` 通过。
2. 写 `docker/docker-compose.yml` 与 `docker/init/01-extensions.sql`。
3. `docker compose up -d --wait`，进 psql 执行 `SELECT extversion FROM pg_extension WHERE extname='vector';` 确认扩展就绪。
4. `.gitignore` 加 `docker/data/`。**先做这一步再启动数据库**，否则几百 MB 数据文件会被 git 跟踪。
5. 装 Drizzle：`drizzle-orm`、`pg`，dev 依赖 `drizzle-kit`、`@types/pg`。
6. 写 `drizzle.config.ts`，连接串从环境变量读。
7. 按领域写 schema 文件，先写 `datasets` / `documents` / `chunks`（RAG 要用），其余随功能补。
8. `pnpm db:generate` 生成首个迁移，检查生成的 SQL 是否符合预期（尤其 vector 列）。
9. `pnpm db:migrate` 应用，进 psql 用 `\d chunks` 确认表结构。
10. 实现 NestJS `DatabaseModule`（连接池、优雅关闭、启动时的向量维度自检）。
11. 实现 `PgVectorStore` 替换 `MemoryVectorStore`，接口与 `06` 约定。
12. 写集成测试：插入向量、相似度检索、维度不匹配报错。

## 目录产出

```
docker/
├── docker-compose.yml
├── init/01-extensions.sql
└── data/                        # gitignore
servers/liangzui-ai-server/
├── drizzle.config.ts
├── drizzle/                     # 生成的迁移，入库
└── src/database/
    ├── database.module.ts
    ├── schema/{index,knowledge,chat,workflow,agent}.ts
    └── repositories/
```

## 验收标准（DoD）

- [x] `docker compose up -d --wait` 后 `docker compose ps` 显示 healthy
- [x] psql 里 `SELECT extversion FROM pg_extension WHERE extname='vector';` 有结果（0.8.6）
- [x] `docker compose down && docker compose up -d` 后 `chunks` 表仍在（卷持久化生效）
- [x] `git status` 里看不到 `docker/data/`（已在 `.gitignore`）
- [x] 首个迁移含 `vector` 扩展与 `chunks.embedding vector(768)`，空库可 `pnpm db:migrate`
- [x] 契约维度与 schema 常量由单测锁死；`vector(512)` 自检必须失败
- [x] 相似度检索集成测试使用 `withTransaction` 回滚隔离（本机 3 条通过）
- [x] `rag.ts` 改为 `VectorStore`（生产 `PgVectorStore`，测试无库时内存实现）

## 验证命令

```bash
# Docker
docker --version
cd docker && docker compose up -d --wait && docker compose ps

# 扩展与表结构
docker compose exec postgres psql -U ai_engine -d ai_engine \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
docker compose exec postgres psql -U ai_engine -d ai_engine -c "\d chunks"

# 迁移
pnpm db:generate
pnpm db:migrate
pnpm db:studio                 # Drizzle Studio 可视化查看

# 持久化验证
docker compose down && docker compose up -d --wait
docker compose exec postgres psql -U ai_engine -d ai_engine -c "SELECT count(*) FROM chunks;"

# 集成测试
pnpm test --filter liangzui-ai-server -- database

# 手写一次向量检索，确认算子可用
docker compose exec postgres psql -U ai_engine -d ai_engine -c \
  "SELECT id, embedding <=> '[0,0,0]'::vector AS dist FROM chunks ORDER BY dist LIMIT 3;"
```

## 风险与备选

| 风险                                              | 处置                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Docker Desktop 在 Apple Silicon 上占资源多        | 在 Docker 设置里限制内存到 4GB；只跑 Postgres 一个容器，不额外起 pgAdmin（用 Drizzle Studio 或 TablePlus 代替） |
| `docker/init/*.sql` 改了不生效                    | 这是预期行为（只在空卷时执行）。要生效必须 `down -v`。开发期数据无价值，直接重建                                |
| pgvector 镜像的 pg 大版本与本地 psql 客户端不匹配 | 统一用 `docker compose exec` 进容器内的 psql，不依赖宿主机客户端                                                |
| 迁移在开发中反复改，历史很脏                      | M1 阶段允许删掉整个 `drizzle/` 重新生成（此时无真实数据）。M2 之后禁止，只能追加                                |
| Drizzle 对 pgvector 的 API 在版本间变化           | `drizzle-orm` 锁定小版本；升级前先在集成测试里验证 `cosineDistance` 行为                                        |
| 忘了先加 .gitignore，数据文件已被跟踪             | `git rm -r --cached docker/data` 后重新提交                                                                     |
