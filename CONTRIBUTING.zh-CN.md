# 贡献指南

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

感谢你愿意改进 Imagine Workbench。

## 开始之前

- 较大的行为变更或供应商集成，请先创建 issue 讨论。
- 保持改动聚焦，避免无关重构。
- 遵循 `docs/zh-CN/development.md` 中的模块边界。
- 不要提交供应商密钥、本地 `.env*` 文件、生成构建产物或私有规划/工作流目录。

## 本地开发

```bash
corepack enable
corepack prepare pnpm@10.27.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run dev
```

## 质量检查

提交 pull request 前，请运行最小必要检查：

```bash
pnpm run lint
pnpm run typecheck
pnpm run check
```

供应商适配器变更还应运行：

```bash
pnpm run test:providers
```

## Pull Request 检查清单

- 改动范围聚焦在请求的行为上。
- 公开行为变化时，同步更新 README/docs。
- 不包含密钥、本地缓存或私有工作流文件。
- 新供应商行为默认放在 `lib/providers/*`，除非 UI 需要直接变化。
- 破坏性或不可逆 UI 操作使用现有 confirm/alert 模式。
