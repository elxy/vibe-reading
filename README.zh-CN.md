# Vibe Reading

Vibe Reading 是一个用于网页阅读、翻译和语言学习的浏览器扩展。配置保存在本地，AI 或翻译能力由用户自行配置的服务商和 API Key 提供。

本扩展不依赖项目自建后端。需要网络服务的功能，例如 AI 翻译，会直接使用用户配置的服务商端点。

## 功能

- 网页翻译，支持双语对照和仅译文模式。
- 划词翻译、解释和朗读。
- 基于页面内容的上下文感知 AI 翻译。
- YouTube 字幕翻译。
- 自定义 AI 动作和 Prompt 配置。
- 本地配置导入/导出。

## 开发

```bash
pnpm install
SKIP_FREE_API=true pnpm test
pnpm type-check
pnpm build
```

`src/utils/host/translate/api/__tests__/free-api.test.ts` 依赖真实外部翻译服务。本地验证时请设置 `SKIP_FREE_API=true`。

## 授权与致谢

Vibe Reading 修改自 [Read Frog](https://github.com/mengxi-ream/read-frog)。感谢 Read Frog 的作者和贡献者提供原始 GPL 授权作品。

本项目按 GNU General Public License version 3 分发，完整许可证见 [LICENSE](./LICENSE)。作为修改版本，Vibe Reading 遵守 GPLv3 条款，继续以同一许可证提供源码，并明确标记本 fork 已发生修改，避免将本 fork 的问题归因于上游项目。
