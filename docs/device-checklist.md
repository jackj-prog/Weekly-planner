# Device checklist — the half that cannot be automated

`tools/shoot.js` renders the app in headless Chromium at 390×844 and catches
layout and logic regressions. It is **not** iPhone verification and must never
be described as one. Playwright's WebKit — even where it is installed — is a
Linux source build of WebKit, not branded iOS Safari, and the four things
CLAUDE.md §2 makes hard constraints are precisely the four it cannot reach:

| §2 constraint | Chromium at 390×844 | Real iPhone |
|---|---|---|
| Layout, tap targets, overflow | **yes** | yes |
| Standalone launch from Home Screen | no | yes |
| `env(safe-area-inset-*)` | no — insets are 0 without a notch | yes |
| Offline after first load, iOS eviction | no | yes |

So: automate the first row, walk the rest. Ten minutes, once per deploy that
touches `sw.js`, `index.html`, `css/style.css`, or the manifest. Content-only
changes to `data/plan.js` do not need it.

---

## Before you start

**Back up first.** Reference → **Copy backup** → paste it somewhere safe.
Testing writes real entries to real dates and you will want them gone
afterwards; **Restore** puts the file back exactly as it was.

That backup *is* the isolation. A separate QA copy sounds tidier and is worse
here, for two reasons:

- GitHub Pages project sites all share one origin (`<user>.github.io`), and a
  different **path** does not isolate `localStorage`. A QA copy would read and
  write the same storage as the real app.
- Worse, `sw.js:34` deletes every cache on the origin that is not the current
  `CACHE_VERSION`. Two Week OS copies on one origin would delete each other's
  cache on every activation, breaking offline for both. That is not a bug —
  it is correct single-app cleanup — but it makes a same-origin QA copy
  actively harmful.

One user, one phone, one backup. Don't build a second deployment.

---

## 1 · Install, and treat it as a fresh install

Safari → Share → **Add to Home Screen** → *Open as Web App* if offered → Add.

Then **launch the new icon while still online** and leave it a few seconds.

This step is load-bearing and easy to skip. iOS gives a Home Screen web app
its **own storage container**, separate from Safari's. Warming the cache in
Safari proves nothing about the installed app — it starts empty and must
install its own service worker and fill its own cache. Skip this and step 3
fails for a reason that has nothing to do with the code.

- [ ] Launches with no Safari chrome — no address bar, no toolbar
- [ ] Icon on the Home Screen is the app icon, not a screenshot of the page

## 2 · Look at it, and touch it

- [ ] Nothing clipped at the top (Dynamic Island / notch) or bottom (home indicator)
- [ ] Tab bar sits above the home indicator, not under it
- [ ] Today · Week · More all render; More opens the sheet
- [ ] Run-log steppers are hittable one-handed without zooming
- [ ] Number entry brings up the right keyboard and dismisses cleanly
- [ ] Rotate to landscape and back — nothing overlaps or strands
- [ ] Scroll to the bottom of Reference — the longest page, and the one that breaks

Record the **device model and iOS version** with the result. "Works on my
phone" is not a finding; "iPhone 14, iOS 18.5" is.

## 3 · Cold-launch offline

Settings → **Airplane Mode on**, then Settings → **Wi-Fi off** as a separate
step. Airplane Mode does not always drop Wi-Fi, and Control Centre's Wi-Fi
button only *disconnects* — it re-enables itself. If Wi-Fi is still up, this
test passes while proving nothing.

Then **quit the app fully** (swipe it out of the app switcher) and relaunch
from the Home Screen icon.

- [ ] App shell loads with no network
- [ ] Today, Week, 30-week plan and Reference all render
- [ ] Fonts are the real fonts, not fallbacks (a missed cache entry shows here)
- [ ] Tick something, log a run — it saves
- [ ] Quit and relaunch, still offline — the change is still there

## 4 · Test a real update

Connectivity back on. Push a deploy with `APP_VERSION` **and**
`CACHE_VERSION` bumped, wait for Pages to publish, then open the app.

- [ ] The "Updated — reload" toast appears
- [ ] Tapping it reloads, and Reference → App shows the **new** version
- [ ] Diagnostics show the new cache name and `controlling`
- [ ] Everything you ticked and logged is still there
- [ ] One more offline cold launch still works

A toast is not the test. A changed worker does **not** refresh cache contents
on its own — only a changed `CACHE_VERSION` plus the `activate` handler evicts
the old assets. If the version string on Reference has not moved, the update
did not land, whatever the toast said.

## 5 · Put it back

Reference → **Restore…** → paste your backup → Restore. Confirm the test
entries are gone and your real ticks are back.

---

## Notes for whoever runs this

**The app reports its own state.** Reference → App shows version, service
worker state, active cache, standalone yes/no and storage used. That exists
because remote Web Inspector needs Safari on **macOS** — from Windows you can
observe the app but not debug it, so the app has to say what it knows.

**`navigator.onLine` is not evidence.** It lies in both directions and the app
does not rely on it. Nothing in a browser can prove you enabled Airplane Mode.
Steps 1, 3 and 5 are human-confirmed by nature — keep them recorded as such,
separately from anything a script asserts.

**iOS automation is not the missing piece.** The Simulator needs macOS and
Xcode, and is still not a physical device for storage-eviction behaviour.
Appium's newer non-macOS support for real devices still needs a
WebDriverAgent built with Xcode, so a Mac remains somewhere in the chain. For
a single-user app this checklist is cheaper than any of it, and tests the real
thing rather than an approximation of it.
