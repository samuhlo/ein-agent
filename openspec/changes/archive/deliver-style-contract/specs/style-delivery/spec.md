# OpenSpec Delta
format: openspec-delta/v1
domain: style-delivery

## ADDED
### Scenario: style-delivery-rules-not-paths
title: Deliver the house style itself, not a pointer to it
requirement: The system MUST deliver the operative style rules to whoever writes code, and MUST NOT rely on the executor opening the full skill documents to obtain them.
Given: An agent that is about to write or edit code.
When: Its prompt is assembled.
Then: The prompt carries the skills' own operative rules, and the skill paths remain available for the detail that the core section does not include.

### Scenario: style-delivery-compiled-from-the-skill
title: Keep the skill as the only source of its rules
requirement: The system MUST read the delivered rules from the skill files themselves and MUST NOT hold a second copy of their text in code.
Given: The style skills are edited.
When: The style block is next assembled.
Then: The delivered rules reflect the edit, because they were read from the skill rather than duplicated in a module.

### Scenario: style-delivery-missing-core
title: Refuse to deliver a silently shorter block
requirement: The system MUST fail explicitly, naming the skill, when a skill does not expose its core section, and MUST NOT deliver a partial block instead.
Given: A style skill without its core section.
When: The style block is assembled.
Then: The failure names the skill, and no partial block is produced.

### Scenario: style-check-only-what-is-mechanical
title: Check what a machine can check, and say what was checked
requirement: The system MUST report emojis and malformed tagged log lines over the supplied lines, MUST NOT treat the comment tag catalogue as closed, and MUST publish which checks it performed.
Given: Lines of touched code containing a comment with a tag outside the documented catalogue.
When: The style check runs.
Then: No finding is reported for that tag, because the catalogue suggests rather than closes, and the report names the checks that were actually performed so a clean result is not read as a full endorsement.
