status: partial
scope_status: bounded
change: installer-safe-secret-writes
phase: sdd-map
budget_source: packet
budget_exceeded: true

# Map — installer-safe-secret-writes

## Scope and OpenSpec anchors

The scope is bounded to `installer/src/core/secrets.ts`, the import-time path contracts in `installer/src/core/paths.ts`, the `Platform`/shell-RC contract in `installer/src/core/platform.ts`, the two installer call paths in `installer/src/cli/install.ts`, and one future focused Bun test file under `tests/`. The structured delta adds `safe-secret-file-writes` and `safe-shell-rc-writes` under `installer-runtime`; the canonical `openspec/specs/installer-runtime/spec.md` otherwise contains unrelated runtime scenarios.

Preserve `EIN.md`, `openspec/config.yaml`, the existing trimmed-secret/newline contract, Fish/POSIX sentinel text, shell detection, and unrelated RC bytes. Non-goals remain checksum/tar/release/CI/E2E work, encryption or keyring migration, sentinel redesign, general filesystem-library work, and all unrelated installer behavior.

## Exact paths and contracts

- `installer/src/core/paths.ts:11-14` snapshots `HOME` at module import (`process.env.HOME ?? homedir()`). `SECRETS_DIR` is `<HOME>/.config/opencode-secrets` (`:123-125`), and the three fixed secret targets are `linear-api-key`, `context7-api-key`, and `minimax-api-key` (`:138-141`). Tests must set `HOME` before importing `paths.ts`/`secrets.ts`, or use an isolated subprocess.
- `secrets.ts:19-23` maps `SecretName` (`linear | context7 | minimax`) to those fixed paths. There is no caller-provided path.
- `Platform.shellRc` is the RC destination. `detectPlatform()` uses `$HOME` at call time (`platform.ts:113-122`): zsh → `.zshrc`; bash → `.bashrc` on Linux and `.bash_profile` on macOS; fish → `.config/fish/config.fish`; unknown shell → `.profile` (`:89-110`). The supported OS set is only `darwin | linux`; unsupported OS and arch detection throw.
- The RC block references the imported `CONTEXT7_KEY_PATH`; it does not inline the API key. Fish uses the existing `test -f ...; and set -gx ... (cat ...)` block; non-Fish uses the existing `export ...="$(cat ... 2>/dev/null)"` block. Start-sentinel detection is currently before target validation.

## Current write flows and primitives

### `writeSecret`

1. Trim the value; whitespace/empty returns `false` before any filesystem action (`secrets.ts:40-42`).
2. `ensureSecretsDir()` recursively calls `mkdir(SECRETS_DIR)` and then best-effort `chmodSync(SECRETS_DIR, 0700)` (`:25-31`). It does not validate that the directory or its ancestors are non-symbolic regular directory objects.
3. Select the fixed path and call direct `writeFileSync(path, trimmed + "\\n")` (`:43-45`). This truncates/replaces directly and can expose partial content on interruption.
4. Best-effort `chmodSync(path, 0600)` runs after the write (`:46-50`), leaving a window with the platform/default creation mode and swallowing chmod failure. The public result is `Promise<boolean>` and successful non-empty writes return `true`.

`hasSecret` (`:34-37`) currently uses `existsSync` plus `readFileSync(...).trim()`, which follows a symlink and can throw on an unsafe object. It is adjacent read behavior, not a writer, but any shared no-follow classifier must not turn a valid regular empty/invalid secret into an unintended install success. `CONTEXT7_KEY_PATH` is also read by installer `verify.ts` and the deployed `ein-doctor.ts`; those are observers and are outside this write slice.

### `ensureContext7Export`

`ensureContext7Export(platform)` (`secrets.ts:59-83`) takes `platform.shellRc`, uses `existsSync` then `readFileSync` (both path-following), returns `{ changed: false, rc }` when the start sentinel is present, builds the existing Fish/POSIX block, preserves existing bytes and adds one separator newline if needed, then calls direct `writeFileSync(rc, next + block)`. It does not create a missing parent directory, does not validate the target type, and has no atomic/temp-file boundary. A failed direct write can truncate or partially publish an RC.

## Callers and error propagation

