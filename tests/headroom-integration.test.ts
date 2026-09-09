import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { headroomConfig, headroomSource, saveHeadroomOriginal, verifyHeadroomTable } from "../ein-pi/agent/lib/headroom.ts";
import { createHeadroomExtension } from "../ein-pi/agent/extensions/ein-headroom.ts";
import { headroomConfigPath, readHeadroomMode, writeHeadroomMode, headroomConfigured, headroomLabel, noteHeadroomAvailability } from "../ein-pi/agent/lib/headroom-settings.ts";
import { applySetting, readSettings } from "../ein-pi/agent/lib/project-settings.ts";
import { pendingEssentials } from "../ein-pi/agent/lib/onboarding.ts";

const dirs: string[] = []; const servers: ReturnType<typeof Bun.serve>[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "ein-headroom-integrated-")); dirs.push(dir); return dir; };
afterEach(() => { servers.splice(0).forEach((s) => s.stop(true)); dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

test("Headroom owns settings; legacy Hypa off stays off and onboarding does not ask again", () => {
  const cwd = temp(); mkdirSync(join(cwd, ".pi/ein"), { recursive: true });
  writeFileSync(join(cwd, ".pi/ein/hypa.json"), '{"mode":"off"}');
  expect(readHeadroomMode(cwd)).toBe("off"); expect(headroomConfigured(cwd)).toBe(true);
  expect(pendingEssentials(cwd)).not.toContain("headroom");
  expect(readSettings(cwd).some((s) => s.id === "hypa")).toBe(false);
  expect(applySetting(cwd, "headroom", "observe")).toBe(true);
  expect(readHeadroomMode(cwd)).toBe("observe");
  expect(JSON.parse(readFileSync(join(cwd, ".pi/ein/hypa.json"), "utf8")).mode).toBe("off");
  noteHeadroomAvailability(cwd, "unavailable"); expect(headroomLabel(cwd)).toContain("sin servicio");
});

test("invalid settings are visible and stop compression; environment overrides are explicit", () => {
  const cwd = temp(); writeHeadroomMode(cwd, "on");
  expect(headroomConfig({ EIN_HEADROOM_MODE: "off" }, cwd).mode).toBe("off");
  writeFileSync(headroomConfigPath(cwd), '{"version":1,"mode":"invalid"}');
  expect(() => headroomConfig({}, cwd)).toThrow(); expect(headroomLabel(cwd)).toContain("inválida");
});

test("original archives stay out of ordinary git staging in an otherwise empty project", async () => {
  const cwd = temp(); expect(Bun.spawnSync(["git", "init", "--quiet"], { cwd }).exitCode).toBe(0);
  await saveHeadroomOriginal(cwd, "archive", "private command output");
  const status = Bun.spawnSync(["git", "-c", "core.excludesfile=/dev/null", "status", "--porcelain", "--untracked-files=all"], { cwd, stdout: "pipe" });
  expect(status.exitCode).toBe(0); expect(status.stdout.toString()).toBe("");
});

test("typed CSV verification preserves quotes, multiline cells, numeric types and nulls", () => {
  const rows = [{ id: 1, active: true, value: 1.5, message: 'a,b "quoted"\nnext', optional: null }, { id: 2, active: false, value: 2.5, message: "", optional: "text" }];
  const table = '[2]{id:int,active:bool,value:float,message:string,optional:string?}\n1,true,1.5,"a,b ""quoted""\nnext",\n2,false,2.5,,text\n';
  expect(verifyHeadroomTable(JSON.stringify(rows), table)).toBe(true);
  expect(verifyHeadroomTable(JSON.stringify(rows), table.replace('1.5', '1.6'))).toBe(false);
  expect(verifyHeadroomTable('[{"value":null},{"value":""}]', '[2]{value:string?}\n\n\n')).toBe(false);
  expect(verifyHeadroomTable('[{"value":0.1000000000000000001}]', '[1]{value:float}\n0.1')).toBe(false);
});

test("reads the complete native Pi spool; sends a verified view without changing metadata", async () => {
  const cwd = temp();
  const rows = Array.from({ length: 600 }, (_, id) => ({ record_identifier: id, service_name: "api", deployment_region: "eu", validation_state: id === 3 ? "failed" : "ok" }));
  const raw = JSON.stringify(rows); expect(Buffer.byteLength(raw)).toBeGreaterThan(50 * 1024);
  writeFileSync(join(cwd, "report.json"), raw);
  // Other suites mock Pi's root SDK. The real runtime probe must run outside
  // that module cache, so it cannot accidentally verify a mocked tool.
  const probe = Bun.spawnSync([process.execPath, "-e", `import {createBashTool} from '@earendil-works/pi-coding-agent'; const r=await createBashTool(${JSON.stringify(cwd)},{shellPath:'/bin/bash'}).execute('native',{command:'cat report.json'});process.stdout.write(JSON.stringify(r));`], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(probe.exitCode).toBe(0);
  const native = JSON.parse(probe.stdout.toString());
  expect((native.details as any).truncation.truncated).toBe(true);
  const event = { type: "tool_result", toolName: "bash", toolCallId: "native", input: { command: "cat report.json" }, ...native, isError: false };
  expect((await headroomSource(event))?.text).toBe(raw);
  const table = "[600]{record_identifier:int,service_name:string,deployment_region:string,validation_state:string}\n" + rows.map((r) => `${r.record_identifier},${r.service_name},${r.deployment_region},${r.validation_state}`).join("\n");
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const body = await request.json() as any; expect(body.messages[1].content).toBe(raw);
    return Response.json({ messages: [{ role: "assistant" }, { role: "tool", tool_call_id: "ein-output", content: table }], tokens_before: 20000, tokens_after: 8000, transforms_applied: ["table"] });
  } }); servers.push(server);
  const handlers = new Map<string, Function>(); const receipts: any[] = [];
  createHeadroomExtension({ mode: "on", endpoint: `http://127.0.0.1:${server.port}`, timeoutMs: 500 })({ on: (key: string, fn: Function) => handlers.set(key, fn), registerCommand() {}, getActiveTools: () => ["read", "bash"], appendEntry: (_key: string, data: any) => receipts.push(data) } as unknown as ExtensionAPI);
  const snapshot = JSON.stringify(event);
  const result = await handlers.get("tool_result")!(event, { cwd, sessionManager: { getSessionId: () => "full-original" } });
  expect(Object.keys(result)).toEqual(["content"]); expect(JSON.stringify(event)).toBe(snapshot);
  expect(result.content[0].text).toContain("3,api,eu,failed"); expect(receipts[0].counts.fullRecovered).toBe(1);
  const path = JSON.parse(result.content[0].text.match(/Original: (".*?")\./)[1]);
  expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(createHash("sha256").update(raw).digest("hex"));
});

