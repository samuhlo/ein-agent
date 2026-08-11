# OpenTUI Spike Decision

**STOP and retain the legacy renderer.** The spike authorizes no production migration or candidate release.

The OpenTUI/Solid candidate proves the architecture, packaging, and lifecycle approach. It passes every functional check in all eight native Pi/Claude cells, but it fails the approved startup and distribution-cost thresholds by decisive margins. The implementation is not defective; its measured product and distribution cost is unacceptable under the spike's stop/go rules.

## Evidence

The decision uses [workflow run 31546992107](https://github.com/samuhlo/ein-agent/actions/runs/31546992107) and evidence revision `c2b774c8f6e97dfecb4cee4ed672b358c5df9292`. PR [#175](https://github.com/samuhlo/ein-agent/pull/175) intentionally remained unmerged because its gate correctly stayed red after proving the stop condition.

Every row passes static parity, real-TTY candidate selection and cleanup, legacy fallback, no-double-launch behavior, offline runtime operation, and update/rollback/uninstall. `Static Δ` and `Interactive Δ` compare candidate and baseline p95. `Interactive p95` is the candidate absolute p95. Size columns report candidate package deltas.

| Target | Surface | Functional | Static Δ ms | Interactive Δ / p95 ms | Compressed Δ bytes / % | Installed Δ bytes |
|---|---|---:|---:|---:|---:|---:|
| darwin-arm64 | Pi | Pass | +156.292 | +447.212 / 600.442 | +26,110,349 / 2501.101% | +137,229,285 |
| darwin-arm64 | Claude | Pass | +160.402 | +420.451 / 615.161 | +26,063,528 / 2749.309% | +137,229,369 |
| darwin-x64 | Pi | Pass | +1173.132 | +983.456 / 1142.556 | +28,654,573 / 2744.754% | +148,685,501 |
| darwin-x64 | Claude | Pass | +599.758 | +870.381 / 1073.084 | +28,607,484 / 3017.664% | +148,685,585 |
| linux-arm64 | Pi | Pass | +195.942 | +358.532 / 398.958 | +41,740,510 / 3991.458% | +211,768,128 |
| linux-arm64 | Claude | Pass | +198.748 | +361.748 / 401.825 | +41,696,077 / 4373.115% | +211,768,212 |
| linux-x64 | Pi | Pass | +238.738 | +415.241 / 457.743 | +42,217,578 / 4029.675% | +213,619,484 |
| linux-x64 | Claude | Pass | +243.706 | +414.299 / 456.623 | +42,173,656 / 4413.617% | +213,619,568 |

The measurement harness uses 5 warmups followed by 30 paired baseline/candidate samples, a monotonic clock, a fixed 80x24 terminal, isolated installed packages, and an offline-controlled environment. It calculates p95 with the nearest-rank method.

## Stop/Go Result

| Approved rule | Result | Decision effect |
|---|---|---|
| Static p95 delta <=25 ms | Every cell fails at +156.292 to +1173.132 ms. | Stop. Static mode must not pay the candidate cost. |
| Interactive p95 delta <=100 ms | Every cell fails at +358.532 to +983.456 ms. | Stop. No accepted user-visible benefit waives the regression. |
| Interactive absolute p95 <=500 ms | Linux passes at 398.958 to 457.743 ms; Darwin fails at 600.442 to 1142.556 ms. | Stop. Both interactive bounds apply, and all cells already fail the delta bound. |
| Compressed delta <=10 MiB and <=25% | Every cell fails both bounds at +26,063,528 to +42,217,578 bytes and +2501.101% to +4413.617%. | Stop. Both release-size bounds apply. |
| Installed delta <=15 MiB | Every cell fails at +137,229,285 to +213,619,568 bytes. | Stop. The candidate binary dominates the increase; duplicated standalone legacy and selector binaries also contribute substantially. |

Functional success cannot waive these independent gates. The approved rule requires all mandatory thresholds to pass before another migration slice; packaging and functionality are necessary but not sufficient. The spike records no compelling benefit acceptance or reviewer-approved exception for these costs.

## Retained Value

- Retain the WP1 renderer/controller seam. It separates product behavior from presentation and keeps both renderer paths testable.
- Retain the legacy renderer's behavior as the shipped static and interactive contract.
- Retain the isolated spike code and evidence for future learning. They prove the architecture, native packaging, terminal lifecycle, and acceptance method without authorizing production use.

## Delivery And Rollback

- Remove or revert the production package selector, Pi/Claude ingress, promotion and lifecycle integration, and release-candidate wiring.
- Retain source-compiled legacy `ein` and `ein-app` as the only shipped path.
- Make native acceptance historical and manually runnable instead of keeping a permanently failing pull-request gate.
- Publish no candidate release.
- Keep the spike directory and evidence archived unless maintainers later choose deletion.

The rollback boundary excludes the WP1 renderer/controller seam and legacy behavior. No OpenTUI candidate remains on the production or release path.
