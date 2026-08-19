# Scope: harden-subagent-envelope-contract

## Summary

Close the subagent envelope contract gap. Three infraestructure bugs in this session (scout normalization, SDD participant result registration, cleaner-improve flow) all stemmed from the same root: the harness assumed subagent results return via the same `tool_call` that launched them, but `pi-subagents` runs backgrounded by default (`asyncByDefault: true`). This change hardens the rule that guards against silent regressions: document centrally where **the rule that protects both existing and future envelope-dependent consumers** lives, test it deterministically, and evaluate constraints for the Claude runtime's policy barriers.

## Scope

Two bounded pieces, both **within scope**; a third piece (the Claude policy barrier mitigation) is **blocked by design decisions** that belong to `sdd-design`, not to scope.

### Piece 1: Centralize and protect the envelope contract rule

**The rule:** If a subagent consumer depends on receiving results through the `tool_call` envelope (not disk artifacts), the subagent launch MUST force `foreground: true` (i.e., `async: false`). If the consumer reads disk evidence (apply-progress.md, continuity checkpoint, etc.), foreground is not required.

**Current state:** 
- Two consumers are protected: `ein-pi/agent/lib/scout-contract.ts` (line 92, 94: `async: false` hardcoded) and `sdd-participants.ts` (implicitly relies on envelope for participant result registration).
- The rule is folklore, not written anywhere centrally.
- No test enforces that a third consumer won't break this silently.

**Scope decision:** Write the rule in ONE authoritative location (determine in design whether it's a new `ein-pi/agent/lib/subagent-envelope-contract.ts`, or an addition to the `openspec/specs/` domain for subagent routing/envoy contracts). Require a test that prevents regression: if a new envelope-dependent consumer is added, the test fails until the consumer forces `async: false`.

**Retirement condition (MANIFIESTO // 004):** When all subagent result consumption has migrated to disk-based evidence (artifact validation instead of envelope parsing), this guardrail becomes unnecessary. Document the evidence that would justify removal: e.g., "no remaining code in ein-pi or cc-ein that reads the `results[]` field from a subagent tool_result details object."

### Piece 2: Identify and document Claude runtime policy constraints

**The problem:** `sdd-close` produces a `summary.md` artefact that describes the change outcome. In Pi, this works. In Claude, the agent (sdd-close) twice refused to write it, interpreting it as an unsolicited "report file" in violation of CLAUDE.md's base policy ("never create .md files by own initiative"). The coordinator worked around it by writing the file manually. This is not an Ein guardrail failure — it's a Claude Code policy that has no escape hatch in Ein's PreToolUse hook (only `Bash` is intercepted, line 526 of cc-ein/sync.ts), and the issue repeats identically if any other phase hits the same policy.

**Scope decision:** Inventory the three candidate hypotheses for mitigation and document their costs and trade-offs. NO IMPLEMENTATION — the choice belongs to `sdd-design` with full visibility into the determinism and maintainability of each path.

**Hypotheses to evaluate:**

1. **Grant Bash to sdd-close in the Claude adapter** 
   - Idea: Give the agent a Bash tool restricted to file-write operations, so it can persist its own summary without triggering the "Write" policy.
   - Cost: Bash escapes the PreToolUse hook pattern; auditing what sdd-close can do becomes a spec question instead of a tool boundary. The write policy might apply to Bash too (untested).
   - Benefit: Agency inside the phase; no fallback complexity.

2. **Deterministic fallback in the envelope**
   - Idea: If sdd-close's output includes a `summary` field in its envelope but the agent blocked Write, have cc-ein-sdd accept it and persist the summary directly.
   - Cost: Couples cc-ein-sdd to sdd-close's output shape; the fallback runs only when blocked, so it's silent when it happens (harder to notice or fix).
   - Benefit: No policy changes; uses existing envelope parsing that already works.

3. **Let cc-ein-sdd write the summary**
   - Idea: Have sdd-close emit the summary content as JSON in its envelope (e.g., `{ summary: { ...content... } }`), and `cc-ein-sdd close` parses and writes it.
   - Cost: cc-ein-sdd gains phase logic; test coverage of the write must verify the exact bytes match the agent's intent.
   - Benefit: Explicit, auditable, and centralizes the write in a tool that already owns the close phase.

## Budget

Allocated for scoping and option gathering:

```
scope: Harden the subagent envelope contract by centralizing the rule that guards foreground enforcement and evaluating Claude policy constraints for SDD phase artifact persistence.
budget_allocated:
  max_tokens: 12000       # Scope + option evaluation; no exploration beyond the three candidates
  max_reads: 20           # Read: scout-contract.ts, sdd-participants.ts, existing tests, cc-ein-sdd, sdd-close spec if exists
  max_runtime_ms: 300000  # 5 min; scope is mechanical
```

## Architecture

- **Piece 1 artifact:** A single authoritative source (file or spec domain) that states the rule clearly, with the retirement condition documented inline.
- **Piece 2 artifact:** A brief design document (`openspec/changes/harden-subagent-envelope-contract/design.md`) that compares the three hypotheses and recommends next steps.

## Known constraints

1. **Byte budget in core/agents/*.md:** At 83,053 bytes (exactly at the limit), there is no room to add rule prose there. The rule must live elsewhere.
2. **Claude policy is runtime-specific:** The Piece 2 constraints only apply in the Claude runtime; Pi's equivalent phase does not face them. Design must account for asymmetry.
3. **Test infrastructure:** Bun test and tsc --noEmit are available; tests live in `tests/`. Regression tests for Piece 1 must pass both.

## Decisions deferred to sdd-design

1. Where does Piece 1's rule live (new file? new spec domain? existing spec)?
2. How is the Piece 1 rule tested (test name? what does it verify exactly)?
3. Which of the three hypotheses for Piece 2 is feasible and best (or if none, what is the trade-off)?
4. Should Piece 2 be fixed in this change or deferred to a follow-up?

---

## Spec delta declaration
spec_delta: none
spec_delta_reason: Scope defines the change surface and guards; actual spec changes (if any) await design.
