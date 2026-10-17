# Changelog

Versions follow the commit titles on `main` (`vX.Y.Z: ...`). Minor = new command, config or policy area; patch = rule or doc addition to an existing area. History before 0.7.1 is in `git log`.

## 0.7.1 (17 Oct 2026)

- Fixed rule 18, **Clean up on merge or close**, in SHIPPING.md §0 and AGENTS.md, with details in SHIPPING.md §5 (approved by Matt, 17 Oct 2026). A devbox forensics pass found about 100 GB of agent leftovers.
  - Delete a PR's task and review worktrees when it merges or closes; reuse one worktree per PR across review rounds.
  - Evidence keeps only logs, diffs, verdicts and screenshots (never repo copies, `node_modules`, binaries or databases) and is deleted on merge or close.
  - No `node_modules` installs in review-only worktrees; use a shared pnpm or bun store with hard links.
  - One shared build cache per toolchain (Rust: `CARGO_TARGET_DIR` or `sccache`, `CARGO_INCREMENTAL=0` for agents), not one per lane or worktree.
  - Walkthrough videos and media go off the box (Drive or similar).
  - Temp dirs delete themselves.
- `templates/eng.config.yml`: `hygiene` comment points to rule 18.
- Docs and rendered text only; no CLI behaviour change.
