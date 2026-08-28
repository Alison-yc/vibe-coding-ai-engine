# 14 · 设计系统与多主题

| 项       | 值                                                                 |
| -------- | ------------------------------------------------------------------ |
| 阶段     | M0 起步（令牌层），随功能增量补组件                                |
| 依赖     | 14-A：02、12-A；14-B：对应功能 plan；14-C：ADR-016、12 locale 接口 |
| 预计工期 | 令牌层 1～2 天；组件随功能开发                                     |
| 状态     | 已完成                                                             |

## 子阶段状态

| 子阶段 | 内容                                                | 所属批次                   | 状态   |
| ------ | --------------------------------------------------- | -------------------------- | ------ |
| 14-A   | 共享 UI 包、Tailwind 跨包扫描、主题令牌、令牌展示页 | CR-03                      | 已完成 |
| 14-B   | 按真实页面需求增量补 shadcn/业务组合组件            | CR-10、CR-12、CR-13、CR-15 | 已完成 |
| 14-C   | 界面 i18n 与抗撑布局                                | CR-I18N-A / CR-I18N-B      | 已完成 |

14-B 不建立单独的大批次。组件必须跟使用它的功能一起 Review，避免预造没有调用方的抽象。

## 技术选型（14-A）

| 工具                     | 版本    | 说明                             |
| ------------------------ | ------- | -------------------------------- |
| Tailwind CSS             | 4.3.x   | 壳与 UI 包共用，跨包用 `@source` |
| class-variance-authority | 0.7.x   | shadcn 变体                      |
| clsx + tailwind-merge    | 2.x/3.x | `cn()`                           |
| @radix-ui/react-slot     | 1.x     | Button `asChild`                 |
| lucide-react             | 1.x     | 图标，尺寸只用 16/20/24          |

`Select` 不使用系统原生下拉（macOS 会遮住触发按钮）。用自绘 listbox：触发按钮 + `absolute top-full` 面板，API 仍兼容 `<option>` 与 `onChange(event.target.value)`。

不在本批次批量安装 shadcn 全家桶。

### 技术选型（14-C · 国际化）

登记于 ADR-016。安装时以 npm 当时最新兼容版为准，跨大版本先评估。

| 包              | 版本带 | 用途                                 |
| --------------- | ------ | ------------------------------------ |
| `i18next`       | 26.x   | 资源、插值、回退                     |
| `react-i18next` | 17.x   | `useTranslation` / `I18nextProvider` |

**不装**：`i18next-http-backend`（本地打包 JSON，禁止运行时拉文案）、`i18next-browser-languagedetector`（默认必须是 `zh-CN`，不能跟 OS 走）、FormatJS / Lingui / next-intl。

资源放 `packages/app-core/src/i18n/locales/<locale>/<ns>.json`，三份 locale 的 key 树必须全等。默认回退 `zh-CN`。复数用 i18next 内置，首批不引入 ICU 插件。

## 目标

建立 `packages/ui`：shadcn 基础组件 + 主题令牌系统，支持亮/暗模式与多套主题色。要求"逻辑清晰美观、符合大众前端审美"。

**关键时序**：令牌层必须在写第一个业务页面之前建好。否则页面里会写满 `bg-neutral-900`、`text-[#333]` 这类硬编码色值，后面加主题时要全部返工。

## 现状

`clients/liangzui-ai-app` 已装 shadcn（`components.json`：new-york 风格、neutral 基色、CSS variables 模式），有一个 `button.tsx`。Tailwind 是 v4（`@tailwindcss/vite` 4.3.3）。

需要做的是把它从"单应用内的 shadcn"提升为"共享 UI 包"。

## Tailwind v4 的关键差异

v4 与 v3 的配置方式完全不同，网上大量教程还是 v3 的写法，照抄会踩坑：

| 项         | v3                                    | v4                                                    |
| ---------- | ------------------------------------- | ----------------------------------------------------- |
| 配置位置   | `tailwind.config.js`                  | CSS 里的 `@theme` 指令                                |
| 引入方式   | `@tailwind base/components/utilities` | `@import "tailwindcss"`                               |
| 自定义颜色 | config 里的 `theme.extend.colors`     | `@theme { --color-brand: ...; }`                      |
| 内容扫描   | `content: [...]` 手动配               | 自动检测（但**monorepo 跨包需要显式声明 `@source`**） |

