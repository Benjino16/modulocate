# Modulocate

For local development, see [CONTRIBUTING.md](./CONTRIBUTING.md). This document covers running Modulocate in production.

## Production deployment

The prod stack (`infra/compose.prod.yaml`) runs Postgres, Redis, Traefik, and the four apps (`backend`, `worker`, `portal`, `vote`) as containers on a single box. By default it **pulls pre-built images from GHCR** — no Node/pnpm toolchain needed on the server. Building the images from this checkout instead is covered separately, in [Building the images from source](#building-the-images-from-source).

### Prerequisites

- A server with **Docker** + **Compose v2.22+** (`docker compose version` to check).
- This repo checked out on that server (only `infra/`, `.env.example`, and `docker-compose`/Traefik config are actually used — cloning the whole thing is simplest).
- If the `ghcr.io/benjino16/modulocate-*` packages are **private**: a GitHub [Personal Access Token](https://github.com/settings/tokens) with `read:packages`, and `docker login ghcr.io -u <github-username>` on the server (paste the token as the password). Not needed if the packages are public.

### 1. Configure `.env`

```bash
git clone https://github.com/Benjino16/modulocate.git
cd modulocate
cp .env.example .env
```

Edit `.env` for this environment — at minimum:

- `STUDENT_SESSION_SECRET`, `BETTER_AUTH_SECRET` — generate real secrets, e.g. `openssl rand -hex 32` each. Do **not** reuse the dev placeholders.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — pick a real password. These configure the `postgres` container directly and are also used to build `DATABASE_URL` for `backend`/`worker`/`migrate` (see `infra/compose.prod.yaml`) — the `DATABASE_URL` value in `.env` itself is not read by the prod stack, only by tooling run outside Docker (e.g. Drizzle Studio), so keep it in sync manually if you use that.
- `DOMAIN` — the hostname Traefik requests its Let's Encrypt certificate for (e.g. `your-domain.example`). Must already have an A/AAAA record pointing at this server before you start the stack, or the ACME challenge fails.
- `ACME_EMAIL` — where Let's Encrypt sends expiry/problem notices.
- `BETTER_AUTH_URL` — the public origin apps/staff will use, e.g. `https://your-domain.example` (same host as `DOMAIN`, `https://`; defaults to the dev-only `http://modulocate.localhost`).
- `VOTE_APP_URL` — same origin + `/voting`, e.g. `https://your-domain.example/voting`. Used in emails sent to students.
- `SMTP_*` / `MAIL_FROM` — a real mail provider; `SMTP_HOST=localhost` (the dev Mailpit catcher) won't work here.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` — optional, bootstraps one staff account on first backend start. Leave blank to skip.
- `S3_*` — object storage for uploaded module pictures.
- `MODULOCATE_IMAGE_REPO` / `MODULOCATE_IMAGE_TAG` — optional, only needed to deploy from a different GHCR namespace or pin a specific tag instead of `latest` (see [Image tags](#image-tags-and-rollbacks) below). Both default to `ghcr.io/benjino16/modulocate` and `latest`.

Everything below assumes commands run from the **repo root** — `--env-file .env` (see next section) and `env_file: ../.env` inside the compose file both depend on that.

### 2. Pull the images and start the stack

```bash
docker compose -f infra/compose.prod.yaml --env-file .env pull
docker compose -f infra/compose.prod.yaml --env-file .env up -d postgres redis
```

`--env-file .env` is required, not optional — see the comment at the top of `infra/compose.prod.yaml` for why (short version: Compose's default project directory is `infra/`, not the repo root, so without this flag the Postgres credentials silently resolve to blank).

Starting `postgres`/`redis` first (rather than everything at once) leaves time to apply the schema before `backend`/`worker` come up against an empty database:

```bash
docker compose -f infra/compose.prod.yaml --env-file .env --profile migrate run --rm migrate
```

Then bring up the rest:

```bash
docker compose -f infra/compose.prod.yaml --env-file .env up -d
```

### 3. Verify

- `curl https://<domain>/api/healthz` — backend.
- `curl https://<domain>/` — should redirect to `/voting/` (student vote app); `/portal/` is the staff UI.
- `docker compose -f infra/compose.prod.yaml --env-file .env ps` — all services healthy/running.
- `docker compose -f infra/compose.prod.yaml --env-file .env logs traefik | grep -i acme` — confirm the certificate was actually issued, not just that Traefik started.

**TLS is set up by default** — Traefik gets a Let's Encrypt cert for `DOMAIN` via HTTP-01 challenge on `:80` and serves everything over `:443`, `:80` only redirects. This requires DNS for `DOMAIN` to already resolve to this server and both `80` and `443` to be reachable from the internet *before* the stack starts — if the challenge can't complete, Traefik still comes up (serving its internal self-signed cert) and keeps retrying, but every browser will show a cert warning until DNS/ports are fixed and it succeeds.

### Redeploying / updating

```bash
docker compose -f infra/compose.prod.yaml --env-file .env pull
docker compose -f infra/compose.prod.yaml --env-file .env --profile migrate run --rm migrate
docker compose -f infra/compose.prod.yaml --env-file .env up -d
```

The `migrate` step runs `drizzle-kit migrate` against `packages/db/drizzle/*.sql` (committed migration history) — always run it before restarting `backend`/`worker` on a new tag, since deploys can include schema changes.

### Image tags and rollbacks

By default every service pulls `:latest`. To pin (or roll back to) a specific build, set `MODULOCATE_IMAGE_TAG` in `.env` (e.g. to a git SHA or version tag your CI publishes) and rerun the pull/up commands above.

### Stopping

```bash
docker compose -f infra/compose.prod.yaml --env-file .env down
```

Data (`postgres_data`, `redis_data` volumes) survives `down`. To wipe it too, add `-v` — this deletes the database.

## Building the images from source

`.github/workflows/docker-publish.yml` publishes `backend`/`worker`/`portal`/`vote` to GHCR on every push to `main` (as `:latest` + `:sha-<short>`) and on version tags (as `:X.Y.Z` + `:X.Y`) — the section above is the normal path. Building locally here is mainly useful for testing an unpublished change on the target machine directly, without waiting on CI.

Layer `infra/compose.prod.build.yaml` on top of the base file — it adds a `build:` (context + Dockerfile) for `backend`/`worker`/`portal`/`vote` alongside the base file's `image:`, so Compose builds locally and tags the result under that same image name instead of pulling:

```bash
docker compose -f infra/compose.prod.yaml -f infra/compose.prod.build.yaml \
  --env-file .env up -d --build postgres redis
docker compose -f infra/compose.prod.yaml -f infra/compose.prod.build.yaml \
  --env-file .env --profile migrate run --rm --build migrate
docker compose -f infra/compose.prod.yaml -f infra/compose.prod.build.yaml \
  --env-file .env up -d --build
```

Everything else (`.env` setup, migrate step, stopping) is identical to the GHCR flow above — only add `-f infra/compose.prod.build.yaml` and `--build` to each command. Building runs the full `turbo prune` + `pnpm install` + esbuild/Vite build inside Docker (see `infra/Dockerfile.*`), so it needs more time and disk than a pull, but no Node/pnpm on the host.
