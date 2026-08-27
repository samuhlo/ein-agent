# Apply Progress — rename-ein-runtime-surfaces

status: complete
base_head: `0aa5403f3b0807fc69a36c60e1f947226eae397c`
strict_tdd: true
release_boundary: version, commit, push, tag and publication are excluded from apply

## Protected roots

- `openspec/changes/fix-overlay-repaint-recovery/`: must remain byte-identical to `base_head`.
- `openspec/changes/archive/`: immutable history; excluded from the live naming audit.

## Execution evidence

### Verify continuation — F-004

- RED: a cross-platform raw gzip/tar inspector observed the actual archive
  records instead of trusting the host `bsdtar` listing. The macOS producers
  emitted 996 payload sidecars/PAX records carrying
  `LIBARCHIVE.xattr.com.apple.provenance`; setting only the copyfile environment
  still left the raw xattr records, so the focused portability test remained
  red for both archives.
- GREEN: `bundle-ein-cc.ts` and `bundle-template.ts` now invoke the same system
  tar with `COPYFILE_DISABLE=1` and portable `--no-xattrs`. The raw archives
  contain neither AppleDouble members nor PAX xattr keys; the focused archive,
  payload and installed-template group passes 13 tests with 419 assertions.
- TRIANGULATE: `cc-payload-smoke.ts` compiled for `bun-linux-arm64` runs to
  completion inside `ein-e2e-ubuntu`. The full Docker installer E2E passes
  `invalid`, `default-pi`, `claude-only` and `both`, including two consecutive
  Claude and combined installs and the Ein-first completion ordering.
- REFACTOR: the test-only parser reads tar headers and PAX payloads directly and
  rejects an explicit `._payload` member. Consumption stays fail-closed:
  `validatePayloadManifest` was not relaxed and no `._*` ignore was added.
- GREEN: fresh integrated evidence is `bun test` with 2,781 tests and 13,597
  assertions across 200 files, plus root and installer typechecks. The generated
  assets and one Linux installer target were rebuilt only for the required
  Docker gates; release identity remains `0.91.0-alpha.2`.

### Verify continuation — F-001/F-002/F-003

- RED: `bun test tests/legacy-runtime-artifacts.test.ts tests/runtime-surface-transaction.test.ts tests/release-asset-contract.test.ts`
  passes 22 tests and fails the four intended assertions: a parent symlink is
  observed and hashed as a regular file, no manifest exists at `before-move`,
  reentry reports an already-moved launcher as absent, and the E2E contract
  still contains the obsolete Claude completion receipt.
- GREEN: the focused continuation gate passes 67 tests across legacy
  observation, durable retirement, install journal integration, update state,
  release/E2E receipts and the live naming audit. The observer rejects an
  escaping parent symlink before hashing; the recovery manifest is published
  before every move and reconciles a SIGKILL between rename and post-state.
- GREEN: `shared.retire-legacy` is the final managed install-plan entry. A
  journal publication failure after real Claude SDD quarantine restores the
  original bytes and `0741` mode; successful global completion alone finalizes
  quarantine. Update continuations use the same update transaction id and the
  measured sequences are `prepare -> commit` on success and
  `prepare -> rollback` after a later template failure.
- TRIANGULATE: explicit rollback and global-commit tests cover retained versus
  deleted recovery roots; completed install/update journals resume finalization
  with their recorded target/transaction identity instead of rescanning the
  legacy path. The `both` Docker contract now observes the actual Ein-first
  Claude receipt `claude code: ein listo` after the Pi receipt.
- REFACTOR: the implementation reuses the install journal and update
  continuation/state machine as lifecycle owners. No parallel migration
  framework, compatibility launcher, data-home rename or release mutation was
  introduced.
- GREEN: fresh integrated evidence is `bun test` with 2,778 tests and 13,589
  assertions, root and installer typechecks, `git diff --check`, zero live
  unclassified retired names, protected-root equality to `base_head`, and
  idempotent structured sync (`canonicalChanged:false`) across five domains.

### // 001 — Typed naming audit

- RED: `bun test tests/runtime-surface-naming-audit.test.ts` first passed the
  fixture-only classifier and failed the live sentinel with real stale current
  paths and commands.
- GREEN: the fixture-only cases now pass for exact stable data homes, explicit
  `LEGACY_*` evidence, exact archive/cache exclusions and symlink rejection.
- TRIANGULATE: the three references in the protected completed change are typed
  by exact path and literal acceptance context as historical evidence; no root
  exclusion hides current usages.