**monorepo 里最容易踩的坑**：`packages/ui` 和 `packages/app-core` 里的 class 不会被壳应用自动扫描到，导致样式丢失。必须在壳的 CSS 里加：

```css
@import 'tailwindcss';
@source '../../../packages/ui/src';
@source '../../../packages/app-core/src';
```

## 令牌体系（三层）

```
第 1 层：原始色板       --brand-500, --gray-800 ...
   ↓
第 2 层：语义令牌       --background, --foreground, --primary, --muted ...
   ↓
第 3 层：组件消费       bg-background, text-muted-foreground
```

**业务代码只允许用第 3 层。** 这是多主题能生效的唯一前提。

### 语义令牌清单

沿用 shadcn 的标准命名（生态兼容，新增组件直接可用）：

```
背景类：background / card / popover / muted / accent
前景类：foreground / card-foreground / muted-foreground / accent-foreground
交互类：primary / primary-foreground / secondary / destructive
边框类：border / input / ring
图表类：chart-1 ~ chart-5
```

本项目额外需要的语义令牌：

```
工作流节点状态：node-idle / node-running / node-success / node-error
工具调用状态：  tool-pending / tool-running / tool-success / tool-error
代码块：        code-bg / code-border
引用：          citation-bg / citation-border
```

这些也必须是令牌而不是硬编码，否则暗色模式下节点高亮的颜色会很难看。

### 多主题实现

用 `data-theme` 属性 + CSS 变量覆盖，配合 `.dark` 类控制明暗：

```css
:root {
  /* 默认主题亮色令牌 */
}
.dark {
  /* 默认主题暗色令牌 */
}
[data-theme='blue'] {
  /* 蓝色主题亮色 */
}
[data-theme='blue'].dark {
  /* 蓝色主题暗色 */
}
```

主题切换 = 改 `<html>` 的 `data-theme` 与 `dark` class。

预设主题：默认（neutral）、蓝、绿、紫。四套够展示能力，不要做十套。

**明暗模式的三态**：亮 / 暗 / 跟随系统。跟随系统要订阅 `matchMedia` 变化（走 `packages/platform` 的 `getSystemTheme`）。

### 避免首屏闪白

主题从持久化存储读，读取是异步的（Tauri 侧走 SQLite）。如果等 React 挂载后才应用主题，会先闪一下亮色。

处置：在 `index.html` 里内联一段同步脚本，从 `localStorage`（Web）读主题并立刻设置 `<html>` 的 class。Tauri 侧同样在 KV 里冗余存一份到 localStorage 供首屏使用。

## 组件分层

```
packages/ui/src/
├── styles/
│   ├── tokens.css         # 三层令牌定义
│   └── themes.css         # 四套主题
├── components/ui/         # shadcn 原语（button/input/dialog/...）
├── components/composite/  # 本项目的通用组合组件
│   ├── markdown-renderer.tsx      # 07/10 共用
│   ├── stream-text.tsx            # 流式文本（含节流）
│   ├── status-badge.tsx           # 状态徽章（节点/工具共用）
│   ├── empty-state.tsx
│   ├── error-state.tsx            # 带"检查 Ollama 是否启动"这类可操作提示
│   └── copy-button.tsx
└── lib/utils.ts           # cn()
```

**`composite` 层的组件不含业务语义。** `MarkdownRenderer` 不知道自己在渲染对话消息还是节点输出。业务语义组件（`ChatMessage`、`WorkflowNodePanel`）属于 `packages/app-core`。

## 需要的 shadcn 组件清单

按功能页面倒推，一次性装好，避免开发中断：

| 页面   | 需要的组件                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 通用   | button, input, textarea, label, card, separator, scroll-area, tooltip, dropdown-menu, dialog, sheet, tabs, badge, skeleton, sonner(toast) |
| 对话页 | avatar, collapsible, hover-card                                                                                                           |
| 知识库 | table, progress, select, slider, alert                                                                                                    |
| 工作流 | resizable, command(节点搜索), popover, switch, accordion                                                                                  |
| 设置页 | radio-group, form                                                                                                                         |

