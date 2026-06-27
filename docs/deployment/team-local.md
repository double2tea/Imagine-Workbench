# Local Team Deployment

This deployment mode is opt-in. The default Imagine Workbench workflow remains browser IndexedDB with no login or database requirement.

## Prerequisites

- Docker with Compose support.
- A copied team env file:

```bash
cp .env.team.example .env.team
```

Edit `.env.team` before starting the stack:

- Replace `POSTGRES_PASSWORD`.
- Replace `DATABASE_URL` with the same PostgreSQL password.
- Set `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES` to the largest single generated/imported media payload the team may store, in bytes.
- Set `IMAGINE_MEDIA_USAGE_WARNING_BYTES` to the media-volume byte count that should show a Settings -> Data warning.
- Keep the default PostgreSQL pool settings for a small LAN team, or tune `IMAGINE_POSTGRES_POOL_MAX`, `IMAGINE_POSTGRES_CONNECTION_TIMEOUT_MS`, `IMAGINE_POSTGRES_IDLE_TIMEOUT_MS`, and `IMAGINE_POSTGRES_QUERY_TIMEOUT_MS` when the app server and database need different limits.
- Replace `IMAGINE_TEAM_SETUP_TOKEN`.
- Replace `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY` with a long random server-side key. Keep it stable across restarts and backups, because team workspace secrets encrypted with it cannot be read with a different key.
- Set `APP_URL` to the URL users will open on the LAN.
- Set `IMAGINE_TRUSTED_ORIGINS` to `APP_URL` plus any reverse-proxy origins that may send browser requests.

## Start

```bash
docker compose --env-file .env.team -f docker-compose.team.yml up --build
```

The app listens on `http://localhost:3000` by default. PostgreSQL data is stored in the `postgres-data` volume. Generated media is stored in the `imagine-media` volume under `/data/imagine-media` inside the app container. Any single media payload larger than `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES` is rejected before it is written to the media volume, and the failing request returns a visible error. When total media-volume usage reaches `IMAGINE_MEDIA_USAGE_WARNING_BYTES`, Settings -> Data shows a non-secret aggregate warning with used bytes and threshold bytes. PostgreSQL access uses a bounded app-server pool; the default pool max is 5 connections, with 3000 ms connection timeout, 1000 ms idle timeout, and 30000 ms query timeout.

## Run Schema Migrations

After the app starts, open Settings -> Data and check Storage Target. In PostgreSQL mode it shows database/media configuration, the configured per-payload upload limit, and pending migrations.

Run pending migrations from the same panel using the setup token from `.env.team`. The token is sent as the `x-imagine-setup-token` request header and is not returned by status APIs.

For scripted upgrades, run the same setup-token-protected migration API from the app container:

```bash
docker compose --env-file .env.team -f docker-compose.team.yml exec app pnpm db:migrate
```

The command requires `APP_URL` and `IMAGINE_TEAM_SETUP_TOKEN`, sends `Origin: $APP_URL`, and prints only app/schema/migration counts.

## Bootstrap First Owner

After migrations are applied, create the first owner account from Settings -> Data. Enter the same setup token used for migrations, then use the team session card's Create First Owner form.

For scripted setup, call the setup-token-protected bootstrap API directly:

```bash
curl -i "$APP_URL/api/storage/team/bootstrap" \
  -H "Content-Type: application/json" \
  -H "Origin: $APP_URL" \
  -H "x-imagine-setup-token: $IMAGINE_TEAM_SETUP_TOKEN" \
  --data '{"email":"owner@example.com","password":"replace-with-a-long-password"}'
```

The route creates the first workspace, team, owner user, server session, and CSRF token only when no owner exists yet. It returns non-secret ids and sets the session/CSRF cookies. Owner/admin member management is available from Settings -> Data in PostgreSQL mode.

## Backup

Back up PostgreSQL and the media volume together. They describe one logical workspace snapshot: PostgreSQL rows contain relative payload refs, while media bytes live in the media volume.

The in-app Settings -> Data full ZIP export reads PostgreSQL rows in a `repeatable read read only` transaction and then packages the referenced media bytes. If any referenced media file is missing or unreadable, export fails instead of producing a partial backup.

Minimal local backup commands:

```bash
docker compose --env-file .env.team -f docker-compose.team.yml exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > imagine-workbench.sql
docker run --rm -v imagine-workbench_imagine-media:/media -v "$PWD:/backup" alpine tar -czf /backup/imagine-media.tgz -C /media .
```

For manual `pg_dump` plus media-volume archive, and for destructive migrations or restore operations, stop writes first by taking the app offline or otherwise ensuring users are not generating, importing, deleting, or editing workspace data.

## Restore

Restore the database dump and media volume from the same backup point. Do not mix a newer database dump with an older media archive, or payload refs may point to missing files.

After restoring, start the stack and verify Settings -> Data:

- Storage Target shows PostgreSQL.
- Migration status is current.
- Data Health does not report missing payload files.
- Asset, board, library, task, settings, and media counts match the expected backup point.

## Update And Rollback

Before updating the app image or running pending migrations, take a database and media backup from the same quiet point.

Update flow:

```bash
docker compose --env-file .env.team -f docker-compose.team.yml pull
docker compose --env-file .env.team -f docker-compose.team.yml up --build -d
```

If Settings -> Data reports pending migrations after the new app starts, run them from the same panel with the setup token or run `docker compose --env-file .env.team -f docker-compose.team.yml exec app pnpm db:migrate`. If migrations fail, stop the stack, restore the previous database dump and media archive, then restart the previous app image or checkout.

Rollback flow:

```bash
docker compose --env-file .env.team -f docker-compose.team.yml down
# restore the matching database dump and media archive here
docker compose --env-file .env.team -f docker-compose.team.yml up -d
```

Do not roll back only the app while keeping a newer migrated database unless that app version explicitly supports the newer schema.

## Current Scope

The current team-storage foundation includes PostgreSQL configuration, health/migration APIs, schema migrations, repository foundations, local media payload storage with a required per-payload byte limit, team auth/session/member APIs, shared asset/board/generation-task APIs, prompt templates, voice profiles, encrypted workspace-secret storage APIs, provider/RunningHub team settings, Settings -> Data status/migration/session/member surfaces, team backup/restore, explicit browser IndexedDB -> PostgreSQL import, clear-assets/reset-boards, media maintenance cleanup, missing-payload asset deletion, missing-preview repair, and stale source-link repair.

Remaining hardening includes deeper automated backup orchestration, reverse-proxy examples, and production-grade monitoring. Keep team mode behind trusted self-hosted access until those operational slices are complete.
