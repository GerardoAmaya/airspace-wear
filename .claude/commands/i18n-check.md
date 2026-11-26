---
description: Find untranslated or hardcoded UI text (es/en)
argument-hint: "[optional path to limit the check]"
---

Audit the project for i18n problems. Scope: $ARGUMENTS (if empty, check all of `apps/web` and `apps/api`).

This is a read-only audit: report the findings and propose fixes, but do not edit files until the user approves.

## Checks

1. **Message files** (`apps/web/messages/es.json` and `apps/web/messages/en.json`):
   - Keys present in one file but not the other.
   - Empty values.
   - Values identical in both files, which usually means a missing translation. Ignore brand names, product names, numbers and units.
   - Placeholders that differ between languages (for example `{name}` in one and `{nombre}` in the other) and malformed ICU plural or select syntax.
2. **Hardcoded text** in `.tsx`, `.ts` and `.jsx` files:
   - Literal text as JSX children.
   - Literal strings in user-facing attributes: `alt`, `title`, `placeholder`, `aria-label`, `aria-description`, `label`.
   - Toasts, error messages, validation messages and `confirm`/`alert` text.
   - Page metadata (`title`, `description`, Open Graph) not taken from translations.
   - Prices, dates or numbers formatted by hand instead of with the next-intl formatters.
   - Ignore class names, test files, logs, CSS values, keys and IDs.
3. **3D and AR**: hotspot labels, AR prompts and any text drawn inside the 3D scenes come from translations or per-locale data.
4. **AI stylist**: the request carries the active locale and the prompt tells the model to answer in that language.
5. **Database content** (only if the backend and database are running): products without a translation row for `es` or `en`.
6. **Writing style**: any em dash (U+2014) in message files, UI text or docs.

## Report

Group the findings by severity:

- **Blocking**: missing keys or translations, hardcoded user-facing text.
- **Should fix**: identical values, hand-made formatting, placeholder mismatches, em dashes.
- **Check manually**: anything ambiguous.

Give `file:line` for every finding and a short suggested fix, including the key name and both translations when a new key is needed. End with the totals per group.
