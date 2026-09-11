import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { adaptTranscriptRenderer, cleanSubagentHeading } from "../ein-pi/agent/lib/terminal-transcript.ts";

const packagePath = process.argv[2];
if (!packagePath) throw new Error("Usage: bun tooling/verify-terminal-transcript-runtime.ts <pi-subagents directory>");
const { renderSubagentResult } = await import(pathToFileURL(join(resolve(packagePath), "src/tui/render.ts")).href);
initTheme("dark");
const release = adaptTranscriptRenderer(ToolExecutionComponent.prototype, cleanSubagentHeading);
let count = 0;
try {
  for (const agent of ["sdd-apply", "ein-scout"]) {
    for (const status of ["running", "completed", "failed", "stopped"]) {
      for (const width of [60, 80, 120]) {
        Object.defineProperty(process.stdout, "columns", { value: width, configurable: true });
        const entry = {
          agent, exitCode: status === "running" ? -1 : status === "failed" ? 1 : 0,
          stopped: status === "stopped", task: "Verify the fixture", messages: [{ role: "assistant", content: [{ type: "text", text: "Verified fixture" }], stopReason: "stop" }],
          usage: { input: 100, output: 30, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
          model: "test/model", durationMs: 1000,
        };
        const tool = {
          name: "subagent", label: "subagent", description: "", parameters: {},
          renderCall: () => new Text(`subagent ${agent}`, 0, 0),
          renderResult: (result: unknown, options: unknown, theme: unknown) => {
            try { return renderSubagentResult(result, options, theme, undefined, { compactResultMaxLines: 5, horizontalSpacing: 1 }); }
            catch (error) { console.error(error); throw error; }
          },
        };
        const view = new ToolExecutionComponent("subagent", "probe", { agent }, {}, tool as any, { requestRender() {} } as any, process.cwd());
        view.updateResult({ content: [{ type: "text", text: "Done" }], details: { mode: "single", results: [entry] }, isError: status === "failed" }, status === "running");
        for (const expanded of [false, true]) {
          view.setExpanded(expanded);
          const lines = view.render(width);
          const text = lines.map(stripVTControlCharacters).join("\n");
          assert.equal((text.match(new RegExp(agent, "g")) ?? []).length, 1, `${agent}/${status}/${width}/${expanded}: ${text}`);
          assert(!text.includes(`subagent ${agent}`), `result must own the heading: ${text}`);
          assert(lines.every((line) => visibleWidth(line) <= width));
          count++;
        }
      }
    }
  }
} finally { release(); }
console.log(`Terminal transcript: ${count} native subagent renders passed.`);
