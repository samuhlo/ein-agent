# OpenSpec Delta
format: openspec-delta/v1
domain: style-delivery

## MODIFIED
### Scenario: style-delivery-payload-closure
title: Ship what the packaged sync needs to run
requirement: The system MUST declare every non-root file that `ein-cc/sync.ts` imports in the Claude payload inventory, and MUST fail packaging rather than the user's machine when one is missing.
Given: the packaged Claude payload is staged and its sync is executed
When: the sync resolves its imports
Then: every imported module is present in the staged tree, and an undeclared one is caught by the inventory contract at packaging time