test("never follows an arbitrary output path or a symlink spool", async () => {
  const cwd = temp(), file = join(cwd, "source.json"); writeFileSync(file, "[]".repeat(5000));
  const event = { toolName: "bash", input: { command: "cat report.json" }, content: [{ type: "text", text: "truncated" }], isError: false, details: { truncation: { truncated: true }, fullOutputPath: file } };
  expect(await headroomSource(event)).toBeUndefined();
  const linked = join(tmpdir(), "pi-bash-abcdef1234567890.log");
  symlinkSync(file, linked);
  try { expect(await headroomSource({ ...event, details: { ...event.details, fullOutputPath: linked } })).toBeUndefined(); }
  finally { rmSync(linked); }
  expect(await headroomSource({ ...event, isError: true })).toBeUndefined();
});

test("normal extension keeps controls available when off and Hypa cannot rewrite commands", () => {
  const commands: string[] = [], hooks: string[] = [];
  createHeadroomExtension()({ registerCommand: (name: string) => commands.push(name), on: (name: string) => hooks.push(name) } as unknown as ExtensionAPI);
  expect(commands).toEqual(["ein:headroom", "ein:hypa"]); expect(hooks).toContain("tool_result");
  const gate = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts"), "utf8");
  expect(gate).not.toContain("maybeWrapBashInput"); expect(gate).toContain("confirmCommand(event.input.command");
});

test("does not post command data to an unrelated service on the configured port", async () => {
  const cwd = temp(), handlers = new Map<string, Function>(); let posts = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) { if (request.method === "POST") posts++; return Response.json({ service: "another-app", ready: true }); } }); servers.push(server);
  const previousUrl = process.env.EIN_HEADROOM_URL, previousMode = process.env.EIN_HEADROOM_MODE;
  process.env.EIN_HEADROOM_URL = `http://127.0.0.1:${server.port}`; process.env.EIN_HEADROOM_MODE = "on";
  try {
    createHeadroomExtension()({ on: (name: string, fn: Function) => handlers.set(name, fn), registerCommand() {}, getActiveTools: () => ["read", "bash"], appendEntry() {} } as unknown as ExtensionAPI);
    const text = JSON.stringify(Array.from({ length: 600 }, (_, id) => ({ id, message: "private output" })));
    const result = await handlers.get("tool_result")!({ toolName: "bash", toolCallId: "check", input: { command: "cat report.json" }, isError: false, content: [{ type: "text", text }] }, { cwd, sessionManager: { getSessionId: () => "check" } });
    expect(result).toBeUndefined(); expect(posts).toBe(0);
  } finally {
    if (previousUrl === undefined) delete process.env.EIN_HEADROOM_URL; else process.env.EIN_HEADROOM_URL = previousUrl;
    if (previousMode === undefined) delete process.env.EIN_HEADROOM_MODE; else process.env.EIN_HEADROOM_MODE = previousMode;
  }
});
