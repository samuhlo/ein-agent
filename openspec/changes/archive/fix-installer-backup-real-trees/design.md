# Design — fix-installer-backup-real-trees

## A. Proposal

### Intent

Aplicar el hotfix mínimo y fail-closed para que el instalador pueda respaldar un árbol Pi real sin copiar dependencias regenerables, preserve enlaces simbólicos legítimos sin seguirlos y permita reintentar únicamente un fallo demostrado como anterior a cualquier mutación de Pi.

### Scope

**Dentro:** contrato de manifest y restore, exclusiones y límites del estado protegido, aceptación segura de hardlinks, detalle acotado de fallos de backup, validación/reanudación del journal y pruebas focalizadas con TDD estricto.

**Fuera:** rediseño del plan o del instalador Claude, copia de dependencias regenerables, conservación de la topología de hardlinks, soporte de sockets/FIFOs/dispositivos/archives, recuperación tras mutación incierta, benchmark sobre el árbol real, release y cambios de formato más allá de compatibilidad de lectura necesaria.

### Affected areas

- `installer/src/core/backup-manifest.ts`: exclusión, manifest v2, enlaces, límites, validación, digest, copia y fsync sin seguimiento.
- `installer/src/core/backup.ts`: snapshot/restore v1-v2, stage seguro, compatibilidad y contexto de error.
- `installer/src/core/install-journal.ts`: detalle de fallo validado y reanudación estrictamente admisible.
- `installer/src/core/install-executor.ts`: devolver el detalle acotado del handler con fallback genérico.
- `installer/src/cli/install.ts`: conservar la causa de `pi.backup-current` y admitir el único retry soportado antes de efectos.
- `tests/installer-backup.test.ts` y `tests/install-journal.test.ts`: escenarios RED/GREEN focalizados. `tests/install-completed-journal-reentry.test.ts` solo si la admisión afecta su contrato existente.

### Risks

- Un enlace recreado antes de verificar sus padres podría convertir el restore en una escritura fuera de raíz.
- Una regla de retry demasiado amplia podría repetir trabajo Pi ya mutado o volver a ejecutar Claude.
- Evolucionar el manifest o journal podría dejar snapshots/journals v1 válidos sin lectura.
- El detalle de un error nativo podría filtrar rutas privadas o desbordar el journal.

### Rollback

Revertir el hotfix restaura el lector v1 y el bloqueo total de recovery. Los snapshots v1 existentes no se modifican. Antes de revertir, cualquier restore de un snapshot v2 deberá realizarse con la versión del hotfix; los snapshots v2 se conservarán, no se reinterpretarán ni borrarán. Un journal reanudado solo podrá quedar `complete` tras éxito probado; de lo contrario seguirá bloqueando de forma segura.

### Success criteria

- El fixture Omarchy-shaped respalda y restaura estado de usuario, omite payloads regenerables por encima de los límites antiguos y nunca lee el target externo.
- Enlaces válidos se recrean como enlaces; enlaces/manifests inseguros fallan antes de mutar el árbol live.
- Hardlinks se aceptan como ficheros regulares independientes sin relajar `O_NOFOLLOW` ni las comprobaciones de identidad.
- Snapshots manifest v1 existentes siguen validando, deduplicando y restaurando.
- El fallo de backup devuelto y persistido identifica operación/entrada y conserva detalle útil, saneado y acotado.
- Solo el journal `both` que demuestra fallo pre-mutación en `pi.backup-current` se reanuda; Claude completado no se ejecuta otra vez.

### Canonical spec context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/installer-runtime/spec.md` | `8612807e4f0b5be419bc38ecbb4f33683e8e959adea62d726128f461671c20c5` | 6237 |

Behavior delta: `openspec/changes/fix-installer-backup-real-trees/specs/installer-runtime/spec.md`.

## B. Spec

### Requirement 1 — Dependency payloads and bounds

The system **MUST** exclude regenerable dependency roots before `lstat`, traversal, hashing, file/byte accounting, or copy. Existing excluded roots remain excluded, and any `node_modules` path segment is excluded; unrelated `.bin` paths are not implicitly excluded. The existing protected-state entry, byte, path, target, and manifest bounds **MUST** remain fail-closed and apply only to included entries.

**Given** an agent tree whose `npm/node_modules` and nested `node_modules` payloads exceed 10,000 files and 128 MiB while included user state remains within bounds, **When** snapshot runs, **Then** dependency bytes and entries are neither inspected below the excluded root nor counted, and included user state is snapshotted; an included tree over its bounds is still rejected.

### Requirement 2 — Non-following symlink preservation

