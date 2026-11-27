# Security review

Review of AIRSPACE Wear against the OWASP Top 10 (2021 and 2025) and the OWASP API Security Top 10 (2023), done on 2026-11-27 by the owner's request. The goal is that the site passes a typical web and API pentest. This document lists what was checked, what was found and fixed, what remains, and how to run the checks again.

## Scope

- **Web** (`apps/web`, https://airspace-wear-web.vercel.app): Next.js 16 pages, the proxy (`proxy.ts`), route handlers (`/api/auth/*`, `/api/stylist/chat`, `/api/stylist/context`, `/api/stylist/orders-hint`, `/api/revalidate`, `/api/dev/avatar-fitting`), the checkout server action (`lib/orders/actions.ts`) and Better Auth (Google sign-in).
- **API** (`apps/api`, https://airspace-wear-api.vercel.app): NestJS on Vercel as a plain function, catalog and content reads, `/v1/me`, checkout and orders, the Stripe webhook and the AI stylist with its order tools.
- **Shared**: `packages/contracts` (zod schemas), dependencies, environment variables and the Vercel setup.
- Out of scope: Google, Stripe, Neon, Anthropic and Vercel themselves, and denial of service tests (the review only confirmed limits with a few requests).

## Method

1. Mapped the attack surface: every endpoint, route handler, server action, cookie, internal header and third-party origin (table below).
2. Read the code of each entry point for authorization, validation, size limits, error handling and secrets.
3. Tested locally (dev servers on :3000 and :4000, and a local production build on :3100) with curl and Playwright scripts, then confirmed safe findings on production with a few non-destructive requests (no load tests, no brute force, Stripe stays in test mode).
4. Scanned the production client JavaScript (26 chunks from four pages) for secrets and environment values.
5. Ran `pnpm audit` on production and development dependencies.
6. Fixed, added regression tests (API e2e, API unit, web e2e) and re-tested.

### Attack surface

| Surface | Auth | Notes |
| --- | --- | --- |
| `GET /v1/products`, `/v1/products/:slug`, `/v1/brands`, `/v1/categories`, `/v1/credits` | public | zod-validated query and params, public cache |
| `GET /health` | public | no rate limit, database ping cached 2 s |
| `GET /v1/me`, `GET /v1/orders`, `GET /v1/orders/:id`, `POST /v1/checkout` | Bearer session token | the web server forwards the Better Auth token; the API looks it up in the `session` table |
| `POST /v1/stripe/webhook` | Stripe signature | raw body, 300 s tolerance |
| `GET /v1/stylist/status`, `POST /v1/stylist/chat` | optional Bearer | streaming SSE; order tools only with a valid session |
| `/api/auth/*` (web) | Better Auth | Google OAuth, session, sign-out, revoke other sessions |
| `/api/stylist/chat`, `/api/stylist/context`, `/api/stylist/orders-hint` (web) | session cookie (optional) | bridges to the API from the web server |
| `/api/revalidate` (web) | `x-revalidate-secret` | used by `pnpm db:seed` |
| `/api/dev/avatar-fitting` (web) | none | returns 404 in production |
| `startCheckout` server action (web) | session cookie | forwards slug, size and quantity only |
| Cookies | | `__Secure-better-auth.session_token`, `__Secure-better-auth.state` (HttpOnly, Secure, SameSite=Lax), `NEXT_LOCALE` (not sensitive) |
| Internal headers | | `x-internal-key` (web server to API, skips the per-IP limit), `x-client-ip` (visitor IP, trusted only with the internal key) |
| Third-party origins | | `accounts.google.com`, `checkout.stripe.com`, `*.googleusercontent.com` (profile photos), `*.public.blob.vercel-storage.com` (Hangar avatar), Google Fonts (server side, share images only) |

## Findings

Severity follows CVSS-like judgement for this project (a portfolio store with test-mode payments). All "Fixed" items are in the working tree and need a deploy to reach production.

| ID | OWASP | Severity | Status | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| S-01 | A05 Security Misconfiguration, API8 | Medium | Fixed | Production web pages had no Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy or COOP, and sent `X-Powered-By: Next.js` (`pnpm security:check` baseline: 25 failures). | `lib/security/headers.ts` adds all of them to every response from `next.config.ts`; `poweredByHeader: false`. Clickjacking blocked with `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| S-02 | A05, API8 | Low | Fixed | The API used helmet defaults meant for HTML (`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, HSTS without preload). | `HELMET_OPTIONS` in `app.setup.ts`: CSP `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS two years with preload, `Referrer-Policy: no-referrer`, explicit `x-powered-by` off, CORS without credentials. |
| S-03 | API4 Unrestricted Resource Consumption, A04 | Medium | Fixed | Order list and detail reads arrive with the internal key (so the per-IP limit does not apply) and had no per-user limit. The web route handlers (`orders-hint`, `stylist/context`, `stylist/chat`, `revalidate`) and the checkout server action had no limit of their own, so one client could make the web server hit the database or the API without bound. | API: 60 order reads per minute per user (`CheckoutThrottle.hitRead`). Web: `lib/security/rate-limit.ts` (per IP, production only) on all four route handlers and the checkout action. Every 429 now carries `Retry-After` (API `RateLimitedException`, web `limitResponse`, Better Auth via the auth route). |
| S-04 | A01 Broken Access Control, API4 | Low | Fixed | The stylist bridge took the visitor IP from the first `X-Forwarded-For` value. Vercel overwrites that header (confirmed: a spoofed value did not change the Better Auth bucket in production), but a self-hosted `next start` keeps a client-supplied value (Next only fills it when missing), so a visitor could rotate fake IPs to dodge the stylist limit. | `lib/security/client-ip.ts` trusts forwarded headers only on Vercel or with `TRUST_PROXY=<hops>`; otherwise the limit uses a shared bucket. |
| S-05 | A05, API4 | Low | Fixed | `TRUST_PROXY` defaulted to 0. On Vercel without the variable every visitor would share one bucket (`request.ip` would be the platform's address). The loopback skip of the API limit depended only on `NODE_ENV`. | `TRUST_PROXY` defaults to 1 when `VERCEL` is set; the loopback skip never applies on Vercel. |
| S-06 | A02 Cryptographic Failures, A07 | Low | Fixed | `/api/revalidate` compared the secret with `!==` (timing side channel) and had no rate limit. | Constant-time comparison of SHA-256 digests, 5 attempts per minute per IP, `Cache-Control: no-store`. |
| S-07 | A01 (open redirect) | Low | Fixed | The checkout action accepted any host ending in `stripe.com` (for example `evilstripe.com`) as the redirect target. Exploiting it needs a compromised API response. | Only `https://checkout.stripe.com` without credentials in the URL. |
| S-08 | API4, LLM10 Unbounded Consumption | Low | Fixed | A stylist request could carry 20 messages of 4,000 characters (assistant turns are client-supplied), about 20k input tokens per call, draining the daily budget faster. | `STYLIST_LIMITS.totalChars` (24,000) in the shared schema; the client trims old turns to fit and caps each stored answer at 4,000 characters. |
| S-09 | A06 Vulnerable Components | Low | Fixed | `pnpm audit --prod`: high, `effect` ReDoS (GHSA-7589-6fvf-x4pw) through `@prisma/config` (pins 3.20.0). Only used when Prisma reads its config (build and CLI), not with user input. | `overrides: effect: 3.22.4` in `pnpm-workspace.yaml` (minor upgrade, older than the minimum release age). `pnpm audit --prod` is now clean. |
| S-10 | A05, A10:2025 Mishandling of Exceptional Conditions | Low | Fixed | `/es/products/%E0%A4%A` crashed the proxy (`decodeURIComponent` threw) and returned 500 on a local production build. Vercel's edge rejects such URLs before the function, so production was not affected. | The proxy answers 400, like Next does for other malformed paths. |
| S-11 | A01 (CSRF) | Low | Fixed | The stylist bridge accepted any content type, so another site could send a "simple" cross-site `text/plain` POST. SameSite=Lax keeps the session cookie off cross-site POSTs, so the impact was cost, not data. | The bridge answers 415 unless the body is `application/json` (which forces a CORS preflight the site never approves). |
| S-12 | A05 | Info | Fixed | zod 4 probes `new Function("")` to compile validators; under the new CSP (no `'unsafe-eval'` in production) that logged a CSP violation on the catalog page. | `z.config({ jitless: true })` in `packages/contracts/src/zod-config.ts`. |
| S-13 | A07 Identification and Authentication Failures | Info | Fixed | Better Auth limits were implicit and its 429 used a non-standard `X-Retry-After`. | Explicit `rateLimit.customRules` for sign-in, callback, sign-out and session revocation; explicit session lifetime (7 days, refreshed daily, no cookie cache so revocation is immediate); the auth route adds `Retry-After` and rejects bodies over 16 kB. |
| S-14 | A05 | Info | Accepted | CSP needs `script-src 'unsafe-inline'`: Next writes per-page inline scripts with the React payload, and Cache Components serve one prerendered shell to everyone, so per-request nonces would force every page to render dynamically. | Mitigated: no HTML injection sinks (only a static boot script uses `dangerouslySetInnerHTML`), AI output rendered as React text, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, a tight `connect-src`, no `'unsafe-eval'` in production. Revisit if Next adds hash-based CSP for static shells. |
| S-15 | API4 | Info | Accepted | All rate limits (API, web, Better Auth) are in memory per function instance; a distributed client is only slowed per instance. | See residual risks. |
| S-16 | A07 | Info | Accepted | `POST /api/auth/sign-in/social` works from any origin when no cookie is sent (Better Auth checks the origin only for cookie-bearing requests). The OAuth `state` cookie binds the flow to the browser that started it, so login CSRF is not practical. | None needed. |
| S-17 | A06 | Info | Accepted | Development-only advisories: `zod` (high, through the `@vercel/blob` CLI tooling), `glob` and `minimatch` (moderate, through `@gltf-transform/cli`). They run only in local asset scripts, never in the deployed apps. | Re-check when those tools update. |
| S-18 | A05 | Info | Accepted | `/health` has no rate limit and reports uptime. | The database ping is cached 2 s, so a flood costs one query per 2 s; uptime is not sensitive. |

### Verified, no finding

- **Object-level authorization (API1, A01).** `GET /v1/orders/:id` filters by `id` and `userId` and answers 404 for another user's UUID (same as unknown); `GET /v1/orders` only lists the caller's orders; non-UUID ids are rejected with 400. The stylist tools only exist with a valid session, and `get_my_orders` and `get_order` filter by the session's `userId` (an order number of another user returns `found: false`). Order cards are built only from orders read in that response. Covered by `apps/api/test/orders.e2e-spec.ts` and `stylist.e2e-spec.ts`.
- **Prompt injection.** The system prompt holds no secrets (store rules and the public catalog). Tool results are JSON data from the caller's own orders, without ids, emails or payment data. A forged conversation can only steer the model within the caller's own data and the public catalog.
- **Authentication.** Session tokens are looked up by unique index; expired or deleted sessions fail on the next request; tokens are format-checked before reaching the database. Cookies are `__Secure-` prefixed, HttpOnly, Secure and SameSite=Lax in production. `callbackURL` and `errorCallbackURL` to another site answer 403 (tested on production). Cookie-bearing requests from another origin answer 403 (CSRF), tested in `apps/web/e2e/security.spec.ts`.
- **Internal key.** Compared in constant time; the web builds API headers on the server and never forwards browser headers, so a browser cannot send `x-internal-key` or `x-client-ip` through it. A wrong key, a spoofed `X-Forwarded-For` or `x-client-ip` do not skip the API limit (tested on production with 11 requests and in `security.e2e-spec.ts`).
- **CORS.** Only the `WEB_ORIGIN` list, no credentials; the browser never calls the API directly.
- **Payments (A08).** Prices, names, sizes and stock come from the database (strict schema rejects extra fields such as a price); the paid amount and currency must match the order; the webhook verifies the signature on the raw body with a 300 s tolerance (replay test added) and is idempotent (only pending orders change).
- **Injection (A03).** Prisma query builder everywhere; the only raw query is the constant `SELECT 1`. Every body, param and query goes through zod with length limits; JSON bodies are capped at 100 kB (413 above). SSE events are JSON-encoded.
- **Secrets (A02).** No secret values in the production client bundles (only Better Auth's environment getter names). `NEXT_PUBLIC_*` holds only the avatar and outfit URLs and the API URL. Local `BETTER_AUTH_SECRET` is 44 characters.
- **Errors and logging (A09).** Errors are `{ code }` JSON without stack traces; stacks go to server logs only. Logs never include tokens, keys or full IPs (rate limit warnings mask the last IPv4 block). Invalid webhook signatures and rate limit hits are logged once per window.
- **SSRF (A10:2021).** Server-side fetches use fixed hosts (`API_URL`, Google Fonts) or regex-checked local paths (posters). No user-supplied URL is fetched.
- **Dev tools.** `/api/dev/avatar-fitting` and `/[locale]/hangar/dev` answer 404 in production (checked).

## Rate limits

| Where | Rule |
| --- | --- |
| API, every route | 120 per minute per IP and route (`RateLimitGuard`), `Retry-After` on 429 |
| API, `POST /v1/checkout` | 10 per minute per IP and 10 per minute per user |
| API, `GET /v1/orders`, `/v1/orders/:id` | 60 per minute per user |
| API, `POST /v1/stylist/chat` | 10 per minute per IP (direct) or per visitor IP forwarded by the web, plus the daily budget (`STYLIST_DAILY_BUDGET_USD`) |
| Web, `/api/stylist/chat` | 20 per minute per IP |
| Web, `/api/stylist/orders-hint` | 30 per minute per IP |
| Web, `/api/stylist/context` | 60 per minute per IP |
| Web, checkout action | 20 per minute per IP |
| Web, `/api/revalidate` | 5 per minute per IP |
| Better Auth | 100 per 10 s per IP and path; `/sign-in/social` 10 per minute; `/callback/*` 20 per minute; `/sign-out` 20 per minute; session revocation 5 to 10 per minute |

The web limits run only in production (`NODE_ENV=production`); `WEB_RATE_LIMIT=off` disables them, for example to run the e2e suite against a local production build.

## Residual risks and recommendations

- **Per-instance limits.** Vercel runs several instances, each with its own counters. A free shared store is not available on Hobby; if abuse ever shows up, move the counters to a shared store (Upstash Redis or Vercel Runtime Cache) behind the same helpers, or Better Auth's `rateLimit.storage: 'database'` (needs a `rateLimit` table and adds a write per auth request).
- **Vercel Firewall (recommendation only).** The platform DDoS mitigation is automatic. In the dashboard (Firewall), consider: the free Bot Protection managed ruleset in "log" first, then "challenge"; a custom rule that denies paths like `/.env`, `/.git/*`, `/wp-*` and `*.php`; a rate limit rule on `/api/stylist/chat` and `/api/auth/*` if your plan includes WAF rate limiting; Attack Challenge Mode during an incident. Do not enable paid features without deciding to.
- **Stylist budget.** A determined client with many IPs can still exhaust the daily budget (US$2); the stylist then falls back to the scripted demo. That is the intended failure mode.
- **CSP `'unsafe-inline'`** (S-14). Accepted for now.
- **Neon roles.** Today the web (Better Auth) and the API share one database role. A tighter setup: a role for the web limited to the `user`, `session`, `account` and `verification` tables, and the API role without DDL rights at runtime (keep the owner role for `prisma migrate deploy` in the build only).
- **Secrets.** `BETTER_AUTH_SECRET` must be at least 32 random characters in production (could not be read from here; generate with `openssl rand -base64 32` if unsure, which signs everyone out). Rotate `INTERNAL_API_KEY`, `REVALIDATE_SECRET` and the Stripe webhook secret if they ever leak.
- **Google console.** Keep only `https://airspace-wear-web.vercel.app/api/auth/callback/google` (and the localhost one for development) as authorized redirect URIs.
- **Stripe.** Keep test mode keys only (the API refuses live keys). Prefer a restricted key (`rk_test_`) with Checkout Sessions write and read only; subscribe the webhook only to `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`.
- **HSTS preload.** `vercel.app` is already on the preload list. For a custom domain, submit it at hstspreload.org once the headers are live.

## Owner actions after deploying

1. Deploy both Vercel projects. No new environment variable is required.
2. Optional: confirm `TRUST_PROXY=1` on the API project (it is now the default on Vercel) and that `REVALIDATE_SECRET` is set on the web project (production answers 403 without the right secret, so it is set).
3. Run `pnpm security:check` and confirm "Todo en orden".

## Re-running the checks

```bash
# Production, safe (about 15 requests, nothing changes)
pnpm security:check

# Local production build (web on :3100, API on :4000)
pnpm --filter @airspace/web exec next build
WEB_RATE_LIMIT=off pnpm --filter @airspace/web exec next start --port 3100
pnpm security:check -- --web http://localhost:3100 --api http://127.0.0.1:4000

# Regression tests
pnpm test            # API unit tests (limits, IP masking, TRUST_PROXY default, loopback skip)
pnpm test:e2e        # API e2e: test/security.e2e-spec.ts, orders (IDOR, per-user limits, webhook replay), stylist (own orders only)
pnpm --filter @airspace/web e2e e2e/security.spec.ts   # headers, CSP violations, open redirect, CSRF, body limits

# Dependencies
pnpm audit --prod
```

When adding a third-party origin (a script, image host, API called from the browser), add it to `lib/security/headers.ts` and run the web e2e suite: any CSP violation shows up as a console error in the tests.
