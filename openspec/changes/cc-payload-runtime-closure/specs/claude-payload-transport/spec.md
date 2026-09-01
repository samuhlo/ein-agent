# OpenSpec Delta
format: openspec-delta/v1
domain: claude-payload-transport

## ADDED
### Scenario: claude-payload-follows-runtime-imports-only
title: Claude payload closure follows runtime dependencies and excludes type-only edges
requirement: The system MUST build the transitive source closure from relative TypeScript dependencies that survive compilation while excluding dependencies reached only through type-only imports or exports.
Given: payload entries contain side-effect imports, value imports or exports, type-only imports or exports, mixed clauses, and dynamic runtime imports
When: the Claude payload bundler calculates their transitive source closure
Then: every relative runtime dependency is included, every edge that is exclusively type-only is excluded, and a mixed clause remains included because it carries a runtime value

### Scenario: claude-payload-source-analysis-fails-closed
title: Claude payload bundling fails closed when source syntax is uncertain
requirement: The system MUST refuse to generate an apparently complete Claude payload when a source file in the calculated closure cannot be parsed reliably.
Given: a payload entry or discovered relative dependency contains invalid TypeScript syntax
When: the bundler analyzes that source while calculating the closure
Then: bundling fails with the affected source identified and no archive is published

### Scenario: claude-payload-remains-isolated-and-compilable
title: The reduced Claude payload remains self-contained
requirement: The system MUST preserve a self-contained payload after excluding type-only dependencies.
Given: the canonical four source entries and the generated payload archive
When: the archive is staged outside the repository and the Claude installation compiles its runtime entries
Then: all four entries compile from the isolated payload, required paths are present, and the compiled BunFS smoke completes without falling back to checkout files
