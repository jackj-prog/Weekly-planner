# AGENTS.md — Week OS ownership and handoff

## Introduction to Claude

Hi Claude — I'm Codex, OpenAI's coding agent. On 9 September 2026, the
repository owner asked me to take over ongoing development of Weekly-planner
and make the transition as streamlined as possible.

You've built up substantial project knowledge here. I'll preserve that work
and use the existing brief, code, tests and decision history as my starting
point. The user remains the product owner and final authority on their routine.
Codex is the primary development agent going forward; this does not change
GitHub ownership or permissions.

I can read and propose repository changes through the user's GitHub
connection. I cannot see your private conversation history, uncommitted work,
or the user's device-local app data. This file is our shared handoff point;
its existence does not mean you have received or answered it.

## Start here — every agent session

1. Read this file, then [CLAUDE.md](CLAUDE.md), the existing routine specification
   and technical constraints.
2. Read [README.md](README.md) for the architecture and test command,
   [docs/PROMPTS.md](docs/PROMPTS.md) for amendment workflows, and
   [docs/AUDIT.md](docs/AUDIT.md) for historical decisions. Audit entries may
   describe older versions; check current code and later decisions.
3. Check the current branch, recent commits, open pull requests and any local
   changes before editing. Preserve unfinished work and avoid concurrent edits
   with another agent.
4. Read the handoff response below. Resolve facts from repository evidence
   wherever possible; ask the user only for missing decisions that affect the
   requested outcome.

## Working agreement

- Continue the existing product: a personal routine executor that answers
  "what am I doing now, today, and this week." Keep the established visual
  identity, dense useful information and low interaction cost.
- Preserve vanilla HTML/CSS/JS, no framework/build dependency, offline PWA
  behavior, relative asset paths, local-time date logic and iPhone Safari support.
- Keep routine content in `data/plan.js`, date resolution in
  `js/day-builder.js`, and rendering/interaction in `js/app.js`.
- The user must explicitly request changes to training content, schedules,
  paces or rules. Taking over development is not permission to rewrite them.
- Preserve localStorage compatibility, backups, stable block IDs and historical
  scaffold eras. Device-local records do not become repository content.
- Carry routine implementation and verification through without repeated
  confirmation. Raise substantive product choices or genuine blockers clearly.
- Follow the existing definition of done: `node tests/build.test.js`, relevant
  syntax checks and, for app changes, device/offline checks. Report what was
  actually run and any gaps. Follow the existing version-bump workflow for app
  releases (`CACHE_VERSION` and `APP_VERSION`).
- Keep shared context in the repository. Update the relevant specification
  alongside an authorized behavior change; record significant decisions and
  remaining work so a new session can continue without asking the user to
  retell the history.

## Repository baseline observed on 9 September 2026

This is a dated snapshot, not a permanent branch or version instruction.

- Default branch: `claude/new-session-ombj5n`.
- Latest observed commit: `fbe1a2229d08ed2f2eab630fed4908e91759d25b`
  (v4.23, long-run gel logging and carbohydrate-rate readback).
- The preceding changes add week-composition reporting (v4.21) and a
  pre-long-run shortfall reminder with a deliberate-rest caveat (v4.22).
- No open pull requests were returned when this handoff began.
- `.github/workflows/pages.yml` deploys pushes to that default branch,
  runs `node tests/build.test.js`, and generates the calendar feed with
  `node tools/make-ics.js`.
- `CLAUDE.md` has some historical wording that needs reconciliation:
  §6's current gym programming puts core/calves on Monday in weeks 11–16
  and retires them at week 17, while the Saturday paragraph and §13 still
  refer to Tuesday. The older audit also describes Tuesday.
  Confirm against implementation and the latest user decision before editing.
- General "Monday never runs" wording coexists with the explicit race-week
  Monday run. Preserve special-week behavior and clarify intent if needed.

The takeover documentation does not amend the routine or app implementation.

## Claude: please complete the handoff here

Please update the response section below in one focused documentation commit,
using your existing conversation context. Link to existing material instead of
duplicating the whole brief. Keep personal details generic, as the project
already requires; do not copy private logs, credentials or raw conversations.

Cover these points:

1. **Current work:** your working branch and latest commit, pending/uncommitted
   changes, and whether anything must be carried over before Codex proceeds.
2. **User intent:** the latest requested outcome, accepted decisions,
   preferences and promises that are not already recorded.
3. **Next steps:** a short ordered list, separating committed work from ideas.
4. **Known issues:** reproducible bugs, fragile areas, and important decisions
   or rejected approaches whose rationale is only in conversation history.
5. **Specification drift:** clarify the core/calves references above and any
   other known disagreement between docs, tests and implementation.
6. **Verification and release:** the last checks actually run and their
   results; deployment branch/site details if different from the snapshot;
   any device/offline behavior that needs manual verification.

If something is unknown, say so. If nothing is outstanding, say that explicitly.
Avoid starting overlapping implementation during the handoff unless the user
asks. End with your exact branch/commit and whether your handoff is complete.

### Claude's handoff response

**Status: awaiting Claude's response.** Codex has prepared the repository
orientation; conversation-only context and unfinished Claude work remain
unconfirmed.

_Claude: replace this placeholder with your response to the six points above._

## Codex continuation

After Claude replies, read the response and compare it with the current branch
and code. Incorporate confirmed decisions into the appropriate documentation,
preserve or finish agreed outstanding work, and record the next concrete task
here. Do not represent the handoff as complete until that review has happened.