## 视觉规范（避免"AI 味"界面）

具体的、可执行的约束：

| 项       | 规范                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 间距     | 只用 4 的倍数（Tailwind 的 1/2/3/4/6/8/12/16）                                     |
| 圆角     | 统一用令牌 `--radius`，不混用 `rounded-md` 和 `rounded-lg`                         |
| 阴影     | 克制。卡片用 `shadow-sm`，浮层用 `shadow-md`，不用更重的                           |
| 字号层级 | 最多 4 级：`text-xs`(辅助) / `text-sm`(正文) / `text-base`(强调) / `text-lg`(标题) |
| 边框     | 优先用边框而不是阴影划分区域，界面更清晰                                           |
| 渐变     | 不用。渐变是"AI 生成界面"最明显的标志                                              |
| 图标     | 统一 lucide-react，尺寸只用 16/20/24                                               |
| 动效     | 只在状态转换处用，时长 150～200ms。运行中的呼吸动画除外                            |
| 空态     | 每个列表页都要有空态设计，含引导操作按钮                                           |

## 实施步骤

### 14-A · CR-03 令牌底座

1. 建 `packages/ui`，配 `package.json` 的 `exports`（分 `./styles` 与 `./components`）。
2. 写 `tokens.css` 三层令牌 + `themes.css` 四套主题。
3. 把现有 button 与 `lib/utils.ts` 迁到 `packages/ui`，不批量安装未来组件。
4. 配 `components.json` 指向 `packages/ui`，验证 shadcn 能生成到正确位置；验证后删除未使用的测试组件。
5. 在两个壳的 CSS 里配 `@source` 指向跨包目录，验证跨包 class 不丢失。
6. 实现 `ThemeProvider`、`ThemeToggle` 与防闪白脚本。
7. 建 `/dev/tokens`：展示全部令牌和**当前已有组件**的主题状态。
8. 配 Playwright 并写第一条主题切换/令牌页 smoke，作为 `15-C` 的起点。

### 14-B · 随功能增量

1. 只在真实页面需要时用 shadcn CLI 增加原语组件。
2. 组合组件与使用它的页面放在同一 CR review，不提前预造。
3. 每次新增主题状态同步更新 `/dev/tokens`。
4. 工作流节点状态、列表空态等专项验收随 `09` / `07` 完成。

## 验收标准（DoD）

### 14-A

- [x] `packages/ui` 能被两个壳正常引入，样式不丢失
- [x] 跨包 class 生效验证：在 `packages/app-core` 写一个只在那里用过的 class（如 `bg-accent`），构建后样式存在
- [x] 四套主题 × 明暗 = 8 种组合，令牌与当前组件在 `/dev/tokens` 显示正常
- [x] 切换主题无闪烁，刷新页面主题保持
- [x] 「跟随系统」模式下，改系统外观，应用实时跟随
- [x] `packages/ui` 的组件不 import `app-core` 或 `contracts`（ESLint 护栏）
- [x] Playwright 的主题 smoke 在 Web 壳通过

### 14-B / 项目收尾

- [x] 全仓库搜不到硬编码色值：`grep -rE 'bg-(neutral|gray|zinc|slate)-[0-9]|text-\[#' packages/ clients/ frontend/` 无结果
- [x] 暗色模式下工作流节点的四种状态使用 `node-*` 专用令牌
- [x] 所有主列表页有空态设计与可执行引导

### 14-C · 界面国际化（CR-I18N）

目标：设置页切换中日英后，**壳层几何稳定**，观感仍走现有语义令牌，不另开一套「翻译专用」颜色或字号。

#### 入口与信息架构

- 入口只在设置页顶部、后端连接卡片之前，独立「语言 / Language / 言語」卡片。
- 使用现有 `packages/ui` 的 Select（自绘 listbox，禁止原生 `<select>` 被 macOS 挡住）。
- 选项标签固定为语言自称，不随当前 locale 改写：`中文`、`日本語`、`English`。
- 切换立即生效，刷新后仍在（`platform.kv`，key 与 contracts 常量一致，建议 `ui.locale`）。
- `html lang` 必须同步，供浏览器与系统字体栈选 CJK/拉丁字形；`dir` 恒为 `ltr`。

