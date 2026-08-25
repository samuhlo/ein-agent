# OpenSpec Specification
format: openspec-spec/v1
domain: style-delivery

## Scenario: style-check-only-what-is-mechanical
title: Check what a machine can check, and say what was checked
requirement: The system MUST report emojis and malformed tagged log lines over the supplied lines, MUST NOT treat the comment tag catalogue as closed, and MUST publish which checks it performed.
Given: Lines of touched code containing a comment with a tag outside the documented catalogue.
When: The style check runs.
Then: No finding is reported for that tag, because the catalogue suggests rather than closes, and the report names the checks that were actually performed so a clean result is not read as a full endorsement.

## Scenario: style-delivery-compiled-from-the-skill
title: Keep the skill as the only source of its rules
requirement: The system MUST read the delivered rules from the skill files themselves and MUST NOT hold a second copy of their text in code.
Given: The style skills are edited.
When: The style block is next assembled.
Then: The delivered rules reflect the edit, because they were read from the skill rather than duplicated in a module.

## Scenario: style-delivery-materialized-matches-source
title: Make a stale deployment loud
requirement: The system MUST verify that the style block materialized into the Claude surface equals the contract compiled from the skill at that moment.
Given: A style skill is edited without re-running the sync.
When: The parity contract is evaluated.
Then: The mismatch is reported, because in this runtime the block is frozen at sync time and a silent drift would leave the runtime working from old rules.

## Scenario: style-delivery-missing-core
title: Refuse to deliver a silently shorter block
requirement: The system MUST fail explicitly, naming the skill, when a skill does not expose its core section, and MUST NOT deliver a partial block instead.
Given: A style skill without its core section.
When: The style block is assembled.
Then: The failure names the skill, and no partial block is produced.

## Scenario: style-delivery-payload-closure
title: Ship what the packaged sync needs to run
requirement: The system MUST declare every non-root file that `cc-ein/sync.ts` imports in the Claude payload inventory, and MUST fail packaging rather than the user's machine when one is missing.
Given: The packaged Claude payload is staged and its sync is executed.
When: The sync resolves its imports.
Then: Every imported module is present in the staged tree, and an undeclared one is caught by the inventory contract at packaging time.

## Scenario: style-delivery-rules-not-paths
title: Deliver the house style itself, not a pointer to it
requirement: The system MUST deliver the operative style rules to whoever writes code, and MUST NOT rely on the executor opening the full skill documents to obtain them.
Given: An agent that is about to write or edit code.
When: Its prompt is assembled.
Then: The prompt carries the skills' own operative rules, and the skill paths remain available for the detail that the core section does not include.

## Scenario: style-delivery-runtime-parity
title: Give both runtimes the same style rules
requirement: The system MUST deliver the compiled style rules to the Claude agents that write code and to the Claude coordinator, and MUST NOT leave one runtime with a pointer while the other receives the rules.
Given: The Claude surface is compiled for deployment.
When: Its agents and coordinator are assembled.
Then: The code-writing agent and the coordinator carry the style rules themselves, and the agents that do not write code do not carry them.
