# Development guide

Technical notes for working on AIRSPACE Wear: every script, environment variables, architecture, the 3D and avatar pipelines, testing, Docker and the Vercel deployment. For the overview and the quick start, see the [README](../README.md).

## Contents

- [Scripts](#scripts)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [3D model pipeline](#3d-model-pipeline-scriptsmodels)
- [Hangar 360° avatar](#hangar-360-avatar-scriptsavatar)
- [Hero smoke](#hero-smoke-scriptsfx)
- [AI stylist](#ai-stylist)
- [Login with Google](#login-with-google)
- [Test payments and orders](#test-payments-and-orders)
- [Testing](#testing)
- [Building the web](#building-the-web)
- [Docker](#docker)
- [Deploying to Vercel](#deploying-to-vercel)

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
| `pnpm db:migrate` | Applies pending migrations (`prisma migrate deploy`). |
| `pnpm db:seed` | Loads brands, products, translations, hotspots, 3D models and credits, then asks the web to refresh its catalog cache. |
| `pnpm docker:up` | Builds and starts the full stack in containers (see [Docker](#docker)). |
| `pnpm docker:down` | Stops the full stack, Postgres included. |
| `pnpm models` | Runs the whole 3D pipeline: download, optimize and credits. |
| `pnpm models:download` | Downloads the original GLB files from Sketchfab into `assets/models/raw` (needs `SKETCHFAB_TOKEN`). |
| `pnpm models:optimize` | Produces `<slug>.glb` (hero) and `<slug>-lite.glb` in `apps/web/public/models` and updates `assets/models/manifest.json`. |
| `pnpm models:credits` | Regenerates the 3D models section of `CREDITS.md` from the manifest. |
| `pnpm models:posters` | Renders a transparent WebP poster per model and theme into `apps/web/public/posters`. Run `pnpm db:seed` afterwards. |
| `pnpm models:preview` | Opens a local viewer (http://localhost:4173) that compares the original, hero and lite models. |
| `pnpm avatar:build` | Converts the Mixamo downloads in `assets/avatar/raw` with Blender, optimizes the avatar and its base outfit into `assets/avatar/out` and updates `assets/avatar/manifest.json`. `--skip-convert` reuses the intermediate GLB files. |
| `pnpm avatar:fit` | Fits the avatar-compatible catalog apparel to the mannequin with Blender (settings in `scripts/avatar/fit.json`) and writes `apps/web/public/avatar-fit/` and `apps/web/lib/avatar/catalog-fit.json`. `--only <slug>` fits one garment. |
| `pnpm avatar:upload` | Uploads the built avatar and outfit to Vercel Blob (needs `BLOB_READ_WRITE_TOKEN`) and prints the `NEXT_PUBLIC_AVATAR_*` and `NEXT_PUBLIC_OUTFIT_*` values to set in Vercel. |
| `pnpm fx:smoke` | Renders the smoke flipbook of the home hero intro into `apps/web/public/fx` (`smoke-atlas.webp` and `smoke-atlas-lite.webp`). |
| `pnpm design:preview` | Serves the reference design prototype in `design/prototype`. |

The web package also has its own Playwright end-to-end suite in `apps/web/e2e` (see [Testing](#testing)).

## Environment variables

Every variable is documented in [`.env.example`](../.env.example). Copy it to `.env` at the repository root. Scripts and apps load that file at runtime (the web loads it from `next.config.ts` without overriding variables already set); it is ignored by git and never baked into a Docker image.

In development all of them are optional:

- **API:** `DATABASE_URL` (defaults to the local Compose database), `DATABASE_URL_TEST`, `API_PORT`, `API_HOST`, `WEB_ORIGIN` (CORS), `TRUST_PROXY`.
- **AI stylist:** `ANTHROPIC_API_KEY`, `STYLIST_ENABLED`, `STYLIST_MODEL`, `STYLIST_DAILY_BUDGET_USD`.
- **Web:** `API_URL` (server side), `NEXT_PUBLIC_API_URL` (no longer used: the browser reaches the stylist through the web server), `SITE_URL` (absolute URLs in metadata, the sitemap and share images, read at build time), `REVALIDATE_SECRET` (required in production).
- **Login with Google (web):** `BETTER_AUTH_SECRET` (signs the session cookies; without it there are no sessions), `BETTER_AUTH_URL` (public web address, defaults to `SITE_URL`, then `http://localhost:3000` in development), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (without them the sign in button is hidden and the site works as before). The web also reads `DATABASE_URL` now (the same database as the API). See [Login with Google](#login-with-google).
- **Web and API:** `INTERNAL_API_KEY`, a shared secret. The web server sends it in the `x-internal-key` header, and the API then skips its rate limit for it (regenerating the home asks for every product, many requests per locale from one IP). In development, requests from 127.0.0.1 skip the limit without it.
- **Hangar 360°:** `NEXT_PUBLIC_AVATAR_URL` and `NEXT_PUBLIC_AVATAR_LITE_URL` (the avatar GLB files on Vercel Blob), `NEXT_PUBLIC_OUTFIT_URL` and `NEXT_PUBLIC_OUTFIT_LITE_URL` (its base outfit). In development they default to `apps/web/public/avatar-local/`. In production, without `NEXT_PUBLIC_AVATAR_URL` the `/hangar` page answers 404 and the site links to the home section instead. They are read at build time.
- **3D pipeline:** `SKETCHFAB_TOKEN`.
- **Avatar pipeline:** `BLENDER_PATH` (when Blender is not on the `PATH` or in `/Applications`) and `BLOB_READ_WRITE_TOKEN` (only for `pnpm avatar:upload`).
- **Seed:** `SEED_MANIFEST_PATH` (optional) seeds from another model manifest, for example one with only the models already deployed.
- **Docker:** `WEB_BUILD_API_URL` and `BUILD_STANDALONE` (see [Docker](#docker)).

In production the API refuses to start without `DATABASE_URL`, and configuration errors name the variable without printing its value.

## Architecture

```
apps/web  (Next.js)  ──server fetch──▶  apps/api  (NestJS)  ──Prisma──▶  PostgreSQL
    │                                       │
    └─/api/stylist/chat, SSE + session─────▶│──▶  Anthropic API
              packages/contracts: zod schemas shared by both sides
```

### Web (`apps/web`)

- App Router with locale routes (`/es`, `/en`) through next-intl. Every UI string lives in `messages/` (`es.json`, `en.json` and the per-section files in `messages/home/`), with the same keys in both languages. Product names and descriptions come translated from the API.
- Pages: home, catalog (search, category and brand filters, sorting, pagination), product pages, balls, Hangar 360°, club, credits, legal, account and orders (a placeholder until test payments arrive). The cart is local to the browser and survives reloads.
- The server reads the catalog from the API only (one source of truth) and validates every response with the shared contracts. Reads are cached with `'use cache'` and tagged, and `POST /api/revalidate` (called by the seed) expires those tags.
- The browser never calls the API. The floating stylist panel loads its catalog data through the web's own `/api/stylist/context` route and chats through `/api/stylist/chat`, which forwards to the API with the visitor's session token (when signed in), the internal key and the visitor's IP, and streams the SSE answer back unchanged.
- One React Three Fiber canvas per area, created on demand. Canvases stop rendering when offscreen, only one draws at a time and the pixel ratio is capped at 1.5 (1 in lite mode).
- AR uses `model-viewer` with a self-hosted Meshopt decoder (`public/vendor/`). Android tries WebXR first (Scene Viewer cannot read Meshopt and WebP GLB files, so it is only a fallback); iOS uses Quick Look, with the USDZ generated from the GLB.
- Motion has clear owners: GSAP for timelines, Motion for UI state, Lenis only for anchor jumps, React `<ViewTransition>` for route changes. `prefers-reduced-motion` turns sequences into static states. Scroll never drives animation.
- SEO: `app/sitemap.ts` lists the fixed pages and every published product in both locales with hreflang alternates (if the API is down it still returns the fixed pages), and `robots.txt` points to it. `opengraph-image.tsx` files draw the share images with `ImageResponse`: one for the home (also used by pages without their own) and one per product, with its dark poster, name, brand and price.

### API (`apps/api`)

- NestJS modules for the catalog (`/v1/products`, `/v1/brands`, `/v1/categories`), content (`/v1/credits`), health (`/health`), the stylist (`/v1/stylist/status`, `/v1/stylist/chat`) and the signed-in user (`/v1/me`).
- Requests and responses are validated with the zod schemas from `packages/contracts`. Errors are returned as `{ code }`, which the web translates.
- Prisma 7 with the `prisma-client` generator (ESM, output in `src/generated`) and the `pg` driver adapter, so no query engine binary ships at runtime.
- Helmet (strict settings for a JSON-only API), CORS limited to `WEB_ORIGIN`, a 100 kB JSON body limit, and a global rate limit (120 requests per minute per IP and route), plus per-user limits for checkout and order reads. Security review, headers and how to re-run the checks: [security.md](security.md).

### Contracts (`packages/contracts`)

zod schemas and types for the catalog, credits, health and the stylist events. Both apps import the compiled output, so build it first (`pnpm dev`, `pnpm test` and `pnpm typecheck` do it for you).

### Catalog

Products belong to one of four categories: `sneaker`, `cleat` (soccer cleats, sized like sneakers and shown on the avatar), `apparel` (with subcategories such as tees, sweatshirts, jackets, pants, shorts, caps and accessories, and letter sizes) and `ball`. Apparel marked as avatar-compatible declares its slot on the avatar. The plan for apparel and the avatar is in [`plan-paso-4.md`](plan-paso-4.md).

## 3D model pipeline (`scripts/models`)

- Downloads the original models, then normalizes them to a shared pose: sneakers with the sole on y = 0, toe to +X and 0.30 m long; balls 0.22 m wide; apparel facing +Z at real size-M scale. Because the pose is shared, hotspot positions are stored in meters in model space.
- Simplifies the meshes, converts textures to WebP and compresses with Meshopt. Each model ships as a hero GLB (under 100k triangles and 1.1 MB, textures up to 2048 px) and a lite GLB (about 20k triangles with a 40k ceiling, under 450 KB, 512 px textures). The lite files are used in lite mode, on low-end phones and on the avatar.
- Settings, including per-model overrides, live in `scripts/models/config.mjs`. `assets/models/manifest.json` records credits, license, pose and stats.
- The optimized GLB files and posters in `apps/web/public` are committed, so the site works right after cloning. Run `pnpm models` only to download and optimize again (it needs `SKETCHFAB_TOKEN`), then `pnpm models:posters` and `pnpm db:seed`.
- Check results visually with `pnpm models:preview`, not only by numbers.

## Hangar 360° avatar (`scripts/avatar`)

- The avatar is Mixamo's Y Bot with four clips (idle, walk, turn and pose). Mixamo's terms allow using it in a project but not redistributing the original files, so **the downloads and the built files are never committed**. Download them from Mixamo into `assets/avatar/raw` (git ignored): `ybot.fbx` ("With Skin", T-pose) and one FBX per clip ("Without Skin", "In Place", 30 fps). The output in `assets/avatar/out` is ignored too, and so is `apps/web/public/avatar-local/`, the copy that `pnpm dev` loads by default. Only `assets/avatar/manifest.json` is committed.
- `pnpm avatar:build` needs [Blender](https://www.blender.org). It converts each FBX to GLB, copies the clips onto the character, normalizes pose and scale (facing +Z, feet on y = 0, 1.75 m tall), trims the feet so the sneakers fit, and writes a hero and a lite variant with Meshopt and WebP textures. It also builds the base outfit (`outfit.glb`, made by the project in Blender) as separate files.
- `pnpm avatar:fit` fits each avatar-compatible garment of the catalog to the mannequin in Blender and writes `apps/web/public/avatar-fit/<slug>.glb` and `-lite.glb`, plus `apps/web/lib/avatar/catalog-fit.json` (slot, base pieces it replaces and body-hiding rules). These files hold only the garment mesh and the bone names, no Mixamo mesh, so they are committed. Fitting notes live in [`avatar-fitting.md`](avatar-fitting.md).
- The sneakers on the avatar are the catalog's own lite GLB files, attached to the foot bones.
- `pnpm avatar:upload` publishes the avatar and outfit to a public Vercel Blob store as `avatar/<name>-<hash>.glb`. A new build gets a new URL, so the files can be cached for a year. Then set the printed `NEXT_PUBLIC_AVATAR_*` and `NEXT_PUBLIC_OUTFIT_*` variables in the web project and redeploy.

## Hero smoke (`scripts/fx`)

The home hero intro lands the shoe with a puff of textured smoke. `pnpm fx:smoke` draws that flipbook (8 x 8 frames of procedural noise, the project's own work with no third-party assets) into `apps/web/public/fx`, in a full and a lite size. The files are committed; run it again only to change the look.

## AI stylist

- Runs on `claude-opus-5-5` (configurable with `STYLIST_MODEL`) with low effort and a capped number of output tokens per answer.
- Recommends only catalog products through a strict `show_products` tool whose slugs are limited to the catalog. The API checks every slug against the database and builds the cards from real data, so the model never writes prices or sizes.
- Answers in the visitor's locale, streams over Server-Sent Events (`text`, `products`, `orders`, `sign_in`, `notice`, `done`, `error`) and treats the visitor's text as data, not instructions. Messages are limited in length and number, and conversations are not stored.
- **Orders:** the session is optional. With a valid session (forwarded by `/api/stylist/chat`) the model gets `get_my_orders` and `get_order`, which read only that user's orders (status, items, total, current tracking step and the time of the next one, from the same tracking function as the order pages). The answer is plain text (on Opus 5.5, text between two tool calls comes back as a hidden progress note), and the API turns the order numbers it mentions, only among the orders it read, into cards linking to `/[locale]/orders/[id]`. Signed out it only gets `ask_to_sign_in`, and the panel shows a "Sign in" action.
- **Budget:** every answer's token usage is priced and added to a daily total. When it reaches `STYLIST_DAILY_BUDGET_USD` (default 2 USD, reset at 00:00 UTC), the stylist turns off until the next day. The chat endpoint also has its own rate limit (10 requests per minute per IP; through the web server it counts the visitor's forwarded IP), and `STYLIST_ENABLED=false` turns it off by hand.
- **Fallback:** without an API key, over budget or switched off, `/v1/stylist/status` reports it as unavailable and the web plays a scripted demo conversation with the suggested ideas instead, so the section always works. Questions about orders (detected in Spanish and English by `detectOrderQuestion` in the contracts) still go to the API, which answers them without the model: real order cards when signed in, or the sign-in action.

## Login with Google

Accounts use [Better Auth](https://www.better-auth.com) inside the web app with Google as the only provider. The plan is in [`plan-paso-5.md`](plan-paso-5.md).

**How it works.**

- `apps/web/app/api/auth/[...all]/route.ts` mounts Better Auth (`/api/auth/*`; `proxy.ts` skips `api/`). The configuration is in `apps/web/lib/auth/`.
- Better Auth stores users, sessions, linked Google accounts and OAuth state in the `user`, `session`, `account` and `verification` tables. They are defined in `apps/api/prisma/schema.prisma` and created by the `auth_tables` migration, so `pnpm db:migrate` (and the API's Vercel build against Neon) creates them like every other table. The web talks to them through Better Auth's own Postgres adapter (a `pg` pool on `DATABASE_URL`), and Better Auth checks the columns on first use.
- The session cookie is httpOnly and `SameSite=Lax`; with an https base URL (production) it is also `Secure` with the `__Secure-` prefix. Sessions last 7 days and refresh once a day while used.
- The browser reads the session from `/api/auth/get-session`, so every page stays static. The header shows "Sign in" (only when the Google keys exist) or the user's avatar with a menu (My orders, My account, Sign out). Below 520 px the account lives in the phone menu. Sign in returns to the same page; a Google error (or a cancelled sign in) lands on `/[locale]/account?error=<code>`, which explains it in the visitor's language.
- **API side.** The session cookie belongs to the web's domain, so it never reaches the API. The web server reads its session and forwards the opaque session token as `Authorization: Bearer <token>` (`apps/web/lib/auth/api-session.ts`). The API's `SessionAuthGuard` (`apps/api/src/auth/`) looks the token up in the shared `session` table, checks that it has not expired and exposes the user with `@CurrentUser()`. `GET /v1/me` returns `{ id, name, email, image }` or `401 { code: 'unauthorized' }`. A signed-out session (row deleted) stops working on the next request, and the API never needs the cookie secret.
- The cart stays in the browser; signing in does not change it. Linking it to the account comes with orders.

**Create the Google OAuth client** (free, once per Google Cloud project):

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services > OAuth consent screen** (Google Auth Platform > Branding): app name "AIRSPACE Wear", a support email and a developer contact email. Audience: **External**. While the app is in **Testing**, add the Google accounts that may sign in as test users (or publish it; the `openid`, `email` and `profile` scopes need no verification).
3. **Clients > Create client**, type **Web application**:
   - Authorized JavaScript origins: `http://localhost:3000` and `https://airspace-wear-web.vercel.app`.
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://airspace-wear-web.vercel.app/api/auth/callback/google`.
4. Copy the client ID and secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the root `.env`, add `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and restart `pnpm dev`. The "Sign in" button appears in the header.
5. In production, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (its own value), `BETTER_AUTH_URL=https://airspace-wear-web.vercel.app` and `DATABASE_URL` (Neon's pooled connection) in the web project, then redeploy (the button's visibility is decided at build time).

**Testing without Google.** The API e2e suite (`apps/api/test/me.e2e-spec.ts`) seeds sessions directly in `airspace_test`. The web suite (`apps/web/e2e/auth.spec.ts`) inserts a user and a session in the development database and sets the cookie Better Auth would set (the token signed with `BETTER_AUTH_SECRET`), then deletes them. It checks the header in both states, the keyboard menu, sign out, the phone menu, the error page, that the cart survives, and that "Sign in" redirects to Google with the right client and redirect URI (the request to Google is intercepted).

## Test payments and orders

Checkout uses [Stripe Checkout](https://docs.stripe.com/payments/checkout) in **test mode only**: no real money is ever charged. The plan is in [`plan-paso-5.md`](plan-paso-5.md) (phases 2 and 3).

**Flow.**

1. The cart's "Pay" button calls a server action (`apps/web/lib/orders/actions.ts`). Signed out, it starts Google sign in and comes back to the same page with `?cart=open` (the cart opens on its own).
2. Signed in, the web server forwards only `slug`, `size` and `quantity` per line to `POST /v1/checkout` with the session token (`Authorization: Bearer`) and the internal key. The request schema is strict, so a price or any extra field is rejected.
3. The API (`apps/api/src/orders/`) prices every line from the database (published, on sale, valid size, enough stock), creates a `pending` order with a snapshot of names (es and en), sizes, prices and posters, and creates a Checkout Session (`mode: payment`, `price_data` from server prices, `client_reference_id` and `metadata.orderId`, the user's email, the Stripe locale, 30 minute expiry, idempotency key = order id). It returns the session URL and the browser goes there.
4. Stripe returns to `/[locale]/orders/<id>?paid=1&session_id=...` (cancel returns to `/[locale]/catalog?cart=open`).
5. `checkout.session.completed` (webhook) marks the order `paid` with `paidAt` and a fake tracking number. The update only touches a `pending` order whose session id and amount match, so retried events are harmless. `checkout.session.expired` marks it `expired`.
6. **Fallback without webhook:** `GET /v1/orders/:id` asks Stripe for the session while the order is still pending, so local development works without `stripe listen`. The order page also refreshes itself for a few seconds after `?paid=1` until the payment shows up, and only then clears the local cart.

**Tracking** is simulated: one step every 5 minutes after payment (Paid, Preparing, Shipped, On the way, Delivered). `apps/api/src/orders/tracking.ts` is a pure function with unit tests; the API returns every step with its reached or estimated time.

**Endpoints.** `POST /v1/checkout` (session required, 10 attempts per minute per user and per IP), `GET /v1/orders` (mine, newest first), `GET /v1/orders/:id?locale=` (mine only, `404` otherwise), `POST /v1/stripe/webhook` (no session; the `Stripe-Signature` header is verified against the raw body, which every entry point keeps through `APP_OPTIONS = { rawBody: true }` in `app.setup.ts`: `src/main.ts`, `api/index.ts` and the e2e app). Without `STRIPE_SECRET_KEY` checkout answers `503` and the cart shows "test payments are not set up"; without `STRIPE_WEBHOOK_SECRET` the webhook answers `503` and orders are confirmed by the fallback. Only `sk_test_` / `rk_test_` keys are accepted: a live key turns payments off.

**Web.** `/[locale]/orders` (list) and `/[locale]/orders/[id]` (confirmation, items, totals, tracking timeline) read the session behind `<Suspense>`, are `noindex`, and show a sign in panel when signed out. `apps/web/lib/orders/` holds the server client (`fetchOrders`, `fetchOrder`, `createCheckout`) that other pages (such as the account page) can reuse.

**Local setup.**

1. Put the Stripe test keys in the root `.env` (`STRIPE_SECRET_KEY=sk_test_...`; the Vercel Marketplace sandbox provides them) and restart `pnpm dev`.
2. Optional, to receive webhooks locally with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

   ```bash
   stripe listen --forward-to localhost:4000/v1/stripe/webhook
   ```

   Copy the printed `whsec_...` to `STRIPE_WEBHOOK_SECRET` and restart the API. Without it, the fallback above confirms payments when the order page opens.
3. Pay with the card `4242 4242 4242 4242`, any future date and any CVC.

**Production webhook.** In the Stripe dashboard (test mode) go to **Developers > Webhooks > Add endpoint**: URL `https://airspace-wear-api.vercel.app/v1/stripe/webhook`, events `checkout.session.completed` (and optionally `checkout.session.expired` and `checkout.session.async_payment_succeeded`). Copy its signing secret to `STRIPE_WEBHOOK_SECRET` in the API project on Vercel, set `WEB_PUBLIC_URL=https://airspace-wear-web.vercel.app` there too (return URLs; otherwise the first `WEB_ORIGIN` is used) and redeploy. Run `pnpm db:migrate` against Neon (the API build does it) so the `orders` migration creates the `Order` and `OrderItem` tables.

**Tests.** `apps/api/test/orders.e2e-spec.ts` replaces the Stripe network calls with a fake (no network) and keeps the real signature check with a test secret: checkout pricing and validation, price tampering, 503 without keys or when Stripe fails, webhook signature, idempotency, amount or session mismatch, expiry, ownership (404), the fallback and tracking. `apps/web/e2e/orders.spec.ts` seeds orders in the development database for the list, detail, confirmation and phone layout, and clicks "Pay" (the Stripe page is intercepted; with keys the API creates a real test-mode session).

## Testing

```bash
pnpm test        # unit tests (Vitest): config, filters, DTOs, seed, prompt, budget, SSE with a mocked SDK
pnpm test:e2e    # API integration tests against airspace_test (needs pnpm db:up)
pnpm lint
pnpm typecheck
pnpm --filter @airspace/web e2e   # web end-to-end tests (Playwright, system Chrome)
```

- The integration tests only accept a database named `airspace_test` (created by `docker/postgres/init` on the first `pnpm db:up`), so the development data is never touched.
- The stylist tests use a mocked Anthropic client and never spend tokens. The web end-to-end suite intercepts every stylist request too.
- The web suite (`apps/web/e2e`) runs against the system Chrome (`channel: 'chrome'`) at 1720x816. It reuses a running `pnpm dev` or starts one; like the build, it needs the API and the database.

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

## Deploying to Vercel

The live site runs on two Vercel projects (Hobby plan) connected to this repository, plus a Neon Postgres database from the Vercel Marketplace. Every push to `main` deploys both.

| Project | Root directory | URL |
| --- | --- | --- |
| `airspace-wear-api` | `apps/api` | https://airspace-wear-api.vercel.app |
| `airspace-wear-web` | `apps/web` | https://airspace-wear-web.vercel.app |

**API.**

- `apps/api/vercel.json` builds the contracts, runs `prisma migrate deploy` against Neon's direct connection (`DATABASE_URL_UNPOOLED`) and generates the Prisma client.
- The API then runs as one plain function, `apps/api/api/index.ts`, that boots Nest once per instance; every path is rewritten to it.
- Vercel's automatic NestJS launcher is not used because it failed to start Nest 12, which is ESM-only.

**Web.**

- `apps/web/vercel.json` builds the contracts, then Next.
- The build prerenders the catalog against the live API, so deploy the API first when both change in ways that depend on each other.

**Environment variables.** Set them in each project, never in the repository:

| Project | Variables |
| --- | --- |
| API | `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (added by the Neon integration), `ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`, `WEB_ORIGIN`, `TRUST_PROXY=1`, `STYLIST_DAILY_BUDGET_USD`, `ENABLE_EXPERIMENTAL_COREPACK=1` |
| Web | `API_URL`, `NEXT_PUBLIC_API_URL`, `SITE_URL`, `DATABASE_URL` (Neon, pooled), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTERNAL_API_KEY` (same value as the API), `REVALIDATE_SECRET`, `NEXT_PUBLIC_AVATAR_URL`, `NEXT_PUBLIC_AVATAR_LITE_URL`, `NEXT_PUBLIC_OUTFIT_URL`, `NEXT_PUBLIC_OUTFIT_LITE_URL`, `ENABLE_EXPERIMENTAL_COREPACK=1` |

**Avatar hosting.** The Hangar 360° avatar is not in the repository (Mixamo license), so the web cannot serve it from `public/`. It lives in a public Vercel Blob store: run `pnpm avatar:build` and `pnpm avatar:upload` locally, set the printed `NEXT_PUBLIC_*` variables in the web project and redeploy (they are read at build time). The fitted apparel in `public/avatar-fit/` is committed and deploys with the web.

**Seeding.** Seed the Neon database once from your machine. Point `DATABASE_URL` at Neon's direct connection for that run only (for example from `vercel env pull` into a file outside the repository), then run `pnpm db:seed`. Delete the pulled file afterwards.

**Hosting cost.** Both projects, Neon and the Blob store run on free plans. The only running cost is the AI stylist, capped by `STYLIST_DAILY_BUDGET_USD`.
