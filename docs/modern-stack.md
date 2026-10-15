# Modern Stack v1

Approved by Matt on Thu 15 Oct 2026 (Sydney). The machine-readable floors are in [`standard/modern-stack.yml`](../standard/modern-stack.yml). The reasoning lives in Core, in the Tech Stack Decisions Index (`nd72pb884wwtv122vr5b6kctes86fpt1`) and the decision notes it links. This page is the short view.

| Layer | Standard (floor) | Sanctioned alternative |
|---|---|---|
| Runtime | Bun 1.4.3 in `packageManager`, Node 24 LTS for `vp` and servers | pnpm, Kalsigns only |
| Toolchain | Vite+ (`vp`) ≥ 1.2.0, Vite ≥ 8.3 | plain `bun run` oxlint/oxfmt/vitest scripts |
| Framework | SvelteKit ≥ 2.70 + Svelte ≥ 5.57.2 | Astro 7 for static or content sites |
| Backend | Convex ≥ 1.46 on Convex Cloud | self-hosted Convex on Railway; PlanetScale |
| Auth | Better Auth ≥ 1.6.33 (below 1.7) + `@convex-dev/better-auth` ≥ 0.12.5 | WorkOS AuthKit (`@workos-inc/node` ≥ 11) |
| Styling | Tailwind ≥ 4.3.3 + shadcn-svelte, shadcn Trace for agent UI | none |
| Lint and format | Oxlint ≥ 1.88 (type-aware) + Oxfmt ≥ 0.73; ESLint and Prettier retired | none |
| Type-check | TS 7.0.2 as the checker, `typescript` 6.0.3 as the API shim | plain TS 7 where no Svelte, Astro, Next or TS-API tools |
| Test | Vitest ≥ 5.0.4, `convex-test` ≥ 0.0.62, Playwright ≥ 1.64.1 | none |
| AI | `ai` ≥ 7, OpenRouter provider ≥ 3 | none |
| CI pins | Bun from `packageManager`, Node 24 from `.node-version` | none |
| Deploy | Railway | Azure, Microsoft-ecosystem clients only |

## Decisions (15 Oct 2026)

1. TS 7 is the checker and `typescript` 6.0 stays alongside until TS 7.1 ships a compiler API.
2. SvelteKit 3 is piloted on Equitus, then Syncsoon. Convex + Better Auth repos wait until the adapter supports Better Auth 1.7.
3. Svelte template linting: the loss is accepted. Oxlint plus svelte-check warnings, no ESLint.
4. Equitus's host is undecided. Compare real Vercel + Supabase costs against a Railway estimate first.
5. Floors live here. A monthly `eng stack-audit` files Core follow-ups. Core keeps the reasoning.

## Recorded exceptions

- **Motus**: Next/React.
- **Kalsigns**: Expo/React, pnpm, Azure, SQL Server.
- **slaytek-site**: Astro.
- **Equitus**: host pending (see decision 4).

## Audit

```sh
eng stack-audit                                  # this repo, at origin/main (else main, else HEAD)
eng stack-audit motus=../motus-app kalsigns=../kalsigns-platform --ref origin/main
eng stack-audit <repos> --json                   # findings as JSON
eng stack-audit <repos> --core                   # Core work.followup-create inputs, one per drift; printed, never sent
```

The audit is read-only and makes no network calls. A floor applies only when a repo declares that package. Exit 1 means drift. Each `--core` item has a stable `dedupe_key`; skip any item whose key already has an open follow-up.

## Not verified

- Vite+ has no official SvelteKit or Next.js guide. SvelteKit fit is inferred from it being a Vite plugin.
- The Convex CLI has not been tested with `typescript` resolving to 7.
