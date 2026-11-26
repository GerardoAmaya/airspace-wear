# Third-party skills

These Claude Code skills were copied from their official sources and reviewed in full before installing. They are reference material for writing animation code. The rules in `/CLAUDE.md` take priority over them.

| Skill folder | Source | Commit | License |
|---|---|---|---|
| `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-react`, `gsap-performance`, `gsap-utils` | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | `aed9cfd` (2026-04-21) | MIT, see `LICENSE-gsap-skills.txt` |
| `react-view-transitions` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-view-transitions) | `5a37a63` (2026-11-20) | MIT (declared in the skill frontmatter) |

## Local changes

- `gsap-scrolltrigger/SKILL.md`: fixed the horizontal scroll example. The original used `Max.max(...)` (typo), passed pixels to `xPercent` and left out `scrub`. It now uses `x: () => Math.min(0, ...)` with `scrub: true` and `invalidateOnRefresh: true`.
- `react-view-transitions/SKILL.md`: removed the pointer to `AGENTS.md`, which is not installed. The five files in `references/` hold the same content.
- Not installed: `gsap-frameworks` (Vue, Svelte, Nuxt; not used here) and the compiled `AGENTS.md`.

## Updating

Copy the new versions over these folders, review every changed file before committing, and keep the local fixes above if upstream has not fixed them.