The system **MUST** represent a legitimate symlink as path plus opaque link target, without resolving or reading the target, and **MUST** recreate only the link node inside an empty safe stage. Absolute and `..`-containing targets **MAY** be preserved because the required Omarchy link can point outside; restore **MUST NOT** follow them. Empty, control-containing, over-limit, duplicate, path-colliding, ancestor-of-entry, or altered link records **MUST** be rejected.

**Given** `skills/omarchy` points to an external directory and dependency `.bin` links exist below an excluded root, **When** snapshot, validation, and restore run, **Then** the external directory is never traversed, `skills/omarchy` is restored with the same opaque target, excluded `.bin` links are absent from protected content, and no write escapes the agent stage/root.

### Requirement 3 — Hardlinks

The system **MUST** accept a regular file solely despite `nlink > 1`, while retaining no-follow open, before/after inode-device-mode-size checks, safe mode checks, and protected-state accounting. Restore **MAY** materialize each manifest path as an independent regular file and **MUST NOT** create hardlinks.

**Given** two included paths are hardlinks to the same safe regular inode, **When** snapshot and restore run, **Then** both paths and bytes are restored as regular files without requiring preserved inode identity and without opening a path-following or cross-root link operation.

### Requirement 4 — Manifest compatibility and integrity

The system **MUST** read and restore canonical file-only manifest v1 snapshots unchanged. New snapshots **MUST** use manifest v2 when supporting symlink entries; file entry encoding and file-only content digest semantics **SHOULD** remain stable so v1 dedupe remains possible. V2 digesting **MUST** include an unambiguous type discriminator and symlink target. Validation **MUST** compare staged content with the declared manifest and reject extra, missing, malformed, excluded, non-canonical, or unsafe entries before live mutation.

**Given** one existing canonical v1 snapshot and one new v2 snapshot containing a symlink, **When** each is listed, validated, and restored, **Then** v1 behavior remains unchanged, v2 restores its declared nodes, and tampering either format blocks before the live rename.

### Requirement 5 — Durable link handling

The system **MUST NOT** open, chmod, fsync, or seal through a symlink. Symlink durability **MUST** be established by fsyncing its containing directory, and every destination parent used by staged or excluded-state restore **MUST** be rechecked as a real directory without symlink components.

**Given** a snapshot contains a valid external-target link and excluded state must be reinserted, **When** snapshot sealing/fsync or restore runs, **Then** no operation touches the external target and any restored-link conflict in a destination parent rejects and rolls back rather than traversing it.

### Requirement 6 — Actionable backup failure

The system **MUST** return and persist a cause for `pi.backup-current` containing the failing backup operation, a safe relative entry when known, and the original useful error message after removal of controls and absolute private-root prefixes. Persisted detail **MUST** be UTF-8 bounded to 512 bytes, belong only to the failed backup journal entry, and never contain stack, stdout, stderr, environment, or unbounded native output. Missing detail **MUST** retain the existing generic fallback.

**Given** backup fails while inspecting, reading, copying, validating, fsyncing, or publishing an entry, **When** the handler and journal wrapper record failure, **Then** the installer result and failed `pi.backup-current` entry expose the same actionable bounded cause, the entry is not completed, and the journal remains `recovery-required`.

### Requirement 7 — Proven pre-mutation retry

The system **MUST** resume automatically only when a valid existing journal matches the newly built plan and all of these facts hold: target is `both`; state is `recovery-required`; code is `handler-failed`; `pendingEntryId` is the failed `pi.backup-current`; prior journaled Pi entries are completed dependency entries only; `pi.migrate-legacy` is not selected/completed; every later Pi entry is `not-run`; shared work is completed; and every Claude entry is completed. Existing v1 journals without failure detail **MAY** qualify from the same evidence.

**Given** that exact journal and same plan, **When** install starts again, **Then** it keeps the transaction evidence, skips every completed shared/Pi/Claude handler, moves only `pi.backup-current` back through pending, and runs later Pi entries only after backup succeeds.

### Requirement 8 — No false recovery

The system **MUST** reject invalid, plan-mismatched, interrupted, pending, post-mutation, migration-completed, path-unsafe, malformed, unsupported-target, or otherwise ambiguous journals. A failed retry **MUST** leave backup failed and later Pi non-complete while preserving completed Claude. Recovery fields and backup failure detail **MUST** be removed only when their entry succeeds; the retained journal **MUST** become `complete` only after every selected/conditional entry is proven completed.

**Given** any journal differing from the admissible predicate or a retry whose backup fails again, **When** install starts, **Then** no uncertain handler runs, no completed Claude work is rerun or downgraded, and the journal remains a truthful blocker rather than reporting success.

