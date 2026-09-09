# OpenSpec Specification
format: openspec-spec/v1
domain: intent-discovery

## Scenario: natural-language-discovery
title: New work begins with a product decision
requirement: The Pi parent MUST use ein_intent before new modifying work, including small work and SDD auto mode, and MUST ask at least one concrete question with a recommendation before scoping or implementing.
Given: a user requests a new change in ordinary language or through SDD.
When: the parent resolves objective, boundaries and completion criteria.
Then: it presents one round of one to four product questions and waits; repository facts are investigated, and lane/TDD preferences do not substitute for discovery.

## Scenario: observed-answer
title: Confirmation uses an actual response to the pending round
requirement: The runtime MUST require an observed interactive or RPC reply bound to the pending revision; model declarations and extension messages MUST NOT count as an answer.
Given: a proposed intent has no subsequent human response.
When: confirm or a supported SDD delegation is attempted.
Then: it remains blocked without creating a new change directory; the ordinary input still reaches the model unchanged.

## Scenario: proportional-and-reusable
title: Small work stays small and existing agreement survives resumption
requirement: Small work MUST keep its agreement in session, while confirmed SDD work MUST persist the canonical intent.md; identical confirmed material MUST be reusable without another question.
Given: confirmed work is resumed in the same session, or a named SDD change in another session.
When: the parent adopts the same objective, boundaries and completion criteria.
Then: the original response is preserved and the work may continue through its existing execution and verification gates.

## Scenario: progressive-rounds
title: Earlier answers survive later questions
requirement: Discovery MUST ask decisions whose prerequisites are settled, retain observed earlier answers and incorporate only choices the user actually answered.
Given: a round answers some decisions and exposes another unresolved choice.
When: the parent proposes the next round.
Then: previous responses remain in the agreement history; no unrelated reply, refusal or unanswered choice is interpreted as approval by the parent.

## Scenario: explicit-delegation
title: The user may explicitly delegate decisions
requirement: The delegate action MAY skip questions only for an explicit current human instruction such as a standalone 'sin preguntas' or 'resuélvelo tú sin preguntas'; auto alone, quoted examples and negative mentions MUST NOT qualify.
Given: the user explicitly delegates decisions without questions.
When: the parent records the bounded objective, limits and assumptions through delegate.
Then: the actual instruction remains recorded; ordinary execution, delivery and safety gates still apply.

## Scenario: material-change
title: Scope changes reopen discovery and invalidate dependent artifacts
requirement: A material change MUST reopen discovery, and existing managed agreements MUST publish their pending state durably so another session cannot use the prior agreement.
Given: the objective, boundaries or completion criteria change.
When: a new round is proposed and later confirmed.
Then: execution waits for the new response, and routing returns to the first artifact whose intent_key does not match the current materialKey. Ordinary Markdown presentation of a unique key is accepted; duplicate keys are rejected.

## Scenario: cancellation
title: Cancellation stops new work without deleting artifacts
requirement: Cancelling discovery MUST prevent subsequent scoped work and MUST leave existing phase artifacts intact.
Given: a pending new change or a revised existing agreement.
When: the parent records the user's cancellation.
Then: a new change leaves no project artifacts, while an existing managed change retains a cancelled agreement and cannot be archived as completed.

## Scenario: canonical-handoff-and-close
title: One agreement governs specs, implementation and close
requirement: Every managed phase artifact MUST reference the current intent_key; tasks/apply MUST NOT use a design with a missing, duplicate or old key, and close MUST reject pending, cancelled, invalid or stale intent.
Given: a managed SDD change with phase artifacts.
When: planning advances, the deterministic summary is written, or close readiness is assessed.
Then: consumers use intent.md as the single agreement authority; the summary derives its key from the agreement after checking apply and verify references. Historical preflight intent fields cannot authorize a new discovery flow.

## Scenario: legacy-and-claude
title: Existing work remains readable without fabricated conversation
requirement: Historical scoped changes without managed intent MAY resume; an existing legacy intent.md MUST remain intact until a new adoption round is answered. Claude MUST preserve confirmed managed agreements and use shared routing/close guards without claiming Pi-equivalent response capture.
Given: an older change or a handoff to Claude.
When: the runtime reads the change.
Then: it does not invent historical user approval. New or changed managed agreements are resolved in Pi before the Claude relief adapter resumes.
