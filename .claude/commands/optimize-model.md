---
description: Add a new GLB model and optimize it with the gltf-transform pipeline
argument-hint: "<Sketchfab URL or uid, or local .glb path> [display name] [brand]"
---

Add and optimize a new 3D model: $ARGUMENTS

The pipeline lives in `scripts/models/` and is configured in `scripts/models/config.mjs`. Read the "3D models" section of `CLAUDE.md` first.

## 1. Source and license

- Sketchfab: get the uid from the URL. Check with the public API (`GET https://api.sketchfab.com/v3/models/{uid}`) that `isDownloadable` is true and note the author and license.
- Local file: ask for the author, source URL and license if they are not given.
- The license must allow modification. Flag non-commercial (NC) or share-alike (SA) terms to the user before continuing. No-derivatives (ND) licenses cannot be used, because the pipeline modifies the model.

## 2. Register the model

- Choose a kebab case slug, for example `nike-dunk-low`.
- Add an entry to `MODELS` in `scripts/models/config.mjs`:
  - Sketchfab: `source: { provider: 'sketchfab', uid }`.
  - Local: copy the file to `assets/models/raw/<slug>.glb` and use `source: { provider: 'local', title, url, author, authorUrl, license: { slug, name, url, commercialUse, shareAlike } }`.
- For Sketchfab, run `pnpm models:download --only <slug>`.

## 3. Inspect and orient

- Run `pnpm exec gltf-transform inspect assets/models/raw/<slug>.glb`: scale, mesh and material count, texture sizes, extensions.
- Open `pnpm models:preview` and load the original to see the orientation. Then set in the config entry:
  - `transform.rotation`: the rotation in degrees that points the toe to +X. The pipeline fixes small yaw angles and the scale by itself.
  - `foot`: `'left'` or `'right'`. Look at the outsole: the arch side (narrower at mid-foot) is the inner side.
  - `extract`, if the file contains a pair: keep one shoe by the side of the axis it sits on.

## 4. Optimize

- Run `pnpm models:optimize --only <slug>`.
- Both variants must report `OK`: hero under 100k triangles and 5 MB, lite under 40k triangles and 1.5 MB, and 0 validator errors.

## 5. Check visually

Numbers are not enough. In `pnpm models:preview`, compare original, hero and lite from several angles, including close-ups. Look for:

- Missing parts or holes.
- Layers showing through each other (a white base poking through colored panels). Fix it with a lower per-model `maxSimplifyError`.
- Broken or blurry textures in the hero version.
- A wrong pose: the toe must point to +X and the sole must rest on the ground.

## 6. Credits and report

- Run `pnpm models:credits` and check the new row in `CREDITS.md`.
- Report a table with triangles, file size and draw calls before and after, for hero and lite.
