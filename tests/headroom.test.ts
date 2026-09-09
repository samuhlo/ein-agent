import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHeadroomExtension } from "../ein-pi/agent/extensions/ein-headroom.ts";
import { compressHeadroom, eligibleHeadroomOutput, headroomPayload, headroomConfig, headroomTableText, presentHeadroom, verifyHeadroomTable, verifyHeadroomRepresentation, saveHeadroomOriginal, type HeadroomConfig } from "../ein-pi/agent/lib/headroom.ts";

const dirs: string[] = [];
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => { servers.splice(0).forEach((server) => server.stop(true)); dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "ein-headroom-test-")); dirs.push(dir); return dir; };
const raw = JSON.stringify(Array.from({ length: 180 }, (_, id) => ({ id, status: "ok", message: "Repeated worker health record for the compression experiment" })));
const table = "[180]{id:int,message:string,status:string}\n" + JSON.parse(raw).map((row: any) => `${row.id},${row.message},${row.status}`).join("\n");
const candidate = () => ({ toolName: "bash", toolCallId: "call-1", input: { command: "cat results.json" }, content: [{ type: "text" as const, text: raw }], isError: false, details: { exitCode: 0 }, usage: { custom: "unchanged" } });
function serve(handler: (request: Request) => Response | Promise<Response>): HeadroomConfig {
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler }); servers.push(server);
	return { mode: "on", endpoint: `http://127.0.0.1:${server.port}`, timeoutMs: 250 };
}
function compressed(text = table): Response {
	return Response.json({ messages: [{ role: "assistant" }, { role: "tool", tool_call_id: "ein-output", content: text }], tokens_before: 4000, tokens_after: 400, transforms_applied: ["tabular"] });
}
function harness(config: HeadroomConfig, activeTools = ["bash", "read"]) {
	const handlers = new Map<string, Function>(), entries: unknown[] = [];
	const api = { on: (name: string, handler: Function) => handlers.set(name, handler), registerCommand: () => {}, getActiveTools: () => activeTools, appendEntry: (_name: string, entry: unknown) => entries.push(entry) };
	createHeadroomExtension(config)(api as unknown as ExtensionAPI);
	const ctx = { cwd: temp(), sessionManager: { getSessionId: () => "session-a" }, signal: undefined as AbortSignal | undefined };
	return { entries, ctx, handlers, run: (event = candidate()) => handlers.get("tool_result")?.(event, ctx) };
}

