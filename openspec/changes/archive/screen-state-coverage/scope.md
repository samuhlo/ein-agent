# Scope: screen-state-coverage

**Change:** `screen-state-coverage`
**Phase:** scope
**Lane:** micro
**TDD:** strict (explicit user choice; this phase records it only)
**Artifact language:** English

## Problem statement

The five findings of dogfooding block A were one defect five times: correct code
behind a surface that says something false. The valuation named the common cause
and the missing mechanism:

> The engine has tests at 1.1:1. The surface does not: the tests that exist fix
> the *appearance* (`sdd-overlay.test.ts`, `terminal-chrome.test.ts`) but none
> checks that what is painted *corresponds to the real state of the system*. A
> contract of "what the screen asserts has to come from a computation" is
> implementable and does not exist right now.

The immediately preceding change produced two fresh instances: the overlay
vanished under an ambiguous selection, and the status output claimed there was no
active change while two were open. Both were found by hand, after the fact.

A spike over the existing surfaces found a third, unnoticed one: `phaseStates`
in `ein-pi/agent/lib/sdd-overlay.ts:71-77` marks the `verify` phase `unknown`
when its report is stale or unreadable, and `done` otherwise — so a report that
says **`fail`** is painted exactly like one that says `pass`. The function's own
comment states that "a stale or unreadable report is not a pass"; it forgot the
most obvious case. A failed verification renders as a completed phase.

## Scope boundary

### In scope

- A mechanical guard that walks the enumerable state a surface receives and
  fails when two semantically different states produce identical output, or when
  a state produces no output at all, unless that emptiness is declared with its
  reason.
- Apply it to the pure, importable SDD surfaces and their state unions:
  `SddSelection`, `VerifyOutcome`, `ApplyOutcome` and the phase rail.
- Fix every lie the guard finds, starting with `verify: fail` rendering as a
  done phase.
- Declare the legitimate empty states explicitly, so "renders nothing" stays a
  contract rather than an accident.

### Out of scope

- Surfaces that cannot be imported without side effects (`formatSddStatus` lives
  in `ein-ai.ts`, which registers Pi tools on load). Those keep the
  source-level assertion approach already used for them.
- The installer and terminal-app surfaces. Same idea applies, but their state is
  not a small enumerable union and the unit stays small.
- Any change to what the phases mean, to routing, or to the lane contract.
- Snapshot testing of appearance. This guard is about correspondence, not looks.

## Acceptance criteria

1. The guard enumerates the declared state space of a surface and reports, per
   surface, any pair of distinct states with identical rendered output.
2. The guard reports any state whose output is empty and not declared as
   legitimately empty, with its reason.
3. Every legitimate empty state is declared in one place, with the reason
   recorded next to it.
4. `verify: fail` no longer renders as a completed phase, and is distinguishable
   from `pass`, `unknown` and `absent`.
5. The guard fails if a new value is added to a covered union without the
   surface distinguishing it — the failure names the union, the surface and the
   colliding values.
6. Pre-existing overlay and router contracts stay green: this change adds
   correspondence checks without relaxing appearance ones.
7. Strict TDD evidence per group.

## Evidence and likely seams

- `ein-pi/agent/lib/sdd-overlay.ts:67-77` — `phaseStates`, where `fail` falls
  through to `done`.
- `ein-pi/agent/lib/sdd-overlay.ts:80-91` — `railLine`, which renders those
  states and already has a `danger` style for `unknown`.
- `ein-pi/agent/lib/sdd-router.ts:31-32` — `VerifyOutcome` and `ApplyOutcome`.
- `ein-pi/agent/lib/sdd-router.ts:92-97` — `SddSelection`, added by the previous
  change and the reason its coverage gap was found by hand.
- Spike result, reproduced before writing this scope: over four `VerifyOutcome`
  values with the report present, the overlay produced three distinct outputs —
  `pass` collided with `fail`, and `absent` collided with `fail`.