- `maybeSecret` in `install.ts:109-119` is called by `runPiInstall` for Context7, optional Linear, and MiniMax (`:328-330`). It skips when `--no-secrets`/`--yes`, skips prompting when `hasSecret` is truthy, otherwise awaits `writeSecret`; it does not catch write errors.
- `runPiInstall` calls `ensureContext7Export` after the secret wizard (`install.ts:334-338`) unless `--no-secrets`. It also does not catch this call locally.
- `orchestrateInstall` catches exceptions from each selected target runner (`install.ts:177-188`) and converts them to a failed `RuntimeInstallResult`. `runInstall` then returns exit code `1` when the aggregate result is not OK (`:493+`). For `both`, a Pi filesystem failure is reported while the Claude runner still executes. This existing error path should remain truthful; no new swallowing/logging belongs in the write helper.
- `runInstall` is reached from `cli/menu.ts` and `main.ts`; neither is a write implementation. `ensureSecretsDir` has only `writeSecret` as a caller.

## Existing tests and seams

- Codegraph and test search found no coverage for `writeSecret`, `ensureContext7Export`, `hasSecret`, or the secret paths.
- The root suite uses Bun's `bun:test` via `bunfig.toml`; `installer/package.json` has no test script. Installer TypeScript is strict ESM with bundler resolution and Bun types; the configured typecheck is `cd installer && bun run typecheck` (not run in this phase).
- `tests/preload-env.ts` fixes `EIN_PI_AGENT_HOME`/`EIN_PI_CONFIG_HOME`, not `HOME`. Existing installer tests use temporary directories and explicit path/context arguments, but they statically import installer modules. A new focused test must establish a temporary `HOME` before a dynamic `secrets.ts` import, or use a child process to isolate import-time constants.
- `Platform` is a plain object seam: tests can pass a temporary `shellRc` and `shell` without invoking platform detection. This permits Fish/POSIX block assertions independently of the host shell.
- No secret-specific filesystem injection exists: `secrets.ts` binds `node:fs` functions directly (`chmodSync`, `existsSync`, `readFileSync`, `writeFileSync`) and `node:fs/promises.mkdir`. Deterministic temp/write/rename failure tests should use a narrowly scoped internal filesystem-operations seam or Bun module mocking before the isolated module import; permission-only tests are not reliable under privileged runners. Keep `writeSecret` and `ensureContext7Export` public return shapes unchanged.
- Existing tests demonstrate temporary roots, byte comparisons, residue checks, and Unix socket fixtures; the future focused file should use only temporary homes/directories, FIFO/socket fixtures where available, and skip unavailable device fixtures rather than touching real user paths.

## Security and TOCTOU map

- Current `existsSync → readFileSync/writeFileSync` permits symlink traversal, directory/special-file handling by incidental errors, and path substitution between check and use. Recursive `mkdir` can also follow a substituted/symlinked parent.
- The design boundary should classify the final target with no-follow metadata (`lstat`-equivalent): missing is allowed; an existing target must be a regular non-symlink file; directories, FIFO/socket/device/other types fail before RC sentinel inspection or secret content access. The secrets directory must likewise be validated as an actual directory and not a symlink before use. Decide explicitly whether validating every pre-existing ancestor (especially `$HOME/.config`) is needed to prevent redirection; do not silently expand this into a general path-security library.
- The write transaction needs a unique same-directory temporary path, exclusive creation with mode `0600` for secret files, complete write, flush/close as applicable, then atomic same-filesystem rename. The final destination must never be opened/followed for content writes. RC mode behavior is not changed implicitly: the delta requires atomicity and preservation, while the explicit `0600` requirement is for secret creation/replacement.
- Cleanup must unlink only the helper's temp path. A cleanup failure must not mask the original write/rename/validation error; it must not be reported as success. Existing destination bytes (and metadata when the commit fails before rename) must remain untouched.
- A path-only `lstat` followed by `rename` still has a last-moment race. Rename does not follow a final symlink (it replaces the directory entry), which protects the external symlink destination, but it can still replace a substituted regular target and a substituted parent directory can redirect the temp/rename. Design must state the supported POSIX/Bun guarantee, use the narrowest available no-follow/identity checks, and test the documented race outcome rather than claiming a race-free check-then-use. Same-directory temp files are required for atomicity, not merely cleanup.

## Handoff to design/apply

