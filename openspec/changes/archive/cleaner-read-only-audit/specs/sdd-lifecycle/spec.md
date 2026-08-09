# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: cleaner-read-only-audit
title: Cleaner audit reports findings without mutation
requirement: The system MUST audit cleaner opportunities in read-only mode using projected project state and applicable reviewed-area ledger records, and MUST produce traceable findings without mutating source, Git, ledger, or cleaner state.
Given: Projected state and applicable ledger evidence are available, incomplete, stale, invalid, unavailable, or ambiguous.
When: A cleaner audit is requested.
Then: The audit reports classified findings with source and evidence references plus explicit uncertainty, does not present suggestions as applied changes, and leaves all inspected project, Git, and ledger state unchanged.
