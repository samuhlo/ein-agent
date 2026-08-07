status: complete
scope_status: bounded
change: runtime-test-fixture-isolation
phase: map

# Map notes

## Evidence and bounded failure set

`openspec/changes/beta-launcher-e2e-hardening/apply-progress.md` records the authoritative reproduction: focused E checks pass; the repository suite reports `1232 pass / 9 fail / 0 errors`; excluding `tests/beta-launcher-e2e-hardening.test.ts` still reports `1209 pass / the same 9 failures / 0 errors`. The failures are runtime-session/session-listing reads from the shared `EIN_PI_AGENT_HOME` fixture. This makes the new E2E file an excluded reproducer, not the owner of the defect.

The bounded ownership candidates are the session fixture writers/readers in `tests/sessions.test.ts` and `tests/runtime-session-adapters.test.ts`. The exact session-listing assertions are:

- `tests/sessions.test.ts`: `ordena por mtime descendente y deriva project del cwd`; `respeta limit y excludePath`; `mantiene dedupe por project y los campos legacy`.
- `tests/runtime-session-adapters.test.ts`: `filters repository scope before limiting and emits opaque recency metadata`; `requires exact cwd equality for non-repository sessions`; `rejects duplicate matching opaque references`; `fails closed when more than 4,096 candidates remain outside the scan window`; `normalizes exact project boundaries and rejects invalid result limits`; `uses a deterministic path tie-breaker without reading beyond the first line`; plus lifecycle listing assertions calling `listSessionRequest` (notably the `list`/created-session cases).

The exact nine failing test names should be captured from the failing Bun report during apply/verify; map phase does not execute the suite by contract. Do not broaden ownership to unrelated tests merely because they also mention session paths.

## Runtime/session module seams

- `ein-pi/agent/extensions/ein-paths.ts`: import-time `HOME = homedir()`; import-time `AGENT_DIR = process.env.EIN_PI_AGENT_HOME ?? join(PI_HOME, "agent")`; derived `CORE_EXTENSIONS`, `LOCAL_SKILLS_DIR`, `DOWNLOADED_SKILLS_DIR`, and backup paths. This is the primary cached path seam.
- `ein-pi/agent/lib/sessions.ts`: import-time `SESSIONS_DIR = join(AGENT_DIR, "sessions")`; `collectCandidates`, `readSessionMeta`, `scanProjectSessions`, and `listRecentSessions` synchronously read that cached directory. `listRecentSessions` is called by banner/AI extensions; project scans are consumed by runtime adapters.
- `ein-pi/agent/lib/runtime-session-adapters.ts`: `listPiProjectSessions` is the Pi listing adapter over `scanProjectSessions`; `listSessionRequest` is the provider dispatch seam. Its production behavior is pure adapter composition and must remain unchanged.
- `tests/runtime-session-adapters.test.ts`: module import follows a top-level mutation of `process.env.EIN_PI_AGENT_HOME`; all writers use `TEST_AGENT_HOME/sessions`; `beforeEach` creates that directory and deletes every `runtime-adapter-*` directory; `afterAll` repeats cleanup. This is a shared root plus destructive per-test cleanup, unsafe if Bun overlaps eligible tests/processes.
- `tests/sessions.test.ts`: same `TEST_AGENT_HOME` and top-level env mutation; dynamic import is deliberately used to win the first-import cache; `beforeAll` deletes/rebuilds `sessions`; `afterAll` deletes it again. It explicitly documents that the home is shared between test files.
- Other import-time consumers with the same root: `tests/lang.test.ts`, `tests/tdd.test.ts`, and `tests/model-config.test.ts`; `model-config` also mutates `EIN_PI_CONFIG_HOME` and writes shared `settings.json`/agent fixtures. These are adjacent cache/global-state owners to inspect when proving no residue, but only their runtime/session interactions belong in this change.

## Global state and concurrency hazards

