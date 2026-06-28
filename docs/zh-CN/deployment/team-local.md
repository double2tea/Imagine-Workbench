# 本地团队部署

这个部署模式需要显式启用。Imagine Workbench 的默认工作流仍然是浏览器 IndexedDB，不需要登录或数据库。

## 前置条件

- Docker，并支持 Compose。
- 复制团队环境变量文件：

```bash
cp .env.team.example .env.team
```

启动前编辑 `.env.team`：

- 替换 `POSTGRES_PASSWORD`。
- 用相同 PostgreSQL 密码替换 `DATABASE_URL`。
- 设置 `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES`，表示团队允许保存的单个生成/导入媒体 payload 最大字节数。
- 设置 `IMAGINE_MEDIA_USAGE_WARNING_BYTES`，表示 Settings -> Data 中触发媒体容量提醒的字节数。
- 小型局域网团队可以保留默认 PostgreSQL 连接池设置；需要时再调整 `IMAGINE_POSTGRES_POOL_MAX`、`IMAGINE_POSTGRES_CONNECTION_TIMEOUT_MS`、`IMAGINE_POSTGRES_IDLE_TIMEOUT_MS` 和 `IMAGINE_POSTGRES_QUERY_TIMEOUT_MS`。
- 替换 `IMAGINE_TEAM_SETUP_TOKEN`。
- 将 `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY` 替换为足够长的服务端随机密钥。它必须在重启和备份恢复后保持稳定，否则已加密的团队工作区密钥将无法读取。
- 将 `APP_URL` 设置为团队成员在局域网中打开的地址。
- 将 `IMAGINE_TRUSTED_ORIGINS` 设置为 `APP_URL`，以及可能发起浏览器请求的反向代理 origin。

## 启动

```bash
docker compose --env-file .env.team -f docker-compose.team.yml up --build
```

默认情况下，应用监听 `http://localhost:3000`。PostgreSQL 数据保存在 `postgres-data` volume。生成媒体保存在 app 容器内 `/data/imagine-media` 对应的 `imagine-media` volume。

## 运行 Schema Migrations

应用启动后，打开 Settings -> Data 查看 Storage Target。PostgreSQL 模式会显示数据库/媒体配置、单 payload 限制和 pending migrations。

可以在同一个面板中用 `.env.team` 的 setup token 运行 migrations。脚本升级也可以在 app 容器内运行：

```bash
docker compose --env-file .env.team -f docker-compose.team.yml exec app pnpm db:migrate
```

该命令需要 `APP_URL` 和 `IMAGINE_TEAM_SETUP_TOKEN`，并且只输出非密钥的 app/schema/migration 计数。

## 创建首个 Owner

migrations 完成后，在 Settings -> Data 使用 setup token 创建首个 owner 账户。也可以直接调用 bootstrap API：

```bash
curl -i "$APP_URL/api/storage/team/bootstrap" \
  -H "Content-Type: application/json" \
  -H "Origin: $APP_URL" \
  -H "x-imagine-setup-token: $IMAGINE_TEAM_SETUP_TOKEN" \
  --data '{"email":"owner@example.com","password":"replace-with-a-long-password"}'
```

该路由只会在还没有 owner 时创建首个 workspace、team、owner user、server session 和 CSRF token。owner/admin 可以在 PostgreSQL 模式的 Settings -> Data 管理成员。

## 备份

PostgreSQL 和媒体 volume 必须一起备份。它们共同描述一个逻辑工作区快照：PostgreSQL 行保存相对 payload refs，媒体字节保存在媒体 volume。

应用内 Settings -> Data 的完整 ZIP 导出会在 `repeatable read read only` 事务中读取 PostgreSQL 记录，然后打包被引用的媒体字节。如果引用的媒体文件缺失或不可读，导出会失败，而不是生成不完整备份。

最小本地备份命令：

```bash
docker compose --env-file .env.team -f docker-compose.team.yml exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > imagine-workbench.sql
docker run --rm -v imagine-workbench_imagine-media:/media -v "$PWD:/backup" alpine tar -czf /backup/imagine-media.tgz -C /media .
```

手动 `pg_dump` + media archive、破坏性 migrations 或 restore 操作前，应先停止写入，例如让 app 下线，确保没有成员正在生成、导入、删除或编辑工作区数据。

## 恢复

从同一个备份点恢复 database dump 和 media volume。不要混用较新的数据库 dump 与较旧的媒体归档，否则 payload refs 可能指向缺失文件。

恢复后启动 stack，并在 Settings -> Data 检查：

- Storage Target 显示 PostgreSQL。
- Migration status 为 current。
- Data Health 没有报告 missing payload files。
- Asset、board、library、task、settings 和 media counts 符合预期备份点。

## 升级与回滚

升级 app image 或运行 pending migrations 前，先从同一个 quiet point 备份数据库和媒体。

升级流程：

```bash
docker compose --env-file .env.team -f docker-compose.team.yml pull
docker compose --env-file .env.team -f docker-compose.team.yml up --build -d
```

如果新 app 启动后 Settings -> Data 显示 pending migrations，用 setup token 在面板中运行，或执行 `docker compose --env-file .env.team -f docker-compose.team.yml exec app pnpm db:migrate`。

回滚流程：

```bash
docker compose --env-file .env.team -f docker-compose.team.yml down
# 在这里恢复匹配的 database dump 和 media archive
docker compose --env-file .env.team -f docker-compose.team.yml up -d
```

除非当前 app 版本明确支持更新的 schema，否则不要只回滚 app、却保留已经迁移到更新版本的数据库。

## 当前范围

当前团队存储基础已经包括 PostgreSQL 配置、health/migration APIs、schema migrations、repository foundations、带单 payload 字节上限的本地媒体 payload 存储、团队 auth/session/member APIs、共享 asset/board/generation-task APIs、提示词模板、声音档案、加密工作区密钥 APIs、provider/RunningHub 团队设置、Settings -> Data 状态/迁移/session/member 界面、团队 backup/restore、显式浏览器 IndexedDB -> PostgreSQL 导入、clear-assets/reset-boards、media maintenance cleanup、missing-payload asset deletion、missing-preview repair、stale source-link repair、完整生成元数据保留、transcript assets，以及由共享 asset payloads 支撑的 asset-library records。

后续仍可以继续补更深入的自动化备份编排、反向代理示例和生产级监控。在这些运维切片完善前，团队模式应放在可信自托管访问环境后面。
