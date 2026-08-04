# Design — installer-safe-secret-writes

## A. Proposal

### Intent

Harden installer secret and shell-RC updates so they reject symbolic or non-regular targets, publish only complete files through same-directory atomic replacement, and preserve the existing secret format and shell-RC idempotency. Filesystem failures remain visible to the existing installer error path.

### Scope

In scope:

- `writeSecret` target validation, trimmed/newline formatting, mode `0600`, atomic replacement, and failure cleanup.
- `ensureContext7Export` target validation, byte-preserving append, Fish/POSIX sentinel behavior, atomic replacement, and failure cleanup.
- Validation of the destination's direct parent; `SECRETS_DIR` must be a real directory rather than a symlink and is created with mode `0700` when missing.
- A narrow deterministic filesystem seam and focused Bun regression coverage.

Out of scope:

- Keyrings, encryption, secret-format migration, or changes to shell detection/sentinel text.
- Tar handling, checksums, CI/E2E configuration, release assets, and unrelated audit findings.
- A repository-wide atomic-file library or native `openat2`/`renameat2` binding.
- Changes to `hasSecret` except any minimal reuse needed to avoid bypassing the same unsafe-target rule.

### Affected areas

- `installer/src/core/secrets.ts`: safe target classification and the bounded atomic-write transaction.
- `tests/installer-safe-secret-writes.test.ts`: focused Bun tests using temporary directories only.
- `installer/src/core/paths.ts`, `platform.ts`, and `installer/src/cli/install.ts` remain contract boundaries; no behavioral redesign is planned there.

### Risks

- Node/Bun path APIs do not provide a portable directory-fd-relative compare-and-rename transaction. A hostile actor able to mutate a parent or destination can still win the final check-to-rename race.
- Atomic replacement changes inode identity; successful RC updates preserve permission bits and bytes, but not unspecified ACLs, extended attributes, ownership overrides, or timestamps.
- `O_NOFOLLOW`/special-file fixtures vary by platform; production must use it when exposed, while tests must explicitly cover the fallback and skip only unavailable fixture types.

### Rollback

Revert the bounded `secrets.ts` and focused-test changes. There is no data migration or new stored format to reverse; files already written remain valid plaintext secret and shell-RC files.

### Success criteria

- Unsafe targets are rejected before reading or writing through them, and symlink destinations remain untouched.
- Successful writes publish complete content atomically; secret files are `0600` from temporary-file creation through commit.
- Existing regular files remain unchanged after any pre-commit failure, and owned temporary files are removed whenever cleanup succeeds.
- Shell-RC content and sentinel behavior remain compatible and idempotent.
- Focused Bun tests and installer typechecking pass in the later apply/verify phases.

### Canonical OpenSpec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `installer-runtime` | `openspec/specs/installer-runtime/spec.md` | `1db8195e4271410b32d7028e498c4e42a83db50817a6e7ab6819daa61ac50407` | 2,365 |

Selection: 1 canonical file, 2,365 of the 32,768-byte limit. The change delta remains in `openspec/changes/installer-safe-secret-writes/specs/installer-runtime/spec.md`.

## B. Spec

### Requirement 1 — Empty secret values

The system MUST return `false` for an empty or whitespace-only secret value before creating a directory, target, or temporary file.

**Scenario — empty value**

- **Given** the configured secret target is missing or already exists
- **When** `writeSecret` receives an empty or whitespace-only value
- **Then** it returns `false` and leaves the filesystem unchanged

### Requirement 2 — Missing safe targets

The system MUST create a missing secret or shell-RC target only when its direct parent is an existing, non-symbolic directory; the secrets directory MAY first be created as a real directory with mode `0700`. Publication MUST use an exclusively created temporary file in that same directory followed by rename.

**Scenario — missing target**

- **Given** the destination is missing and its direct parent is a safe directory
- **When** a non-empty secret is written or the Context7 export is ensured
- **Then** one complete regular destination is published, the operation reports success/`changed: true`, and no temporary file remains

### Requirement 3 — Existing regular targets

The system MUST accept an existing target only when no-follow metadata identifies a regular file. A secret update MUST replace its one-token content; an RC update MUST preserve every existing byte and add only a required separator plus the existing shell-specific block.

**Scenario — existing regular file**