## C. Decisions

### D1. Version the manifest, not the snapshot container

Add a manifest v2 union with existing v1 file entries plus `{ path, type: "symlink", target }`; keep metadata/container publication unchanged and dispatch validation by manifest version. The target is opaque, bounded metadata. This is the smallest honest schema evolution while retaining v1 read/restore compatibility.

File digest tuples remain byte-compatible with v1; symlink tuples add a type discriminator and target. New writes are v2. Rejected alternative: silently extending v1, because old and new meanings would share a version. Rejected alternative: dereferencing links, because it copies external data and destroys link identity.

### D2. Safety belongs to the collector/restore boundary

`backup-manifest.ts` owns path/entry/target validation, non-following reads, canonicalization, limits and durability behavior. `backup.ts` owns empty-stage creation, atomic publication/swap, excluded-state reinsertion and rollback. A symlink may be created only as a final node after validating/rechecking all real directory parents; validators reject a symlink path that is an ancestor of another manifest entry. Excluded-state copy receives the same parent check.

### D3. Dependencies are excluded structurally; user state stays bounded

Keep current protected/excluded semantics and skip known dependency roots before traversal; extend the rule to any `node_modules` segment. Do not raise or remove the 10,000-entry/128-MiB protected-state caps. This fixes the reported payload without permitting unbounded user-state backups. Rejected alternative: globally increasing caps, because it masks classification errors and weakens fail-closed resource bounds.

### D4. Hardlinks become independent file payloads

Remove only the `nlink === 1` admission rule. Each path is read and verified as a regular file and restored independently. Rejected alternative: encode/recreate hardlink groups, because inode topology is not required for recoverable user state and `link` operations add path and ordering risk.

### D5. Preserve causes at narrow boundaries

Backup failures gain operation/relative-entry context at the filesystem boundary. The Pi backup handler sanitizes and bounds that context; the executor returns handler detail with a generic fallback. The journal permits optional bounded failure detail only on a failed `pi.backup-current` entry, preserving older journals with no detail and avoiding persistence of arbitrary handler output. Rejected alternative: raw thrown errors or stacks, because they leak private paths and are not bounded.

### D6. Resume the existing transaction, do not create a second plan execution

`runInstall` may defer rejection long enough to build the read-only plan, but admission remains before banner, prompts with side effects, or handlers. `executeInstallPlanJournaled` resumes the matching journal only through the exact predicate in Requirement 7: completed entries are no-op successes, the failed backup is retried, and later Pi work remains ordered. The transaction id and completed Claude evidence are retained. Successful completion keeps the existing canonical `complete` tombstone rather than deleting it.

Rejected alternatives: retry every `handler-failed` journal; infer safety from entry ordering alone; restart a fresh journal; rerun Claude. Each either loses evidence or repeats uncertain/completed work.

### Boundaries

- **Design:** observable manifest, failure and recovery contracts in this document.
- **Apply:** tests first, then the minimal TypeScript changes in mapped files; no plan redesign.
- **Verify:** focused regressions, full configured test gate and both TypeScript gates; no production-tree operation.
- **Close:** summarize evidence and remaining compatibility risk; no release/version work in this change.

## D. Success Criteria

Strict-TDD evidence must show RED before production edits for these behaviors, then GREEN after the smallest implementation:

- Omarchy-shaped fixture: external symlink, excluded dependency `.bin` links and payload beyond old caps, included hardlinks and user files; asserts no target traversal and exact safe restore.
- Link attacks: malformed target, symlink ancestor/path collision, tampered link, linked destination parent and excluded-state conflict all reject before live mutation.
- Bounds: excluded payload is not counted; included payload over file/byte/manifest/target bounds remains rejected.
- Compatibility: canonical v1 fixture still validates/restores/dedupes; v2 canonical bytes and content digest detect tamper.
- Failure detail: returned and persisted backup cause includes operation/relative entry/original useful detail, is at most 512 UTF-8 bytes, sanitized, and never marks backup complete.
- Retry: exact `both` journal retries backup, skips completed Claude and prior completed entries, then completes remaining Pi work; repeated backup failure preserves all truthful statuses.
- Rejection matrix: interrupted, migration-completed, later-Pi-started, plan-mismatched, target-mismatched, malformed and path-unsafe journals remain blocked before handlers.

Required verification commands (not run in design phase):

```sh
bun test tests/installer-backup.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts
bun test
bun run typecheck
cd installer && bun run typecheck
```

No build, release, benchmark, or manual snapshot of the production home is required for this hotfix.
