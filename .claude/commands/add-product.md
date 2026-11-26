---
description: Add a catalog product with its Spanish and English texts
argument-hint: "[product name, brand and any details you already have]"
---

Add a new product to the AIRSPACE Wear catalog: $ARGUMENTS

Follow the conventions in `CLAUDE.md` (i18n, brand, credits, no em dashes).

## 1. Gather the data

Collect everything below. Ask for whatever is missing in one message instead of guessing:

- Brand, product name and category (sneakers or apparel).
- Price, sizes, colorways and stock, if the catalog uses them.
- Texts in **both** languages, Spanish (`es`) and English (`en`):
  - name (trademark names such as "Air Force 1" stay as they are in both languages)
  - short description (one sentence)
  - long description
  - materials and details
- Images and their credits.
- 3D model, if any. If it is new, run `/optimize-model` first.
- For products with a 3D model: hotspots, each with a position in meters in the canonical model pose (see "3D models" in `CLAUDE.md`) and a label in both languages.

Spanish copy must read as natural neutral Latin American Spanish, not a literal translation. Never leave one language empty or copy the other language into it.

## 2. Plan and wait

Show the product data in a table (field, `es`, `en`), the slug (kebab case, English) and the list of files you will touch. Wait for approval.

## 3. Add the product

- Find the catalog source of truth in `apps/api`: the product entity, its translations table and the seed or migration that loads products. If the backend does not exist yet, stop and say so instead of inventing a structure.
- Add the product and one translation row per locale (`es` and `en`).
- Reference 3D models as `/models/<slug>.glb` and `/models/<slug>-lite.glb`.
- Store hotspot labels per locale the same way as other product texts.
- Add credits for any third-party asset to `CREDITS.md` (and the data the `/credits` page reads).

## 4. Verify

- Run the seed or migration and confirm the product is returned by the API in both locales.
- Open the product page under `/es` and `/en` and check that names, descriptions, hotspots and AR texts change with the language.
- Run `/i18n-check` on the files you touched.
- Report what was added, with file paths.
