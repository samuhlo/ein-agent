# README release information architecture

Reformulate Ein's root README so a new user immediately understands the project, reaches a supported installation path, and can distinguish the latest published release from behavior present only in source or development. Keep the README's established Swiss Grid Brutalism signature while replacing volatile provider/model recommendations with durable capability-and-cost guidance.

## SCOPE PACKET

```yaml
scope: Reformulate Ein's root README information architecture so a new user sees what Ein is, the supported quick-install path and installer link immediately; add a concise latest-published-release summary linked to CHANGELOG with a maintenance contract that prevents it drifting on future releases; replace concrete provider/model names with capability/cost guidance; document only installation channels that actually exist; and consume only verified facts from updater, Engram and banner handoffs without claiming unreleased or unverified deployment behavior.
change_name: readme-release-ia
webfetch: false
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Current project context

- `openspec/config.yaml` exists and remains unchanged in this phase.
- The recorded project context is Node.js/TypeScript ESM with Bun under `installer/`; `strict_tdd` is `false`, and no repository-wide test command is configured.
- `.pi/ein/atl/skill-registry.md` exists.
- Root `README.md` currently delays installation until approximately section `// 010`.
- The supported bootstrap path uses `curl | bash`. GitHub release assets and checksums support a manual path, subject to map-phase confirmation of their exact names, platforms, commands, and public links.
- No Homebrew tap or formula exists. `brew install` documentation remains prohibited.
- Archived handoffs exist for `release-update-semantics`, `engram-deterministic-contract`, and `banner-git-semantics`. They are evidence inputs, not proof that their merged behavior belongs to the latest published installer release.
- Existing unrelated untracked work and archived changes must remain untouched.

## In scope

1. Reorder the root README using progressive disclosure:
   1. hero and concise value proposition;
   2. supported quick install and a clear link to detailed installation;
   3. latest **published** release summary;
   4. concepts and architecture;
   5. detailed installation, commands, configuration, and reference material.
2. Keep the quick-install block concise. It may show the verified bootstrap command once and must point to the detailed installation section rather than duplicate platform, troubleshooting, or manual-install instructions.
3. Add a latest-published-release block containing:
   - an explicit version and publication date;
   - a stable link to that version's anchor in `CHANGELOG.md`;
   - between two and four factual bullets derived from canonical published-release evidence;
   - wording that does not fold merged-but-unreleased updater, Engram, or banner changes into the release.
4. Establish a deterministic maintenance contract for the release block:
   - map one canonical version/date source and the repository's release/tag convention;
   - validate that README version, date, and CHANGELOG anchor agree with canonical published-release evidence;
   - make drift fail a focused repository check or an existing release gate rather than relying on maintainer memory;
   - integrate with existing release mechanics where possible, without claiming generated README content or adding speculative automation.
5. Replace concrete provider/model recommendations in README guidance with capability-and-cost criteria:
   - stronger reasoning for architecture, ambiguity, adversarial review, and high-risk decisions;
   - cheaper execution for bounded, well-specified, repetitive, or mechanical work;
   - preserve verified preset/configuration commands and the fact that Ein does not silently auto-fallback;
   - use no concrete provider or model names in the guidance.
6. Document only installation channels confirmed to exist:
   - the bootstrap installer;
   - verified manual GitHub release assets and checksums if map confirms the complete usable path.
7. Consume updater, Engram, and banner handoffs at the correct truth level:
   - handoff facts may describe verified source/dev behavior only when clearly labelled as such;
   - latest-release bullets may use them only if canonical release evidence proves that behavior is published in that release;
   - handoff limitations and explicit non-claims must survive any condensed README wording.
8. Preserve useful existing anchors, badges, bilingual conventions, and the README's `// 00N` Swiss Grid Brutalism structure where they remain accurate. Renumbering or moving sections is allowed when required by the new reading order.
9. Improve scanability and accessibility within the touched README: logical heading order, descriptive link text, readable tables/lists, labelled command blocks, and no meaning conveyed only through decorative symbols.
10. Synchronize only directly duplicated supporting documentation or release contracts when map proves that a README-only change would leave contradictory maintained guidance. Any such edit must be narrowly justified.
11. Add or adjust focused offline checks for commands, release metadata, forbidden volatile guidance, and unsupported install-channel claims.
12. Produce a factual downstream handoff for `homebrew-install-channel` that records the current absence of Homebrew support and the exact gate for future public documentation.

## Truth and evidence gates

### Published release gate

The map phase must determine the latest published installer release from repository-local canonical evidence, including `CHANGELOG.md`, installer package/version data, and release workflow/tag conventions. It must not infer publication from merged `dev` code, archived SDD completion, a package version alone, or an unverified handoff. Web and network lookup are disabled for this change.

If repository-local evidence cannot prove one coherent version, date, tag convention, and CHANGELOG anchor, the latest-release copy is blocked until the discrepancy is resolved; the README must not guess.

### Updater handoff gate

The archived updater handoff permits narrowly qualified documentation of selector syntax, observable outcomes/exit codes, GitHub-release SHA-256 verification and its limitations, marker-derived version states, external-owner rejection, and recovery-required behavior. It explicitly does **not** prove that these changes were published, that Homebrew exists, or that SHA-256 is a publisher-independent signature. Map must cross-check any public claim against the archived verification artifact and published-release evidence.

### Engram handoff gate

The archived Engram handoff supports only an optional, project-scoped E2 notebook seam through a bounded injected CLI adapter, with OpenSpec remaining canonical and failures remaining non-blocking. It does not support claims of mandatory memory, direct database/MCP integration, full artifact storage, or demonstrated persistence/retrieval against a real private notebook. Published-release wording still requires release evidence.

### Banner handoff gate

