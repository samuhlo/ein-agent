# Design — reviewed-area-ledger

## A. Proposal

### Intent

Add the smallest project-local contract that lets an audit evaluate bounded review records against privacy-safe evidence and B-owned Git state without claiming approval or causing mutation. Resolve freshness and persistence fail-closed: only an exact binding is current, and only one explicit review-recording workflow may replace the canonical ledger.

### Scope

**In:** Roadmap G only; deterministic area identity, a versioned ledger snapshot, evidence references/digests, pure read/evaluation seams, exact Git binding, affected-area intersection, six fail-closed outcomes, and a deliberately invoked atomic persistence seam.

**Out:** approval, review inferred from sessions or automation, transcript/history export, automatic writes, background refresh, Git mutation, SDD completion, cleaner/architect mutation, launcher/updater/adapter/installer behavior, migration, parallel writers, and roadmap H–L.

### Affected areas

- A focused domain module under `ein-pi/agent/lib` for v1 types, normalization, canonical serialization, intersection, and pure evaluation.
- A narrow repository adapter in the same domain only if persistence is implemented in G; its read and explicit atomic replace operations remain separate from evaluation.
- Focused Bun contract tests, reusing `ProjectGitState`/`ProjectGitChange` fixtures and F-style normalized evidence.
- Canonical project-local data source: Git-ignored `openspec/reviewed-area-ledger.json`, with the narrow ignore contract owned by `openspec/.gitignore`. The data file is absent until an explicit review-recording workflow creates it.

The review-sized internal work units are: pure format/area semantics; pure evidence/Git evaluation; then the bounded store adapter and no-write consumer contract. They are implementation boundaries only. The Review Workload Guard determines delivery shape after measuring the final diff.

### Risks

- B currently exposes a current snapshot, not a historical path delta. Treating `git.changes` as “since review” would under- or over-invalidate dirty reviews.
- A global Git reference can change for an unrelated area. Exact binding therefore conservatively becomes `unknown`, not falsely `stale` or `reviewed`.
- Evidence references can leak private topology unless their grammar and resolved manifest are strictly constrained.
- A single file can encounter concurrent/manual edits; a compare-and-swap atomic replace must abort instead of merging.
- If the canonical file ceases to be Git-ignored, writing it would change B's state reference and self-invalidate its records; the writer must require B-owned exclusion proof and otherwise refuse to write.

### Rollback

Revert the additive module/tests/integration and the narrow `openspec/.gitignore` rule; remove or restore the ignored local `openspec/reviewed-area-ledger.json` separately. Readers never migrate or rewrite the file, so an unsupported/corrupt file remains recoverable. The writer must leave the prior file intact on validation, concurrency, exclusion-proof, temp-write, sync, or rename failure.

### Success criteria

- Equal inputs produce byte-identical canonical output and deeply immutable evaluation results.
- Only valid reviewed records with verified evidence and an exact complete B Git binding evaluate as `reviewed/current`.
- Rename, copy, delete, index, tracked-worktree, and in-area untracked transitions use the deterministic intersection rules below; uncertainty never evaluates current.
- Reads, audits, session discovery, launcher reads, and repeated evaluation leave ledger/source/Git bytes unchanged.
- The implementation remains G-only and review-sized.

## B. Spec

### Requirement 1 — Stable bounded areas

The system **MUST** represent an area as a non-empty set of at most 64 typed selectors. A selector **MUST** be either `{kind:"file", path}` for one exact repository-relative path or `{kind:"tree", path}` for that path and descendants. Paths **MUST** use `/`, be at most 512 UTF-8 bytes, and reject empty/`.`/`..` segments, absolute or escaping paths, backslashes, NUL/control characters, and trailing `/`. Duplicate or redundant selectors are invalid rather than silently removed.

Selectors **MUST** be ordered by UTF-8 byte order of `kind + NUL + path`. `area.id` **MUST** equal `area-v1:sha256:<64 lowercase hex>` over the canonical JSON of the ordered selector array. A label **MAY** describe an area but **MUST NOT** affect identity or expand its boundary. Overlapping areas remain independent identities.

**Scenario:** Given the same valid selectors in different input orders, when the boundary is normalized, then the same ordered boundary and area ID are produced; an empty, unsafe, redundant, or mismatched-ID boundary is `invalid` and never reviewable.

### Requirement 2 — Canonical record and persistence format

The system **MUST** use one canonical source, `openspec/reviewed-area-ledger.json`, with top-level shape `{schemaVersion:1, records:[...]}`. The local data file **MUST** be excluded from Git by the narrow project-owned `openspec/.gitignore` contract so persistence cannot alter the B state it records; the data file itself is not versioned. Records **MUST** be unique by `area.id`, sorted by that ID, and declare only `reviewed` or `unreviewed`; freshness is computed, never persisted. A reviewed record **MUST** contain its area, evidence, and Git binding. An unreviewed record **MUST NOT** contain evidence or a Git binding.

