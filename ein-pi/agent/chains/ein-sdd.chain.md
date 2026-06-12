---
name: ein-sdd
description: Ein SDD flow — init, explore, design, apply, verify for a change.
---

## sdd-init

output: init.md
outputMode: file-only
progress: true

Initialize SDD context for {task} before any planning or implementation. If `openspec/config.yaml` is missing, inspect the project and create it automatically. If it already exists, read it, refresh only safe derived context when appropriate, and report the current SDD/testing configuration without blocking the chain.

## sdd-explore

reads: init.md
output: exploration.md
outputMode: file-only
progress: true

Explore {task}. Identify scope, risks, dependencies, and prior art, and whether the change should proceed into design. This is a research phase: only return findings, do not edit repository files.

## sdd-design

reads: init.md+exploration.md
output: design.md
outputMode: file-only
progress: true

Create the unified design plan for {task}: propuesta, spec (RFC 2119 + Given/When/Then) y tareas accionables. Do not include a review workload forecast or chained-PR planning. This is a planning phase: the plan goes to the output file, do not edit repository source files.

## sdd-apply

reads: design.md
output: apply-progress.md
outputMode: file-only
progress: true

Implement the design tasks for {task}; enforce strict TDD when active. Update apply-progress with evidence.

## sdd-verify

reads: design.md+apply-progress.md
output: verify-report.md
outputMode: file-only
progress: true

Verify {task} against the design plan, implementation, apply-progress, strict TDD evidence, and assertion quality. This is a verification phase: run checks and report, do not edit repository files.
