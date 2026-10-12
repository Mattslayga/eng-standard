---
name: property-test
description: "Test a law over all inputs with fast-check, using the same wording and name as LAWS.bend. Use for laws that need IO, a DB, floats or app wiring that Bend cannot model, and to check the shipped TS path around a Bend kernel."
---

# Property test

Follows pstack `principle-test-behavior-not-implementation`: call the real code as users do. A property test adds all-input coverage; keep at least one literal-value test per behaviour beside it.

1. Take an approved law (from `.eng/laws-candidates.md` or `laws/LAWS.bend`). Copy its name and plain-words statement verbatim into the test name. Done: `rg <law_name>` finds both the law and the test.
2. Write generators for the whole input domain with `fast-check` (`fc.nat`, `fc.array`, `fc.record`), including empty, zero and the largest allowed value. Never filter the domain down to examples.
3. Call the real app function (the one users hit), not a copy of the rule. Assert the law as stated. Done: `fc.assert(fc.property(...))` in `*.laws.test.ts`.
4. Prove it bites: plant a bug that breaks the law, run `bun test`, see the counterexample, revert. Done: you saw a failing seed and shrunk counterexample.
