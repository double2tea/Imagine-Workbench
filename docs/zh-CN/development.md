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

配置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 后，GitHub Actions 会将 `main` 部署到 Cloudflare Pages。

## 依赖说明

- CI 中使用 `pnpm install --frozen-lockfile`。
- 保持 `.npmrc` 和 lockfile 的 pnpm 设置一致。
- 不要提交本地 `.env*`、`.next/`、`.vercel/`、`.tmp/` 或私有规划/工作流目录。