#### 布局硬约束（CR 必查）

这些不是审美偏好，是防返工条款。英文通常最长，**壳层按 en-US 实测最长串定宽**，中日文不得反向把容器撑得比英文更大。

| 表面               | 约束                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 顶栏 `AppNavLinks` | `flex-nowrap`；条目 `min-w-0 max-w-[9rem] truncate`（9rem 以英文 “Knowledge”/“Workflow”/“Settings” 实测为准，实现时量完再写进 class 或 token，禁止拍脑袋后不再测） |
| 页标题 `h1`        | `line-clamp-2 min-h-[1.75rem]`，不得随语言把 header 从 1 行撑成 3 行以上                                                                                           |
| 页描述             | `line-clamp-3`；允许换行，不允许撑开 `max-w-5xl` 以外                                                                                                              |
| 主按钮             | 禁止 `w-fit` 包翻译；`min-w` 取三语最长、`px` 固定；过长 `truncate` + `title`                                                                                      |
| 设置卡片           | `w-full`；内部 `flex-col`，控件 `min-w-0`，`sm:flex-row` 时输入框必须 `flex-1 min-w-0`                                                                             |
| 侧边栏（对话）     | 宽度仍由现有 layout 决定，标签 `truncate`，不得因 “Conversations” 把侧栏加宽                                                                                       |
| 工作流节点名       | I18N-B 才翻显示名；节点几何与 `type` id 不变                                                                                                                       |

禁止用 JS 测量 DOM 再改宽度作为主方案。先 CSS 约束，测试断言 class 与「切换前后导航 `getBoundingClientRect().height` 差 ≤ 1px」（jsdom 不够则 Playwright 三语对照）。

字体：继续系统栈，不为日文单独打包字体。`lang=ja` 时依赖系统日文字形。

#### 分层与禁止项

```
contracts  localeSchema
platform   getUiLocale / setUiLocale（kv + documentElement.lang）
app-core   i18n 实例、JSON、页面 t()
ui         零文案
server     I18N-A 零改动
```

- 不要翻译：模型 id、工具 `name`、路径、traceId、评测报告、README 安装命令、`.plan/`。
- 不要用字符串拼接句子（`t('a') + name + t('b')`）；用插值 `t('key', { name })`。
- 不要把 `t()` 放进 `packages/ui`。
- 不要在 `app-core` 写 `window` / `document` / `localStorage`。

#### 实施步骤（开发令下达后才执行）

**I18N-A（本批次可开工的全部）**

1. contracts：`uiLocaleSchema`、`UI_LOCALE_STORAGE_KEY`。
2. platform 接口 + web/tauri 实现：读写 locale、写 `document.documentElement.lang`；单测 mock。
3. `app-core` 初始化 i18next（资源静态 import），Provider 包在现有 App 内。
4. 设置页语言卡片 + 顶栏/PageShell 默认文案走 `common` 命名空间。
5. 按上表给导航、标题、设置页主按钮加上抗撑 class。
6. 三语 JSON key 树全等测试；切换 locale 的组件测试；Playwright：设置页改语言后 heading 变为英文/日文，导航高度不跳。
7. 现有 E2E 里写死「设置」「对话」的，改为 `data-testid` 或当前 locale 夹具（默认仍 zh-CN，中文 E2E 保持绿）。

**I18N-B（禁止与 A 同一 CR）**

8. 对话、知识库、工作流、错误页、空态、审批文案。
9. 已知 API 中文错误映射表（有 code 用 code，无 code 则保持原文并记录缺口，禁止猜测翻译服务端所有字符串）。

#### 14-C DoD

- [x] 设置页可切换三种语言，刷新保持
- [x] 两端 `html[lang]` 与所选 locale 一致
- [x] 三份 JSON key 集合全等，缺 key 测试失败
- [x] 1280 与 375 视口下，zh→en→ja 顶栏高度变化 ≤ 1px（Playwright）
- [x] 设置页卡片宽度不随语言增加（对 `main` 或 card `width` 断言）
- [x] `packages/ui` 零文案；`packages/app-core` 生产代码无新增平台 API（测试仅断言 `html` 同步）
- [x] 未翻译 NestJS、未改模型提示词
- [x] `pnpm ci:local` 绿

