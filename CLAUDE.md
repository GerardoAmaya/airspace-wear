# AIRSPACE Wear

Multi-brand sneaker, apparel and soccer ball e-commerce. Portfolio project, not affiliated with Nike, Adidas, New Balance or any other brand shown.

## Working agreement

- Explain the plan before writing code, and wait for approval on anything beyond a small, obvious change.
- All code in English: variables, functions, files, routes, DB tables and commits.
- All code comments in Spanish.
- Never use em dashes in UI text or docs. Use commas, colons, parentheses or periods instead.
- Never read, print or log `.env` files or their values. Scripts load them at runtime (`node --env-file=.env`). Document every new variable in `.env.example`.
- Third-party skills in `.claude/skills/` are reference material (see `THIRD_PARTY.md` there). This file wins on any conflict, and no skill justifies changes the approved plan did not include.

## Features

- Apple-style scroll 3D product pages.
- AR view with model-viewer.
- 360° animated avatar: a Mixamo character wearing the selected sneaker and a default outfit. The sneakers and the catalog apparel marked as avatar-compatible change on the avatar (plan: docs/plan-paso-4.md).
- AI stylist that recommends products from the catalog.

## Stack

- Frontend: Next.js (App Router) + TypeScript + React Three Fiber, in `apps/web`.
- Backend: NestJS + PostgreSQL, in `apps/api`.
- Docker for local services and deployment.
- pnpm workspaces monorepo, Node 22 or later.

## Repository layout

```
apps/web/                     Next.js frontend (next-intl, R3F); messages/ holds es.json and en.json
apps/web/public/models/       optimized GLB files (generated, committed)
apps/api/                     NestJS backend (Prisma 7 in prisma/, client generated into src/generated/)
packages/contracts/           zod schemas shared by web and API (build before use: pnpm dev does it)
docker-compose.yml            local Postgres on 127.0.0.1:5434 (pnpm db:up / pnpm db:down); `full` profile adds migrate, seed, api (:4001) and web (:3001) (pnpm docker:up / pnpm docker:down)
.dockerignore                 build context for apps/api/Dockerfile and apps/web/Dockerfile (built from the root)
README.md                     project overview, setup, scripts, architecture, testing and Docker
assets/models/raw/            original GLB downloads (git ignored, re-download with pnpm models:download)
assets/models/manifest.json   model metadata: credits, license, pose and stats (generated, committed)
scripts/models/               3D model pipeline
design/prototype/             Flight Deck design and motion prototype (static HTML, reference only)
scripts/design/               local server for the prototype (pnpm design:preview)
.claude/                      Claude Code settings, commands and skills
CREDITS.md                    third-party credits (3D models section generated)
```

## i18n

- next-intl with locale routes `/es` and `/en`. Spanish is the default locale.
- Language switcher in the header.
- No hardcoded UI text. Every string lives in `apps/web/messages/es.json` and `apps/web/messages/en.json`, and both files keep exactly the same keys. This includes alt text, aria labels, page metadata, 3D hotspots and AR texts.
- Product names and descriptions are stored per language in the database (a translations table keyed by product and locale), never in the message files.
- The AI stylist answers in the selected language.
- Format prices, dates and numbers with the next-intl formatters, never by string concatenation.
- Run `/i18n-check` before finishing any UI work.

## Brand

| Token | Value |
| --- | --- |
| `background` | `#0E0E10` |
| `surface` | `#1C1C21` |
| `primary` | `#C6FF3D` |
| `secondary` | `#FF5B2E` |
| `text` | `#F4F1EA` |

- Colors are design tokens. Never hardcode hex, rgb() or rgba() values in components. For alpha variants use `color-mix(in srgb, var(--token) N%, transparent)`.
- Logo: "AIRSPACE" in bold, followed by "Wear" smaller in `#C6FF3D` (in light mode it uses the primary ink color so it stays legible).
- Typography (all SIL Open Font License, variable, with a width axis). Load them with `next/font/google`:
  - **Hubot Sans** for display: uppercase, expanded (`wdth` 125, about 108 on phones so long Spanish words fit), weight about 800.
  - **Mona Sans** for body text and UI.
  - **Martian Mono** for HUD labels, telemetry, prices and the departures board.
  - Always use the font tokens, never a font name in a component.
- Design direction: "Flight Deck" visual style (HUD lines, corner brackets, mono data labels, grid) with cinematic, Gallery-like restraint for the 3D shoe sequences. The copy does NOT use flight or airport metaphors (no vuelos, salidas, puertas, embarque, torre de control, pase de abordar): the user found them odd. UI text speaks of sneakers, apparel and balls. The only exception is "Hangar 360°". Glossary: `design/prototype/COPY.md`. The reference prototype lives in `design/prototype/` (`pnpm design:preview`) and its tokens in `design/prototype/core/tokens.css`.

### Light and dark mode

