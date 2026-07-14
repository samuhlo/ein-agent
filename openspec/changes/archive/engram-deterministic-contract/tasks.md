# Tasks — engram-deterministic-contract

status: ready
blocked_by: none

## // 001. Injectable CLI transport and normalized operation contracts

- [x] 1.1 Implement the pure result/budget contract and the injected argument-array CLI transport in `ein-pi/agent/lib/memory-contract.ts` and `ein-pi/agent/lib/engram-cli.ts` (`EngramTransport`, `search`, `save`, transport-result normalization).
  - skills: `architecture`, `bun`, `vitest`, `work-unit-commits`
  - why: E2 needs one deterministic, fakeable external boundary rather than prompt-selected MCP tools or a real-process test dependency.
  - learn: An injected transport lets tests control external outcomes without installing or calling the external program.
  - architecture: Keep subprocess execution (`shell: false`) in `engram-cli.ts`; expose only typed normalized outcomes to policy/lifecycle modules. Pin `engram search <query> --project <id> --scope project --limit 5` and `engram save <title> <content> --type <type> --project <id> --scope project --topic <topic>` as argument arrays.
  - avoid: Do not add a custom MCP client, direct database access, shell-string interpolation, dependencies, retries, or real `engram` discovery/invocation in tests.
  - acceptance evidence: Fake process capabilities prove the exact arrays, 1,500 ms timeout and child cancellation, retrieval stdout/stderr caps of 16 KiB/4 KiB, save caps of 4 KiB/2 KiB, `ENOENT → unavailable`, timeout/cap/malformed/nonzero/spawn errors → `failed`, zero-exit search → `retrieved|empty`, and zero-exit save acknowledgement → `saved`; anchored ANSI-tolerant update notices neither fabricate a result nor invalidate an otherwise valid exit-zero response.
  - rollback/cleanup: Remove the new adapter and its focused tests as one unit; no OpenSpec artifact, MCP configuration, process state, or `~/.engram-pi` data requires migration or cleanup.
  - forecast: production ≤220 lines; tests ≤220 lines.
  - verify: `bun test tests/engram-memory-contract.test.ts`

## // 002. Project-scoped notebook policy and retrieval/upsert service

- [x] 2.1 Add pure project identity, generated stable topics, allowlist/redaction/noise/freshness policy, and bounded retrieval/upsert orchestration in `ein-pi/agent/lib/memory-contract.ts` and `ein-pi/agent/lib/memory-lifecycle.ts` (`resolveProjectIdentity`, topic generation, candidate validation, `prepare`, upsert receipt/dedup handling).
  - skills: `architecture`, `bun`, `vitest`, `work-unit-commits`
  - why: Memory is safe only when its project key, content policy, freshness, and save semantics are deterministic before a lifecycle owner can call it.
  - learn: Stable topic keys make an external notebook idempotent: equal content can be skipped locally and changed content updates the same topic.
  - architecture: Resolve identity in the specified order—canonical `origin` fetch remote, exactly one fetch remote, sorted root commits, otherwise `unknown`—and pass `--project` plus `--scope project` through every transport call. Keep policy functions pure; `MemoryLifecycle` owns finite session counters (five retrievals, ten saves) and local successful-digest dedup, never search-before-save.
  - avoid: Do not fall back to path, basename, package name, session ID, guessed project creation, caller-provided topics, raw artifacts/logs/diffs/transcripts, or content-bearing diagnostics.
  - acceptance evidence: Fake transport tests prove remote/root identity determinism and unknown/ambiguous no-call `skipped/unknown_project`; `sdd/<change>/{scope,map,design,tasks,apply-progress,verify-report,close}` and hashed durable-family topic generation; project isolation; one-call/key/result caps (five results, 6 KiB injected context, 4 KiB save content); same project/topic/digest `skipped/duplicate`; changed content upserts with the identical `--topic`; secret fixtures (token, API key, private key, authorization, password, cookie, `*_TOKEN|KEY|SECRET|PASSWORD`) never reach arguments or receipts; noise is skipped; and >180-day entries discard while 31–180-day and unknown-age entries remain explicitly stale/unverified and advisory.
  - rollback/cleanup: Remove the policy/lifecycle modules and tests together; receipt/dedup state is session-local, so there is no database migration or persisted memory cleanup.
  - forecast: production ≤260 lines; tests ≤280 lines.
  - verify: `bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts`

