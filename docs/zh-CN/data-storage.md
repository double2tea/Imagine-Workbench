# 数据存储

[English](../data-storage.md) | [简体中文](data-storage.md)

Imagine Workbench 默认是浏览器优先应用，也可以显式启用基于 PostgreSQL 的局域网/自托管团队工作区。

## 存储模式

| 模式 | 使用场景 | 工作区权威存储 |
| --- | --- | --- |
| `browser` | 在线预览、单用户本地使用、普通开发 | 浏览器 IndexedDB + `localStorage` |
| `postgres` | 显式启用的局域网/自托管团队工作区 | App server + PostgreSQL + 服务端媒体卷 |

浏览器模式仍是默认模式。只有配置 `IMAGINE_STORAGE_TARGET=postgres` 以及必要的团队存储环境变量后，才会启用 PostgreSQL 模式。

## 浏览器模式

| 数据 | 存储位置 |
| --- | --- |
| 生成资产元数据 | IndexedDB `ImagineWorkbenchDB` |
| 生成媒体 payload 和预览 | IndexedDB blob/payload stores |
| Board 文档 | IndexedDB board store |
| 生成任务快照 | IndexedDB generation task store |
| 素材库记录 | IndexedDB library store |
| Settings 中保存的供应商密钥 | 浏览器 `localStorage` |
| 模型缓存、UI 偏好、Agent 会话快照 | 浏览器 `localStorage` |
| 安全快照 | 单独的浏览器 IndexedDB safety database |

这意味着在线预览站点并没有一个共享服务端数据库保存所有用户素材。清理浏览器数据可能删除本地工作区，除非用户提前导出了备份。

## PostgreSQL 团队模式

PostgreSQL 团队模式把共享工作区记录存入 PostgreSQL，把媒体字节存放在服务端媒体卷中，并通过安全 payload ref 引用。

已实现的团队存储能力包括：

- 首个 owner 引导、登录会话、CSRF/origin 校验，以及 owner/admin/editor/viewer 角色权限；
- 共享素材、payload refs、预览、素材库记录、boards、生成任务、提示词模板、声音档案、安全快照和非密钥设置；
- 加密的团队工作区密钥，以及保存的 RunningHub/供应商目标；
- 版本化 schema migrations、schema health、有界 PostgreSQL 连接池配置，以及拒绝不支持的更新 schema；
- Settings -> Data 中的团队摘要、迁移状态、成员管理、备份/恢复、浏览器 IndexedDB -> PostgreSQL 导入、清空素材、重置 boards、媒体维护、缺失 payload 清理、缺失 preview 清理和 stale source-link 修复；
- 保留完整生成元数据，包括 cinematic profiles、reference media snapshots、board/result-stack 链接、crop derivative 元数据、library backing links、preview status、voice profile refs 和 transcript assets。

生成结果、导入素材和素材库条目都通过 `assets` + `asset_payloads` 解析；`asset_library` 只保存引用 backing asset 的整理/收藏元数据，不创建独立媒体存储路径。

## 备份与恢复

在 Settings -> Data 中可以：

- 将整个工作区导出为 ZIP；
- 导入工作区 ZIP；
- 导出当前 board；
- 导入本地媒体文件；
- 显式选择是否包含供应商密钥；
- 检查并清理失败、过期处理中、损坏或孤立记录。

供应商密钥不会默认进入导出文件，只有用户显式开启凭证导出时才会包含。

PostgreSQL 模式下，完整工作区导出会通过团队备份路由打包 PostgreSQL 记录和被引用的媒体字节。恢复会先创建安全快照，在事务中替换工作区记录，并且只有显式开启凭证恢复时才导入密钥。

## 团队部署

Docker Compose 启动、环境变量、migrations、首个 owner 引导、备份、恢复、升级和回滚步骤见[本地团队部署](deployment/team-local.md)。

## 托管部署影响

对于 Cloudflare Pages、Vercel、Netlify 或其他托管部署：

- serverless 路由可以调用供应商并返回媒体结果；
- 用户工作区默认仍留在浏览器；
- 服务端不提供按用户的素材浏览或同步；
- 如果对外开放 `/v1/*`，应使用 `OPENAI_COMPAT_API_KEY` 保护；
- 供应商 key 应视为密钥，不应提交到仓库或暴露在客户端可见代码中。

## 当前限制

- 浏览器模式没有内置用户账号或跨设备同步。
- PostgreSQL 模式需要显式启用，适合可信局域网/自托管访问。
- 没有读取其他浏览器 IndexedDB 资产的公开 API。
- 浏览器 IndexedDB -> PostgreSQL migration 是显式用户触发操作，不会自动发生。
