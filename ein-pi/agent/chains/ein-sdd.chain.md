---
name: ein-sdd
description: Ein SDD flow — scope, map, design, tasks, apply, verify, close for a change.
---

## sdd-scope

output: scope.md
outputMode: file-only
progress: true

Define SDD scope for {task} before any planning or implementation. If `openspec/config.yaml` is missing, inspect the project and create it automatically. If it already exists, read it, refresh only safe derived context when appropriate, and report the current SDD/testing configuration without blocking the chain.

## sdd-map

reads: scope.md
output: map.md
outputMode: file-only
progress: true

Map {task}. Identify scope, risks, dependencies, and prior art, and whether the change should proceed into design. This is a research phase: only return findings, do not edit repository files.

FAIL-SAFE:
  BEFORE MAPPING, verify that scope.md contains:
    - scope: <string> (non-empty)
    - budget_allocated: { max_tokens, max_reads? }

  IF scope is missing:
    - output: map-error.md
    - status: scope_missing
    - message: "Scope not found in scope.md. Cannot proceed to map."
	    - STOP CHAIN — do not invoke sdd-design

  IF scope exists but budget_allocated is missing or holds placeholders:
    - Apply the map hard-default budget (max_tokens: 15000, max_reads: 30)
	    - Never map unbounded

  WHEN scope exists but budget max_reads > 50:
    - Warning in artifact: "Scope too broad; consider decomposition"
    - Continue with exploration but register risk

The map.md artifact MUST include:
  budget_allocated: <from SCOPE PACKET>
  budget_consumed: <from ledger>
  scope_status: <valid | scope_missing | too_broad>

## sdd-design

reads: scope.md+map.md
output: design.md
outputMode: file-only
progress: true

Create the design contract for {task}: proposal, spec (RFC 2119 + Given/When/Then), decisions, and success criteria. Do not include a review workload forecast, chained-PR planning, or actionable task checklist. This is a planning phase: the design goes to the output file, do not edit repository source files.

## sdd-tasks

reads: design.md
output: tasks.md
outputMode: file-only
progress: true

Transform the design contract for {task} into an executable `tasks.md` checklist. Do not remap and do not edit repository source files.

## sdd-apply

reads: design.md+tasks.md
output: apply-progress.md
outputMode: file-only
progress: true

Implement the tasks.md checklist for {task}; enforce strict TDD when active. Update apply-progress with evidence.

## sdd-verify

reads: design.md+tasks.md+apply-progress.md
output: verify-report.md
outputMode: file-only
progress: true

Verify {task} against the design contract, tasks checklist, implementation, apply-progress, strict TDD evidence, and assertion quality. This is a verification phase: run checks and report, do not edit repository files.

## sdd-close

reads: design.md+tasks.md+apply-progress.md+verify-report.md
output: summary.md
outputMode: file-only
progress: true

Only if verify-report indicates PASS. Condense {task} into a clean, reviewable `summary.md` (// 00N format: what changed, how it works under the hood, decisions, verification). Do NOT move files — the deterministic close move is run by the parent via `/ein:sdd-close`. If verify failed, return blocked and do not write a summary.
