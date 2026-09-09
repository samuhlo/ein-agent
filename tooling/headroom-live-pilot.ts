/** Paired Pi runs. Requires an isolated PI_CODING_AGENT_DIR with valid auth.
 * Usage: bun tooling/headroom-live-pilot.ts OUTPUT_DIR REPLAY_DIR AGENT_DIR
 * Calls the configured provider (12 bounded runs); never installs or deploys.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const repo = resolve(import.meta.dir, "..");
const out = resolve(process.argv[2] ?? "/tmp/ein-headroom-live");
const corpus = resolve(process.argv[3] ?? "/tmp/ein-headroom-pilot-final");
const agentDir = process.argv[4];
if (!agentDir) throw new Error("Pass an isolated agent directory as argument 3; no default user session is used.");
const model = process.env.EIN_HEADROOM_PILOT_MODEL ?? "gpt-5.6-luna";
const provider = process.env.EIN_HEADROOM_PILOT_PROVIDER ?? "openai-codex";
const endpoint = process.env.EIN_HEADROOM_URL ?? "http://127.0.0.1:18787";
mkdirSync(out, { recursive: true });
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const inventory = JSON.parse(readFileSync(join(corpus, "inventory.json"), "utf8")) as { id: number; path: string; bytes: number }[];
const max = inventory.reduce((a, b) => a.bytes > b.bytes ? a : b);
const applyPrompt = readFileSync(join(repo, "runtime/agents/sdd-apply.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
writeFileSync(join(out, "system.txt"), applyPrompt + "\n\nThis is a supervised ad-hoc experiment, not an SDD chain. Strict TDD: OFF. No skills required: skill_resolution=none. Do not discover skills or write progress artifacts. Only modify the files explicitly allowed by tasks.md. Do not commit, install dependencies, or call any network. The harness will verify after you finish.\n");
const cases = [
	{ id: "repair", fixture: "diagnostics.json", instruction: "Run exactly `cat diagnostics.json` through bash. Inspect the diagnostic records and repair retryDelay in source.ts. It must clamp negative attempts to zero and cap the delay at 3000ms; preserve linear steps of 100ms for nonnegative attempts. Run `bun test visible.test.ts`. Only source.ts may change. Do not change tests or fixture data.", allow: ["source.ts"] },
	{ id: "inventory", fixture: "inventory.json", instruction: "Run exactly `cat inventory.json` through bash. Write answer.json with exactly {count,totalBytes,largestPath}, computed from ALL records (largestPath is the path with the most bytes). Do not guess from a subset. You may use read or further bash calculations if needed. Only answer.json may change.", allow: ["answer.json"] },
	{ id: "logs", fixture: "worker.log", instruction: "Run exactly `cat worker.log` through bash. Write answer.json with exactly {job,error,path,timestamp,occurrences}: the failing job, error code, affected path, FULL ISO timestamp, and the number of error occurrences across ALL lines. Only answer.json may change.", allow: ["answer.json"] },
];
function files(dir: string, base = dir): Record<string, string> {
	const found: Record<string, string> = {};
	for (const item of readdirSync(dir, { withFileTypes: true })) {
		if (item.name === ".pi") continue; // Explicitly owned compression artifacts, measured separately.
		const path = join(dir, item.name);
		if (item.isDirectory()) Object.assign(found, files(path, base)); else found[path.slice(base.length + 1)] = sha(readFileSync(path, "utf8"));
	}
	return found;
}
const results: any[] = [];
for (let repeat = 0; repeat < 2; repeat++) for (const [index, scenario] of cases.entries()) {
	for (const arm of (repeat + index) % 2 ? ["on", "off"] : ["off", "on"]) {
		const id = `${scenario.id}-${repeat}-${arm}`, cwd = join(out, id), logs = join(out, "logs");
		mkdirSync(cwd, { recursive: true }); mkdirSync(logs, { recursive: true });
		copyFileSync(join(corpus, scenario.fixture), join(cwd, scenario.fixture));
		writeFileSync(join(cwd, "tasks.md"), `# Tasks\n\nstatus: ready\n\n- [ ] ${scenario.instruction}\n\nThis pilot leaves task state unchanged; the external verifier owns completion.\n`);
		writeFileSync(join(cwd, "design.md"), "# Design\n\nExecute only tasks.md. Read the full evidence when needed. Preserve exact diagnostic facts and source behavior outside the task.\n");
		if (scenario.id === "repair") {
			writeFileSync(join(cwd, "source.ts"), "export function retryDelay(attempt: number): number { return attempt * 100; }\n");
			writeFileSync(join(cwd, "visible.test.ts"), "import {test,expect} from 'bun:test'; import {retryDelay} from './source'; test('negative and capped retry',()=>{expect(retryDelay(-1)).toBe(0); expect(retryDelay(40)).toBe(3000); expect(retryDelay(2)).toBe(200);});\n");
		}
		const before = files(cwd), started = Date.now();
		const eventPath = join(logs, id + "-events.jsonl"), sessionPath = join(logs, id + "-session.jsonl");
		const child = Bun.spawn([join(repo, "node_modules/.bin/pi"), "--offline", "--no-extensions", "-e", join(repo, "ein-pi/agent/extensions/ein-headroom.ts"), "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes", "--provider", provider, "--model", model, "--thinking", "low", "--tools", "read,bash,edit,write", "--system-prompt", join(out, "system.txt"), "--mode", "json", "--session", sessionPath, "-p", "Execute the bounded task in tasks.md and design.md. This is an ad-hoc supervised pilot, strict TDD off, no skills. Do not modify tasks.md. Report completion briefly."], {
			cwd, env: { ...process.env, PI_CODING_AGENT_DIR: resolve(agentDir), EIN_PI_AGENT_HOME: resolve(agentDir), EIN_HEADROOM_MODE: arm, EIN_HEADROOM_URL: endpoint },
			stdout: Bun.file(eventPath), stderr: Bun.file(join(logs, id + "-stderr.log")),
		});
		let timedOut = false; const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120_000);
		const exitCode = await child.exited; clearTimeout(timer);
		const elapsedMs = Date.now() - started, after = files(cwd);
		const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]);
		const escaped = changed.filter((path) => !scenario.allow.includes(path));
		let verified = false, answer: unknown, verifyExit: number | null = null;
		if (scenario.id === "repair") {
			writeFileSync(join(cwd, "holdout.test.ts"), "import {test,expect} from 'bun:test'; import {retryDelay} from './source'; test('independent holdout',()=>{for(const [i,want] of [[-50,0],[-0.5,0],[0,0],[1,100],[15,1500],[30,3000],[100,3000]]) expect(retryDelay(i!)).toBe(want!);});\n");
			const check = Bun.spawnSync(["bun", "test", "visible.test.ts", "holdout.test.ts"], { cwd, stdout: "pipe", stderr: "pipe" });
			verifyExit = check.exitCode; verified = verifyExit === 0; writeFileSync(join(logs, id + "-verify.log"), check.stderr);
		} else {
			try {
				answer = JSON.parse(readFileSync(join(cwd, "answer.json"), "utf8")); const a = answer as any;
				verified = scenario.id === "inventory" ? a.count === inventory.length && a.totalBytes === inventory.reduce((sum, row) => sum + row.bytes, 0) && a.largestPath === max.path : a.job === "job-173" && a.error === "EACCES" && a.path === "/cache/lock" && a.timestamp === "2026-09-09T08:00:53Z" && a.occurrences === 1;
			} catch { verified = false; }
		}
		const rows = readFileSync(eventPath, "utf8").split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
		const messages = rows.filter((row) => row.type === "message_end" && row.message?.role === "assistant").map((row) => row.message);
		const usage = messages.reduce((sum, message) => { for (const k of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) sum[k] += message.usage?.[k] ?? 0; sum.cost += message.usage?.cost?.total ?? 0; return sum; }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 });
		const session = readFileSync(sessionPath, "utf8").split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
		const compression = session.filter((row) => row.type === "custom" && row.customType === "ein-headroom").map((row) => row.data);
		const tools = rows.filter((row) => row.type === "tool_execution_start").map((row) => ({ name: row.toolName, args: row.args }));
		const readOriginal = tools.some((tool) => tool.name === "read" && String(tool.args?.path).includes("/headroom/"));
		const result = { id, scenario: scenario.id, repeat, arm, model, provider, exitCode, timedOut, elapsedMs, verified, verifyExit, changed, escaped, pass: exitCode === 0 && !timedOut && verified && escaped.length === 0, turns: messages.length, usage, compression, readOriginal, tools, answer };
		results.push(result); writeFileSync(join(out, "live.json"), JSON.stringify({ version: 1, model, provider, trials: results }, null, 2) + "\n");
		console.log(JSON.stringify({ id, pass: result.pass, seconds: elapsedMs / 1000, turns: messages.length, tokens: usage.totalTokens, cost: usage.cost, compressed: compression.filter((c) => c.outcome === "compressed").length, readOriginal }));
		if (messages.length === 0 || messages.some((m) => m.stopReason === "error")) throw new Error("Provider/runtime failure: retained evidence; no unrequested model fallback.");
	}
}
