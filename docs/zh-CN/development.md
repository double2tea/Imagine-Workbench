# 开发指南

[English](../development.md) | [简体中文](development.md)

## 项目结构

```text
app/                         Next.js App Router 页面和 API 路由
components/                  Workbench、board、settings、asset 和创作 UI
hooks/                       客户端工作流状态和动作 hooks
lib/                         供应商适配器、IndexedDB、board 持久化和工具函数
docs/                        公开项目文档
public/                      静态资源
tests/                       helper 和供应商行为的 Node 测试
```

关键边界：

- `app/page.tsx` 负责主工作台 shell。
- `app/board/*`、`components/board/*`、`hooks/useBoardState.ts` 和 `lib/board/*` 负责 board 工作流。
- `app/api/*` 路由应保持轻量；供应商行为放在 `lib/providers/*`。
- 生成媒体走 active storage boundary：默认使用浏览器 IndexedDB，团队模式使用 PostgreSQL 元数据和服务端媒体 payload refs。
- 主题持久化逻辑位于 `lib/theme-mode.ts`。

## 质量检查

```bash
pnpm run lint
pnpm run typecheck
pnpm run check
pnpm run test:providers
```

`pnpm run check` 包含 lint、typecheck、应用版本校验和模型能力目录校验。

## Cloudflare Pages

```bash
pnpm run pages:build
pnpm run pages:preview
pnpm run pages:deploy
```

配置 `ENABLE_CLOUDFLARE_PAGES_DEPLOY=true`、`CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 后，GitHub Actions 才会将 `main` 部署到 Cloudflare Pages。

Cloudflare Pages 只构建 browser-first 路由。构建会先隐藏 Node runtime API route 文件，运行 Pages adapter 后再在本地恢复它们；Node-only 的 provider/team API 不会包含在 Pages 输出中。
启用 workflow 或手动 Pages 部署前，先运行 `pnpm run pages:build`。

## 依赖说明

- CI 中使用 `pnpm install --frozen-lockfile`。
- 不要提交本地 `.env*`、`.next/`、`.vercel/`、`.tmp/` 或私有规划/工作流目录。