## // 003. Bounded deterministic retrieval at supported preparation seams

- [x] 3.1 Wire optional session and phase retrieval into `ein-pi/agent/lib/sdd-preflight.ts` (`ensureSddPreflight`) and `ein-pi/agent/extensions/ein-ai.ts` (`runSddPreflight`, `before_agent_start` phase/change inference), using the injected `MemoryLifecycle.prepare` service.
  - skills: `architecture`, `bun`, `vitest`, `ein-discipline`
  - why: E2 retrieval is not established until executable lifecycle code, rather than an agent prompt, invokes the adapter at a named seam.
  - learn: Cache by session/project/change/phase so resumed work can refresh once while repeated hooks cannot become per-command memory traffic.
  - architecture: Retrieve once after enabled preflight for `session`; retrieve only before mapped `map`, `design`, `apply`, and `verify` agents with explicit/sole active change inference. Append a bounded advisory block and safe receipt to `systemPrompt`; label stale/unverified context and state that user instructions, source/configuration, and OpenSpec prevail.
  - avoid: Do not wire scope/tasks/close or arbitrary commands as E2 retrieval points, inject memory as system instructions, block agent start, broaden failed queries, or accept prompt-only E1 wording as proof of invocation.
  - acceptance evidence: Lifecycle tests with a fake transport observe exactly one pinned project-scoped search per enabled lifecycle key, repeat-start cache reuse, a fresh retrieval in a new resumed session, max five/6 KiB safely wrapped results, update-notice-only `empty`, and no injection/call for disabled mode, unknown identity, ambiguous change, unavailable, timeout, malformed, or failed search; existing OpenSpec/router flow continues in each path.
  - rollback/cleanup: Remove only the preflight/agent lifecycle calls and integration tests; OpenSpec preparation, prompts, and artifacts remain functional without memory.
  - forecast: production ≤180 lines; tests ≤200 lines.
  - verify: `bun test tests/engram-memory-lifecycle.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/sdd-router.test.ts`

## // 004. Post-gate and close-only non-blocking notebook saves

- [x] 4.1 Extend `ein-pi/agent/extensions/ein-ai.ts` (`ein_sdd_check`) and the `ein:sdd-close` command path using `ein-pi/agent/lib/sdd-close.ts` (`closeChange`) to invoke policy-approved upserts only after a zero-error artifact gate or successful archive, and write safe `memory-receipts.jsonl` sidecars.
  - skills: `architecture`, `bun`, `vitest`, `ein-discipline`, `work-unit-commits`
  - why: A deterministic save claim requires proof that the adapter was called after—not instead of—the canonical OpenSpec gate/close operation.
  - learn: A receipt is evidence of one operation; only `saved/acknowledged` may be rendered as persistence.
  - architecture: Keep `ein_sdd_check({ change })` lint-compatible; E2 save requires its optional phase/candidate after lint success. Build candidates from concise structured agent/orchestrator summaries, pass only policy-approved fields to `MemoryLifecycle`, return `details.memory`, and append safe receipts best-effort. Archive first, then attempt at most one `sdd/<change>/close` fallback when no same-digest successful close receipt exists; report archive and memory independently.
  - avoid: Do not save full artifacts, code, diffs, raw test output, chat/prompt text, speculative discoveries, or every command; do not let receipt write/save failure alter lint success, archive success, or phase progression.
  - acceptance evidence: Fake lifecycle tests prove no adapter call before missing/invalid/errorful artifact checks; a valid candidate calls save once with generated `--topic`; policy skip/unavailable/failed/timeout never says “saved” and leaves lint/close successful; duplicate close receipts avoid a second write; changed phase content upserts; receipt JSONL and returned `details.memory` contain only status/reason/key/project hash/topic/counts/bytes/duration/timestamp/digest; and close archives even when save or receipt append fails.
  - rollback/cleanup: Remove check/close side effects while preserving existing lint and archive behavior; historical `memory-receipts.jsonl` files are additive diagnostics and may remain or be deleted independently without affecting OpenSpec.
  - forecast: production ≤220 lines; tests ≤240 lines.
  - verify: `bun test tests/engram-memory-lifecycle.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts`

