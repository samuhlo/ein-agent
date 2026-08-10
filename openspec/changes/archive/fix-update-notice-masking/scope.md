# Scope: fix-update-notice-masking

## Scope packet

scope: Correct the over-conservative facet-level check in `renderPiEinAdvisorNotice()` that silences startup notices when advisor evidence is incomplete (e.g., one source skipped) even if other sources contain fresh, actionable updates. The rendering logic already filters correctly by component; the check must simply allow `unavailable` status through to that filtering, restoring the intended behavior without modifying the advisor contract.

budget_allocated:
  max_tokens: 8000
  max_reads: 15
  max_runtime_ms: 120000

## Purpose and defect summary

The Ein startup notice displays proactively when Pi/Ein binaries or packages have updates available. Under TDD enforcement, the startup path calls `renderPiEinAdvisorNotice()` to render update evidence collected from three sources: binary, packages, and Ein template.

**The defect:** When any one source cannot complete (e.g., `packages` is skipped due to `PI_SKIP_VERSION_CHECK`, or `binary` returns development state), the shared advisor marks the overall facet status as `unavailable` (indicating incomplete evidence). The current line 313 of `ein-update-notice.ts`:

```ts
if (result.update.status !== "update-available") return null;
```

interprets `unavailable` as "no news" and exits silently, discarding any actionable updates in the other sources. However, lines 321–327 already contain the correct per-component filter:

```ts
const commands = [...new Set(
  result.update.provenance
    .filter((item) => item.quality === "update-available" && item.freshness === "current")
    .map((item) => UPDATE_COMMANDS[item.source])
    .filter((command): command is string => command !== undefined),
)];
```

This filter would render only the fresh, actionable components, honoring the advisor's honest signal that evidence is incomplete while still delivering useful news to the user.

**Verified production triggers:**
1. `PI_SKIP_VERSION_CHECK=1`: skips binary check; Ein + packages may still be actionable.
2. Development Ein install (readEinVersion returns "dev"): marks install as skipped; binary + packages may still be current.

**Note on advisor contract:** The shared advisor (`shared-config-update-advisor.ts`, `updateFacet()`) correctly returns `unavailable` when observations include missing/skipped items. This fail-closed aggregation respects the convention in `EIN.md`: "uncertainty never becomes a good state." The advisor is sound; the consumer was over-cautious.

## In scope

- Read and understand the exact condition on line 313 of `ein-update-notice.ts` and the per-component filter on lines 321–327.
- Decide which facet statuses should pass the check to the per-component filter:
  - `update-available`: pass (fresh, complete evidence).
  - `unavailable`: pass (incomplete evidence but potentially with actionable components).
  - `ambiguous`, `error`, `unsupported`: silent (contradictory or unrecoverable evidence).
- Implement the minimal change to the conditional check to embody this decision.
- Verify the change against the two existing tests in `tests/ein-banner-updates.test.ts`:
  - Line 441: stale evidence must remain silent (regression guard).
  - Line 458: three fresh sources must render identically (regression guard).
- Add a new test case that covers the specific defect: one fresh actionable source + one skipped/unavailable source should render the actionable command.

## Out of scope

- No changes to `shared-config-update-advisor.ts`, its facet aggregation, or its fail-closed contract.
- No modifications to the test infrastructure, test runner, or CI configuration.
- No refactoring of `renderPiEinAdvisorNotice()` beyond the conditional check; the rest of the function is correct and stable.
- No changes to the advisory logic for configuration or handoff decisions.

## Prerequisite and dependency

This fix is a prerequisite for change `launcher-update-surface` (block N), specifically slice N.2, which depends on correct startup notice rendering for full feature delivery. Register this dependency in the change log.

## Testing

TDD strict mode is active (`openspec/config.yaml: strict_tdd: true`). The delivery gate is `bun test`.

- **Existing passing tests** (must not break):
  - `tests/ein-banner-updates.test.ts` line 441: `"stays silent when stale evidence never became an actionable update"`
  - `tests/ein-banner-updates.test.ts` line 458: `"startup notice renders actionable commands and never claims unread configuration"`
- **New regression test required** (in the same test file): the production trigger uses `freshness: "current"` on the skipped source, not `unknown`. `updateObservation()` in `ein-banner.ts:325-332` defaults `freshness` to `"current"`, and `checkPiBinaryUpdate` / `checkPiPackageUpdates` call it without overriding. The test MUST cover `ein=update-available/current` + `binary=current/current` + `packages=skipped/current` and assert the Ein command renders.

### Measured behavior of the three cases (evidence, do not re-derive)

| case | facet status / reason | facet freshness | actionable+fresh provenance |
| :--- | :--- | :--- | :--- |
| 1. `packages=skipped/current` — real trigger | `unavailable` / `unavailable` | `current` | `["ein"]` |
| 2. `packages=skipped/unknown` | `unavailable` / `unknown-evidence` | `unknown` | `["ein"]` |
| 3. stale release (version-comparison path, existing test line 441) | `unavailable` / `stale-evidence` | `stale` | `[]` |

**Key safety result:** case 3 yields an empty command list, so `commands.length === 0` and the function returns `null` at line 328 **even after `unavailable` is allowed through**. The existing stale regression guard therefore cannot break — the per-component filter already excludes non-`current` items on its own. This is measured, not assumed.

Case 2 also renders, because the item being rendered (`ein`) is itself fresh. Design should confirm this is acceptable: the filter's own `freshness === "current"` check is what protects honesty, independent of the aggregate.

No other test files are expected to be affected. The change is localized to the rendering function's entry condition.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Fix restores specified per-component rendering behavior masked by over-conservative facet check; advisory contract unchanged.