- `process.env.EIN_PI_AGENT_HOME` is mutated at module top level in multiple test files and never restored in `sessions`, `runtime-session-adapters`, `lang`, `tdd`, or `model-config`.
- The cached `AGENT_DIR` and `SESSIONS_DIR` mean restoring env after import alone does not repair a module already bound to another test's home. Dynamic import/module cache isolation or a test-owned dependency seam is required.
- `tests/sessions.test.ts` and `tests/runtime-session-adapters.test.ts` both target `/tmp/ein-agent-tests/agent`; one suite's `beforeAll`/`beforeEach`/`afterAll` can remove directories while another is scanning. Runtime test cleanup is prefix-filtered but still mutates the common directory enumeration during reads.
- `globalThis[Symbol.for("rpiv-i18n")]` is mutated by `sessions` and `lang`; `lang` restores it per test, while `sessions` only restores its captured value per test. Include it in residue checks if the fixture harness serializes module/global owners.
- `EIN_PI_CONFIG_HOME`, `LANG`, `LC_ALL`, and `XDG_CONFIG_HOME` are additional process env seams in adjacent tests; no cwd mutation or production child-process handle is owned by the two bounded session fixtures. Spawned processes in the beta E2E use child-local env and unique roots and are explicitly cleared by the blocker evidence.
- `mock.module`/module-cache concerns exist elsewhere in the suite, but no session fixture uses a mock-module reset. Avoid global cache resets that could perturb unrelated tests; prefer unique homes or a narrowly scoped serialized writer.

## Smallest likely ownership surface

Test-only files/helpers are the smallest likely surface: a shared disposable runtime/session fixture helper (new under `tests/fixtures/` or local to the two owning tests), plus `tests/sessions.test.ts` and `tests/runtime-session-adapters.test.ts`. The helper should create a unique `mkdtemp` agent home per fixture owner, establish the env before importing cached modules, and provide `try/finally` cleanup for pass/fail/timeout/cancellation/spawn-failure paths. If Bun's module cache prevents per-test dynamic imports from being independent, serialize only the import-bound fixture owner and await teardown before releasing it; do not serialize the whole suite.

Regression coverage should run two concurrent eligible fixture users with distinct homes, a residue-follow-up test, and failure-path cleanup assertions for exact prior env/global values and removed temp roots. The existing opaque-reference and project-scope assertions remain the behavioral oracle.

## Commands for apply/verify (not run in map)

- Focused ownership: `bun test tests/sessions.test.ts tests/runtime-session-adapters.test.ts`
- Targeted concurrency with E and neighboring suites: `bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/beta-launcher-e2e-hardening.test.ts`
- Required acceptance: `bun test` (repository-default concurrency), repeated at least three times; also run the focused command alone and the targeted concurrency command.
- Regression/typecheck after test-only changes: `cd installer && bun run typecheck` (required by scope, though no installer files are in ownership).

## Explicit no-production boundary

No files under `ein-pi/agent/**` production runtime, `cc-ein/**`, `installer/**`, dependency manifests, lockfiles, launcher/projector/adapter implementation, or beta E2E assertions should change. In particular, do not alter `AGENT_DIR`, `SESSIONS_DIR`, `scanProjectSessions`, `listRecentSessions`, or runtime adapter semantics to accommodate tests. Only test files and test-harness fixtures/helpers are in the ownership boundary.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/runtime-test-fixture-isolation/scope.md", lines: 52, estimated_tokens: 900 }
    - { path: "openspec/changes/beta-launcher-e2e-hardening/apply-progress.md", lines: 43, estimated_tokens: 850 }
    - { path: "tests/sessions.test.ts", lines: 127, estimated_tokens: 1100 }
    - { path: "tests/runtime-session-adapters.test.ts", lines: 1200, estimated_tokens: 7600 }
    - { path: "tests/model-config.test.ts", lines: 238, estimated_tokens: 1500 }
    - { path: "tests/lang.test.ts", lines: 213, estimated_tokens: 1200 }
    - { path: "tests/tdd.test.ts", lines: 52, estimated_tokens: 400 }
    - { path: "ein-pi/agent/extensions/ein-paths.ts", lines: 53, estimated_tokens: 500 }
    - { path: "ein-pi/agent/lib/sessions.ts", lines: 191, estimated_tokens: 1500 }
    - { path: "ein-pi/agent/lib/tdd.ts", lines: 91, estimated_tokens: 700 }
    - { path: "ein-pi/agent/lib/lang.ts", lines: 65, estimated_tokens: 500 }
    - { path: "ein-pi/agent/lib/mode.ts", lines: 108, estimated_tokens: 750 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 14500, reads: 12 }
  budget_exceeded: false

skill_resolution: paths-injected
Skipped nuxt-modules, nuxt-better-auth, and vueuse implementation guidance: this is a Bun test-fixture map with no Nuxt/auth/VueUse surface. Applied ein-discipline and Vitest fixture/concurrency guidance; tests are Bun-native rather than Vitest.
