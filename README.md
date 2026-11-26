# AIRSPACE Wear

A multi-brand store for sneakers, apparel and soccer balls, built around 3D. Every pair has its own model: you turn it, look at the details up close, place it in your room with AR and ask an AI stylist which one fits your plans.

> **Portfolio project. Not affiliated with any brand shown.** Nike, Adidas, New Balance and every other name, logo and design belong to their owners and appear only to illustrate the project. Prices, sizes and stock are sample data, and nothing is sold.

## Features

- **Scroll-free 3D product pages.** Cinematic sequences that play on their own when they come into view, with hotspots you can reach by keyboard and a drag (or arrow keys) to turn the shoe. Scroll never drives the animation.
- **AR view** with `model-viewer` (Scene Viewer on Android, Quick Look on iOS, where the USDZ is generated from the GLB).
- **AI stylist** that recommends products from the catalog only, streams its answer and replies in the visitor's language.
- **Hangar 360°** (coming soon): an animated Mixamo avatar wearing the selected sneaker.
- **Spanish and English** on every screen (`/es` and `/en`), with **light and dark themes** and no flash on load.
- **Lite mode** for modest devices: lighter models, capped pixel ratio, no postprocessing.

## Stack

| Area | Tools |
| --- | --- |
| Web (`apps/web`) | Next.js 16 (App Router, Cache Components), TypeScript, next-intl, React Three Fiber, drei, GSAP, Motion, Lenis, CSS Modules |
| API (`apps/api`) | NestJS 12 (ESM), Prisma 7 with `@prisma/adapter-pg`, PostgreSQL 18, Anthropic SDK |
| Shared (`packages/contracts`) | zod schemas used by both the web and the API |
| 3D pipeline (`scripts/models`) | gltf-transform, meshoptimizer, sharp, Playwright (posters) |
| Tooling | pnpm 11 workspaces, Node 22 or later, Docker Compose, Vitest, Playwright, ESLint, oxlint |

## Prerequisites

- Node.js 22 or later.
- pnpm 11 (`corepack enable` picks the version pinned in `package.json`).
- Docker with Compose v2, for Postgres.
- Optional: a Sketchfab API token (only to download the original 3D models) and an Anthropic API key (only for the live AI stylist).

## Quick start

```bash
pnpm install
cp .env.example .env      # fill in only what you need; every variable is optional in development
pnpm db:up                # Postgres on 127.0.0.1:5434
pnpm db:migrate           # apply the Prisma migrations
pnpm db:seed              # load the catalog (repeatable)
pnpm dev                  # web on http://localhost:3000, API on http://127.0.0.1:4000
```

The optimized GLB files and posters in `apps/web/public` are committed, so the site works right after cloning. Run `pnpm models` only when you want to download and optimize the models again (it needs `SKETCHFAB_TOKEN`).

Open http://localhost:3000. The root redirects to `/es`, the default locale. The API reports its state at http://127.0.0.1:4000/health.

## Scripts