- `<html data-theme="dark|light">`. Dark ("night flight") is the brand palette above. Light ("day flight") inverts it: background `#F4F1EA`, surfaces `#FBF9F4` / `#FFFFFF`, text `#0E0E10`.
- Each accent has two roles. **Ink** (`--color-primary`, `--color-secondary`) is used for text, lines and marks on the page background: lime and orange in dark, `#4D6B00` and `#C2410C` in light (AA contrast on cream). **Fill** (`--color-primary-fill`, `--color-secondary-fill`) is used for buttons, active chips and highlights: always `#C6FF3D` and `#FF5B2E`, with `#0E0E10` text on top. Never put dark text on the ink color or lime text on a light background.
- Choice order: saved choice (localStorage), then `prefers-color-scheme`. Set the attribute with an inline script in `<head>` before paint, so there is no flash.
- The theme switch in the header animates with the View Transitions API (a circle that grows from the switch) and falls back to an instant change.
- Every screen, the 3D scenes and AR texts must be checked in both themes.
- Footer disclaimer, translated in both languages: "Portfolio project. Not affiliated with any brand shown."
- Credits live in `/CREDITS.md` and on the `/credits` page. The page reads model credits from `assets/models/manifest.json`.

## Motion

The site is full motion. Each library has one job:

| Library | Owns |
| --- | --- |
| Lenis (`lenis/react`) | Smooth anchor jumps (`scrollTo`) only. Wheel and touch stay native (`smoothWheel: false`). One instance in the root layout. |
| GSAP + ScrollTrigger + SplitText (`@gsap/react`) | Time-based timelines: entrances that play when content enters view (ScrollTrigger only as a trigger), text reveals, 3D camera moves, autoplay sequences. |
| Motion (`motion/react`) | UI state and interaction: hover, tap, drawers, modals, layout animations, enter and exit. |
| React `<ViewTransition>` | Route transitions, such as the product card morphing into the product page. |
| React Three Fiber + drei + `@react-three/postprocessing` | 3D scenes. |

Rules:

