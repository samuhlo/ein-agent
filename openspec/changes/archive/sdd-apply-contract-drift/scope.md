# Align the sdd-apply acceptance contract with runtime behavior

Normal `sdd-apply` work uses the runtime-injected `acceptance: none` default and therefore does not require an acceptance report. This change aligns the written apply prompt, orchestration guidance, runtime contract, and focused tests while preserving `sdd-verify` as the independent behavioral gate and retaining `acceptance: verified` as an explicit exceptional override.

## Scope packet

```yaml
scope: Align the written sdd-apply contract with the runtime's real default: normal apply work receives acceptance none and does not require an acceptance report, while verified remains an explicit evidence-bearing override and sdd-verify remains the final behavioral gate. Update only the apply acceptance contract, its runtime injection surfaces, orchestration guidance, and focused regression contracts; preserve verify freshness, apply execution behavior, model routing, and unrelated lifecycle behavior.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Goals

1. Make the apply prompt, orchestrator guidance, runtime injection, and regression contracts describe the same `acceptance: none` default.
2. State that normal or mechanical apply work with `acceptance: none` does not produce or require `acceptance-report.md`.
3. Preserve `acceptance: verified` as an explicit exceptional override that requires fresh re-execution and evidence.
4. Preserve `sdd-verify` as the independent final behavioral gate after apply.
5. Add focused regression coverage for the default and exceptional paths.

## Non-goals and hard boundaries

- Do not change verify freshness or candidate-receipt freshness rules.
- Do not change apply execution behavior beyond removing the contradictory general acceptance-report requirement.
- Do not change model routing or phase ownership.
- Do not weaken, merge, or bypass `sdd-verify`.
- Do not change unrelated SDD lifecycle, delivery, close, or archive behavior.
- Do not modify unrelated changes or untracked files.

## Candidate mapping boundary

The map phase should confirm the smallest coherent set rather than assume every candidate must change:

- `ein-pi/core/agents/sdd-apply.md` — written apply-phase acceptance contract.
- `ein-pi/agent/assets/orchestrator.md` — orchestration and handoff guidance.
- Runtime surfaces that inject or normalize apply acceptance mode.
- `tests/sdd-phase-runtime-contract.test.ts` — runtime/prompt contract regression.
- `tests/sdd-planning-acceptance.test.ts` — planning and acceptance semantics.
- `tests/subagent-build-hygiene.test.ts` — generated-agent contract hygiene, only if affected.

Mapping must trace where `acceptance: none` is injected, where acceptance-report requirements are asserted, and where `verified` evidence requirements are enforced. It must not broaden into unrelated lifecycle exploration.

## Acceptance criteria

- [ ] Apply prompt, orchestrator guidance, runtime contract, and tests describe `acceptance: none` as the normal default.
- [ ] Normal or mechanical apply with `acceptance: none` neither requires nor claims an acceptance report.
- [ ] Explicit `acceptance: verified` still requires fresh re-execution and recorded evidence.
- [ ] `sdd-verify` remains an independent required final gate.
- [ ] Focused regressions cover both the default path and the explicit verified override.
- [ ] Verify freshness, apply execution behavior, model routing, and unrelated lifecycle behavior remain unchanged.

## Canonical OpenSpec context

The scope phase used only the explicitly selected canonical domain and remained within the shared limit of three files and 32 KiB UTF-8.

| Domain | Path | SHA-256 | Bytes |
|---|---|---|---:|
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `ba81a1c1e07334514cb089246b81458071d5fc13ddf9e5818b881b21b3297559` | 24622 |

The behavior delta for this change belongs to `sdd-lifecycle` and is declared in `specs/sdd-lifecycle/spec.md`; design should refine that delta without expanding its domain.

## Project configuration

- Stack: Node.js/TypeScript ESM; Bun package manager is detected under `installer/`.
- Testing: no reliable configured runner or test command is recorded in `openspec/config.yaml`; focused test commands must be mapped before apply/verify.
- `strict_tdd`: `false`.
- Artifact store: OpenSpec under `openspec/`; no optional notebook is active for this session.
- Existing configuration was preserved unchanged.
- Skill registry exists at `.pi/ein/atl/skill-registry.md`.

## Risks

- Removing the requirement too broadly could accidentally weaken the explicit `verified` path; regressions must distinguish the two modes.
- Prompt and runtime wording can drift again if tests assert fragments independently rather than one shared semantic contract.
- Conflating apply acceptance with final verification could weaken lifecycle separation; `sdd-verify` ownership must remain explicit.

## Next phase

Map the acceptance value from runtime injection through apply/orchestrator prompts and existing regression contracts, then identify the minimum files and focused test commands required for design.
