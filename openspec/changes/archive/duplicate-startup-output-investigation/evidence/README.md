# PTY startup evidence

Canonical retained run: `b7dc0533-758b-4511-8ae0-a91718520fb8`.

## Reproduction procedure

1. Create a temporary `HOME` containing `.pi-ein/agent/settings.json` with the exact source path recorded in `pty-capture-metadata.json` as its only extension and no packages, skills, or prompts. Add a temporary trust entry for the recorded cwd. Copy only the installed `.ein-install.json` marker.
2. Set the diagnostic environment recorded under `effectiveEnvironment`, including `PI_OFFLINE=1`. The `pi-ein` launcher then derives both isolated agent-home variables from the temporary `HOME`.
3. Fork `/opt/homebrew/bin/fish` under a Python standard-library PTY sized 120×40 and run the recorded no-argument command: `source '<repo>/pi-ein/pi-ein.fish'; pi-ein`.
4. Capture every PTY byte in `pty-startup.raw`, every read with wall/monotonic time and base64 bytes in `pty-chunks.jsonl`, and the process tree every 500 ms in `pty-processes.jsonl`.
5. After nine seconds send Ctrl-D. Keep a 14-second hard deadline with process-group TERM/KILL fallback. The retained run exited normally on the first Ctrl-D (`exitCode: 0`, deadline fallback unused), and the temporary home was removed. No Pi-Ein process remained.

## Evidence boundaries

- `pty-capture-metadata.json` records actual command, empty Pi argv, temporary isolated settings, cwd, Pi version/binary, PID/PPID, effective homes/`AGENT_DIR`, source realpath/URI/hash/inode, discovery result, and run identity.
- `startup-provenance.jsonl` is the structured application side channel: one linked load, registration, and unfiltered UI invocation.
- `pty-presentations.jsonl` is independent PTY evidence: one complete stable banner presentation, timestamped and digested as `banner-stdout-redraw`; its notification parent and compatible application monotonic time remain `unknown`.
- `startup-run-summary.json` is the classifier result. Detector, notification emission, and notification-overlay presentation evidence remain unknown, not zero. The supported diagnosis is therefore `unknown/missing-evidence`.
- `verify-evidence.ts` checks run/process/parent identities, the raw hash, clean exit, independent presentation attribution, and fail-closed unknowns.

The installed user agent home and its manifest were not used as active-discovery evidence and were not modified. No production build was run.
