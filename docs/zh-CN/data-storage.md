# 数据存储

[English](../data-storage.md) | [简体中文](data-storage.md)

Imagine Workbench 是 local-first 应用。部署后的实例负责提供应用页面和供应商代理路由，但默认情况下，每个用户的工作区数据存储在该用户自己的浏览器中。

## 当前默认存储

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

## 备份与恢复

在 Settings -> Data 中可以：

- 将整个工作区导出为 ZIP；
- 导入工作区 ZIP；
- 导出当前 board；
- 导入本地媒体文件；
- 显式选择是否包含供应商密钥；
- 检查并清理失败、过期处理中、损坏或孤立记录。

供应商密钥不会默认进入导出文件，只有用户显式开启凭证导出时才会包含。

## 本地数据库状态

代码中已经有面向未来本地 SQLite 工作区目标的存储类型和运行状态 helper：

- `IMAGINE_STORAGE_TARGET`
- `IMAGINE_LOCAL_WORKSPACE_DIR`
- `imagine-workbench.sqlite`
- 本地 asset、preview、export 和 trash 目录名

但这条本地数据库路径不是当前默认生产存储路径。当前稳定支持路径仍是浏览器 IndexedDB 加显式 ZIP 备份/恢复。代码中的 local folder、local database 和 remote database adapter 仍标记为 planned storage targets。

## 托管部署影响

对于 Cloudflare Pages、Vercel、Netlify 或其他托管部署：

- serverless 路由可以调用供应商并返回媒体结果；
- 用户工作区默认仍留在浏览器；
- 服务端不提供按用户的素材浏览或同步；
- 如果对外开放 `/v1/*`，应使用 `OPENAI_COMPAT_API_KEY` 保护；
- 供应商 key 应视为密钥，不应提交到仓库或暴露在客户端可见代码中。

## 当前限制

- 没有内置用户账号。
- 没有内置跨设备同步。
- 没有共享团队工作区数据库。
- 没有默认启动 SQLite 数据库。
- 没有读取其他浏览器 IndexedDB 资产的公开 API。
- 没有从 IndexedDB 自动迁移到服务端数据库。
