## // 000. SUMMARY
Binds the SDD TODO overlay to the active Pi session instead of implicitly adopting filesystem-only selection. Fresh sessions stay empty, explicit intent binds and repaints immediately, resumed sessions restore their own binding, and continue-as-new transports validated focus into the new Pi session.

## // 001. WHAT CHANGED
- Added the pure V1 contract, parsing, transitions, events, and launch metadata in `ein-pi/agent/lib/sdd-session-binding.ts`.
- Added session-local restore, validation, persistence, invalidation, synchronous repaint, and listener lifecycle handling in `ein-pi/agent/extensions/ein-sdd-overlay.ts`.
- Published binding/invalidation events from approved SDD interactions in `ein-pi/agent/extensions/ein-ai.ts`.
- Added validated Pi-create metadata and closed-plan/tamper guards in `ein-pi/agent/lib/runtime-session-adapters.ts`; declared `appendEntry` in `ein-pi/agent/lib/pi-contract.ts`.
- Propagated continue focus through `ein-pi/agent/lib/terminal-app-controller.ts` and `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`; sanitized inherited metadata in `pi-ein/pi-ein.fish`.
- Added focused contracts in `tests/sdd-session-binding.test.ts`, `tests/sdd-overlay-repaint.test.ts`, `tests/runtime-session-adapters.test.ts`, `tests/runtime-session-resume.test.ts`, `tests/terminal-app-controller.test.ts`, `tests/terminal-app-pty.test.ts`, `tests/surface-wiring.test.ts`, and `tests/pi-contract.test.ts`.

## // 002. HOW IT WORKS INTERNALLY
The overlay owns closure-local `SessionBinding` state. It restores the newest matching Pi custom entry (`ein:sdd-session-binding`, V1); malformed, stale, closed, unsafe, unavailable, or cleared state fails closed without scanning backward or using sole-change fallback. A valid startup-only `EIN_SDD_SESSION_BINDING_V1` intent is consumed once, persisted, and painted. Explicit events use `pi.events` synchronously: the overlay validates, appends, invalidates its paint cache, and updates stable widget `ein-sdd` before emission returns. Continue captures focus before async preparation; only validated Pi create plans carry canonical metadata, while create argv remains empty and resume remains `--session <uuid>`.

## // 003. DECISIONS
- Pi custom entries are the persistence seam; no Pi core storage, project-global file, or process singleton is used.
- UI binding authority is separate from filesystem OpenSpec authority; CLI/non-UI explicit, sole, and ambiguous selection semantics remain unchanged.
- Launch metadata uses a reserved validated environment key rather than argv or continuity text, preserving the closed argv and model-context boundaries.
- Newest matching entry is authoritative; malformed newest state clears instead of reviving older focus.

## // 004. VERIFICATION
- Strict TDD is complete: all 12 apply groups plus the `appendEntry` remediation record RED → GREEN → TRIANGULATE → REFACTOR evidence.
- Focused nine-file regression: `bun test ...` — 212 tests, 996 assertions, pass.
- `bun test tests/pi-contract.test.ts` — 18 tests, 44 assertions, pass.
- `bun test` — 2,624 tests, 12,678 assertions, pass.
- `bun run typecheck` and `cd installer && bun run typecheck` — pass.
- `git diff --check` — pass; behavior coverage verified. Automatic Cleaner is advisory/unavailable because Fish scope admission rejected `pi-ein/pi-ein.fish`.

## // 005. PENDING / RISKS
- No blocking follow-up; invalid or unavailable OpenSpec inspection intentionally leaves the widget unbound.
- One-shot launch metadata must only be added by the trusted validated Pi-create adapter; inherited Fish metadata is erased.
- Release/deployment: no release or archive action was performed; ship through the normal Ein release/deployment pipeline after review, with no installer-specific production change required.
