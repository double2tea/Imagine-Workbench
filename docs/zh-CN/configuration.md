# 配置说明

[English](../configuration.md) | [简体中文](configuration.md)

Imagine Workbench 可以从 `.env.local` 或应用内 Settings 面板读取供应商密钥。环境变量适合本地开发、服务端部署，以及面向插件的 API 路由。

先复制示例文件：

```bash
cp .env.example .env.local
```

## 供应商密钥

```bash
TWELVE_AI_API_KEY="sk_your_12ai_key"
TWELVE_AI_BASE_URL="https://cdn.12ai.org"
TWELVE_AI_VIDEO_BASE_URL="https://new.12ai.org"

GROK2API_API_KEY="your_grok2api_key"
GROK2API_BASE_URL="http://localhost:8000"

AGNES_AI_API_KEY="your_agnes_ai_key"
AGNES_AI_BASE_URL="https://apihub.agnes-ai.com"

MODELSCOPE_API_KEY="ms_your_modelscope_token"
MODELSCOPE_BASE_URL="https://api-inference.modelscope.cn"

RUNNINGHUB_API_KEY="your_runninghub_api_key"
RUNNINGHUB_BASE_URL="https://www.runninghub.cn"

MIMO_API_KEY="your_mimo_api_key"
MIMO_BASE_URL="https://api.xiaomimimo.com"
```

## OpenAI 兼容网关保护

公共或团队部署建议设置：

```bash
OPENAI_COMPAT_API_KEY="local_gateway_key"
```

设置后，外部调用者必须发送：

```http
Authorization: Bearer local_gateway_key
```

这个网关密钥只用于保护 Workbench 的 `/v1/*` 路由，不会作为上游供应商密钥转发。

## 应用内设置

Settings 面板包含：

- `连接`：供应商密钥、模型列表和连接检查。
- `功能模型`：各功能的模型选择。
- `数据`：浏览器工作区备份/恢复/清理；启用团队模式后，也会显示 PostgreSQL 团队状态、迁移、成员、备份、恢复、导入和维护操作。

生成素材和画布默认存储在浏览器 IndexedDB。供应商密钥导出是显式操作，默认关闭。

## 存储目标

默认工作区存储是浏览器存储：

- 生成媒体、媒体元数据、素材库、生成任务和 board 使用 IndexedDB；
- 供应商密钥、模型缓存、UI 偏好和 Agent 会话快照使用浏览器 `localStorage`；
- 工作区备份与恢复通过显式 ZIP 导出/导入完成。

PostgreSQL 团队存储需要显式启用：

```bash
IMAGINE_STORAGE_TARGET="postgres"
DATABASE_URL="postgresql://imagine:replace_with_password@db:5432/imagine_workbench"
IMAGINE_MEDIA_DIR="/data/imagine-media"
IMAGINE_MAX_MEDIA_PAYLOAD_BYTES="536870912"
IMAGINE_TEAM_SETUP_TOKEN="replace_with_a_long_random_setup_token"
IMAGINE_TEAM_SECRET_ENCRYPTION_KEY="replace_with_a_long_random_workspace_secret_key"
APP_URL="http://localhost:3000"
IMAGINE_TRUSTED_ORIGINS="http://localhost:3000"
```

团队模式还支持 `IMAGINE_MEDIA_USAGE_WARNING_BYTES` 和 PostgreSQL 连接池/超时设置。详见[数据存储](data-storage.md)和[本地团队部署](deployment/team-local.md)。
