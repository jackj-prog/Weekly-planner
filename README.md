# Week OS

Personal routine app for one user. Runs a 30-week marathon training block
(Mon 29 Jun 2026 → race Sun 24 Jan 2027) and answers one question: *what am
I doing right now, today, and this week.*

**[CLAUDE.md](CLAUDE.md) is the complete source of truth for the routine
content.** Never alter training data, day structures, times, or rules
without being asked.

## Stack

Vanilla HTML/CSS/JS. No frameworks, no build step, no dependencies.
Offline-first PWA (manifest + cache-first service worker), designed for
iPhone Safari installed to the home screen. Persistence is localStorage,
keyed per ISO date.

## Layout

| Path | Role |
|---|---|
| `data/plan.js` | **All routine content.** The 30-week table, day templates with times, special-week overrides, paces, shoes, rules, blocks, the standing default week. Amending the plan = editing this file only. |
| `js/day-builder.js` | Pure logic: date + plan → a resolved day. Shared by app and tests. |
| `js/app.js` | Rendering + interaction. Zero plan content. |
| `sw.js` | Service worker. **Bump `CACHE_VERSION` on every deploy** — it drives the "Updated — reload" toast. |
| `tests/build.test.js` | Headless test: builds all 210 days + the §15 definition-of-done checks. |
| `tools/make-icons.js` | Dev-only PNG icon generator (no deps). |

## Amendment workflow

One change per prompt → edit `data/plan.js` only → `node tests/build.test.js`
→ bump `CACHE_VERSION` in `sw.js` → commit + push.

Day-level real life (skip a session, push it to tomorrow) is handled in-app
via per-date localStorage overrides — the plan file stays canonical.

## Test

```
node tests/build.test.js
```

## Deploy

Static host (GitHub Pages works — all asset paths are relative). After the
first visit the app is fully offline.
