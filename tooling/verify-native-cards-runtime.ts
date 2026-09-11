import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, setCapabilities, setKeybindings } from "@earendil-works/pi-tui";
import { loadThemeFromPath, setThemeInstance } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { installToolCardBridge } from "../ein-pi/agent/lib/tool-card-renderer-bridge.ts";
import { renderNativeCard } from "../ein-pi/agent/lib/native-card.ts";

initTheme("dark");
setKeybindings(new KeybindingsManager());
setThemeInstance(loadThemeFromPath(join(import.meta.dir, "../ein-pi/agent/themes/ein.json"), "truecolor"));
const release = installToolCardBridge(ToolExecutionComponent.prototype, { matches: (name) => ["bash", "read", "edit", "write", "grep", "find", "ls"].includes(name), duration: () => 200, render: renderNativeCard });
assert(release);
const snapshots: { tool: string; state: string; width: number; expanded: boolean; lines: string[] }[] = [];
try {
  for (const tool of ["bash", "read", "edit", "write", "grep", "find", "ls"]) {
    for (const state of ["pending", "running", "completed", "failed", "cancelled", "empty"]) {
      const args = tool === "bash" ? { command: "env -u DATABASE_URL -u APP_ENV -u DATABASE_ENV bun -e '/* inspect connection without inherited variables */'" }
        : { path: "openspec/changes/demo/tasks.md", edits: [{ oldText: "- [] 2.1 Modelo", newText: "- [x] 2.1 Modelo" }], content: "example", pattern: "active" };
      const view = new ToolExecutionComponent(tool, "fixture", args, {}, undefined, { requestRender() {} } as any, process.cwd());
      if (state !== "pending") view.markExecutionStarted();
      if (state !== "pending") view.updateResult({
        content: [{ type: "text", text: state === "failed" ? "password authentication failed for user 'neondb_owner'\nCommand exited with code 1" : state === "cancelled" ? "Tool execution aborted" : state === "empty" ? "" : "Result line one\nResult line two" }],
        details: tool === "edit" ? { diff: "-1 - [] 2.1 Modelo\n+1 - [x] 2.1 Modelo", firstChangedLine: 1 } : {},
        isError: state === "failed" || state === "cancelled",
      }, state === "running");
      for (const width of [32, 40, 60, 80, 120]) for (const expanded of [false, true]) {
        view.setExpanded(expanded);
        const lines = view.render(width);
        const plain = lines.map(stripVTControlCharacters);
        assert(lines.every((line) => visibleWidth(line) <= width), "overflow");
        assert.equal(plain.filter((line) => /^[●✓✗■] /.test(line)).length, 1, "one heading");
        assert(plain.join("\n").includes("ein ·"), "Ein identity");
        if (!expanded) {
          assert(lines.length <= 5);
          assert(!plain.join("\n").includes("DATABASE_URL"), "long script remains folded");
          assert(!plain.join("\n").includes("- []"), "administrative diff remains folded");
        } else if (tool === "edit" && state === "completed") {
          assert(plain.join("\n").includes("Diff"));
          assert(plain.join("\n").includes("+1 - [x]"));
        }
        snapshots.push({ tool, state, width, expanded, lines });
      }
    }
  }
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const image = new ToolExecutionComponent("read", "image", { path: "design.png" }, {}, undefined, { requestRender() {} } as any, process.cwd());
  image.updateResult({ content: [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=" }], isError: false });
  assert(image.render(80).join("\n").includes("\x1b_G"));
  image.setShowImages(false);
  assert(!image.render(80).join("\n").includes("\x1b_G"));
} finally { release(); }
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(snapshots, null, 2));
console.log(`Native cards: ${snapshots.length} real Pi renders passed; seven builtins, six states, five widths, expansion and Kitty images.`);
for (const snapshot of snapshots.filter((s) => ["bash", "edit"].includes(s.tool) && ["completed", "failed"].includes(s.state) && s.width === 80 && !s.expanded)) console.log(snapshot.lines.join("\n"));