The banner handoff describes separate HEAD, LOCAL, and UPSTREAM semantics, logical porcelain-entry counts, local tracking-ref divergence, and explicit stale/offline/unavailable boundaries. Because the handoff text records APPLY evidence and warns that independent VERIFY was pending at handoff time, map must consult the archived verification result before treating these statements as independently verified. Neither the handoff nor local source proves inclusion in the latest published release.

### Homebrew gate

`homebrew-install-channel` is blocked downstream. This change must not add a Homebrew command, badge, availability promise, roadmap promise framed as availability, tap name, formula name, or upgrade instructions. A later documentation change may add them only after a real tap/formula is published, its clean install and upgrade path are verified against a published release, and updater ownership is explicit.

## Acceptance criteria

- [ ] Above the first concepts/architecture section, a new user can identify what Ein is, copy the supported quick-install command, follow a descriptive installer/details link, and see the latest published release summary.
- [ ] The quick path is concise and does not duplicate the detailed installation section.
- [ ] The latest-release block names one repository-proven published version and date, links to the matching `CHANGELOG.md` anchor, and contains two to four factual bullets.
- [ ] No latest-release bullet presents merged-but-unreleased updater, Engram, or banner work as shipped.
- [ ] A deterministic offline check or existing release gate fails when README release version, date, or CHANGELOG anchor drifts from the mapped canonical published-release evidence.
- [ ] The maintenance contract fits existing release mechanics; no unsupported auto-generation claim is introduced.
- [ ] README model guidance uses capability, risk, and cost characteristics without concrete provider/model names, while preserving verified presets/config commands and no-auto-fallback behavior.
- [ ] Installation documentation contains only verified bootstrap and, if confirmed, manual release-asset/checksum paths.
- [ ] No Homebrew installation command, channel claim, tap/formula promise, or misleading badge appears.
- [ ] Any updater, Engram, or banner wording is traceable to an archived verified artifact, retains its material limitation, and is labelled at the correct published-versus-source truth level.
- [ ] Existing useful anchors, badges, bilingual conventions, and visual signature remain functional after section movement or renumbering.
- [ ] Heading order, link text, command labels, and tables/lists remain understandable without relying on decorative symbols alone.
- [ ] Focused offline checks validate documented commands, release version/date/anchor, mapped forbidden model/provider examples, stale volatile examples, and the Homebrew non-claim.
- [ ] A factual handoff names `homebrew-install-channel` as blocked until a published and verified channel exists with explicit updater ownership.
- [ ] Unrelated untracked files, archived changes, dependencies, and public behavior remain unchanged.

## Verification surfaces for later phases

Scope does not run tests or builds. Map/design/tasks should identify the smallest existing Bun test convention or repository check that can cover:

1. extraction and comparison of README release version/date/CHANGELOG anchor against the mapped canonical sources;
2. existence and validity of the quick-install command and its target anchor;
3. allowlisting of supported installation channels and rejection of `brew install`/Homebrew availability claims;
4. rejection of the concrete provider/model names and stale examples inventoried during map, without banning ordinary prose accidentally;
5. preservation of required README anchors and section order;
6. traceability of updater, Engram, and banner claims to verified artifacts and published-release evidence.

All checks must be offline and deterministic. No test may publish a release, create a tag, mutate an installation, invoke a real remote, or access a real Engram store.

## Non-goals and hard boundaries

- Implementing a Homebrew tap, formula, cask, package, release channel, or ownership mechanism.
- Publishing a release, creating/pushing a tag, changing a release version, or bumping installer/package metadata.
- Changing updater, Engram, banner, installer, deployment, checksum, marker, or recovery behavior.
- Changing model presets, provider configuration, routing, fallback behavior, or dependencies.
- Inventing installation channels, generated release notes, release automation, or deployment behavior not supported by mapped repository mechanics.
- Rewriting `CHANGELOG.md` history or using it to claim unreleased work is published.
- A full website, documentation-site, architecture-doc, or bilingual-content redesign.
- Broad cleanup of README-adjacent docs, code, workflows, tests, archived changes, or unrelated untracked work.
- Web/network research or validation.
- Tests, builds, implementation, public README edits, or release actions during this scope phase.

## Review workload forecast

- **Production code:** 0 changed lines expected.
- **Root README and directly duplicated supporting docs/contracts:** target **180–320 changed lines**, hard planning ceiling **under 400** unless map identifies an unavoidable contradiction and the parent approves a split.
- **Focused tests/checks:** forecast **40–100 changed lines**, reported separately from documentation and production.
- **Likely review unit:** one bounded docs-and-contract PR, with checks in the same work unit. If map forecasts more than 400 documentation/production lines, narrow or split the work rather than expanding this scope.

## Risks

- Repository-local version sources may disagree or may not prove publication; guessing would turn the release block into misinformation.
- A handoff can verify source behavior without proving release deployment. Conflating those levels is the primary truthfulness risk.
- A brittle forbidden-string test could reject legitimate historical/reference text; map must inventory exact volatile guidance before designing the check.
- Moving numbered sections can break inbound anchors or the README's visual rhythm; preserve stable anchors where practical and verify all touched links.
- Duplicating install details near the top would recreate maintenance drift; keep one detailed source and one short path to it.
- Future Homebrew work could tempt premature documentation. The downstream gate must remain explicit and factual.

## Exit condition for scope

This scope is ready for `sdd-map` when exploration remains bounded to the root README structure, canonical local release evidence, release-maintenance mechanics, directly duplicated docs/contracts, focused check conventions, and the three archived handoff/verification sets. Map must return an evidence table that separates **published release**, **verified source/dev behavior**, and **explicit non-claim**, and must keep `homebrew-install-channel` blocked.