- **Given** a regular secret contains an old token or a regular RC contains unrelated bytes without the sentinel
- **When** the corresponding update runs successfully
- **Then** the secret contains only the trimmed new token plus one newline, or the RC retains its original bytes and has exactly one compatible Fish/POSIX block appended

### Requirement 4 — Symbolic links

The system MUST reject a symbolic-link destination before sentinel inspection or content access and MUST NOT follow it for reads or writes. Where Node/Bun exposes `O_NOFOLLOW`, destination reads and exclusive temporary creation MUST include it.

**Scenario — symlink target**

- **Given** the configured destination is a symlink to an external regular file, whether or not that file contains the sentinel
- **When** either writer runs
- **Then** the operation throws, and both the symlink and its external destination remain unchanged

### Requirement 5 — Directories and special files

The system MUST reject directories, FIFOs, sockets, devices, and all other non-regular destination objects based on no-follow metadata, without opening them for content I/O.

**Scenario — directory or special target**

- **Given** the destination is a directory or an available FIFO, socket, device, or other non-regular object
- **When** either writer runs
- **Then** it throws without blocking, reading, replacing, or modifying that object

### Requirement 6 — Restrictive creation mode

The system MUST open every owned temporary file with exclusive creation and mode `0600`; a committed secret MUST have mode `0600`. An existing RC's permission bits SHOULD be preserved, while a newly created RC MUST remain no more permissive than `0600`.

**Scenario — mode**

- **Given** a missing secret or an existing regular secret with permissive mode bits
- **When** `writeSecret` succeeds under any process umask
- **Then** the resulting secret's permission bits are exactly `0600`, and no write occurred first under a more permissive creation mode

### Requirement 7 — Complete atomic commit

The system MUST fully write the temporary file, flush it, apply its final mode, flush metadata as applicable, and close it before an atomic same-filesystem rename. It MUST revalidate the direct parent and destination state/identity immediately before rename and MUST NOT open the destination for writing.

**Scenario — write or rename failure**

- **Given** a regular destination with known bytes, or a missing destination
- **When** an injected write, flush, close, or rename operation fails
- **Then** the call throws, no partial destination is published, and an existing destination retains its original bytes and pre-commit metadata

### Requirement 8 — Cleanup and error truthfulness

The system MUST unlink only a temporary path that it successfully created with exclusive ownership. Cleanup and close failures MUST NOT turn a failed transaction into success or mask its primary failure; a cleanup failure MAY be attached as secondary error information.

**Scenario — cleanup**

- **Given** the transaction owns a temporary file and then fails before rename
- **When** cleanup is available
- **Then** the temporary file is removed and the original error is surfaced; if cleanup itself fails, the operation still rejects and reports both conditions without deleting the destination

### Requirement 9 — RC idempotency

The system MUST validate an existing RC as regular and non-symbolic before reading it. If its bytes contain `# >>> ein context7 export >>>`, the system MUST return `{ changed: false, rc }` without creating a temporary file or rewriting any bytes.

**Scenario — idempotency**

- **Given** a valid regular RC already contains the start sentinel and unrelated user content
- **When** `ensureContext7Export` runs repeatedly
- **Then** every call returns `changed: false`, the path is unchanged, and no duplicate block or temporary file is created

## C. Decisions

### 1. One bounded atomic-write core, not a general filesystem package

`secrets.ts` will own a private target classifier and atomic-write core used by both public functions. This earns reuse because both vulnerable flows require exactly the same validation, publication, and cleanup invariants; moving it to shared infrastructure would broaden the change without a third use case.

### 2. No-follow classification plus descriptor verification

The direct parent and final target are classified with `lstat`, never `stat`. A target is either missing (`ENOENT`) or an existing regular file; all other errors and object types fail closed. Existing RC content is read from a descriptor opened with `O_RDONLY | O_NOFOLLOW` where available, then checked with `fstat`; device/inode identity is compared with the prior `lstat`. If `O_NOFOLLOW` is unavailable, `lstat` plus post-open `fstat`/identity comparison is the fallback, not a claim of race freedom.

The secrets directory is created with `0700` when absent and then `lstat`-validated as a non-symbolic directory. The RC parent must already exist as a non-symbolic directory. The same parent identity and destination state are checked again immediately before commit.

### 3. Exclusive same-directory temporary file and commit ordering

