# OpenSpec Delta
format: openspec-delta/v1
domain: style-delivery

## ADDED
### Scenario: style-delivery-runtime-parity
title: Give both runtimes the same style rules
requirement: The system MUST deliver the compiled style rules to the Claude agents that write code and to the Claude coordinator, and MUST NOT leave one runtime with a pointer while the other receives the rules.
Given: The Claude surface is compiled for deployment.
When: Its agents and coordinator are assembled.
Then: The code-writing agent and the coordinator carry the style rules themselves, and the agents that do not write code do not carry them.

### Scenario: style-delivery-materialized-matches-source
title: Make a stale deployment loud
requirement: The system MUST verify that the style block materialized into the Claude surface equals the contract compiled from the skill at that moment.
Given: A style skill is edited without re-running the sync.
When: The parity contract is evaluated.
Then: The mismatch is reported, because in this runtime the block is frozen at sync time and a silent drift would leave the runtime working from old rules.

### Scenario: style-delivery-payload-closure
title: Ship what the packaged sync needs to run
requirement: The system MUST declare every non-root file that `cc-ein/sync.ts` imports in the Claude payload inventory, and MUST fail packaging rather than the user's machine when one is missing.
Given: The packaged Claude payload is staged and its sync is executed.
When: The sync resolves its imports.
Then: Every imported module is present in the staged tree, and an undeclared one is caught by the inventory contract at packaging time.
