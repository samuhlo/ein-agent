# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: review-budget-resists-line-packing
title: A change cannot enter the budget by packing production code into fewer lines
requirement: The system MUST NOT report a measured range as within the review budget when the UTF-8 byte volume of non-whitespace content in its added and deleted production lines exceeds the configured byte budget, regardless of how few production lines that range contains.
Given: a measured range whose production line count sits below the line budget while its changed non-whitespace production byte volume exceeds the configured byte budget
When: the review-size forecast evaluates that range against the budget
Then: the range is reported as exceeding the budget and the caller is asked to choose between a declared exception and chained PRs, exactly as for a range that exceeds the line budget

### Scenario: review-forecast-density-is-a-localized-notice
title: Anomalous line density is reported where it happens and never blocks on its own
requirement: The system MUST surface production files whose changed non-whitespace byte volume per changed line exceeds the configured notice threshold, and MUST NOT deny a change solely because an individual line exceeds a character length.
Given: a measured range contains a production file whose changed non-whitespace byte volume per changed line exceeds the configured notice threshold
When: the review-size forecast renders its result
Then: the result carries a notice naming the affected files so a reviewer can find them, and no change is denied solely because an individual line is long

### Scenario: review-forecast-reports-volume
title: The review forecast reports character volume and file count, not only lines
requirement: The system MUST report, alongside the production line count, the UTF-8 byte volume of non-whitespace content in added and deleted production lines and the number of distinct production files touched in the measured range.
Given: a measured range contains production source changes
When: the review-size forecast measures that range
Then: the reported forecast carries the production line count, changed non-whitespace production byte volume and distinct production file count, so a consumer can distinguish a change that is small in every dimension from one that is small only in lines
