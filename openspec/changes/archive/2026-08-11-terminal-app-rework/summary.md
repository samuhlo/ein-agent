# Archive Report — terminal-app-rework

## Closure

- **Status:** archived
- **Change:** `terminal-app-rework`
- **Archived to:** `openspec/changes/archive/2026-08-11-terminal-app-rework/`
- **Artifact store:** hybrid (`openspec` + Engram)
- **Archive date:** 2026-08-11
- **Native status:** `nextRecommended: archive`; no blocked reasons; archive ready
- **Review gate:** structurally absent. Receipt-driven review was disabled clone-locally by maintainer authorization, so archive proceeded under ordinary repository policy. No `reviewGate` artifact was required or fabricated.

## Final State

The original implementation was committed as `da8dcd7 feat(terminal): rework terminal app experience`. A bounded remediation then fixed TTY `--once` ANSI output, the unavailable-store/no-sessions contradiction, and stale resize dimensions in 95 changed lines. Fresh verification superseded the earlier failed snapshot and passed:

- 11/11 requirements and 20/20 scenarios
- 25/25 tasks complete; no unchecked implementation tasks
- Focused terminal tests: 92/92
- Full suite: 1706/1706 tests, 6365 expectations, 121 files
- Root and installer typechecks passed
- Source and compiled payload TTY `--once`: `ansi=0 bytes=2158 dashboard=true`
- Payload inventory: 11/11
- Evidence revision: `sha256:e4c49e6fd32fab7475ea9efc954c8e014b175876fa820a14411663961a8115df`
- Canonical verify report SHA-256: `2455cce5cc9da4d2fdff9bdb5ea0f95a54e48610b407c4777091cf8ebeb0e313`

The clean four-lens remediation review had no findings and receipt `sha256:c9e2357c0d2201c13bfacf2eb4ea84976d194c5d97fca99a65ccd8f3c0897f57`, but its SDD binding was intentionally bypassed after the clone-local RDD disablement caused by a provider defect. The receipt was not used as an archive gate.

The remaining `ein update` and manual installed-app traversal are post-release acceptance follow-up, not archive blockers. The final verification report contains no critical findings.

## Artifacts Read

### OpenSpec filesystem artifacts

- `openspec/changes/terminal-app-rework/proposal.md`
- `openspec/changes/terminal-app-rework/specs/terminal-app-experience/spec.md`
- `openspec/changes/terminal-app-rework/specs/runtime-session-management/spec.md`
- `openspec/changes/terminal-app-rework/specs/launcher-update-surface/spec.md`
- `openspec/changes/terminal-app-rework/specs/project-settings-management/spec.md`
- `openspec/changes/terminal-app-rework/design.md`
- `openspec/changes/terminal-app-rework/tasks.md`
- `openspec/changes/terminal-app-rework/verify-report.md`
- `openspec/changes/terminal-app-rework/apply-progress.md`
- `openspec/changes/terminal-app-rework/scope.md`
- `openspec/changes/terminal-app-rework/map.md`
- `openspec/config.yaml`
- Existing main spec: `openspec/specs/launcher-update-surface/spec.md`

### Engram artifacts fully retrieved

- Observation `#437`: `sdd/terminal-app-rework/proposal`
- Observation `#438`: `sdd/terminal-app-rework/spec` (combined four-spec content)
- Observation `#439`: `sdd/terminal-app-rework/verify-report`
- Observation `#441`: `sdd/terminal-app-rework/apply-progress`

Exact searches found no separate Engram topics for `sdd/terminal-app-rework/design`, `sdd/terminal-app-rework/tasks`, `sdd/terminal-app-rework/scope`, or `sdd/terminal-app-rework/map`; the corresponding OpenSpec files were read and archived. No review topics were read because `reviewGate` was absent.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `terminal-app-experience` | Created | Delta spec copied mechanically as the new source-of-truth spec. |
| `runtime-session-management` | Created | Delta spec copied mechanically as the new source-of-truth spec. |
| `project-settings-management` | Created | Delta spec copied mechanically as the new source-of-truth spec. |
| `launcher-update-surface` | Updated | Added confirmed allowlisted terminal-app update behavior and modified the launcher non-execution requirement while preserving existing scenarios. |

## Mechanical Readback Evidence

The required copy readbacks for the three newly created main specs produced no output and exit status 0:

```text
diff -r openspec/changes/terminal-app-rework/specs/terminal-app-experience/spec.md <temporary target>
diff -r openspec/changes/terminal-app-rework/specs/runtime-session-management/spec.md <temporary target>
diff -r openspec/changes/terminal-app-rework/specs/project-settings-management/spec.md <temporary target>
```

The required pre-move recursive archive readback produced no output and exit status 0:

```text
diff -r <pre-move snapshot>/source openspec/changes/archive/2026-08-11-terminal-app-rework
```

An empty `diff -r` output is the passing result for each readback. The archive report was added after the pre-move snapshot, as required.

## Archive Contents

The archived folder contains the complete change audit trail, including `proposal.md`, all four delta specs, `design.md`, `tasks.md`, `verify-report.md`, `apply-progress.md`, `scope.md`, and `map.md`. The active `openspec/changes/terminal-app-rework/` source no longer exists.

## Risks and Follow-up

- **Warning:** Once a release contains this change, run `ein update` and manually traverse the installed application once.
- `.atl/` was excluded and remains untouched.
- No staging, commit, push, PR, release, or dependency change was performed by archive.

## Result

The terminal-app-rework SDD cycle is complete and its OpenSpec source of truth plus hybrid audit trail are preserved.