A collision-resistant temporary basename is placed beside the destination. It is opened with `O_CREAT | O_EXCL | O_WRONLY`, `O_NOFOLLOW` when exposed, and mode `0600`; name collisions are retried without unlinking the colliding path. The transaction writes all bytes, sets final permission bits (`0600` for secrets; prior RC permission bits for an existing RC), `fsync`s, closes, revalidates, and then renames. Rename success is the commit point. Temp-file `fsync` is required; portable directory-fsync durability is not promised by this slice.

### 4. Existing destination safety and residual TOCTOU boundary

Atomic rename replaces the final directory entry and does not follow a final symlink on supported Linux/macOS filesystems, so it cannot write through such a link to its referent. Initial validation, descriptor checks for RC reads, and pre-rename identity checks narrow substitution opportunities.

They do **not** make path checks race-free. Node/Bun does not expose a portable `renameat2`/`openat2` transaction anchored to a locked directory descriptor. An actor with permission to mutate the parent can replace the destination or parent after the last check but before path-based rename; the rename may then replace that substituted entry or resolve in a substituted ancestor, although it still does not write through a final symlink. Eliminating this residual boundary requires stronger directory ownership/permissions or native descriptor-relative primitives and is outside scope.

### 5. RC preservation and mode behavior

Sentinel detection happens only after safe descriptor-based reading. Existing bytes are copied exactly; one separator newline is added only when non-empty content lacks a trailing newline, followed by the unchanged Fish or POSIX block referencing `CONTEXT7_KEY_PATH`. Existing RC permission bits are applied to the temp before commit; a missing RC remains `0600`. Extended metadata is intentionally not part of the existing contract.

### 6. Deterministic strict-TDD seam

Public signatures and return shapes remain unchanged. The implementation core receives a narrow `AtomicFsOps` dependency while production wrappers supply Node/Bun operations. A clearly marked test-only adapter in `secrets.ts` exposes the same core with injected paths, temp-name generation, and operation wrappers; it is not a reusable public filesystem abstraction.

Tests use real temporary directories for bytes, modes, symlinks, and residue. A fail-once decorator deterministically throws at `open`, `write`, `fsync`, `close`, `rename`, or `unlink`, avoiding unreliable permission-based failures. Public `writeSecret` path wiring is exercised in an isolated Bun subprocess with `HOME` set before module import, preventing import-time path constants from touching or caching the real home. Socket/FIFO fixtures are created only where supported.

### Alternatives rejected

- **Direct write followed by `chmod`:** exposes partial content and a permissive-creation window.
- **Temporary file in the system temp directory:** cross-filesystem rename may fail or lose atomicity.
- **`existsSync`/`stat` checks alone:** follow links or leave unchecked read/write races.
- **Only `lstat` before write:** useful classification, but not race-free and insufficient for safe RC reads.
- **In-place update with `O_NOFOLLOW`:** avoids symlink following but can truncate/publish partial content.
- **Permission-denial fixtures:** nondeterministic under privileged runners and differing filesystems.
- **Native `openat2`/`renameat2` addon:** could reduce TOCTOU further but is disproportionate and outside the Node/Bun-only bounded change.

## D. Success Criteria

Acceptance requires all of the following observable outcomes:

- Missing and existing regular secret targets end with trimmed content plus one newline and mode `0600`.
- Missing RCs receive the existing shell-specific block; existing RC bytes and permission bits are preserved apart from the required separator/block.
- A valid sentinel causes a no-write `changed: false` result on every repeated call.
- Symlinks, directories, and available special files are rejected; external referents and original objects remain unchanged.
- Deterministically injected write, flush, close, and rename failures leave no partial destination; successful cleanup leaves no temp-name residue.
- Cleanup failure remains an error and never deletes or rewrites the destination.
- Existing installer callers continue to propagate thrown failures through the current failed-runtime/exit-code path.

Required later-phase verification from the repository root:

```sh
bun test tests/installer-safe-secret-writes.test.ts
cd installer && bun run typecheck
```

No tests, builds, typechecks, or source changes are performed during this design phase.

### Skill application

- `ein-discipline`, `bun`, `nodejs-best-practices`, `architecture`, and `best-practices`: applied to the bounded SDD record, Bun test contract, filesystem/error design, minimal dependency seam, and security posture.
- `nuxt-modules`: skipped because this change has no Nuxt module or web-runtime surface.