The v1 store **MUST** be bounded to 256 KiB, 256 records, and the area/evidence bounds in this design. Its serializer **MUST** emit fixed key order, no insignificant whitespace, UTF-8, and one terminal newline. Unknown fields, duplicate keys/IDs, contradictory fields, non-finite values, or bound violations **MUST** fail closed.

**Scenario:** Given logically identical valid v1 records in different input orders, when serialized, then byte-identical JSON is emitted; malformed or contradictory input is not partially trusted.

### Requirement 3 — Single writer and read-only consumers

The explicit human-invoked review-recording workflow **MUST** be the sole persistence owner. Before writing, it **MUST** receive current B-owned proof that the canonical path is excluded from B's Git projection; checking or changing ignore state is not G's responsibility. It **MUST** validate the complete proposed v1 snapshot, compare the previously read file digest, write a bounded sibling temporary file with exclusive creation, sync it, atomically rename it, and sync the parent directory where supported. Missing exclusion proof, a changed precondition, existing concurrent temp/write, or any failure **MUST** abort without merge or alteration of the prior file.

All readers and evaluators **MUST** expose no implicit write callback. Session existence, launcher reads, audits, SDD routing, artifact discovery, process startup, timers, watchers, and background behavior **MUST NOT** call the writer. G **MUST NOT** add another store or writer.

**Scenario:** Given an audit repeatedly reads a valid ledger, when it evaluates records, then ledger/source/Git bytes remain unchanged; only a separately and deliberately invoked recording operation with B-owned Git-exclusion proof can atomically replace the file without changing `stateRef`.

### Requirement 4 — Privacy-safe attributable evidence

A reviewed record **MUST** contain:

- `kind: "human-review"`;
- `reference: "review-evidence-v1:<32–64 lowercase hex>"`;
- `digest: "sha256:<64 lowercase hex>"`; and
- `reviewerRef: "reviewer-v1:sha256:<64 lowercase hex>"`.

The digest **MUST** identify a canonical, privacy-screened evidence manifest owned by the existing F evidence workflow and bound to the same `area.id` and recorded Git state reference. The ledger **MUST NOT** store or render raw prompts, transcripts, messages, commands, payloads, exceptions, secrets, session identifiers, private paths, reviewer names/email, or evidence content. A pure evaluator **MUST** consume an injected F-normalized lookup result (`verified`, `missing`, `mismatch`, `invalid`, or `unavailable`) rather than perform filesystem, session, network, or process discovery.

**Scenario:** Given evidence whose reference resolves and whose digest, area ID, reviewer attribution, and Git binding all match, when evaluated, then it may qualify; missing, mismatched, unsafe, or unavailable evidence never produces `reviewed`.

### Requirement 5 — Exact B-owned Git binding

A reviewed record **MUST** bind to B's exact `git-v1:sha256:<64 lowercase hex>` `stateRef`. The current input **MUST** be a repository state with `repository=true`, `complete=true`, `quality=current`, and a valid `stateRef`. G **MUST NOT** run Git, hash worktree content, reinterpret `GitBaseline`, or create a second project-state snapshot.

Equality between recorded and current `stateRef` is necessary for `reviewed/current`. A dirty state **MAY** be reviewed and remain current when the exact reference is unchanged; cleanliness alone never proves review. A missing, malformed, non-repository, incomplete, overflowed, unreadable, or unavailable B state **MUST NOT** be current.

**Scenario:** Given a valid reviewed record and verified evidence, when the complete current B state has the exact recorded reference, then the result is `reviewed/current`, including when that exact state is dirty; otherwise the mismatch is evaluated under Requirement 6.

### Requirement 6 — Deterministic area-to-Git intersection

A historical transition, when supplied, **MUST** be B-owned, bounded, complete, and explicitly bind `fromStateRef` to the record and `toStateRef` to the current B state. G **MUST NOT** treat the current snapshot's `git.changes` as changes since review.

For each valid transition change, impacted paths are:

- added, modified, type-changed, or unmerged: `path`;
- deleted: `path`, plus `previousPath` when present;
- renamed or copied: both required `previousPath` and `path`.

Every impacted path is matched against every selector: `file` matches exact equality; `tree` matches exact equality or the `path + "/"` descendant prefix. Index, tracked-worktree, and explicitly in-area untracked changes use the same rule. A rename/copy crossing a boundary invalidates both source and destination areas. A deletion invalidates the area containing the deleted path.

