---
name: write-law-and-proof
description: "Write an approved law in LAWS.bend over all inputs, prove it in PROOF.bend, and compile the kernel the app calls. Use when a pure decision (money, permissions, transitions) gets a Bend kernel."
---

# Write a law and its proof (Bend2)

Run `bend guide` first; it is the reference. Layout: `laws/<kernel>.bend` (code), `laws/LAWS.bend` (claims, human-owned), `laws/PROOF.bend` (proofs, agent-owned).

1. Start from an approved plain-words law. Write it in `LAWS.bend` with `for x: T` over every input. A law with only fixed values (`{total(100n, 500n) == 0n}`) is an example, not a law; do not add one. Done: every `law` quantifies at least one variable.
2. Keep the kernel to Base ops (`Nat.add`, `Nat.sub`, `Nat.is_le` ...): they compile to native JS. Hand-written unary recursion proves fine but runs one step per unit.
3. Prove each law in `PROOF.bend` with `def Laws.<name>`: match is case analysis, the self-call is induction, `%e : P` rewrites. Mark inputs used twice with `+`. Done: `bend PROOF.bend` prints `ALL PROOFS CHECK`.
4. Add a mutation per law to `eng.config.yml` → `laws.mutations` (a planted bug the law forbids). Done: `eng laws` reports each as `caught by proofs`.
5. Run `eng laws --write` to regenerate the kernel and manifest, then `eng laws`. A change to `LAWS.bend` fails until the rule owner runs `eng laws approve <who> <note>`; you never run it. Never weaken a law to make a proof pass.
