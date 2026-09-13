import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { AssistantMessageComponent, ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import terminalActivity from "../../ein-pi/agent/extensions/ein-terminal-activity.ts";
import { adaptTranscriptRenderer, cleanHiddenThinking, cleanSubagentHeading, HIDDEN_THINKING_LABEL } from "../../ein-pi/agent/lib/terminal-transcript.ts";

initTheme("dark");
const plain = (lines: string[]) => lines.map(stripVTControlCharacters).join("\n");
const message = (content: unknown[]) => ({ role: "assistant", content, stopReason: "stop", timestamp: 0 }) as any;

describe("native transcript presentation", () => {
  test("hidden thinking takes no rows during streaming or session replay; expanded thinking survives", () => {
    const release = adaptTranscriptRenderer(AssistantMessageComponent.prototype, cleanHiddenThinking);
    try {
      for (const width of [10, 60, 80, 120]) {
        const source = message([{ type: "thinking", thinking: "internal reasoning" }]);
        const view = new AssistantMessageComponent(source, true, undefined, HIDDEN_THINKING_LABEL);
        view.updateContent(source, true);
        expect(view.render(width)).toEqual([]);
        view.updateContent(source, false);
        expect(view.render(width)).toEqual([]);
        view.setHideThinkingBlock(false);
        expect(plain(view.render(width))).toContain("internal");
        view.setHideThinkingBlock(true);
        expect(view.render(width)).toEqual([]);
        expect(source.content[0].thinking).toBe("internal reasoning");
      }
    } finally { release(); }
  });

  test("mixed messages preserve text, tool calls, spacing and shell zones", () => {
    const release = adaptTranscriptRenderer(AssistantMessageComponent.prototype, cleanHiddenThinking);
    try {
      const text = { type: "text", text: "Resultado comprobado." };
      const source = message([{ type: "thinking", thinking: "private" }, text]);
      const view = new AssistantMessageComponent(source, true, undefined, HIDDEN_THINKING_LABEL);
      const baseline = new AssistantMessageComponent(message([text]), true);
      expect(view.render(80)).toEqual(baseline.render(80));
      source.content.push({ type: "toolCall", id: "call", name: "bash", arguments: {} });
      view.updateContent(source);
      expect(plain(view.render(80))).toContain(text.text);
      expect(plain(view.render(80))).not.toContain(HIDDEN_THINKING_LABEL);
    } finally { release(); }
  });

  test("native tool transitions retain one heading and all result detail", () => {
    const release = adaptTranscriptRenderer(ToolExecutionComponent.prototype, cleanSubagentHeading);
    try {
      for (const glyph of ["●", "✓", "✗", "■"]) {
        const tool = {
          name: "subagent", label: "subagent", description: "", parameters: {},
          renderCall: () => new Text("subagent sdd-apply", 0, 0),
          renderResult: () => new Text(`${glyph} sdd-apply · model · 1m13s\nDone\noutput: /tmp/result.md`, 0, 0),
        };
        const view = new ToolExecutionComponent("subagent", "call", { agent: "sdd-apply" }, {}, tool as any, { requestRender() {} } as any, process.cwd());
        expect(plain(view.render(80))).toContain("subagent sdd-apply");
        view.updateResult({ content: [{ type: "text", text: "Done" }], isError: glyph === "✗" }, glyph === "●");
        for (const width of [60, 80, 120]) {
          const output = plain(view.render(width));
          expect(output.match(/sdd-apply/g)).toHaveLength(1);
          expect(output).toContain(`${glyph} sdd-apply`);
          expect(output).toContain("output: /tmp/result.md");
        }
        view.setExpanded(true);
        expect(plain(view.render(80)).match(/sdd-apply/g)).toHaveLength(1);
      }
    } finally { release(); }
  });

  test("management calls, different agents, empty results and ordinary tools stay intact", () => {
    for (const lines of [
      ["subagent status", "✓ sdd-apply"], ["subagent sdd-apply", "✓ ein-scout"],
      ["subagent sdd-apply", "Error: unavailable"], ["bash", "✓ sdd-apply"],
      ["subagent sdd-apply"], ["subagent sdd-apply [async]", "✓ sdd-apply"],
    ]) expect(cleanSubagentHeading(lines)).toBe(lines);
  });

  test("workflow result owns one title while wrapped lanes and rejected retries remain visible", () => {
    const release = adaptTranscriptRenderer(ToolExecutionComponent.prototype, cleanSubagentHeading);
    const heading = "subagent workflow · background · 2 lanes: cleaner-remediation, verify-remediation";
    const error = "SDD participant unavailable: generated task contract was altered";
    const args = { workflowScript: "await workflow.parallel([])", async: true };
    try {
      for (const width of [40,60,80,120]) for (const expanded of [false,true]) {
        const tool = { name:"subagent", label:"subagent", description:"", parameters:{},
          renderCall:()=>new Text(heading,0,0),
          renderResult:(_result:unknown,_options:unknown,_theme:unknown,context:{isError:boolean})=>new Text(context.isError ? error : "✓ workflow · 2/2 done · in:114k out:6.1k $0.2649\n✓ Workflow 2 done\noutput: /tmp/workflow.md",0,0),
        };
        const failed = new ToolExecutionComponent("subagent","rejected",args,{},tool as any,{requestRender(){}} as any,process.cwd());
        expect(plain(failed.render(width))).toContain("subagent workflow");
        failed.updateResult({content:[{type:"text",text:error}],isError:true},false);
        failed.setExpanded(expanded);
        const rejected=plain(failed.render(width));
        expect(rejected).toContain("✗ workflow"); expect(rejected).not.toContain("subagent workflow");
        expect(rejected.replace(/\s+/g," ")).toContain(error);
        const success = new ToolExecutionComponent("subagent","retry",args,{},tool as any,{requestRender(){}} as any,process.cwd());
        success.updateResult({content:[{type:"text",text:"Done"}],details:{mode:"workflow"},isError:false},false);
        success.setExpanded(expanded);
        const text=plain(success.render(width));
        expect(text).not.toContain("subagent workflow");
        expect(text.match(/✓ workflow/g)).toHaveLength(1);
        expect(text).toContain("cleaner-remediation"); expect(text).toContain("verify-remediation");
        expect(text.replace(/\s+/g," ")).toContain("2/2 done"); expect(text).toContain("output: /tmp/workflow.md");
      }
    } finally { release(); }
  });

  test("reload does not stack adapters and disposal restores native rendering", () => {
    const prototype = { render: () => ["native"] };
    const original = prototype.render;
    const one = adaptTranscriptRenderer(prototype, (lines) => [...lines, "adapted"]);
    const two = adaptTranscriptRenderer(prototype, (lines) => [...lines, "twice"]);
    expect(prototype.render()).toEqual(["native", "adapted"]);
    one(); one();
    expect(prototype.render()).toEqual(["native", "adapted"]);
    two();
    expect(prototype.render).toBe(original);
  });

  test("animation uses the native loader, supports static mode and cleans up", async () => {
    for (const motion of [false, true]) {
      const handlers = new Map<string, Function>();
      const indicators: any[] = [];
      terminalActivity({ on: (name: string, fn: Function) => handlers.set(name, fn), registerFlag(name: string, options: any) { expect(name).toBe("ein-no-motion"); expect(options.default).toBe(false); }, getFlag: () => !motion } as any);
      const ctx = { hasUI: true, ui: { setHiddenThinkingLabel() {}, setWorkingIndicator: (value: unknown) => indicators.push(value), theme: { fg: (_color: string, value: string) => value } } };
      await handlers.get("session_start")!({}, ctx);
      expect(indicators[0].frames.length).toBe(motion && process.env.TERM !== "dumb" ? 4 : 1);
      await handlers.get("session_shutdown")!({}, ctx);
      expect(indicators.at(-1)).toBeUndefined();
    }
  });
});
