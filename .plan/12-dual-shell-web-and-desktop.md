# 12 · 双端架构：一套业务代码跑 Web 与 Tauri

| 项       | 值                                        |
| -------- | ----------------------------------------- |
| 阶段     | M5 · 双端交付（但**要在 M0 就打好地基**） |
| 依赖     | 02                                        |
| 预计工期 | 3～4 天                                   |
| 状态     | 未开始                                    |

## 重要：这个 plan 的时间安排是反直觉的

它编号在 12，但**平台适配层的接口必须在 M0（`02` 之后）就定义好**，各功能 plan 从一开始就依赖接口而不是直接调平台 API。

否则等到 M5 才做双端，前面写的所有业务代码里都散落着 `invoke()` 和 `localStorage`，改造工作量会是从零做的三倍。

**所以拆成两个阶段：**

| 阶段 | 何时          | 内容                                                             |
| ---- | ------------- | ---------------------------------------------------------------- |
| 12-A | M0，紧跟 `02` | 定义 `packages/platform` 接口 + 两套实现骨架（可以先是简陋实现） |
| 12-B | M5            | 补全实现、Web 壳落地、两端体验打磨                               |

## 目标

`packages/app-core` 里的业务代码在两个壳里跑，零改动。差异全部收敛在 `packages/platform`。

## 平台能力清单

| 能力         | 接口                                       | Web 实现                                           | Tauri 实现                                |
| ------------ | ------------------------------------------ | -------------------------------------------------- | ----------------------------------------- |
| 选择目录     | `pickDirectory(): Promise<string \| null>` | 弹自定义对话框让用户输入路径（服务端校验白名单内） | `plugin-dialog` 原生目录选择              |
| 选择文件     | `pickFiles(opts): Promise<FileRef[]>`      | `<input type="file">`                              | `plugin-dialog`                           |
| 本地键值存储 | `kv.get/set/remove`                        | `localStorage`                                     | Rust 侧 SQLite（`plugin-sql` 或自写命令） |
| 后端基址     | `getApiBaseUrl(): string`                  | 环境变量 / 同源                                    | 从设置读，用户可配                        |
| 打开外部链接 | `openExternal(url)`                        | `window.open`                                      | `plugin-opener`（已装）                   |
| 应用信息     | `getAppInfo()`                             | 版本号来自构建注入                                 | Tauri API                                 |
| 窗口控制     | `window.minimize/maximize/close`           | 空实现（浏览器不支持）                             | Tauri window API                          |
| 系统主题     | `getSystemTheme()` / 订阅变化              | `matchMedia`                                       | Tauri theme API                           |

### 接口设计原则

**不要把接口设计成平台 API 的最小公约数，也不要设计成某一端的形状。** 按业务需要什么来设计。

```ts
// ❌ 泄漏了 Tauri 概念，Web 端实现起来很别扭
interface Platform {
  invoke(cmd: string, args: unknown): Promise<unknown>;
}

// ❌ 泄漏了 Web 概念
interface Platform {
  localStorage: Storage;
}

// ✅ 业务语义的接口，两端都能自然实现
interface Platform {
  pickDirectory(): Promise<string | null>;
  kv: KeyValueStore;
  getApiBaseUrl(): string;
}
```

**窗口控制这类 Web 端做不到的能力**，接口上要能表达"不支持"：

```ts
interface Platform {
  readonly capabilities: {
    nativeDirectoryPicker: boolean;
    windowControls: boolean;
  };
  // ...
}
```

业务代码查 `capabilities` 决定是否渲染某个按钮，而不是判断 `isTauri`。这样将来加第三个壳（比如 VS Code 插件）也不用改业务代码。

### 注入方式

React Context + 一个 `usePlatform()` hook。壳在最外层注入实现：

```tsx
// clients/liangzui-ai-app/src/main.tsx
<PlatformProvider value={createTauriPlatform()}>
  <App />
</PlatformProvider>

// frontend/liangzui-ai-web/src/main.tsx
<PlatformProvider value={createWebPlatform()}>
  <App />
</PlatformProvider>
```

`App` 组件本身来自 `packages/app-core`，两个壳共用。

### 用 ESLint 强制约束

`02` 里已经规定用 `no-restricted-imports` 禁止 `packages/app-core` 引入 `@tauri-apps/*`。这条规则是这套架构的生命线——**没有它，几个月后一定会有人（包括你自己）图省事直接 import**。

同样禁止 app-core 引入 Node 内置模块与 `window.__TAURI__`。

## Web 壳落地

`frontend/liangzui-ai-web/` 是一个标准的 Vite + React 应用：

| 文件              | 内容                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `vite.config.ts`  | React 插件、Tailwind 插件、路径别名、端口 5173、`/api` 代理到 3000 |
| `index.html`      | 挂载点                                                             |
| `src/main.tsx`    | 注入 web platform + Provider 装配                                  |
| `src/platform.ts` | `createWebPlatform()`                                              |

**与 Tauri 壳的配置差异**要尽量小。可以抽一个 `packages/vite-config` 共享基础配置（如果发现重复够多再抽，不要过早）。

## Tauri 壳改造

现状是官方模板示例页。改造内容：

1. `src/App.tsx` 替换为路由 + Provider 装配（业务组件来自 app-core）
2. `src-tauri/src/commands.rs` 的 `greet`/`say_hello` 替换为真实平台能力命令
3. 按需装插件：`plugin-dialog`（目录选择）、`plugin-sql`（本地 KV）
4. `capabilities/default.json` 补权限声明
5. 设置页：后端地址与端口配置（这是你要的"可配置连接本地端口"）
6. 删掉示例资源（`App.css` 里的模板样式、`assets/react.svg`、`public/tauri.svg`）

