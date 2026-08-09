# Contributing

Setup and daily dev workflow for Modulocate. Works the same on macOS and Linux (e.g. Ubuntu) — everything except your editor's TypeScript/ESLint tooling runs inside Docker.

## Prerequisites

- **Docker** with Compose v2.22+ (needed for `docker compose watch`)
  - macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Ubuntu: [Docker Engine](https://docs.docker.com/engine/install/ubuntu/) + the `docker-compose-plugin` package (gives you `docker compose`, not the old standalone `docker-compose`). Add your user to the `docker` group so you don't need `sudo` for every command.
  - Check with `docker compose version`.
- **Node.js 22** (see `.nvmrc`) — only needed locally for your editor's TypeScript/ESLint tooling and to run `pnpm`. The apps themselves run inside Docker, not on your host. On Linux, install via [nvm](https://github.com/nvm-sh/nvm) rather than your distro's package manager — `apt`'s Node lives under `/usr`, so `corepack enable` needs `sudo` and can fail or clash with newer pnpm versions.
- **pnpm 11** (see `packageManager` in `package.json`) — either via [Corepack](https://pnpm.io/installation#using-corepack) (`corepack enable`, ships with Node) or a standalone install (e.g. `brew install pnpm` on macOS, or the [install script](https://pnpm.io/installation) on Linux).

## First-time setup

```bash
git clone <repo-url>
cd modulocate
pnpm install          # for editor tooling (types, lint) — the apps run in Docker regardless
cp .env.example .env
```

Fill in `.env`:
- `STUDENT_SESSION_SECRET`, `BETTER_AUTH_SECRET` — any random string, e.g. `openssl rand -hex 32`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` — optional; if set, the backend bootstraps one staff account with these credentials on first start
- Everything else already has working local defaults (Postgres, Redis, Mailpit)

Start everything:

```bash
pnpm dev
```

This runs `docker compose up --build --watch`, bringing up Postgres, Redis, Mailpit, Traefik, and all four apps (backend, worker, portal, vote), and keeps the containers in sync with your local file edits (see [Hot reload](#hot-reload) below). Leave it running in a terminal.

Once `pnpm dev` is up, apply the database schema — `packages/db` has no `.env` of its own anymore, so this runs inside the `backend` container, where `DATABASE_URL` comes from Compose's `env_file`. `packages/db/src` is watch-synced into the running container (see `infra/compose.dev.yaml`), so this picks up schema changes with no rebuild:

```bash
pnpm db:push
pnpm db:seed   # optional: sample data
```

Only rebuild first (`pnpm dev` again) if you changed `packages/db/package.json` itself — new script or dependency — since Watch only syncs `src/`, not `package.json`.

We're still in early dev with the schema changing often, so `db:push` (drizzle-kit push) syncs `src/schema.ts` straight to the DB with no migration files to keep in sync — just rerun it after any schema change. No migrations are committed yet; once the schema stabilizes we'll switch to `db:generate`/`db:migrate` and commit the migration history from that point on.

### URLs

Everything is served same-origin behind Traefik at `http://modulocate.localhost` (`.localhost` resolves to `127.0.0.1` in every modern browser, no `/etc/hosts` entry needed):

- Portal (staff): `http://modulocate.localhost/portal`
- Vote (students): `http://modulocate.localhost/voting`
- Backend API: `http://modulocate.localhost/api`
- Mailpit (catches all outgoing dev email): `http://localhost:8025`
- Traefik dashboard: `http://localhost:8080`

## Hot reload

`infra/compose.dev.yaml` uses [Docker Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) to sync `src/` changes straight into the running containers, where Vite/tsx pick them up. This only activates under `docker compose watch` (or `up --watch`, which is what `pnpm dev` uses) — plain `docker compose up` will start stale containers with no live sync at all, which looks exactly like "hot reload is broken." Always use `pnpm dev`.

Editing `package.json`, `vite.config.ts`, or `tsconfig.json` isn't synced (dependency/config changes need a real rebuild) — rerun `pnpm dev` to rebuild and pick those up.

## Common commands

```bash
pnpm dev                                          # start the full stack with hot reload
pnpm -r run lint                                  # lint all packages that have a lint script
pnpm --filter @modulocate/portal-web lint         # lint just the portal
pnpm --filter @modulocate/allocation-engine test  # run a package's tests
pnpm db:studio                                    # browse the DB with Drizzle Studio
pnpm build                                        # turbo build across the workspace
```

## Troubleshooting

- **Hot reload not picking up changes**: make sure you started with `pnpm dev`, not `docker compose up`. If containers are already running without watch, `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml down` and restart with `pnpm dev`.
- **Changed a `package.json`/`vite.config.ts`/`tsconfig.json` and nothing happened**: expected — rerun `pnpm dev` to rebuild.
- **`corepack enable` fails with `EACCES`, or `pnpm` throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`**: you're on a distro-packaged Node. Switch to nvm (see Prerequisites) — no more `sudo`, and a corepack version that matches pnpm 11.