- **Scroll never drives animation.** No pinned sections and no `scrub`. The user tested a scroll-driven version and found it stuck and slow, especially on desktop. Content animates on its own: a one-shot entrance when it enters view (`once: true`), or a loop while visible. Anything the user should steer gets an explicit control (buttons, drag), never the scroll position.
- Loops and idle motion pause when offscreen. 3D stops rendering when its canvas is not visible (`setRendering(false)`), only one canvas draws at a time, and DPR is capped at 1.5 (1 in lite mode).
- No `backdrop-filter` and no live `blur()` filters: they repaint every frame, especially over 3D.
- Load 3D models on demand and prefetch on hover or focus. Preload only what the first screen shows.
- GSAP owns timelines, Motion owns UI state. Never animate the same element and property with both.
- One frame loop: drive Lenis from `gsap.ticker`, set `gsap.ticker.lagSmoothing(0)` and call `ScrollTrigger.update` on every Lenis scroll event. Per-frame values (pointer, rotation, progress) live in refs or a store, never in React state.
- Never call `setState` inside per-frame callbacks (`useFrame`, ScrollTrigger `onUpdate`). Write to refs.
- Animate only `transform`, `opacity` and shader uniforms. Never animate layout properties (`width`, `height`, `top`, `margin`).
- Register GSAP plugins once in a client module. Put GSAP code inside `useGSAP` with a scope so it cleans up. Call `ScrollTrigger.refresh()` after fonts and 3D models finish loading.
- Durations and easings are motion tokens defined once and shared by GSAP, Motion and CSS.
- `prefers-reduced-motion`: no smooth anchor jumps, no autoplay or loops, sequences become static states, keep only short opacity fades.
- Lite mode: an inline script in `<head>` adds a `lite` class to `<html>` before hydration on low-end devices (`hardwareConcurrency <= 4`, `deviceMemory <= 4`, Save-Data, or a 2g/3g connection). Lite mode loads the `-lite.glb` models, caps DPR at 1, disables postprocessing and swaps the 3D canvas for a poster image where needed.
- The intro animation plays once per session (sessionStorage) and is skipped on deep links and with reduced motion.
- Reload (Cmd+R) must land where the user was and in a correct state: set `history.scrollRestoration = 'manual'` in `<head>`, save the position on `pagehide`, restore it after every section is mounted, and set `overflow-anchor: none` on `html` (moving nodes, such as a 3D canvas changing slots, otherwise shifts the restored position). Every element that starts hidden is hidden in CSS, not only in JS. Test reloads at several scroll positions and at short viewports (the user's window is about 1720x816).
- Content never depends on an animation finishing to be readable or focusable.
- Budget: 60 fps on a mid-range phone, LCP under 2.5 s, INP under 200 ms. Test on a real phone.

## 3D models

- Pipeline: `pnpm models` runs download, optimize and credits. Settings live in `scripts/models/config.mjs`.
- Hero smoke: the flipbook atlas in `apps/web/public/fx/` (`smoke-atlas.webp` and `smoke-atlas-lite.webp`, own generated work) is generated with `pnpm fx:smoke` (`scripts/fx/smoke-atlas.mjs`).
- Posters: `pnpm models:posters` renders one transparent WebP per model and theme (`apps/web/public/posters/<slug>-dark.webp` and `-light.webp`) with the prototype's stage and light presets. Re-run it after optimizing a model, then `pnpm db:seed` so the API serves the poster URLs.
- Each model produces two files in `apps/web/public/models/`, in kebab case:
  - `<slug>.glb` (hero): under 100k triangles and 1.1 MB, textures up to 2048 px (per-model `variantOverrides` in `scripts/models/config.mjs` can lower sizes and quality per texture or material).
  - `<slug>-lite.glb`: target 20k triangles (ceiling 40k), under 450 KB, 512 px textures, tiny loose parts such as stitching removed. Used in lite mode, on low-end phones and on the avatar.
- Canonical pose for sneakers: sole on y = 0, centered on X and Z, toe pointing to +X, real length 0.30 m. The default camera (+Z) sees the outer side of a right shoe and the inner side of a left shoe. `pose.foot` and `pose.lateralSideFacing` in the manifest say which.
- Balls (`category: 'ball'` in the config): 0.22 m diameter (FIFA size 5), resting on y = 0, centered on X and Z, with no automatic yaw. They have no `foot`.
- Apparel (`category: 'apparel'`): front of the garment facing +Z (the default camera), centered on X and Z, bottom edge on y = 0, real size-M scale (about 0.70 m tall for a tee or hoodie, 1.0 m for full-length pants, 0.5 m for shorts, real width for caps, glasses, bags and watches; per-model `size` overrides). Posters render it front-facing. `parts`, `extract` and `texturePatches` drop extra pieces, split sets and cover stray logos.
- Because pose and scale are shared, hotspot positions are in meters in model space and stay valid when a model is re-optimized.
- Contrast: half of the sneakers are mostly black (Air Jordan 1, Uptempo, Samba). Every 3D scene uses per-theme light presets (including a white edge "kicker" light) and a soft studio halo behind the shoe, which is lighter in dark mode and darker in light mode, so both black and white shoes stand out in both themes. The home hero uses the Jordan 4 Travis Scott (violet accent); the black pairs (Air Jordan 1, Uptempo, Samba) rely on this lighting in the board and product pages. See `design/prototype/core/stage.js` (`LIGHT_PRESETS`) and `.stage-halo`.
- Files use Meshopt compression (`EXT_meshopt_compression`) and WebP textures (`EXT_texture_webp`):
  - R3F: drei `useGLTF` enables the Meshopt decoder by default.
  - model-viewer has no default Meshopt decoder. Set `meshoptDecoderLocation` to a self-hosted copy of `meshoptimizer/meshopt_decoder.cjs` before any model loads, or optimized models fail with "setMeshoptDecoder must be called before loading compressed files". See `scripts/models/preview.html`.
  - iOS AR (Quick Look): model-viewer generates the USDZ from the GLB, so no separate file is needed.
- Simplification never exceeds its error limit. Some models (often exported from garment design tools) have layered panels about 1 mm apart, and a larger error lets the base show through the panels. Use the per-model `maxSimplifyError` for those.
- When simplification distorts the UVs of a normal-mapped part (false highlights or stains that disappear without simplification), protect that material with `keepMaterials` or enable `simplifyWithAttributes` (UV and normal aware). A per-model `budgetOverrides` may relax the lite budget, with the reason written next to it. Photogrammetry scans whose texture atlas is split into thousands of islands may not reach the lite target; `simplifyAcrossSeams: ['lite']` lets simplification cross UV seams (with a texture-error weight) for that variant only. Check the texture visually afterwards.
- Load models on demand in the real site: fetch a product's GLB when it is shown or about to be (hover, viewport). The prototype's departures board preloads all of them, which is fine for a prototype only.
- `normalizePose` (scripts/models/geometry.mjs) measures length, centering and sole height on the transformed vertex positions, not on per-mesh boxes, so rotated models keep their exact real size.
- Verify visually, not only by numbers: `pnpm models:preview` opens a local viewer at http://localhost:4173 comparing original, hero and lite.
- Licenses: the Adidas Samba model is CC BY-NC-SA 4.0 (non-commercial, share-alike). If the project ever becomes commercial, remove or replace it.
- Transparent materials: the Adidas Sambae has a translucent gum sole (alpha blend plus `KHR_materials_transmission`). Transmission costs an extra render pass per frame, so the lite variant drops it (`dropTransmission`) and keeps only the transparency.

## Credits

- Every third-party asset (models, avatar, animations, fonts, images, sounds) gets an entry in `CREDITS.md` and on the `/credits` page, with author, source link, license and changes made.
- The 3D models section of `CREDITS.md` is generated by `pnpm models:credits`. Edit the rest by hand.

## Custom commands

- `/add-product`: add a catalog product with its Spanish and English texts.
- `/i18n-check`: find untranslated or hardcoded text.
- `/optimize-model`: add and optimize a new GLB with the model pipeline.
