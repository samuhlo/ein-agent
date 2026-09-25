---
name: browser-verification
description: Use when SDD verification requires a real browser, Playwright, or a declared E2E command. Trigger: browser, Playwright, e2e.
license: internal
---

# Browser verification

Verify the agreed behavior in a real browser when navigation, hydration, browser storage, focus, or dialogs are part of acceptance. Keep the runner in the project. Ein does not install a browser framework globally.

1. Read the existing E2E command and its configuration. If absent, report the browser check as unavailable with the exact missing prerequisite. The apply phase may add a small project runner; verify does not edit it.
2. Run focused nonbrowser checks first. Start one local browser run for the accepted scenario after those checks pass. Use one Chromium worker, no automatic local retry, and retain a trace on failure. Repeat only to diagnose a concrete failure.
3. Before starting a local app server, isolate its process with an allowlisted environment, no project `.env` loading (or an explicit empty test dotenv file), a loopback address, and an unreachable loopback database URL when APIs are mocked. Check the effective configuration before launch; deny external network access when the project can use other endpoints. A browser route cannot intercept server rendering or startup imports. A verified process and network boundary is sufficient without auditing every import. If isolation is uncertain, report `unavailable`; do not start the server.
4. Register API fixtures before navigation. Mock only the network boundary, not the client behavior under test. Abort unexpected API calls and external URLs. Disable service workers when they would bypass request routing. Do not reuse a server started outside the test runner.
5. Record the exact command, exit status, browser scenario and trace location. Distinguish client navigation evidence from server authorization evidence. A mock response never proves that the real server accepted or rejected a request.

Use the existing `ein_sdd_verification` receipt and command plan. Do not add a second browser receipt or rerun the full suite merely because a browser test ran.
