# Local dependency corrections

`pi-subagents-0.67.0-widget-animation.patch` corrects the native async widget's
one-second animation cadence and phase jumps caused by activity counters. It
also schedules repaint requests by clock frame, avoiding an extra skipped tick
when interval callbacks arrive slightly early. Status filesystem reconciliation
retains its existing five-second interval.

This is a temporary correction for the installed `pi-subagents@0.67.0`, not an
automatic installer patch or a replacement for the `latest` dependency policy.
Updating that package can overwrite it; the fix belongs upstream. Check the
actual installed package with:

```sh
NODE_PATH="$PWD/node_modules" bun tooling/verify-subagent-widget-animation.ts /path/to/pi-subagents
NODE_PATH="$PWD/node_modules" bun tooling/verify-subagent-widget-runtime.ts /path/to/pi-subagents
```

To apply to an unmodified 0.67.0 package, back up the package and run from the
Ein repository root:

```sh
git -C /path/to/pi-subagents apply --check "$PWD/tooling/patches/pi-subagents-0.67.0-widget-animation.patch"
git -C /path/to/pi-subagents apply "$PWD/tooling/patches/pi-subagents-0.67.0-widget-animation.patch"
```

Run both probes after applying it and restart Ein to load the changed modules.
Merging this PR alone does not deploy the correction to users' installations.

The animation probe checks sequential frames, stable phase during progress,
mounted-component reuse, terminal states, the real quiet-job repaint timer,
suspension, and disposal. It intentionally fails against the unpatched 0.67.0.
