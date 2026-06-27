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
- Replace `IMAGINE_TEAM_SETUP_TOKEN`.
- Replace `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY` with a long random server-side key. Keep it stable across restarts and backups, because team workspace secrets encrypted with it cannot be read with a different key.
- Set `APP_URL` to the URL users will open on the LAN.
- Set `IMAGINE_TRUSTED_ORIGINS` to `APP_URL` plus any reverse-proxy origins that may send browser requests.

## Start

```bash
docker compose --env-file .env.team -f docker-compose.team.yml up --build
```

The app listens on `http://localhost:3000` by default. PostgreSQL data is stored in the `postgres-data` volume. Generated media is stored in the `imagine-media` volume under `/data/imagine-media` inside the app container.

## Run Schema Migrations

After the app starts, open Settings -> Data and check Storage Target. In PostgreSQL mode it shows database/media configuration and pending migrations.

Run pending migrations from the same panel using the setup token from `.env.team`. The token is sent as the `x-imagine-setup-token` request header and is not returned by status APIs.

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

Minimal local backup commands:

```bash
docker compose --env-file .env.team -f docker-compose.team.yml exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > imagine-workbench.sql
docker run --rm -v imagine-workbench_imagine-media:/media -v "$PWD:/backup" alpine tar -czf /backup/imagine-media.tgz -C /media .
```

For destructive migrations or restore operations, stop writes first by taking the app offline or otherwise ensuring users are not generating, importing, deleting, or editing workspace data.

## Restore

Restore the database dump and media volume from the same backup point. Do not mix a newer database dump with an older media archive, or payload refs may point to missing files.

## Current Scope

The current team-storage foundation includes PostgreSQL configuration, health/migration APIs, schema migrations, repository foundations, local media payload storage, team auth/session/member APIs, shared asset/board/generation-task APIs, encrypted workspace-secret storage APIs, and the Settings -> Data status/migration/session/member surfaces.

Provider/RunningHub settings migration to encrypted team secrets, team-mode settings/backup/restore/clear/cleanup routing, explicit IndexedDB -> PostgreSQL import, and deeper backup/restore automation are later implementation slices. Do not expose a team deployment to untrusted networks until the remaining operational slices are complete.
