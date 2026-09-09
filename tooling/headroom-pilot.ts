/** Reproducible local replay. No provider calls; originals stay in --out. */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHeadroomExtension } from "../ein-pi/agent/extensions/ein-headroom.ts";
import { buildHypaCommand, resolveHypaBin, resolveHypaEnabled } from "../ein-pi/agent/lib/hypa.ts";
import { compressHeadroom, headroomConfig } from "../ein-pi/agent/lib/headroom.ts";

const root = resolve(import.meta.dir, "..");
const out = resolve(process.argv[2] ?? "/tmp/ein-headroom-pilot");
const endpoint = process.argv[3] ?? "http://127.0.0.1:18787";
const hypa = process.env.HYPA_BIN ?? "/opt/homebrew/bin/hypa";
mkdirSync(out, { recursive: true });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const shell = (args: string[], cwd = root) => {
	const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
	return { text: result.stdout.toString() + result.stderr.toString(), exitCode: result.exitCode };
};
const files = shell(["git", "ls-files", "ein-pi/agent/lib"]).text.trim().split("\n").slice(0, 160);
const inventory = files.map((path, id) => ({ id, path, extension: "ts", owner: "ein", kind: "runtime-library", bytes: statSync(join(root, path)).size, tracked: true }));
writeFileSync(join(out, "inventory.json"), JSON.stringify(inventory));
const diagnostics = Array.from({ length: 180 }, (_, id) => ({ id, service: "retry-worker", status: id === 71 ? "failed" : "ok", message: id === 71 ? "retryDelay(-1) returned -100; expected 0" : "Retry calculation passed", duration: 12 }));
writeFileSync(join(out, "diagnostics.json"), JSON.stringify(diagnostics));
const logs = Array.from({ length: 320 }, (_, i) => `2026-09-09T08:00:${String(i % 60).padStart(2, "0")}Z ${i === 173 ? "ERROR job-173 EACCES permission denied /cache/lock" : "INFO worker health check succeeded; queue=ready; region=eu-west"}`).join("\n");
writeFileSync(join(out, "worker.log"), logs);
const runner = shell(["bun", "test", "tests/project-context.test.ts", "tests/hypa.test.ts", "tests/pi-contract.test.ts", "tests/guardrails.test.ts", "tests/session-accounting.test.ts"]);
writeFileSync(join(out, "runner.log"), runner.text);
const source = readFileSync(join(root, "ein-pi/agent/lib/hypa.ts"), "utf8"); writeFileSync(join(out, "source.ts"), source);
const diff = shell(["git", "diff", "HEAD~5", "HEAD", "--", "ein-pi"]).text; writeFileSync(join(out, "change.diff"), diff);
const scenarios = [
	{ id: "inventory", kind: "real-repo-metadata", command: "cat inventory.json", cwd: out },
	{ id: "diagnostics", kind: "synthetic-adversarial-json", command: "cat diagnostics.json", cwd: out },
	{ id: "worker-log", kind: "synthetic-repeated-log", command: "cat worker.log", cwd: out },
	{ id: "runner", kind: "real-ein-tests", command: "cat runner.log", cwd: out },
	{ id: "source", kind: "protected-real-source", command: "cat source.ts", cwd: out },
	{ id: "diff", kind: "protected-real-diff", command: "git diff HEAD~5 HEAD -- ein-pi", cwd: root },
	{ id: "git-log", kind: "real-git-log", command: "git log -150 --oneline", cwd: root },
];
const config = headroomConfig({ EIN_HEADROOM_MODE: "on", EIN_HEADROOM_URL: endpoint, EIN_HEADROOM_TIMEOUT_MS: "1500" });
const results: unknown[] = [];
for (const scenario of scenarios) {
	const tool = createBashTool(scenario.cwd, { shellPath: "/bin/bash" });
	const rawResult = await tool.execute("pilot", { command: scenario.command, timeout: 60 });
	const rawText = rawResult.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
	const wrapped = buildHypaCommand(scenario.command, hypa);
	const hypaResult = wrapped ? await tool.execute("pilot-hypa", { command: wrapped, timeout: 60 }) : rawResult;
	const hypaText = hypaResult.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
	writeFileSync(join(out, `${scenario.id}.raw.txt`), rawText);
	writeFileSync(join(out, `${scenario.id}.hypa-wrapper.txt`), hypaText);
	// Hypa's generic compressor is a separate experimental arm; Ein does not
	// currently call it. Do not label this as savings from the installed wrapper.
	const generic = shell([hypa, "compress", "--file", join(out, `${scenario.id}.raw.txt`), "--kind", "shell-output"], out);
	writeFileSync(join(out, `${scenario.id}.hypa-generic.txt`), generic.text);
	for (const arm of ["headroom", "hypa-plus-headroom"] as const) {
		const inputResult = arm === "headroom" ? rawResult : hypaResult;
		const command = arm === "headroom" ? scenario.command : wrapped ?? scenario.command;
		let handler: Function | undefined; const entries: any[] = [];
		createHeadroomExtension(config)({ on: (_name: string, fn: Function) => { handler = fn; }, registerCommand: () => {}, getActiveTools: () => ["bash", "read"], appendEntry: (_name: string, data: unknown) => entries.push(data) } as unknown as ExtensionAPI);
		const started = performance.now();
		const patch = await handler!({ toolName: "bash", toolCallId: scenario.id, input: { command }, ...inputResult, isError: false }, { cwd: out, sessionManager: { getSessionId: () => `replay-${scenario.id}-${arm}` } });
		const text = (patch?.content ?? inputResult.content).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
		writeFileSync(join(out, `${scenario.id}.${arm}.txt`), text);
		results.push({ scenario: scenario.id, kind: scenario.kind, arm, rawBytes: Buffer.byteLength(rawText), resultBytes: Buffer.byteLength(text), rawSha256: hash(rawText), resultSha256: hash(text), elapsedMs: performance.now() - started, hypaWrapped: wrapped !== null, outcome: entries.at(-1)?.outcome ?? "ineligible", truncatedBeforeExtension: !!(rawResult.details as any)?.truncation?.truncated, metadataUnchanged: !patch || Object.keys(patch).every((key) => key === "content") });
	}
	results.push({ scenario: scenario.id, kind: scenario.kind, arm: "hypa-wrapper", rawBytes: Buffer.byteLength(rawText), resultBytes: Buffer.byteLength(hypaText), hypaWrapped: wrapped !== null });
	results.push({ scenario: scenario.id, kind: scenario.kind, arm: "hypa-generic-experimental", rawBytes: Buffer.byteLength(rawText), resultBytes: Buffer.byteLength(generic.text), exitCode: generic.exitCode });
}
// Measure warmed local RPC overhead separately from the model or its cache.
const timings: number[] = [];
for (let i = 0; i < 10; i++) { const start = performance.now(); await compressHeadroom(JSON.stringify(inventory), { ...config, timeoutMs: 5000 }); timings.push(performance.now() - start); }
const summary = { version: 1, baseCommit: shell(["git", "rev-parse", "HEAD"]).text.trim(), date: new Date().toISOString(), endpoint, runtime: { bun: Bun.version, hypa: shell([hypa, "--version"]).text.trim(), headroom: "0.37.0" }, existingEinHypa: { resolved: resolveHypaBin() ?? null, enabledForRepo: resolveHypaEnabled(root) }, corpus: { runnerExitCode: runner.exitCode, origin: "real repo outputs plus two labeled synthetic stress cases; not session-wide savings" }, warmRpcMs: timings, results };
writeFileSync(join(out, "replay.json"), JSON.stringify(summary, null, 2) + "\n");
for (const row of results as any[]) console.log(`${row.scenario}\t${row.arm}\t${row.rawBytes} -> ${row.resultBytes}\t${row.outcome ?? ""}`);
