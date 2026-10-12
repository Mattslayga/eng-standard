---
name: e2e-flow
description: "Write an end-to-end user flow with the open-source TesterArmy `e2e` runner (Playwright) using exact steps, and keep video and screenshots per commit for taste review. Use for any UI or user-visible change."
---

# E2E flow

This is the Drive harness of the repo's `verify-<app>` skill (pstack `create-verification-skill`). Add each flow to that skill's feature map, so `maintain-verification-skill` covers it.

1. Read `e2e.config.ts` and the e2e skill installed by `e2e init` (`.agents/skills/e2e/`). The target starts the app itself (`app.command`).
2. Write `tests/<flow>.e2e.ts` the way a user moves: `app.open`, `screen.getByRole/getByLabel(...).fill/tap`, `expect(...).toHaveText`. Use exact locators; `agent.*` steps only if `eng.config.yml` → `e2e.model` is not `none`.
3. Call `app.screenshot('<state>')` before and after the key action, so a passing run has stills.
4. Run `eng e2e`. Done: it prints `PASS` and `.eng/evidence/<sha>/e2e/` holds `video.webm` and the screenshots. CI replays only (`CI=1`, `--strict-cache`); it never records.
5. Prove it bites: break the behaviour, run `eng e2e`, see the failing assertion with observed text, revert.