The smallest implementation surface is a private safe-target classifier plus a same-directory atomic-write helper in `secrets.ts`, with a deterministic filesystem seam for failure tests. Preserve the direct block text, trimmed value plus one newline, empty-value no-op, sentinel idempotency, and caller propagation. RED coverage must cover missing/regular targets, modes, symlink external-destination preservation, directory and available special files, write/flush/close/rename failures, cleanup, RC byte preservation/separator behavior, Fish/POSIX blocks, and repeated sentinel calls. Invalid RC objects must be rejected before reading the sentinel. Do not run tests, builds, typechecks, or network calls in map.

## Ledger Contract

ledger:
  reads:
    - { path: "/home/samuhlo/.pi-ein/agent/skills/local/ein-discipline/SKILL.md", lines: "1-101", estimated_tokens: 1000 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/downloaded/drizzle/SKILL.md", lines: "1-200", estimated_tokens: 1800 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt-seo/SKILL.md", lines: "1-70", estimated_tokens: 400 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt-studio/SKILL.md", lines: "1-90", estimated_tokens: 650 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/downloaded/seo/SKILL.md", lines: "1-250", estimated_tokens: 1800 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/local/skill-registry/SKILL.md", lines: "1-80", estimated_tokens: 850 }
    - { path: "openspec/changes/installer-safe-secret-writes/scope.md", lines: "1-145", estimated_tokens: 2200 }
    - { path: "openspec/changes/installer-safe-secret-writes/specs/installer-runtime/spec.md", lines: "1-21", estimated_tokens: 180 }
    - { path: "openspec/specs/installer-runtime/spec.md", lines: "1-31", estimated_tokens: 400 }
    - { path: "EIN.md", lines: "1-47", estimated_tokens: 300 }
    - { path: "codegraph: explore secrets.ts/paths.ts/platform.ts", lines: "source excerpts", estimated_tokens: 2200 }
    - { path: "codegraph: callers writeSecret", lines: "caller list", estimated_tokens: 40 }
    - { path: "codegraph: callers ensureContext7Export", lines: "caller list", estimated_tokens: 40 }
    - { path: "codegraph: callers hasSecret", lines: "caller list", estimated_tokens: 40 }
    - { path: "installer/package.json", lines: "1-20", estimated_tokens: 170 }
    - { path: "installer/tsconfig.json", lines: "1-20", estimated_tokens: 160 }
    - { path: "bunfig.toml", lines: "1-7", estimated_tokens: 100 }
    - { path: "openspec/config.yaml", lines: "1-55", estimated_tokens: 340 }
    - { path: "codegraph: explore install.ts flow", lines: "source excerpts", estimated_tokens: 2400 }
    - { path: "codegraph: explore maybeSecret/runInstall", lines: "source excerpts", estimated_tokens: 2200 }
    - { path: "installer/src/cli/install.ts", lines: "1-210", estimated_tokens: 1500 }
    - { path: "installer/src/cli/install.ts", lines: "211-430", estimated_tokens: 1600 }
    - { path: "installer/src/cli/install.ts", lines: "430-550", estimated_tokens: 650 }
    - { path: "tests/preload-env.ts", lines: "1-22", estimated_tokens: 260 }
    - { path: "tests/installer-backup.test.ts", lines: "1-160", estimated_tokens: 1700 }
    - { path: "tests/installer-runtime-menu.test.ts", lines: "1-340", estimated_tokens: 3000 }
    - { path: "codegraph: explore repository atomic filesystem patterns", lines: "source excerpts", estimated_tokens: 1000 }
    - { path: "codegraph: callers CONTEXT7_KEY_PATH", lines: "caller list", estimated_tokens: 40 }
    - { path: "codegraph: callers ensureSecretsDir", lines: "caller list", estimated_tokens: 40 }
    - { path: "codegraph: callers runInstall", lines: "caller list", estimated_tokens: 40 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 26000, reads: 30 }

## Skill application

- `ein-discipline`: applied for bounded SDD mapping, phase boundary, and strict-TDD handoff.
- `drizzle`, `nuxt-seo`, `nuxt-studio`, and `seo`: skipped as unrelated to this Bun/TypeScript filesystem change.
- `skill-registry`: skipped because no skill was installed, removed, moved, or renamed.
- `skill_resolution: paths-injected`
