# OpenSpec Specification
format: openspec-spec/v1
domain: agent-accounting

## Scenario: accounting-query-command
title: Read-only accounting query command
requirement: The system MUST expose a read-only command that renders the accounting report without computing, filtering or persisting anything, printing every figure together with its coverage and printing an unknown figure as unknown.
Given: A project whose runs carry no cost data.
When: The accounting command is run.
Then: The command prints the snapshot identity and the figures with their coverage, the cost line reads as unknown instead of 0, the sample count accompanies every percentile, and nothing is written to the session store.

## Scenario: fail-closed-unknown-metrics
title: Fail-closed handling for incomplete data
requirement: The system MUST report unknown or partial coverage status for corrupted, missing, or unattributable metrics, never converting uncertainty to false certainty (0 or census).
Given: Session metadata is missing, corrupted, or has unattributable costs.
When: Accounting aggregation is performed.
Then: System marks affected metrics as unknown or partial, reports provenance, and includes coverage in output.

## Scenario: output-tokens-per-model
title: Generated output tokens per model and agent
requirement: The system MUST report generated output tokens per model, per agent and for the parent/subagent partition, using the same single-channel precedence as cost, and MUST report unknown when no sample carries an output count.
Given: Session records report output token counts for some runs and none for others.
When: The accounting report is generated.
Then: Output tokens are reported per model and per agent with their coverage, runs without an output count still count toward the total, and a bucket with no samples reports unknown instead of 0.

## Scenario: parent-subagent-cost-partition
title: Cost partition by parent and subagent runs
requirement: The system MUST partition session tree by parent runs and child subagent runs, summing costs and tracking coverage (partial vs. complete).
Given: Session tree hierarchy exists in filesystem structure.
When: Partition query is requested.
Then: System returns parent cost, subagent cost, coverage status, and data provenance (transcript vs. artifact).

## Scenario: peak-context-window-per-model
title: Peak prompt tokens and peak sequence tokens per model
requirement: The system MUST compute two distinct peaks per agent and model instead of a single ambiguous context window: peak prompt tokens, the maximum of input + cacheRead + cacheWrite in a single message, and peak sequence tokens, the same turn including its generated output, taken from usage.totalTokens when the message reports it and derived from input + cacheRead + cacheWrite + output when it does not. Each peak MUST report mean, p95, max and sample count with its own coverage, and MUST record the source of each sequence sample.
Given: Session transcripts exist with message.usage fields, some messages reporting usage.totalTokens and some not.
When: Aggregation is requested for peak token usage.
Then: System returns peak prompt tokens and peak sequence tokens as two separate statistics (mean, p95, max, sample count) per agent and model, records for each sequence sample whether it was reported or derived, and reports coverage independently for each of the two metrics.

## Scenario: process-rerun-counting
title: Process reruns are derived from the run-N index
requirement: The system MUST derive the process rerun index from the run-N directory segment under a runId, MUST count runs whose index is greater than 0 as reruns, MUST expose the highest observed index, and MUST treat an unparseable index as undetermined rather than as a non-rerun.
Given: The session tree contains run directories from run-0 to run-9 under the same runId plus one directory whose name does not match the run-N form.
When: The accounting report is generated.
Then: Runs with an index greater than 0 are counted as reruns, the highest observed index is reported, and the unparseable directory increments only the undetermined count of the rerun tally.

## Scenario: run-failure-taxonomy
title: Run failures, model fallbacks and process reruns are counted separately
requirement: The system MUST count run failures (exitCode different from 0), model fallbacks (more than one entry in modelAttempts) and process reruns (a run-N directory with N greater than 0) as three independent tallies, each carrying its own undetermined count and its own coverage, and MUST NOT merge them into a single failure figure or infer one from another.
Given: A run has a missing exitCode, a single modelAttempts entry and a rerun directory.
When: Outcomes are counted.
Then: The failure tally records the run as undetermined with partial coverage, the model-fallback tally records a non-fallback, the process-rerun tally records a rerun, and no tally is inferred from another.

## Scenario: single-channel-cost-attribution
title: Each run contributes cost through exactly one channel
requirement: The system MUST attribute a run's cost through exactly one channel, transcript taking precedence over artifact, MUST NOT sum a transcript-derived cost and an artifact-derived cost for the same run, and MUST report how many runs were attributed through each channel and how many through none.
Given: A subagent run has both a readable transcript carrying a cost and a readable meta.json carrying a cost.
When: The cost total is computed.
Then: Only the transcript figure is counted, the run is recorded against the transcript channel, the artifact figure is not added, and the report states the per-channel and unattributed run counts.

## Scenario: snapshot-identity-in-report
title: Snapshot identity accompanies every report
requirement: The system MUST accompany every accounting report with a snapshot identity block stating the report generation timestamp, the time interval covered by the corpus, the sessions and transcripts examined, the artifacts found, the corrupt or absent files, the runs attributed versus unattributable, and the discovery counters, reporting any field it cannot determine as unknown rather than 0.
Given: The session corpus has grown between two generations of the report.
When: Each report is generated.
Then: Each report carries its own snapshot identity block so the two are comparable, and every field that could not be determined is reported as unknown, never as 0.

## Scenario: turnos-per-run-aggregation
title: Turns per run by agent and model
requirement: The system MUST aggregate usage.turns from subagent metadata per run, computing mean, p95, and max turns per agent and model.
Given: Subagent artifacts metadata exists with usage.turns.
When: Accounting report is generated.
Then: System reports turns per run (mean, p95, max) with partial or complete coverage.

## Scenario: unattributable-model-cost-bucket
title: Unattributable usage keeps its own bucket
requirement: The system MUST attribute usage whose model cannot be resolved to an explicit unattributed-model bucket that still counts toward run and partition totals, and MUST NOT distribute that usage across the known models.
Given: A transcript contains messages emitted before any model_change event.
When: The per-model breakdown is produced.
Then: An explicit unattributed-model entry carries those figures, per-model coverage becomes partial, and no known model absorbs them.