describe("Headroom is an explicit, local experiment", () => {
	test("disabled by default and registers no hooks", () => {
		expect(headroomConfig({})).toMatchObject({ mode: "off" });
		expect(harness({ ...headroomConfig({}), mode: "off" }).handlers.size).toBe(0);
	});
	test("rejects remote origins, redirects via URL, credentials and invalid limits", () => {
		for (const url of ["https://127.0.0.1", "http://example.com", "http://localhost", "http://127.0.0.1/path", "http://user:secret@127.0.0.1", "http://127.0.0.1?url=remote"]) expect(() => headroomConfig({ EIN_HEADROOM_URL: url })).toThrow();
		for (const timeout of ["0", "Infinity", "5001", "oops"]) expect(() => headroomConfig({ EIN_HEADROOM_TIMEOUT_MS: timeout })).toThrow();
		expect(() => headroomConfig({ EIN_HEADROOM_MODE: "auto" })).toThrow();
	});
	test("protects source reads, failed checks, SDD evidence and already-compressed output", () => {
		expect(eligibleHeadroomOutput(candidate())).toBe(raw);
		for (const toolName of ["read", "subagent", "ein_sdd_status", "edit"]) expect(eligibleHeadroomOutput({ ...candidate(), toolName })).toBeUndefined();
		expect(eligibleHeadroomOutput({ ...candidate(), isError: true })).toBeUndefined();
		for (const command of ["hypa -c git status", "git diff", "cat tasks.md", "cat config.ts", "ein-cc-sdd status", "cat openspec/output.json"]) expect(eligibleHeadroomOutput({ ...candidate(), input: { command } })).toBeUndefined();
		for (const details of [{ fullOutputPath: "/tmp/out" }, { truncation: { truncated: true } }, { headroom: {} }]) expect(eligibleHeadroomOutput({ ...candidate(), details })).toBeUndefined();
	});
	test("preserves binary/multipart output and short messages", () => {
		expect(eligibleHeadroomOutput({ ...candidate(), content: [{ type: "image" }] })).toBeUndefined();
		expect(eligibleHeadroomOutput({ ...candidate(), content: [{ type: "text", text: "short" }] })).toBeUndefined();
		expect(eligibleHeadroomOutput({ ...candidate(), content: [...candidate().content, { type: "text", text: raw }] })).toBeUndefined();
	});
	test("log folding verifies every line and rejects the duplicate-count regression", () => {
		const log = "2026-09-09T08:00:00Z INFO worker ready\n".repeat(350) + "2026-09-09T08:00:53Z ERROR job-173 EACCES\n";
		const folded = "2026-09-09T08\n" + log.replaceAll("2026-09-09T08:", "");
		expect(eligibleHeadroomOutput({ ...candidate(), input: { command: "cat worker.log" }, content: [{ type: "text", text: log }] })).toBeDefined();
		expect(verifyHeadroomRepresentation(log, folded)).toBe("prefix-lines");
		const display = presentHeadroom(folded, "prefix-lines");
		expect(display).toContain("2026-09-09T08:00:53Z ERROR job-173 EACCES");
		expect(display.match(/ERROR/g)).toHaveLength(1);
		expect(verifyHeadroomRepresentation(log, display)).toBe("prefix-lines");
		expect(verifyHeadroomRepresentation(log, folded + "00:53Z ERROR job-173 EACCES\n")).toBeUndefined();
		expect(verifyHeadroomRepresentation(log, folded.replace("00:53Z ERROR job-173 EACCES\n", ""))).toBeUndefined();
	});
	test("verifies every row, type, value and duplicate count", () => {
		expect(verifyHeadroomTable(raw, table)).toBe(true);
		expect(verifyHeadroomTable(raw, JSON.stringify(table + "\n"))).toBe(true);
		expect(headroomTableText(JSON.stringify(table))).toBe(table);
		for (const damaged of [table.replace("[180]", "[179]"), table.replace("0,", "1,"), table.replace("179,", "178,"), table.replace("id:int", "id:string"), table + "\n0,extra,ok", table.replace("ok", "failed")]) expect(verifyHeadroomTable(raw, damaged)).toBe(false);
		expect(verifyHeadroomTable('[{"id":1,"message":"a,b"}]', '[1]{id:int,message:string}\n1,"a,b"')).toBe(true);
		expect(verifyHeadroomTable('[{"id":1,"nested":{"a":2}}]', '[1]{id:int,nested:string}\n1,[object Object]')).toBe(false);
		expect(verifyHeadroomTable('[{"id":1,"id":2}]', '[1]{id:int}\n2')).toBe(false);
	});
});

