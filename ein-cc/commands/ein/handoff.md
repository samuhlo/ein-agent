---
description: Inspect or control Ein continuity
argument-hint: status|to pi|to claude|refresh|clear
---

Continuity control is handled deterministically by the UserPromptSubmit hook.

An unresolved operation survives restart and cannot be cleared by refresh.
List unresolved IDs with `ein-cc-sdd continuity inspect`; inspect one with
`ein-cc-sdd continuity inspect <opId>`, then resolve using
`ein-cc-sdd continuity resolve <opId> < recovery.json` with the returned token,
native call reference and existing evidence. Do not retry the original action
or invent a successful result. Missing external read-back remains a blocker.
Local recovery is an explicit coordinator attestation, not proof of execution.
External Git recovery currently requires a push of a literal commit to a literal
credential-free repository destination and matching native ls-remote evidence;
mutable aliases or other external effects remain unproven.