### 后端地址配置

桌面端的核心需求。设计：

| 项       | 做法                                            |
| -------- | ----------------------------------------------- |
| 存储     | Rust 侧 SQLite，key `apiBaseUrl`                |
| 默认值   | `http://localhost:3000`                         |
| 设置页   | 输入框 + 「测试连接」按钮（调后端健康检查接口） |
| 连接失败 | 首屏显示引导页：说明需要先启动后端，给出命令    |
| 变更后   | 清空 TanStack Query 缓存并重新拉取              |

「测试连接」按钮不是装饰。用户配错端口时，一个明确的"连接失败：无法访问 http://localhost:3001"比整个应用白屏要好得多。

## 路由

两端共用 React Router。桌面端用 hash 路由或 memory 路由（避免 file:// 协议下 history 路由的问题），Web 端用 history 路由。这个差异也走 platform 的 capabilities。

页面清单：

```
/                    重定向到 /chat
/chat                对话助手（07）
/chat/:sessionId
/knowledge           知识库列表（06）
/knowledge/:id       知识库详情
/workflow            工作流列表（08/09）
/workflow/:id        工作流编辑器
/agent               文件助手（10）
/agent/:sessionId
/settings            设置（后端地址、主题、MCP 配置）
```

## 实施步骤

### 12-A（M0 阶段做）

1. 建 `packages/platform`，定义接口与 `capabilities` 类型。
2. 实现 `createWebPlatform()`（localStorage + 简易实现）。
3. 实现 `createTauriPlatform()` 骨架（先只实现 KV 与 openExternal，其余抛"未实现"）。
4. 实现 `PlatformProvider` + `usePlatform()`。
5. 配好 ESLint 的 `no-restricted-imports` 护栏并验证它真的会报错。

### 12-B（M5 阶段做）

6. 建 `frontend/liangzui-ai-web` 的 Vite 骨架。
7. `packages/app-core` 抽出共用的 `App` 组件（路由 + Provider 装配）。
8. 两个壳都改为挂载 app-core 的 `App`。
9. 补全 Tauri 侧的平台能力实现（目录选择、SQLite KV）。
10. Tauri 设置页：后端地址配置 + 测试连接 + 引导页。
11. 清理 Tauri 模板残留资源。
12. 两端逐页面走查，修差异。
13. 加 E2E：Web 端的关键路径。

## 验收标准（DoD）

- [ ] `packages/app-core` 里搜不到 `@tauri-apps`、`window.__TAURI__`、`localStorage`
- [ ] 故意在 app-core 里加一行 `import { invoke } from '@tauri-apps/api/core'`，`pnpm lint` 报错
- [ ] `pnpm dev:web` 起浏览器版，四个页面都能打开并正常使用
- [ ] `pnpm dev:app` 起桌面版，四个页面表现一致
- [ ] 桌面端设置页改后端端口为错误值，显示明确的连接失败提示（不白屏）
- [ ] 桌面端「测试连接」按钮工作正常
- [ ] 桌面端点击目录选择，弹出**原生**对话框
- [ ] Web 端点击目录选择，弹出输入对话框（不报错、不空白）
- [ ] Web 端不显示窗口控制按钮（capabilities 生效）
- [ ] 桌面端重启后，配置的后端地址与主题设置仍保留
- [ ] 两端的业务代码 diff：`packages/app-core` 零差异（同一份代码）

## 验证命令

```bash
# 架构护栏（应报错）
echo "import { invoke } from '@tauri-apps/api/core';" >> packages/app-core/src/index.ts
pnpm lint --filter @ai-engine/app-core
git checkout packages/app-core/src/index.ts

# 平台专有 API 泄漏检查（应无输出）
grep -rn "@tauri-apps" packages/app-core/src/ || echo "OK: 无 Tauri 依赖"
grep -rn "localStorage" packages/app-core/src/ || echo "OK: 无直接 localStorage"

# 两端启动
pnpm dev:server           # 终端 1
pnpm dev:web              # 终端 2 → http://localhost:5173
pnpm dev:app              # 终端 3 → Tauri 窗口

# Web 端构建
pnpm build --filter liangzui-ai-web
pnpm preview --filter liangzui-ai-web

# Rust 侧检查
cd clients/liangzui-ai-app/src-tauri
cargo fmt --check && cargo clippy -- -D warnings

# E2E
pnpm test:e2e
```

## 风险与备选

| 风险                                                     | 处置                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 抽象层设计不当，某个能力两端语义差太远                   | 允许该能力在接口上标为"可选"（`capabilities` 里声明不支持），业务代码降级处理。不要为了统一硬凑一个别扭的接口                           |
| Tauri 的 `plugin-sql` 引入 Rust 依赖，编译变慢           | 备选：不用 plugin-sql，自写一个 Rust 命令用 `rusqlite` 存 KV。KV 需求很简单，一张两列的表就够                                           |
| 桌面端 hash 路由的 URL 很丑                              | 桌面端 URL 用户看不到，无所谓。不要为此折腾 Tauri 的自定义协议                                                                          |
| Web 端因为没有原生能力，某些功能不可用                   | 明确在 README 的功能对照表里写清"Web 端 / 桌面端"各支持什么。这是诚实的产品说明，不是缺陷                                               |
| 两个 Vite 配置逐渐漂移                                   | 抽 `packages/vite-config` 共享。但等真的出现三处以上重复再抽                                                                            |
| M0 只做骨架，M5 才补全，中间业务代码可能误用未实现的能力 | 骨架里未实现的方法**抛明确错误**（`NotImplementedError: pickDirectory 在 Tauri 端尚未实现，见 plan 12-B`），不要返回 undefined 静默失败 |
