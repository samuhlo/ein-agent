/** Frozen paired workloads exercising complete Pi tool output. Uses model quota.
 * bun tooling/headroom-acceptance-pilot.ts OUT_DIR ISOLATED_AGENT_DIR [REPETITIONS]
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const repo = resolve(import.meta.dir, ".."), out = resolve(process.argv[2] ?? "/tmp/ein-headroom-acceptance");
const agentDir = process.argv[3], repetitions = Number(process.argv[4] ?? 5);
if (!agentDir || !Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error("Pass isolated agent directory and 1..10 repetitions");
const model = process.env.EIN_HEADROOM_PILOT_MODEL ?? "gpt-5.6-luna", provider = process.env.EIN_HEADROOM_PILOT_PROVIDER ?? "openai-codex";
const endpoint = process.env.EIN_HEADROOM_URL ?? "http://127.0.0.1:8787";
const hash = (data: string) => createHash("sha256").update(data).digest("hex");
function files(dir: string, base = dir): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".pi") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(map, files(path, base)); else map[path.slice(base.length + 1)] = hash(readFileSync(path, "utf8"));
  }
  return map;
}
type Case = { id: string; kind: string; seed: number; source: string; allowed: string[]; expected: unknown; repair: boolean };
const cases: Case[] = [];
mkdirSync(join(out, "cases"), { recursive: true }); mkdirSync(join(out, "logs"), { recursive: true });
for (let seed = 0; seed < repetitions; seed++) for (const kind of ["full-report", "api-table", "log-count", "small-edit"]) {
  const id = `${kind}-${seed}`, source = join(out, "cases", id); mkdirSync(source);
  let request = "", expected: unknown, allowed: string[];
  if (kind === "full-report") {
    const early = 3 + seed * 7, late = 991 - seed * 3;
    writeFileSync(join(source, "source.ts"), "export function retryDelay(attempt: number): number { return attempt * 100; }\n");
    writeFileSync(join(source, "diagnostics.ts"), `import {retryDelay} from './source'; const rows=Array.from({length:1000},(_,id)=>{const n=id===${early}? -2 : id===${late}? 40 : id%31; const expected=Math.min(30,Math.max(0,n))*100; const observed=retryDelay(n);return {check_identifier:id,input_attempt:n,expected_delay_ms:expected,observed_delay_ms:observed,validation_state:observed===expected?'ok':'failed'};}); console.log(JSON.stringify(rows));\n`);
    writeFileSync(join(source, "visible.test.ts"), "import {test,expect} from 'bun:test'; import {retryDelay} from './source'; test('ordinary retry',()=>{expect(retryDelay(1)).toBe(100);expect(retryDelay(10)).toBe(1000);});\n");
    request = "Run exactly `bun diagnostics.ts` with bash before editing. The report covers 1000 checks; inspect the COMPLETE report, including earlier output if Pi truncates it. Save findings.json as {\"failed\":[sorted check_identifier values that failed BEFORE repair]}. Repair retryDelay in source.ts to satisfy the report for finite integer attempts. Preserve its exported API. Run `bun test visible.test.ts`. Only source.ts and findings.json may change. Do not edit diagnostics.ts or tests.";
    expected = { failed: [early, late] }; allowed = ["source.ts", "findings.json"];
  } else if (kind === "api-table") {
    const failed = [13 + seed * 5, 437 + seed * 2, 890 - seed * 3];
    const rows = Array.from({ length: 900 }, (_, id) => ({ inventory_record: id, logical_service: `svc${String(id).padStart(3, "0")}`, deployment_region: "eu-west", validation_state: failed.includes(id) ? "failed" : "ok", current_version: "1.2.3" }));
    writeFileSync(join(source, "api.json"), JSON.stringify(rows));
    request = "Run exactly `cat api.json` with bash. Use ALL records, including the complete output if truncated. Write findings.json as {\"count\":number of records,\"failed\":[sorted inventory_record values whose validation_state is failed]}. Only findings.json may change.";
    expected = { count: rows.length, failed }; allowed = ["findings.json"];
  } else if (kind === "log-count") {
    const errorAt = 73 + seed * 11, count = 600;
    const lines = Array.from({ length: count }, (_, i) => {
      const timestamp = `2026-09-09T08:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`;
      return `${timestamp} ${i === errorAt ? `ERROR job-${seed} EACCES /cache/lock` : "INFO worker health check succeeded; queue=ready; region=eu-west"}`;
    });
    // Some independent fixtures contain a legitimate duplicate event. Keeping
    // the exact sequence is required; a deduplicating upstream result is refused.
    if (seed % 2) lines.splice(errorAt + 1, 0, lines[errorAt]);
    writeFileSync(join(source, "worker.log"), lines.join("\n"));
    request = "Run exactly `cat worker.log` with bash. Count actual ERROR occurrences, including duplicate events, using the COMPLETE original when needed. Write findings.json as {\"errors\":number of occurrences,\"job\":the failing job,\"timestamp\":its FULL ISO timestamp}. Only findings.json may change.";
    expected = { errors: seed % 2 ? 2 : 1, job: `job-${seed}`, timestamp: lines[errorAt].split(" ")[0] }; allowed = ["findings.json"];
  } else {
    writeFileSync(join(source, "source.ts"), "export function label(n: number): string { return n === 1 ? 'items' : 'items'; }\n");
    writeFileSync(join(source, "visible.test.ts"), "import {test,expect} from 'bun:test'; import {label} from './source'; test('singular',()=>expect(label(1)).toBe('item'));\n");
    request = "Fix label in source.ts: return 'item' for exactly 1, and 'items' for all other finite integers. Run `bun test visible.test.ts`. Only source.ts may change. This is a small edit; no broad exploration is needed.";
    expected = null; allowed = ["source.ts"];
  }
  writeFileSync(join(source, "tasks.md"), `# Tasks\n\nstatus: ready\n\n- [ ] ${request}\n\nThe supervisor owns task state; leave tasks.md unchanged.\n`);
  writeFileSync(join(source, "design.md"), "# Design\n\nExecute only the bounded task. Evidence may be larger than Pi's initial output view. Preserve exact values and duplicate counts. No new dependencies, reports beyond findings.json, network calls or commits.\n");
  cases.push({ id, kind, seed, source, allowed, expected, repair: kind === "full-report" || kind === "small-edit" });
}
// Freeze all cases before the first provider call. No case is changed mid-study.
writeFileSync(join(out, "corpus.json"), JSON.stringify({ cases, hashes: files(join(out, "cases")) }, null, 2) + "\n");
const system = readFileSync(join(repo, "runtime/agents/sdd-apply.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "") + "\n\nSupervised ad-hoc apply pilot. Strict TDD OFF. No skills required. Do not discover skills or create SDD progress. tasks.md names the only writable files. Do not change task checkboxes in this pilot. The supervisor runs independent verification after you finish.\n";
writeFileSync(join(out, "system.txt"), system);
const results: any[] = [];
for (const [index, scenario] of cases.entries()) for (const arm of (index + scenario.seed) % 2 ? ["on", "off"] : ["off", "on"]) {
  const id = `${scenario.id}-${arm}`, cwd = join(out, "runs", id); mkdirSync(cwd, { recursive: true }); cpSync(scenario.source, cwd, { recursive: true });
  const before = files(cwd), start = Date.now(), events = join(out, "logs", `${id}.events.jsonl`), session = join(out, "logs", `${id}.session.jsonl`);
  const child = Bun.spawn([join(repo, "node_modules/.bin/pi"), "--offline", "--no-extensions", "-e", join(repo, "ein-pi/agent/extensions/ein-headroom.ts"), "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes", "--provider", provider, "--model", model, "--thinking", "low", "--tools", "read,bash,write,edit", "--system-prompt", join(out, "system.txt"), "--mode", "json", "--session", session, "-p", "Execute the bounded task in tasks.md and design.md. No skills, strict TDD off. Do not change tasks.md. Report briefly."], { cwd, env: { ...process.env, PI_CODING_AGENT_DIR: resolve(agentDir), EIN_PI_AGENT_HOME: resolve(agentDir), EIN_HEADROOM_MODE: arm, EIN_HEADROOM_URL: endpoint }, stdout: Bun.file(events), stderr: Bun.file(join(out, "logs", `${id}.stderr.log`)) });
  let timedOut = false; const timer = setTimeout(() => { timedOut = true; child.kill(); }, 150_000); const exitCode = await child.exited; clearTimeout(timer);
  const elapsedMs = Date.now() - start, after = files(cwd), changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => before[p] !== after[p]), escaped = changed.filter((p) => !scenario.allowed.includes(p));
  let verified = true, answer: unknown, verifyExit: number | null = null;
  if (scenario.expected) {
    try { answer = JSON.parse(readFileSync(join(cwd, "findings.json"), "utf8")); verified = Object.entries(scenario.expected as Record<string, unknown>).every(([key, value]) => JSON.stringify((answer as any)[key]) === JSON.stringify(value)); } catch { verified = false; }
  }
  if (scenario.repair) {
    const holdout = scenario.kind === "full-report" ? "import {retryDelay as fn} from './source'; const data=[[-100,0],[-2,0],[0,0],[1,100],[15,1500],[30,3000],[40,3000],[10000,3000]];" : "import {label as fn} from './source'; const data=[[-1,'items'],[0,'items'],[1,'item'],[2,'items'],[100,'items']];";
    writeFileSync(join(cwd, "holdout.test.ts"), "import {test,expect} from 'bun:test'; " + holdout + " test('independent verification',()=>{for(const [input,want] of data)expect(fn(input as number)).toBe(want);});\n");
    const check = Bun.spawnSync(["bun", "test", "visible.test.ts", "holdout.test.ts"], { cwd, stdout: "pipe", stderr: "pipe" }); verifyExit = check.exitCode; verified &&= verifyExit === 0; writeFileSync(join(out, "logs", `${id}.verify.log`), check.stderr);
  }
  const parse = (path: string) => readFileSync(path, "utf8").split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const rows = parse(events), messages = rows.filter((r) => r.type === "message_end" && r.message?.role === "assistant").map((r) => r.message);
  const usage = messages.reduce((sum, m) => { for (const k of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) sum[k] += m.usage?.[k] ?? 0; sum.cost += m.usage?.cost?.total ?? 0; return sum; }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 });
  const receipts = parse(session).filter((r) => r.type === "custom" && r.customType === "ein-headroom").map((r) => r.data);
  const result = { id, kind: scenario.kind, seed: scenario.seed, arm, exitCode, timedOut, elapsedMs, verified, verifyExit, answer, escaped, turns: messages.length, usage, receipts, pass: exitCode === 0 && !timedOut && verified && escaped.length === 0 };
  results.push(result); writeFileSync(join(out, "results.json"), JSON.stringify({ model, provider, repetitions, results }, null, 2) + "\n");
  console.log(JSON.stringify({ id, pass: result.pass, seconds: elapsedMs / 1000, turns: result.turns, tokens: usage.totalTokens, cost: usage.cost, compressed: receipts.filter((r) => r.outcome === "compressed").length, fullRecovered: receipts.at(-1)?.counts.fullRecovered ?? 0 }));
  if (!messages.length || messages.some((m) => m.stopReason === "error")) throw new Error("Provider/runtime failure retained; no automatic model fallback");
}
