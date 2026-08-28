---
change: add-intent-channel
phase: scope
created: 2026-08-28T08:39:00Z
---

## Scope

Add two user-invoked commands to Ein that create a pre-SDD decision channel:

1. **/ein:intent** — An interrogation session that models the user's request as a decision tree. The command asks in rounds across decision frontiers whose prerequisites are already resolved. Each question is numbered with a recommended answer. Facts are delegated to `ein-scout` without blocking the rest of the round. Closes by writing `intent.md` with the closed decisions, which `sdd-scope` will consume as input in future changes.

2. **/ein:eh** — A short command that reformulates the user's last message in plain project language using vocabulary from EIN.md.

Both commands must exist and execute in both runtimes (Pi and Claude), not merely promised by an adapter.

### Stack

- **Project**: ein-installer (Node.js/TypeScript ESM)
- **Package manager**: Bun
- **Test runner**: `bun test` (v1.3.14)
- **Typecheck**: `cd installer && bun run typecheck` + root typecheck (covers both `ein-pi/` and `ein-cc/`)
- **TDD stance**: strict (recorded via preflight)
- **Lane**: standard (seven phases: scope → map → design → tasks → apply → verify → close)

### Command surface locations

- **Claude runtime** (`ein-cc`): Commands are `.md` files with frontmatter at `ein-cc/commands/ein/<name>.md`; the `.md` content IS the instruction (reference: `status.md`, `handoff.md`)
- **Pi runtime** (`ein-pi`): Commands are registered via TypeScript handler at `pi.registerCommand("ein:<name>", { description, handler })` within an extension (reference: `ein-pi/agent/extensions/ein-continuity.ts`). The handler is deterministic logic, not a prompt injection point.
- **Shared skill logic** (`ein-pi/core/skills/local/`): Local skills live at `ein-pi/core/skills/local/<name>/SKILL.md` and are consumed by both adapters.

### Surface asymmetry (KNOWN RISK)

The two runtimes present different command surfaces: Claude uses `.md` declarative instructions; Pi uses TypeScript handlers. Both routes must deliver the same observable behavior. This asymmetry is recorded but NOT resolved in this phase — resolution belongs to `sdd-design`.

### Excluded scope

- Do NOT create a new CONTEXT.md or glossary (EIN.md already serves that role)
- Do NOT touch the deterministic router or `ein_sdd_status`
- Do NOT convert `intent` into an eighth SDD phase or mandatory gate
- Do NOT touch the change `fix-overlay-repaint-recovery` or its artifacts
- Do NOT adopt to-spec, to-tickets, implement, triage, or wayfinder

### Attribution

The decision-tree and frontier mechanics are inspired by `grilling` from mattpocock/skills (MIT License, Copyright 2026 Matt Pocock). Ein's implementation closes decisions to disk via `intent.md` and delegates fact-finding to `ein-scout` — changes documented in `SKILL.md` via design phase.

---

## Budget

- **max_tokens**: 15000
- **max_reads**: 30
- **max_runtime_ms**: 300000

---

## Spec delta declaration
spec_delta: none
spec_delta_reason: Adds optional commands and intent.md artefact; does not alter SDD router, decision semantics, or observable phase behavior.
