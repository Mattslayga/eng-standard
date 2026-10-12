---
name: add-gate
description: "Route every write of a domain object through one gate function that enforces its laws, and add a lint rule that blocks any other write path. Use when a law protects data that more than one code path can write."
---

# Add a gate

This is pstack `correct` levels 1-2 (one supported way, then a lint whose error names the fix) applied to writes, per `principle-boundary-discipline`.

1. Find every write path for the object (`rg` for the raw writer: `db.insert`, `ctx.db.patch`, `rawInsert`, SQL). Done: a list of call sites.
2. Create one gate module (for example `src/gate.ts`) exporting the only write function. It validates inputs, calls the proved kernel or law check, then calls the raw writer. Move every call site to it. Done: `rg` finds the raw writer only in the gate and the storage module.
3. Add a lint rule to `eng.config.yml` → `constraints.rules`: `pattern` matches the raw writer, `paths` covers `src/**`, `exclude` lists the gate and storage module, `message` names the gate to call. Add a fixture under `.eng/rule-proofs/<id>/` with a bypass write. Done: `eng rules prove` says the rule bites, and `eng lint` passes on the repo.
4. CI runs the gate's lint from main's copy: `eng lint --config-from origin/main`, so a PR that deletes the rule is still checked by main's rule. Done: a branch that removes the rule and adds a bypass fails `eng lint --config-from main`.