If a complete exact transition intersects the area, the outcome **MUST** be `stale/relevant-git-change`. If it proves no intersection, the outcome **MUST** be `unknown/binding-mismatch-unaffected`, not `stale` and not current, because v1 requires exact reference equality. If the transition is absent, does not bind both exact references, is overflowed/incomplete, contains an unknown kind, has an unsafe path, or lacks a required rename/copy source, the outcome **MUST** be `unknown/git-transition-unverifiable`.

This intentionally over-invalidates uncertain mismatches to `unknown`; it never under-invalidates them to current. It also avoids falsely marking unrelated areas stale. A later B-owned exact transition surface may reduce `unknown` outcomes without changing G's ownership boundary.

**Scenario:** Given reviewed areas for `src/a` and `docs`, when an exact transition renames `src/a/old.ts` to `docs/new.ts`, then both areas are stale; an unrelated proven transition is unknown under v1, and an unknown/overflowed transition is unknown for safety.

### Requirement 7 — Outcomes, precedence, and reasons

The evaluator **MUST** return one immutable outcome from `reviewed`, `unreviewed`, `stale`, `invalid`, `unavailable`, or `unknown`, with a bounded stable reason code. Only `reviewed` has freshness `current`.

Precedence **MUST** be:

1. unreadable/oversized/unsupported store or unavailable required authority → `unavailable`;
2. malformed v1 store, area, record, reference, digest, or contradiction → `invalid`;
3. no record or explicit valid unreviewed declaration → `unreviewed`;
4. unverified evidence → `unavailable`, `invalid`, or `unknown` according to the injected F result;
5. unavailable/incomplete current Git → `unavailable`;
6. exact complete Git equality → `reviewed`;
7. exact complete transition intersects → `stale`;
8. remaining binding ambiguity → `unknown`.

Observed/current Git references **SHOULD** be returned only when syntactically valid and applicable. Reasons and rendering **MUST NOT** include raw Git output or evidence payloads.

**Scenario:** Given one request for each condition, when evaluated repeatedly, then each returns the same outcome/reason/reference tuple and no fail-closed condition is upgraded to reviewed.

### Requirement 8 — No approval or lifecycle semantics

A ledger outcome **MUST** mean only that this record satisfies or fails this metadata contract. It **MUST NOT** imply approval, merge readiness, verification success, SDD completion, close readiness, or a substitute for human review. Session, artifact, phase, test, build, launcher, and automation success **MUST NOT** create or upgrade a record.

**Scenario:** Given a completed session and all SDD artifacts but no qualifying record/evidence, when queried, then the area is `unreviewed/no-record` (or fail-closed if the store cannot be read) and no approval or lifecycle claim is emitted.

### Requirement 9 — Version and corruption handling

An absent canonical file **MUST** be treated as an empty valid ledger, so a valid requested area is `unreviewed/no-record`. Read errors or size violations **MUST** be `unavailable`. Unsupported schema versions **MUST** be `unavailable/unsupported-version`. Malformed known-v1 content **MUST** be `invalid/malformed-ledger`. Readers and writers **MUST NOT** migrate, repair, truncate, partially consume, or overwrite such content.

**Scenario:** Given absent, corrupt, oversized, and future-version files, when read, then they deterministically become empty/unreviewed, invalid, unavailable, and unsupported/unavailable respectively, without changing bytes.

## C. Decisions

### 1. Intersection is transition-based, never snapshot-difference guessing

`ProjectGitState.changes` describes the current index/worktree relative to current HEAD; it does not describe what changed since a review. Reusing it as a delta would falsely stale pre-existing dirty paths and miss committed or reverted changes. Therefore exact equality is the only current path. Mismatches need an optional exact B-owned transition to distinguish affected (`stale`) from proven-unaffected (`unknown`) cases; all other ambiguity is `unknown`.

**Trade-off:** v1 conservatively loses “current” after even a proven unrelated global state change. This is deliberate over-invalidation required by the exact-reference rule. It avoids both false current and false stale claims and leaves a clean B-owned evolution seam.

### 2. One canonical snapshot, one explicit owner

The canonical store is the small schema-versioned, Git-ignored local JSON file at `openspec/reviewed-area-ledger.json`; it contains at most one current declaration per area. `openspec/.gitignore` owns only the narrow exclusion rule, preventing the ledger from participating in the state reference it stores. The human-invoked review recorder owns whole-file compare-and-swap replacement and must receive B-owned proof that exclusion is effective. Audits own reads only. This avoids circular/self-invalidating bindings, append ordering, latest-event selection, multiple stores, conflict merging, and background persistence.

A writer may exist as an explicit adapter, but no read/evaluation API imports or invokes it. If the explicit recorder is not wired in G, the format and owner contract still stand and files may only be produced by that designated workflow later—not by a fallback writer.

### 3. Areas are typed path selectors, not executable named seams