## // 005. Honest preflight, artifact semantics, and internal E0/E1/E2 claims

- [x] 5.1 Replace the `artifactStore` UI/prompt semantics in `ein-pi/agent/lib/sdd-preflight.ts` (`collectSddPreflightPreferences`, `renderSddPreflightPrompt`, `ensureSddPreflight`) with `memoryMode: "off" | "engram"`, normalize legacy values, and align E0/E1/E2 language in `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/assets/orchestrator.md`, and affected `ein-pi/core/agents/{sdd-scope,sdd-map,sdd-design,sdd-tasks,sdd-apply,sdd-verify,sdd-close}.md`.
  - skills: `cognitive-doc-design`, `architecture`, `bun`, `vitest`
  - why: The old selection incorrectly implies Engram can replace full artifacts even though OpenSpec is always canonical.
  - learn: A feature claim must describe the verified behavior boundary, not merely installed configuration or advisory instructions.
  - architecture: Make OpenSpec unconditional; new UI calls Engram an optional project notebook. Normalize legacy `openspec → off` and `engram|both → engram` at the compatibility boundary, then emit only `memoryMode`. Keep E0 configured, E1 prompt-advised, and E2 receipt-backed wording distinct; internal agents provide concise candidates/receipts but do not themselves claim deterministic persistence.
  - avoid: Do not rewrite README, alter `ein-pi/agent/mcp.json`, installer/doctor implementation, updater/banner/Homebrew behavior, or describe a selected mode, tool-name probe, install, or prompt as proof of E2.
  - acceptance evidence: Existing preflight/flow contract tests show headless/default memory off, legacy normalization with OpenSpec retained, UI/prompt/status text says optional notebook rather than artifact store, no Engram-only branch exists, and unavailable/failed/no-receipt states never claim retrieved or saved; text contracts reject prompt-only E1 as E2.
  - rollback/cleanup: Restore preflight rendering and prompt language only if needed; legacy inputs remain accepted and OpenSpec records require no migration.
  - forecast: production ≤120 lines; tests ≤120 lines.
  - verify: `bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts`

## // 006. Integration evidence, doctor/status regression, and downstream handoff

- [x] 6.1 Complete focused fake-transport integration coverage and factual handoff evidence for `readme-release-ia` in `tests/engram-memory-contract.test.ts`, `tests/engram-memory-lifecycle.test.ts`, `tests/sdd-preflight-tdd-gate.test.ts`, `tests/sdd-close.test.ts`, `tests/sdd-router.test.ts`, and `openspec/changes/engram-deterministic-contract/handoff.md`.
  - skills: `vitest`, `bun`, `cognitive-doc-design`, `ein-discipline`, `work-unit-commits`
  - why: The completed E2 claim must be reviewable as deterministic adapter/lifecycle evidence and must give the downstream documentation change only facts it is allowed to publish.
  - learn: Integration evidence should prove boundaries and degradation paths with fakes, not by relying on a developer’s installed state or private data.
  - architecture: Test only injected fake transport/process capabilities; cover preflight/status/doctor-facing safe receipts without changing installer or backend behavior. Write `handoff.md` as an OpenSpec handoff that identifies verified E2 seams, exact test evidence, canonical OpenSpec continuity, remaining E0/E1 limits, and the `readme-release-ia` truthfulness gate—without editing README.
  - avoid: Do not invoke real `engram`, mutate/read `~/.engram-pi`, depend on installed memory content, run a custom MCP client, add dependencies, perform a README rewrite, or make unsupported lifecycle points sound E2.
  - acceptance evidence: The final matrix proves exact arrays/caps/timeouts, unavailable versus failed distinction, update-notice tolerance, unknown project, `--topic` upsert/dedup, project isolation, redaction/noise rejection, stale retrieval, explicit adapter invocation and receipts after gates/close, and OpenSpec continuity for empty/unavailable/search failure/save failure. The handoff states that README claims remain E0/E1 until these focused fake tests have passed and records no real-memory evidence.
  - rollback/cleanup: Revert only regression/handoff additions with their corresponding behavior slice; no external memories, dependency locks, or backend state exist to clean up.
  - forecast: production ≤40 lines; tests ≤220 lines.
  - verify: `bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts`; `bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts`; `bun test tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts`
