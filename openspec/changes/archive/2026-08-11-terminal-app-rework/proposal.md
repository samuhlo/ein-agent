# Proposal: Terminal App Rework

## Intent

Turn `ein` from a mostly read-only status dump into the terminal application used to start and continue project work. It must expose useful project state and settings, unify Pi and Claude Code sessions, support safe runtime handoff, and remain readable across interactive, narrow, colorless, and non-TTY terminals.

## Scope

### In Scope
- Resume Pi and Claude Code sessions through opaque references and provider-specific launch arguments.
- Discover bounded Claude transcripts and merge both runtimes into one recency-ordered session view.
- Read and update work mode, agent/artifact languages, persona, strict TDD, Hypa, and CodeGraph through their existing owners.
- Provide actionable project state, confirmed allowlisted system commands, and a branded responsive dashboard.

### Out of Scope
- Removing `lib/workbench.ts` or changing installer launchers.
- Shared/parallel agent state, moving settings to `EIN.md`, or making Engram a project setting.
- Adding a TUI framework or new persistent application state.

## Capabilities

### New Capabilities
- `runtime-session-management`: Safely discover, summarize, unify, create, and resume Pi and Claude Code project sessions.
- `terminal-app-experience`: Provide actionable navigation, project state, runtime/system handoff, and adaptive terminal rendering.
- `project-settings-management`: Read and mutate the seven supported project settings through existing storage owners.

### Modified Capabilities
- `launcher-update-surface`: Permit the terminal app to execute only declared update commands after explicit confirmation while keeping unsupported or uncertain updates non-actionable.

## Approach

Keep the model, key handling, and rendering pure; isolate filesystem, process, TTY, resize, and alternate-screen behavior in the terminal driver. Resolve opaque session references by bounded rescanning, validate launch arguments against four exact provider/mode shapes with UUID-only variability, and use one terminal-handoff path for runtimes and allowlisted commands.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `ein-pi/agent/lib/runtime-*.ts` | Modified/New | Session discovery, resume, validation, and unified listing |
| `ein-pi/agent/lib/terminal-app.ts` | Modified | Pure application model, actions, and rendering |
| `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` | Modified | TTY lifecycle, IO, and process handoff |
| `ein-pi/agent/lib/{project-settings,session-summary,theme}.ts` | Modified/New | Settings, transcript summaries, color, and width |
| `tests/` | Modified/New | Runtime, model, driver, settings, and rendering coverage |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Argument injection through resume | Medium | Exact argv shapes, UUID validation, and `shell: false` |
| Transcript/store ambiguity | Medium | Bounded reads, content-based `cwd`, and explicit unavailable states |
| Terminal rendering regressions | Medium | Injected IO tests and honest no-color/non-TTY degradation |

## Rollback Plan

Revert commit `da8dcd7` as one coordinated change; core and driver share contracts. No new application-owned persistent state requires migration.

## Dependencies

- Existing runtime adapters, project-setting owners, update probes, and isolated runtime homes; no new package dependency.

## Success Criteria

- [ ] Pi and Claude sessions list together and resume with exact validated arguments.
- [ ] Seven settings round-trip through disk-backed owners, and project/system views expose only valid actions.
- [ ] No ANSI escapes appear with `NO_COLOR`, non-TTY, or `--once`; narrow rendering remains legible.
- [ ] Root tests and required typechecks pass, with real-PTY behavior verified.