Exact files and recursive trees are sufficient and testable. Labels are descriptive only. Executable/glob/named seam expansion was rejected because it can drift, become unbounded, and make identity dependent on ambient configuration. Glob semantics and repository-wide wildcard areas are out.

### 4. Freshness is derived, not stored

Records persist a declaration, evidence identity, and exact observed binding. `reviewed`, `stale`, `unknown`, and availability are evaluated from injected current authorities. Persisting derived freshness was rejected because it would become stale and encourage audit writes.

### 5. Evidence payloads remain outside the ledger

F remains responsible for evidence normalization/verification; G stores only strict opaque references, digests, and pseudonymous attribution and consumes a normalized result. Importing session/history data or broadening F's advisor into a ledger store was rejected as privacy leakage and ownership inversion.

### Boundaries and integration direction

- **B/project-state:** sole source of current repository/Git identity, effective proof that the ledger path is excluded from its projection, and, if added by B, exact historical transitions. G consumes immutable inputs and never invokes Git. Until B supplies exclusion proof, no G writer is wired.
- **F/evidence discipline:** sole source of normalized evidence verification. G validates the ledger's safe identifiers and consumes an injected result; it does not inspect raw evidence.
- **G/domain evaluator:** owns area normalization, format validation, intersection, outcome precedence, immutable results, and stable semantic rendering.
- **G/store adapter:** owns only bounded byte reads and the explicitly called atomic compare-and-swap replace. It has no scheduler, watcher, startup hook, or audit side effect.
- **Audit consumers:** request/read/evaluate and render; no writer capability is passed to them.
- **SDD/router/launcher/installer/H–L:** no ownership and no behavior changes.

### Strict-TDD seams

The design exposes small function/module seams suitable for RED–GREEN–REFACTOR:

- pure boundary normalization and canonical area ID calculation;
- pure canonical parse/serialize validation over injected bytes;
- pure `intersects(area, transition)` over fixtures, including rename/delete/unknown cases;
- pure `evaluate(record, currentGit, transition?, evidenceResult)` with no clock/I/O/process/session dependency;
- byte-reader and explicit atomic writer adapters tested separately for absence, oversize, corruption, compare-and-swap failure, atomicity, and no-write reads;
- read-only consumer tests asserting deep immutability, repeatability, privacy, and no approval/session semantics.

No class hierarchy, event bus, cache, database, migration framework, watcher, or plugin system is justified.

### Canonical spec context receipts

None. `scope.md` explicitly records that no canonical `openspec/specs/<domain>/spec.md` file was selected because the relevant canonical lifecycle file exceeds the shared 32 KiB limit. The validated local delta at `openspec/changes/reviewed-area-ledger/specs/sdd-lifecycle/spec.md` was used as change input, not represented as a canonical-domain receipt.

### Skill applicability

- Applied `architecture` for simple pure seams and explicit ownership, and `cognitive-doc-design` for a concise, reviewable decision record.
- Delivery-topology guidance was skipped because this design defines internal implementation boundaries only; the Review Workload Guard owns delivery decisions after the final diff is known.
- `skill-registry` was skipped because no skill was installed, removed, created, moved, or renamed.
- `web-design-guidelines` was skipped because G has no UI surface.
- `github-workflow` was skipped because no GitHub delivery action was requested or performed.

## D. Success Criteria

- A valid selector set has one stable ID and canonical byte representation across permutations; unsafe, empty, redundant, or mismatched boundaries fail closed.
- Valid reviewed evidence with an exact complete current B state produces only `reviewed/current`; no other path does.
- Exact transition fixtures cover committed, staged, tracked-worktree, untracked, rename/copy, delete, type-change, unmerged, unknown, malformed, and overflow behavior using the stated intersection semantics.
- Dirty-at-review equality remains current; current dirty lists are never misused as historical deltas.
- Missing records are unreviewed; corrupt records are invalid; unreadable/future-version authority is unavailable; unverifiable mismatches are unknown.
- Serialized/output data contains no prompt, transcript, message, command, payload, exception, secret, session/private path, or identifying reviewer value.
- Repeated audit reads/evaluations are deeply immutable and produce no file, source, index, worktree, commit, SDD artifact, launcher, cleaner, or architect mutation.
- A deliberate writer replaces only a fully valid bounded snapshot atomically, only with B-owned Git-exclusion proof, leaves `stateRef` unchanged, and aborts safely on concurrent change/failure.
- Focused verification commands, once implementation exists:
  - `bun test tests/reviewed-area-ledger.test.ts`
  - `bun test tests/shared-project-state.test.ts tests/shared-config-update-advisor.test.ts`
- No build, test, typecheck, or source edit is performed in this design phase; installer typecheck is not required unless later scope explicitly introduces installer-facing TypeScript.