CR-I18N-B 已通过（2026-08-28）。审查确认 API code 映射真实进入业务错误链路，未知服务端文案保持原文；工作流日志切语言一致，测试实例隔离，375px 英文画布工具条可访问且页面无横向溢出。三语资源 key 树、全量 E2E 与 `pnpm ci:local` 均通过。

#### CR 排查步骤（审查时按此勾，不改代码）

1. **对照 ADR-016**：依赖是否只登记了 i18next / react-i18next；有无 languagedetector / http-backend。
2. **入口**：设置页是否在 MCP 卡片之前；有无第二入口藏在聊天顶栏（本批次不应有）。
3. **分层**：`grep -n "useTranslation\\|i18next" packages/ui` 应无；`grep document\\|localStorage packages/app-core/src` 应无新增。
4. **key 完备**：跑 locale fixture 测试；抽查 ja/en 无残留中文 UI 句子（专有名、模型 id 除外）。
5. **布局**：按 DoD 跑 Playwright 高度/宽度；用英文最长串目视导航是否截断而不是撑行。
6. **E2E**：默认中文用例仍过；另有一条显式切到 `en-US` 的设置页用例。
7. **范围**：`git diff servers/` 在 I18N-A 应为空。
8. **回退**：选一个故意删掉的 en key，界面应显示中文回退且测试应红（证明测试不是永真）。

验证命令见本文件「验证命令」节追加段。

## 验证命令

```bash
# 硬编码色值检查（应无输出）
grep -rnE 'bg-(neutral|gray|zinc|slate|stone)-[0-9]{2,3}' packages/ clients/*/src frontend/*/src
grep -rnE '(text|bg|border)-\[#[0-9a-fA-F]{3,8}\]' packages/ clients/*/src frontend/*/src

# 令牌展示页
pnpm dev:web    # → http://localhost:5173/dev/tokens

# 构建后验证跨包样式没丢
pnpm build --filter liangzui-ai-web
grep -c 'bg-accent' frontend/liangzui-ai-web/dist/assets/*.css

# shadcn 生成路径验证
pnpm dlx shadcn@latest add alert-dialog
git status    # 应出现在 packages/ui/src/components/ui/

# UI 包依赖洁癖（应无输出）
grep -rn '@ai-engine/\(app-core\|contracts\)' packages/ui/src/

pnpm test --filter @ai-engine/ui

# 14-C · i18n（开发开始后才跑）
# 三语 key 树与 locale 组件测试
pnpm --filter @ai-engine/app-core test
# 默认中文 E2E 仍绿
pnpm test:e2e -- e2e/web-smoke.spec.ts e2e/mcp.spec.ts
# 布局：切换语言后顶栏高度与卡片宽度
pnpm test:e2e -- e2e/i18n.spec.ts
```

## 风险与备选

| 风险                                          | 处置                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tailwind v4 的 `@source` 在 monorepo 里不生效 | 备选：在壳的 vite 配置里用 `@tailwindcss/vite` 的选项显式声明扫描路径。**这一项要在步骤 6 单独验证，不要等到开发后期才发现样式丢了** |
| shadcn CLI 对 monorepo 的支持不完善           | 备选：手动从 shadcn 官网复制组件代码到 `packages/ui`。反正生成后也要改                                                               |
| 四套主题下某些组合对比度不足（文字看不清）    | 用浏览器 devtools 的对比度检查，或在 `/dev/tokens` 页面加对比度数值显示。至少保证正文达到 4.5:1                                      |
| 工作流画布的连线颜色不跟随主题                | React Flow 的连线样式部分是内联 SVG 属性，要用 CSS 变量注入。这一项在 `09` 的验收里也有                                              |
| 令牌越加越多，失去约束力                      | 加令牌前先问"能不能用现有语义令牌表达"。新增前项目里搜一遍是否已有类似的                                                             |
| 英文文案把导航折成两行                        | 以 en-US 定 `max-width` + truncate；CR 用 Playwright 高度差 ≤ 1px 卡住                                                               |
| ja/en JSON 漏 key silently 回退中文           | 启动或测试比较三份 key 集合，不允许子集                                                                                              |