describe("local compression and failure recovery", () => {
	test("only sends the fresh output; no prompts or provider call", async () => {
		let body: any;
		const config = serve(async (request) => { expect(new URL(request.url).pathname).toBe("/v1/compress"); body = await request.json(); return compressed(); });
		expect((await compressHeadroom(raw, config)).tokensAfter).toBe(400);
		expect(body.messages).toHaveLength(2); expect(body.messages[1].content).toBe(raw); expect(body).not.toHaveProperty("api_key");
	});
	test("rejects malformed responses and dangling retrieval instructions", async () => {
		for (const response of [() => Response.json({}), () => compressed("<<ccr:abc>>"), () => compressed(""), () => new Response("bad", { status: 500 })]) {
			await expect(compressHeadroom(raw, serve(response))).rejects.toThrow();
		}
	});
	test("does not follow a redirect away from loopback", async () => {
		await expect(compressHeadroom(raw, serve(() => Response.redirect("https://example.com", 302)))).rejects.toThrow();
	});
	test("timeout and user cancellation return the original result", async () => {
		const config = serve(async () => { await Bun.sleep(150); return compressed(); });
		const h = harness({ ...config, timeoutMs: 50 });
		expect(await h.run()).toBeUndefined();
		const controller = new AbortController(); controller.abort(); h.ctx.signal = controller.signal;
		expect(await h.run()).toBeUndefined();
	});
	test("three failures open the circuit instead of delaying every tool", async () => {
		let requests = 0;
		const h = harness(serve(() => { requests++; return new Response("down", { status: 503 }); }));
		for (let i = 0; i < 5; i++) expect(await h.run()).toBeUndefined();
		expect(requests).toBe(3);
	});
	test("never compresses when the worker cannot read the original", async () => {
		let requests = 0;
		const h = harness(serve(() => { requests++; return compressed(); }), ["bash"]);
		expect(await h.run()).toBeUndefined(); expect(requests).toBe(0);
	});
	test("observe keeps content and creates no original archive", async () => {
		const h = harness({ ...serve(() => compressed()), mode: "observe" });
		expect(await h.run()).toBeUndefined();
		expect(h.entries).toHaveLength(1); expect(h.entries[0]).toMatchObject({ outcome: "would-compress" });
		expect(() => statSync(join(h.ctx.cwd, ".pi"))).toThrow();
	});
	test("successful compression preserves the raw snapshot and all Pi metadata", async () => {
		const h = harness(serve(() => compressed())); const event = candidate();
		const result = await h.run(event);
		expect(Object.keys(result)).toEqual(["content"]);
		expect(result.content[0].text).toContain("Source JSON files remain JSON");
		expect(result.content[0].text).toContain("int/float are JSON numbers");
		const path = JSON.parse(result.content[0].text.match(/Original: (".*?")\./)[1]);
		expect(readFileSync(path, "utf8")).toBe(raw); expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(event).toEqual(candidate()); // Input not mutated; details/usage/isError not replaced.
		expect(await h.run(event)).toBeDefined(); // Identical repeated output remains retrievable.
	});
	test("mixed JSON and a shell footer retain the footer exactly once", async () => {
		const text = raw + "\n__RC:0\n";
		expect(headroomPayload(text)).toEqual({ payload: raw, prefix: "", suffix: "\n__RC:0\n" });
		const h = harness(serve(() => compressed()));
		const event = { ...candidate(), input: { command: 'bun diagnostics.ts; echo __RC:0' }, content: [{ type: "text" as const, text }] };
		const result = await h.run(event);
		expect(result.content[0].text.endsWith("\n__RC:0\n")).toBe(true);
		expect(result.content[0].text.match(/__RC:/g)).toHaveLength(1);
		const path = JSON.parse(result.content[0].text.match(/Original: (".*?")\./)[1]);
		expect(readFileSync(path, "utf8")).toBe(text);
	});
	test("rejects a marginal saving after retrieval overhead", async () => {
		const h = harness(serve(() => compressed(raw.slice(0, -50))));
		expect(await h.run()).toBeUndefined(); expect(h.entries[0]).toMatchObject({ outcome: "rejected" });
	});
	test("refuses to compress if saving the original fails", async () => {
		const h = harness(serve(() => compressed())); writeFileSync(join(h.ctx.cwd, ".pi"), "occupied");
		expect(await h.run()).toBeUndefined();
	});
	test("archives are isolated by session and refuse symlink redirection", async () => {
		const cwd = temp(); const a = await saveHeadroomOriginal(cwd, "a", raw), b = await saveHeadroomOriginal(cwd, "b", raw);
		expect(a).not.toBe(b); expect(await saveHeadroomOriginal(cwd, "a", raw)).toBe(a);
		const other = temp(); mkdirSync(join(other, "outside")); symlinkSync(join(other, "outside"), join(other, ".pi"));
		await expect(saveHeadroomOriginal(other, "a", raw)).rejects.toThrow("symlink");
	});
});