- REFACTOR: matching, traversal, exclusions and typed reasons live in
  `tests/helpers/runtime-surface-naming-audit.ts`; no source/test/docs root is
  broadly excluded.

### // 002–009 — Runtime surfaces

- RED: focused launcher/runtime tests failed imports immediately after the
  mechanical root moves, proving consumers still addressed the retired roots.
- GREEN: `pi-ein/` is removed, its three adapter files now live directly under
  `ein-pi/`, `cc-ein/` is removed, and the Claude adapter lives under `ein-cc/`;
  the focused runtime group passes 205 tests.
- TRIANGULATE: parity, source, updater and generated-surface checks pass 333
  tests, including exact launcher argv, generator provenance and environment
  preservation.
- REFACTOR: generated `ein-cc/CLAUDE.md` was reproduced from
  `compileClaudeSurface()`; no compatibility command alias was retained.

### // 010–019 — Installer, payload and legacy cleanup

- RED: payload tests failed on retired inventory/script/archive names; the new
  ownership, transaction and upgrade tests initially failed because their
  modules did not exist; installer completion assertions exposed the obsolete
  two-command primary guidance.
- GREEN: the payload/build/release group passes 53 tests. The installer cleanup
  gate passes 68 of 68 non-audit tests across legacy ownership, transactional
  rollback, managed-surface upgrade, runtime install and uninstall.
- TRIANGULATE: exact alpha.2 hashes, symlink/directory/neighbor collisions,
  marker mismatch, injected post-move failure, materialization failure and
  absent managed runtimes are covered.
- REFACTOR: one typed inventory owns the new payload archive; one exact legacy
  inventory owns cleanup classification; the obsolete generated
  `installer/src/assets/cc-ein-runtime.tar.gz` was removed and the new
  `ein-cc-runtime.tar.gz` is present.

### // 020–027 — Specs, documentation and final audit

- RED: living docs and canonical specs initially contained current retired
  commands and roots; the audit enumerated them.
- GREEN: deterministic
  `bun ein-cc/sdd-cli/cli.ts sync rename-ein-runtime-surfaces` updated the five
  selected canonical domains. Spec/wiring checks pass 88 tests; docs checks pass
  31 tests and the docs-site production build succeeds.
- TRIANGULATE: primary onboarding now opens `ein`; `ein-pi` and `ein-cc` are
  documented as advanced direct shims; troubleshooting describes safe collision
  preservation and the hard cut.
- REFACTOR: the final live audit is ready for its integrated gate without
  modifying either protected root.

### // 028 — Integrated gates

- RED: the first integrated run passed 2,772 tests and failed one frozen-corpus
  byte comparison because a mechanical rename had rewritten immutable historical
  facts. The corpus was restored through its owner contract and classified as an
  exact historical record rather than changing its expected bytes.
- GREEN: `bun test` passes 2,773 tests across 199 files with 13,548 assertions;
  `bun run typecheck` and `cd installer && bun run typecheck` pass. The final
  live naming audit has zero unclassified retired spellings.
- GREEN: the structured spec sync is idempotent (`canonicalChanged:false`), the
  compiled payload smoke runs successfully from `/tmp`, the docs build produces
  23 pages, installer/SDD help and both Fish function identities show only the
  current entry points, and the focused E2E/release contracts pass inside the
  full suite.
- TRIANGULATE: the integrated failures measured both sides of the historical
  boundary: changing frozen history fails byte parity, while leaving a current
  retired spelling untyped fails the live sentinel.
- REFACTOR: production `build:all`, Docker publication E2E and release mutation
  remain at the repository's `sdd-verify`/release boundary; apply ran the
  compiled payload and contract gates without producing a release build.
- GREEN: `git diff --check` passes and the protected-root diff against
  `base_head` is empty. `installer/package.json` and
  `installer/src/core/version.ts` remain `0.91.0-alpha.2`.

## Apply decisions

- The comment-style guide is active for touched TypeScript and JavaScript blocks: comments explain non-obvious reasons only.
- Stable state and integration contracts remain `~/.pi-ein/agent`, `~/.claude-ein`, `PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`, and `CLAUDE_CONFIG_DIR`.
- Post-verify release tasks // 029–031 are not executable in this phase.
- The design's legacy-retirement semantics use one private durable manifest:
  validated new artifacts first, exact owned-artifact quarantine second,
  atomic intent/post-state around every move, reentrant reconciliation,
  collision preservation, reverse-order rollback, and deletion only after the
  caller's global commit. No general-purpose migration framework was introduced.
