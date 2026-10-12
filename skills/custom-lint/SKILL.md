---
name: custom-lint
description: "Turn a recurring mistake into a project lint rule with a fixture that proves it catches the bad case. Use when `eng verify maintain` reports a mistake seen twice, or a review finding repeats."
---

# Custom lint

This is the lint rung of pstack `correct`. Run `correct` first: if architecture or types can make the mistake impossible, do that instead and stop.

1. Name the mistake with one id (kebab-case). If it came from `eng mistake <id>`, reuse that id: `verify maintain` looks for a rule or check with the same id.
2. Add the rule to `eng.config.yml` → `constraints.rules`: `id`, `paths`, optional `exclude`, `pattern` (regex for the bad shape), `message` (names the fix), `proven_by.incident` (where it happened) and `proven_by.fixture`.
3. Copy the real bad code into `.eng/rule-proofs/<id>/` keeping its path shape, with a `.fixture` suffix so build and test tools ignore it. Done: `eng rules prove` prints `<id>: bites`.
4. Run `eng lint`. Done: it passes on the repo (fix or baseline existing hits) and `eng verify maintain` no longer reports the mistake.
