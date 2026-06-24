# AGENTS.md

## 项目概述

Vibe Reading 是一个专注于网页阅读翻译的浏览器扩展，基于 WXT 框架构建。扩展不依赖项目自建后端，AI/翻译能力由用户自行配置的服务商和 API Key 提供。

**Fork 谱系**：[mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog) → [Xuanwo/vibe-reading](https://github.com/Xuanwo/vibe-reading) → [elxy/vibe-reading](https://github.com/elxy/vibe-reading)（本仓库）。为避免与上游 `Xuanwo/vibe-reading` 同名，在扩展商店以 **“Vibe Reading (fork)”** 发布。

## 技术栈

- **构建**: WXT + Vite + Nx (task caching)
- **前端**: React 19 + TypeScript 6 + Tailwind CSS v4 + shadcn/ui (base-ui)
- **状态管理**: Jotai（本地状态）+ TanStack Query（异步/缓存状态）
- **AI**: Vercel AI SDK（`@ai-sdk/openai`、`@ai-sdk/deepseek`、`@ai-sdk/openai-compatible`）
- **本地存储**: Dexie (IndexedDB) + chrome.storage
- **消息通信**: `@webext-core/messaging`
- **测试**: Vitest + jsdom + Testing Library，覆盖率用 istanbul
- **Lint**: ESLint + commitlint + husky + lint-staged
- **包管理**: pnpm 10.x

## 项目结构

```
src/
├── entrypoints/           # WXT entrypoints
│   ├── popup/             # 工具栏弹窗（语言/模型选择 + 翻译触发）
│   ├── options/           # 设置页面（Providers / Prompt / 翻译样式 / 通用）
│   ├── host.content/      # 内容脚本（DOM 翻译、快捷键绑定）
│   └── background/        # 后台 Service Worker（翻译队列、LLM 调用、数据库清理）
├── utils/
│   ├── atoms/             # Jotai atoms
│   ├── config/            # 本地配置读写
│   ├── db/dexie/          # IndexedDB 表定义
│   ├── host/translate/    # 翻译核心逻辑（api / dom / ui / core）
│   ├── providers/         # AI 服务商配置
│   └── styles/            # Tailwind 工具 + PostCSS 插件
├── components/            # shadcn/ui 组件
├── assets/                # 静态资源（providers / styles / icons）
└── definitions/           # 类型定义
```

## 开发命令

| 命令                 | 说明                  |
| -------------------- | --------------------- |
| `pnpm dev`           | 启动 Chrome 开发模式  |
| `pnpm dev:edge`      | 启动 Edge 开发模式    |
| `pnpm dev:firefox`   | 启动 Firefox 开发模式 |
| `pnpm build`         | 构建 Chrome 版本      |
| `pnpm build:firefox` | 构建 Firefox MV3 版本 |
| `pnpm test`          | 运行测试 (Vitest)     |
| `pnpm test:cov`      | 运行测试 + 覆盖率     |
| `pnpm test:watch`    | 测试监听模式          |
| `pnpm lint`          | ESLint 检查           |
| `pnpm lint:fix`      | ESLint 自动修复       |
| `pnpm type-check`    | TypeScript 类型检查   |
| `pnpm zip`           | 打包 Chrome 版本      |
| `pnpm zip:all`       | 打包所有浏览器版本    |

## 代码规范

- 遵循 antfu ESLint 配置，字符串使用**双引号**。
- Import 按以下顺序排列（case-insensitive 字母序）：
  1. setup（`@/utils/zod-config`）
  2. type-import
  3. 同类 type（parent / sibling / index / internal）
  4. builtin
  5. external（第三方包）
  6. internal（`@/` 别名）
  7. parent / sibling / index
  8. side-effect import
- 未使用的 import 会报错（`unused-imports/no-unused-imports`）。
- Promise 必须显式处理，禁止 floating promise（`@typescript-eslint/no-floating-promises`）。
- React 组件中不使用 `key` 作为显式 prop（React 19 已自动处理）。
- 测试文件遵循 `consistent-test-it`、`no-identical-title`、`prefer-hooks-on-top` 规则。
- Commit 遵循 conventional commits（`@commitlint/config-conventional`），husky + lint-staged 在提交时自动校验。

## Testing Notes

- Run the local test suite with `pnpm test`.
- 测试环境为 `node`，使用 jsdom + fake-browser 模拟浏览器扩展环境。
