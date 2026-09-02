# OpenSpec Specification
format: openspec-spec/v1
domain: claude-payload-transport

## Scenario: claude-payload-carries-canonical-orchestrator
title: Claude payload carries the canonical orchestrator asset
requirement: The system MUST include the canonical `runtime/assets/orchestrator.md` in the Claude payload inventory and generated archive at the stable payload-relative path `runtime/assets/orchestrator.md`, preserving its bytes and declaring it in the manifest.
Given: Given a checkout containing the canonical orchestrator asset and the Claude payload bundler.
When: When the payload inventory and bundle pipeline generate the Claude archive.
Then: Then the archive contains `runtime/assets/orchestrator.md` at that exact path, the manifest contains its path and checksum, and a missing or unreadable canonical asset fails bundling instead of producing an apparently valid payload.

## Scenario: claude-payload-follows-runtime-imports-only
title: Claude payload closure follows runtime dependencies and excludes type-only edges
requirement: The system MUST build the transitive source closure from relative TypeScript dependencies that survive compilation while excluding dependencies reached only through type-only imports or exports.
Given: payload entries contain side-effect imports, value imports or exports, type-only imports or exports, mixed clauses, and dynamic runtime imports
When: the Claude payload bundler calculates their transitive source closure
Then: every relative runtime dependency is included, every edge that is exclusively type-only is excluded, and a mixed clause remains included because it carries a runtime value

## Scenario: claude-payload-remains-isolated-and-compilable
title: The reduced Claude payload remains self-contained
requirement: The system MUST preserve a self-contained payload after excluding type-only dependencies.
Given: the canonical four source entries and the generated payload archive
When: the archive is staged outside the repository and the Claude installation compiles its runtime entries
Then: all four entries compile from the isolated payload, required paths are present, and the compiled BunFS smoke completes without falling back to checkout files

## Scenario: claude-payload-source-analysis-fails-closed
title: Claude payload bundling fails closed when source syntax is uncertain
requirement: The system MUST refuse to generate an apparently complete Claude payload when a source file in the calculated closure cannot be parsed reliably.
Given: a payload entry or discovered relative dependency contains invalid TypeScript syntax
When: the bundler analyzes that source while calculating the closure
Then: bundling fails with the affected source identified and no archive is published

## Scenario: claude-payload-uses-shared-sdd-remedies-core
title: Claude payload renders SDD remedies through the shared core
requirement: The system MUST derive deterministic SDD remedies for Pi and Claude from one runtime-neutral core, and the Claude payload MUST NOT depend on the Pi sdd-remedies implementation for those results.
Given: Pi and Claude receive equivalent lifecycle status including OpenSpec provenance, stale verification, stale summary, and close-channel context
When: each runtime collects and formats the applicable remedies or the Claude payload source closure is calculated
Then: both runtimes return equivalent ordered remedies, the shared remedies core is present in the payload, and the Pi sdd-remedies implementation is absent from that closure

## Scenario: claude-payload-uses-shared-sdd-routing-core
title: Claude payload routes SDD state through the shared core
requirement: The system MUST derive active-change selection, lifecycle status, and next-phase routing for Pi and Claude from one runtime-neutral SDD core, and the Claude payload MUST NOT depend on the Pi sdd-router implementation for those decisions.
Given: Pi and Claude inspect the same OpenSpec change tree, including absent, unique, explicit, ambiguous, incomplete, stale, and conflicting states
When: each runtime resolves lifecycle status or the Claude payload source closure is calculated
Then: both runtimes return equivalent selection and routing results, the shared routing core is present in the payload, and the Pi sdd-router implementation is absent from that closure