All scripts run from the repository root.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Builds `@airspace/contracts`, then runs contracts (watch), API and web in parallel. |
| `pnpm dev:web` | Runs only the web (`next dev` on port 3000). |
| `pnpm dev:api` | Runs only the API (`nest start --watch` on port 4000). |
| `pnpm build` | Builds every workspace package. The web build needs the API running (see [Building the web](#building-the-web)). |
| `pnpm lint` | Lints every package (ESLint, design token and message checks on the web, oxlint on the API). |
| `pnpm typecheck` | Builds the contracts and type-checks every package. |
| `pnpm test` | Builds the contracts and runs the unit tests of every package that has them. |
| `pnpm test:e2e` | Runs the API integration tests against the `airspace_test` database. |
| `pnpm db:up` | Starts Postgres only (`docker compose up -d --wait db`). |
| `pnpm db:down` | Stops the local services (`docker compose down`). Data stays in the `db-data` volume. |
| `pnpm docker:up` | Builds and starts the full stack in containers (see [Docker](#docker)). |
| `pnpm docker:down` | Stops the full stack, Postgres included. |
| `pnpm db:migrate` | Applies pending migrations (`prisma migrate deploy`). |
| `pnpm db:seed` | Loads brands, products, translations, hotspots, 3D models and credits, then asks the web to refresh its catalog cache. |
| `pnpm models` | Runs the whole 3D pipeline: download, optimize and credits. |
| `pnpm models:download` | Downloads the original GLB files from Sketchfab into `assets/models/raw` (needs `SKETCHFAB_TOKEN`). |
| `pnpm models:optimize` | Produces `<slug>.glb` (hero) and `<slug>-lite.glb` in `apps/web/public/models` and updates `assets/models/manifest.json`. |
| `pnpm models:credits` | Regenerates the 3D models section of `CREDITS.md` from the manifest. |
| `pnpm models:posters` | Renders a transparent WebP poster per model and theme into `apps/web/public/posters`. Run `pnpm db:seed` afterwards. |
| `pnpm models:preview` | Opens a local viewer (http://localhost:4173) that compares the original, hero and lite models. |
| `pnpm design:preview` | Serves the reference design prototype in `design/prototype`. |

The web package also has its own Playwright end-to-end suite in `apps/web/e2e` (see [Testing](#testing)).

## Environment variables

Every variable is documented in [`.env.example`](.env.example). Copy it to `.env` at the repository root. Scripts and apps load that file at runtime; it is ignored by git and never baked into a Docker image.

In development all of them are optional:

- **API:** `DATABASE_URL` (defaults to the local Compose database), `DATABASE_URL_TEST`, `API_PORT`, `API_HOST`, `WEB_ORIGIN` (CORS), `TRUST_PROXY`.
- **AI stylist:** `ANTHROPIC_API_KEY`, `STYLIST_ENABLED`, `STYLIST_MODEL`, `STYLIST_DAILY_BUDGET_USD`.
- **Web:** `API_URL` (server side), `NEXT_PUBLIC_API_URL` (browser, stylist stream only), `SITE_URL` (absolute URLs in metadata, read at build time), `REVALIDATE_SECRET` (required in production).
- **3D pipeline:** `SKETCHFAB_TOKEN`.
- **Docker:** `WEB_BUILD_API_URL` and `BUILD_STANDALONE` (see [Docker](#docker)).

In production the API refuses to start without `DATABASE_URL`, and configuration errors name the variable without printing its value.

## Architecture

```
apps/web  (Next.js)  ──server fetch──▶  apps/api  (NestJS)  ──Prisma──▶  PostgreSQL
    │                                       │
    └──browser, stylist stream (SSE)───────▶│──▶  Anthropic API
              packages/contracts: zod schemas shared by both sides
```

### Web (`apps/web`)

- App Router with locale routes (`/es`, `/en`) through next-intl. Every UI string lives in `messages/es.json` and `messages/en.json`, which keep the same keys. Product names and descriptions come translated from the API.
- The server reads the catalog from the API only (one source of truth) and validates every response with the shared contracts. Reads are cached with `'use cache'` and tagged, and `POST /api/revalidate` (called by the seed) expires those tags.
- The browser never calls the API, except for the stylist stream.
- One React Three Fiber canvas per area, created on demand. Canvases stop rendering when offscreen, only one draws at a time and the pixel ratio is capped at 1.5 (1 in lite mode).
- Motion has clear owners: GSAP for timelines, Motion for UI state, Lenis only for anchor jumps, React `<ViewTransition>` for route changes. `prefers-reduced-motion` turns sequences into static states.

### API (`apps/api`)

- NestJS modules for the catalog (`/v1/products`, `/v1/brands`, `/v1/categories`), content (`/v1/credits`), health (`/health`) and the stylist (`/v1/stylist/status`, `/v1/stylist/chat`).
- Requests and responses are validated with the zod schemas from `packages/contracts`. Errors are returned as `{ code }`, which the web translates.
- Prisma 7 with the `prisma-client` generator (ESM, output in `src/generated`) and the `pg` driver adapter, so no query engine binary ships at runtime.
- Helmet, CORS limited to `WEB_ORIGIN`, and a global rate limit (120 requests per minute per IP).

### Contracts (`packages/contracts`)

zod schemas and types for the catalog, credits, health and the stylist events. Both apps import the compiled output, so build it first (`pnpm dev`, `pnpm test` and `pnpm typecheck` do it for you).

### 3D pipeline (`scripts/models`)

Downloads the original models, then normalizes them to a shared pose (sole on y = 0, toe to +X, 0.30 m long; balls are 0.22 m), simplifies the meshes, converts textures to WebP and compresses with Meshopt. Each model ships as a hero GLB (under 100k triangles and 5 MB) and a lite GLB (about 20k triangles, 512 px textures). Settings live in `scripts/models/config.mjs`, and `assets/models/manifest.json` records credits, license, pose and stats. Because the pose is shared, hotspot positions are stored in meters in model space.

### AI stylist

- Runs on `claude-opus-5-5` (configurable with `STYLIST_MODEL`) with low effort and a cap of about 4,000 output tokens per answer.
- Recommends only catalog products through a strict `show_products` tool whose slugs are limited to the catalog. The API checks every slug against the database and builds the cards from real data, so the model never writes prices or sizes.
- Answers in the visitor's locale, streams over Server-Sent Events (`text`, `products`, `done`, `error`) and treats the visitor's text as data, not instructions. Messages are limited in length and number, and conversations are not stored.
- **Budget:** every answer's token usage is priced and added to a daily total. When it reaches `STYLIST_DAILY_BUDGET_USD` (default 2 USD, reset at 00:00 UTC), the stylist turns off until the next day. The chat endpoint also has its own rate limit (10 requests per minute per IP), and `STYLIST_ENABLED=false` turns it off by hand.
- **Fallback:** without an API key, over budget or switched off, `/v1/stylist/status` reports it as unavailable and the web plays a scripted demo conversation with the suggested ideas instead, so the section always works.

## Testing

```bash
pnpm test        # unit tests (Vitest): config, filters, DTOs, seed, prompt, budget, SSE with a mocked SDK
pnpm test:e2e    # API integration tests against airspace_test (needs pnpm db:up)
pnpm lint
pnpm typecheck
```

- The integration tests only accept a database named `airspace_test` (created by `docker/postgres/init` on the first `pnpm db:up`), so the development data is never touched.
- The stylist tests use a mocked Anthropic client and never spend tokens.
- The web has a Playwright end-to-end suite in `apps/web/e2e`, run from `apps/web` with its `e2e` script. Like the build, it needs the API and the database running.

## Building the web

The catalog and product pages are prerendered, so `next build` fetches from the API. With the API down the build fails instead of publishing an empty catalog. Start it first:

```bash
pnpm db:up && pnpm dev:api      # in one terminal
pnpm build                      # in another
```

After deployment, cached catalog reads refresh every few minutes or right away through `POST /api/revalidate` with the `x-revalidate-secret` header.

## Docker

Day to day, both apps run with `pnpm dev` and only Postgres runs in Docker. For a production-like check there are two Dockerfiles, built from the repository root:

| Image | Dockerfile | Contents | Size |
| --- | --- | --- | --- |
| `airspace-wear-api:local` | `apps/api/Dockerfile` (target `runtime`) | compiled API and production dependencies only | about 320 MB |
| `airspace-wear-api-tools:local` | `apps/api/Dockerfile` (target `tools`) | Prisma CLI and `tsx`, for migrations and the seed | about 1.2 GB |
| `airspace-wear-web:local` | `apps/web/Dockerfile` | Next.js standalone server, static files and `public/` | about 240 MB |

All images use a pinned `node:22.23.4-alpine3.24` base, install with pnpm through corepack and a frozen lockfile, and run as the non-root `node` user. The API listens on `0.0.0.0` inside its container and both apps have a health check.

### Full stack with Compose

`docker-compose.yml` has a `full` profile next to the default `db` service:

| Service | What it does | Host address |
| --- | --- | --- |
| `db` | Postgres (also the only service without a profile) | 127.0.0.1:5434 |
| `migrate` | `prisma migrate deploy`, then exits | |
| `seed` | loads the catalog, then exits | |
| `api` | the API | http://127.0.0.1:4001 |
| `web` | the web | http://127.0.0.1:3001 |

The ports differ from `pnpm dev` (3000 and 4000), so both can run side by side. Ports are bound to 127.0.0.1 only.

```bash
pnpm docker:up      # db, migrate, seed and api first, then builds and starts web
pnpm docker:down    # stops everything, Postgres included
```

`pnpm docker:up` runs in two steps on purpose: the web build prerenders the catalog, and Compose cannot reach a service while it builds an image. So the API starts first, and the web image is built against it through the host (`WEB_BUILD_API_URL`, by default `http://host.docker.internal:4001`). At runtime the web talks to the API inside the Compose network (`http://api:4000`). To build the web against another API, for example the one from `pnpm dev`:

```bash
WEB_BUILD_API_URL=http://host.docker.internal:4000 docker compose --profile full build web
```

Notes:

- Compose passes `ANTHROPIC_API_KEY`, `STYLIST_*`, `TRUST_PROXY` and `REVALIDATE_SECRET` from your `.env` to the containers at runtime. Without a key the stylist uses the scripted demo. To keep it off even with a key, run `STYLIST_ENABLED=false pnpm docker:up`.
- Set `REVALIDATE_SECRET` in `.env` if you want the seed to refresh the web cache. Without it, the production web rejects `POST /api/revalidate` and the cache refreshes by itself within minutes.
- The `full` profile uses the same `db` service and volume as development, so migrate and seed run against your local database (both are safe to repeat).
- `NEXT_PUBLIC_API_URL` and `SITE_URL` are read at build time (`http://127.0.0.1:4001` and `http://localhost:3001` in Compose, set as build args, not from `.env`). Rebuild the web image if either address changes.
- `next.config.ts` switches to `output: 'standalone'` only when `BUILD_STANDALONE=1`, which the web Dockerfile sets. `pnpm dev`, `next build` and `next start` are unchanged.

### Images on their own

```bash
docker build -f apps/api/Dockerfile -t airspace-wear-api .
docker build -f apps/api/Dockerfile --target tools -t airspace-wear-api-tools .
docker build -f apps/web/Dockerfile \
  --build-arg API_URL=http://host.docker.internal:4001 \
  --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:4001 \
  -t airspace-wear-web .
```

The tools image runs `prisma migrate deploy` by default. For the seed, override the command with `./node_modules/.bin/tsx prisma/seed/index.ts`. Pass `DATABASE_URL` and the other variables with `--env-file` or your platform's secret store, never as plain command-line values.

## Project layout

```
apps/web/              Next.js site (next-intl, R3F); messages/ holds es.json and en.json
apps/web/public/       optimized GLB models, posters and the self-hosted Meshopt decoder
apps/api/              NestJS API (Prisma schema, migrations and seed in prisma/)
packages/contracts/    zod schemas shared by web and API
scripts/models/        3D model pipeline
assets/models/         model manifest (original downloads in raw/, git ignored)
design/prototype/      static design and motion prototype (reference only)
docker/                Postgres init scripts
docs/                  plans and decisions
CREDITS.md             third-party credits
```

## Credits and licenses

Every third-party asset (3D models, fonts, libraries) is credited with its author, source, license and the changes made, in [`CREDITS.md`](CREDITS.md) and on the `/credits` page of the site. The 3D models section is generated from the model manifest by `pnpm models:credits`.

The fonts (Hubot Sans, Mona Sans and Martian Mono) use the SIL Open Font License. Most 3D models are CC BY 4.0.

**License note:** the Adidas Samba model is **CC BY-NC-SA 4.0** (non-commercial, share-alike). It is fine for this portfolio, but if the project ever becomes commercial, that model must be removed or replaced.
