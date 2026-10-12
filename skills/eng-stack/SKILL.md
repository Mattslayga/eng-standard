---
name: eng-stack
description: "Check STACK.md before adding a language, framework, package manager or major dependency. Use whenever you would add one."
---

# eng-stack
1. Read `STACK.md`. If what you need is listed, use it.
2. If not, don't add it. Propose a `stack.exceptions` entry in eng.config.yml: `{kind, name, reason}` where reason matches STACK.md "When another language is justified" with a measured fact. Matt approves.
3. `eng stack-check` fails CI on any unrecorded addition.
