import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { runIntentCommand } from "../ein-cc/sdd-cli/intent-command.ts";
import { runClaudePreflightInputCommand, runSummaryCommand } from "../ein-cc/sdd-cli/cli.ts";
import { readAgreement, writeAgreement } from "../shared/sdd/intent-agreement.ts";
import { closeChange, resolveSddStatus } from "../shared/ports/sdd.ts";
import { compileClaudeSurface } from "../ein-cc/sync.ts";
import { readContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { bundleEinCcPayload } from "../installer/scripts/bundle-ein-cc.ts";
import { beginVerification, finishVerification } from "../ein-pi/agent/lib/sdd-verification-runtime.ts";
import { runIntentDiscovery } from "../shared/sdd/intent-discovery.ts";
import { createIntentDraftRuntime } from "../shared/ports/intent.ts";

const roots: string[] = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "claude-lifecycle-")); roots.push(cwd);
	execFileSync("git", ["init", "-q"], { cwd });
	return { cwd, dir: join(cwd, "openspec/changes/export-csv"), change: "export-csv" };
}
const input = {
	material: { objective: "Export filtered rows", boundaries: { in: ["CSV of visible rows"], out: ["Hidden rows"] }, completionCriteria: ["CSV preserves the active filter"] },
	questions: ["Export only visible rows?"], response: "Sí, las visibles. Sigue aquí.", confirmed: true,
};
function record(cwd: string, extra = {}) { return runIntentCommand(cwd, ["export-csv", "record"], JSON.stringify({ ...input, ...extra })); }
function recordPi(cwd: string, source: "interactive" | "rpc"): void {
	runIntentDiscovery({ cwd, sessionManager: { getBranch: () => [] } }, { action: "record", work: "export-csv", change: "export-csv", material: input.material, expectedRevision: "absent" }, () => {},
		{ id: "observed-pi", text: input.response, source }, createIntentDraftRuntime(cwd, { mutating: true }));
}
function verifyReport(dir: string, content: string): void {
	const cwd = resolve(dir, "../../..");
	const begun = beginVerification({ cwd, changePath: dir });
	if (!begun.ok) throw new Error(begun.reason);
	const finished = finishVerification({ cwd, changePath: dir, token: begun.value.token, content });
	if (!finished.ok) throw new Error(finished.reason);
}
function ready(dir: string, key: string) {
	const cwd = resolve(dir, "../../..");
	const files = {
		"scope.md": "scope: export\nbudget_allocated: 1\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture only",
		"map.md": "Map", "design.md": "Design",
		"tasks.md": "status: ready\nblocked_by: none\n- [x] 1.1 Export visible rows",
		"apply-progress.md": "status: complete",
		"verify-report.md": 'status: pass\nbehavior_coverage: verified\n- command: `bun test`\nrequired_check: {"command":"bun test","exitCode":0}',
	};
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), `${text}\nintent_key: ${key}\n`);
	writeFileSync(join(cwd, "src.ts"), "export const value = 1;\n");
	utimesSync(join(dir, "apply-progress.md"), new Date(1000000), new Date(1000000));
	verifyReport(dir, files["verify-report.md"]);
}

describe("Claude completes SDD without Pi", () => {
	test("packaged standalone CLI completes Claude, Pi handoff and unmanaged recovery", async () => {
		const packageDir = fixture().cwd;
		await bundleEinCcPayload({ repoRoot: join(import.meta.dir, ".."), outputPath: join(packageDir, "runtime.tar.gz") });
		const unpack = Bun.spawnSync(["tar", "-xzf", join(packageDir, "runtime.tar.gz"), "-C", packageDir]);
		expect(unpack.exitCode).toBe(0);
		const binary = join(packageDir, "ein-cc-sdd");
		const build = Bun.spawnSync([process.execPath, "build", "--compile", join(packageDir, "ein-cc/sdd-cli/cli.ts"), "--outfile", binary], { cwd: packageDir });
		expect(build.exitCode, build.stderr.toString()).toBe(0);
		for (const origin of ["claude", "pi", "unmanaged"]) {
			const f = fixture();
			const cli = (args: string[], data?: unknown) => {
				const result = Bun.spawnSync([binary, ...args], { cwd: f.cwd, stdin: data === undefined ? undefined : Buffer.from(JSON.stringify(data)) });
				return { code: result.exitCode, text: result.stdout.toString() + result.stderr.toString() };
			};
			if (origin === "claude") {
				expect(JSON.parse(cli(["objective", "show"]).text)).toMatchObject({ kind: "absent" });
				const objective = cli(["objective", "set"], { objective: "Preparar exportacion", expectedRevision: "absent", requestId: "packaged-human", requestText: "Prepara la exportacion" });
				expect(objective.code, objective.text).toBe(0);
				expect(JSON.parse(cli(["objective", "show"]).text)).toMatchObject({ objective: "Preparar exportacion", objectiveEvidence: { kind: "claude-attested" } });
			}
			let request = { ...input };
			if (origin === "pi") {
				recordPi(f.cwd, "interactive");
			}
			if (origin === "unmanaged") {
				mkdirSync(f.dir, { recursive: true }); writeFileSync(join(f.dir, "intent.md"), "Acuerdo confirmado en Claude antes del relevo.");
				expect(cli(["close", f.change, "--force"]).code).toBe(1);
				const shown = JSON.parse(cli(["intent", f.change, "show"]).text);
				request = { ...request, ...{ expectedDigest: shown.digest, reopenReason: "Recover confirmed agreement" } };
			}
			const recorded = cli(["intent", f.change, "record"], request); expect(recorded.code, recorded.text).toBe(0);
			const agreement = JSON.parse(recorded.text).agreement;
			expect(agreement.response.source).toBe(origin === "pi" ? "interactive" : "claude-coordinator");
			const stance = cli(["preflight", f.change, "--tdd", "off", "--lane", "standard"]); expect(stance.code, stance.text).toBe(0);
			expect(cli(["sync", f.change]).code).toBe(0);
			ready(f.dir, agreement.materialKey);
			expect(cli(["status", f.change]).text).not.toContain("Intent pendiente");
			const summary = cli(["summary", f.change], { content: "# Resumen\nExportación verificada.", commands: ["bun test"] }); expect(summary.code, summary.text).toBe(0);
			const closed = cli(["close", f.change]); expect(closed.code, closed.text).toBe(0);
			expect(existsSync(join(f.cwd, "openspec/changes/archive", f.change, "summary.md"))).toBe(true);
		}
	}, 30000);
	test("show and invalid input create no change; malformed and invented confirmation are rejected", () => {
		const f = fixture();
		expect(runIntentCommand(f.cwd, [f.change]).text).toBe('{"kind":"absent"}');
		for (const patch of [{ confirmed: false }, { response: "" }, { questions: [3] }, { material: {} }]) expect(record(f.cwd, patch).exitCode).toBe(1);
		expect(runIntentCommand(f.cwd, ["../escape", "record"], JSON.stringify(input)).exitCode).toBe(1);
		expect(existsSync(f.dir)).toBe(false);
	});
	test("records Claude provenance and preflight reuses the agreement and TDD choice", async () => {
		const f = fixture(); expect(record(f.cwd).exitCode).toBe(0);
		const objective = readContinuityCheckpoint(f.cwd, { mode: "sdd", change: f.change });
		expect(objective.status === "valid" && objective.checkpoint).toMatchObject({ objective: input.material.objective, objectiveEvidence: { kind: "intent", work: f.change } });
		const before = readFileSync(join(f.dir, "intent.md"), "utf8");
		expect(JSON.parse(runIntentCommand(f.cwd, [f.change]).text).agreement.response.source).toBe("claude-coordinator");
		expect(JSON.parse(record(f.cwd).text).outcome).toBe("adopted");
		expect(readFileSync(join(f.dir, "intent.md"), "utf8")).toBe(before);
		const preflight = await runClaudePreflightInputCommand(f.cwd, [f.change, "--tdd", "off", "--lane", "standard"], "");
		expect(preflight.exitCode).toBe(0);
		expect(preflight.text).not.toContain("What outcome");
		expect((await runClaudePreflightInputCommand(f.cwd, [f.change], "")).text).toContain("off");
	});
	test("reopens with a reviewed revision, retains answers and leaves old phase keys stale", () => {
		const f = fixture(); const prior = JSON.parse(record(f.cwd).text).agreement;
		ready(f.dir, prior.materialKey);
		const patch = { material: { ...input.material, objective: "Export a different selection" }, reopenReason: "User changed selection" };
		expect(record(f.cwd, patch).exitCode).toBe(1);
		expect(record(f.cwd, { ...patch, expectedRevision: "stale" }).exitCode).toBe(1);
		const result = record(f.cwd, { ...patch, expectedRevision: prior.revision });
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.text).agreement.history[0].response.text).toBe(input.response);
		expect(resolveSddStatus(f.cwd, f.change).intent?.stalePhase).toBe("scope");
		expect(closeChange(f.cwd, f.change, { force: true }).ok).toBe(false);
	});
	test("retains multiple human rounds during recovery", () => {
		const f = fixture();
		const result = record(f.cwd, { rounds: [{ questions: ["Primera decisión?"], response: "Recomendadas" }], response: "1A 2A" });
		expect(result.exitCode).toBe(0);
		const agreement = JSON.parse(result.text).agreement;
		expect(agreement.history[0].response).toMatchObject({ text: "Recomendadas", source: "claude-coordinator" });
		expect(agreement.response.text).toBe("1A 2A");
	});
	for (const origin of ["claude", "pi", "unmanaged"] as const) test(`${origin}: normal summary and close preserve agreement evidence`, () => {
		const f = fixture();
		let extra = {};
		if (origin === "unmanaged") {
			mkdirSync(f.dir, { recursive: true }); writeFileSync(join(f.dir, "intent.md"), "Acuerdo anterior: solo filas visibles; respuesta literal: recomendadas.\n");
			expect(record(f.cwd).exitCode).toBe(1);
			const { digest } = JSON.parse(runIntentCommand(f.cwd, [f.change]).text);
			extra = { expectedDigest: digest, reopenReason: "Register already agreed scope in Claude" };
		}
		if (origin === "pi") recordPi(f.cwd, "rpc");
		const result = record(f.cwd, extra); expect(result.exitCode).toBe(0);
		const agreement = JSON.parse(result.text).agreement;
		if (origin === "pi") {
			const before = readFileSync(join(f.dir, "intent.md"), "utf8");
			expect(record(f.cwd).exitCode).toBe(0);
			expect(readFileSync(join(f.dir, "intent.md"), "utf8")).toBe(before);
		}
		ready(f.dir, agreement.materialKey);
		const summary = runSummaryCommand(f.cwd, [f.change], JSON.stringify({ content: "# Resumen\nExportación comprobada.", commands: ["bun test"] }));
		expect(summary.exitCode).toBe(0);
		const closed = closeChange(f.cwd, f.change); expect(closed.ok).toBe(true);
		const content = readFileSync(join(closed.to, "summary.md"), "utf8");
		expect(content).toContain(input.response);
		expect(content).toContain("intent.md");
		if (origin === "unmanaged") expect(content).toContain("Acuerdo anterior: solo filas visibles");
		expect(readdirSync(closed.to).sort()).toEqual(["summary.md", "verification-receipt.json"]);
	});
	for (const failure of ["tests", "contradictory", "tasks", "spec", "stale"] as const) test(`close still blocks ${failure}, even with force`, () => {
		const f = fixture(); const { agreement } = JSON.parse(record(f.cwd).text); ready(f.dir, agreement.materialKey);
		expect(runSummaryCommand(f.cwd, [f.change], JSON.stringify({ content: "# Summary\nDone", commands: ["bun test"] })).exitCode).toBe(0);
		if (failure === "tests") writeFileSync(join(f.dir, "verify-report.md"), `status: fail\nintent_key: ${agreement.materialKey}\n12 failed (expected regression)`);
		if (failure === "contradictory") writeFileSync(join(f.dir, "verify-report.md"), `status: pass\nintent_key: ${agreement.materialKey}\nrequired_check: {"command":"bun test","exitCode":1}\n12 failed (expected regression)`);
		if (failure === "tasks") writeFileSync(join(f.dir, "tasks.md"), `- [ ] 1.1 Pending\nintent_key: ${agreement.materialKey}`);
		if (failure === "spec") writeFileSync(join(f.dir, "scope.md"), `spec_delta: invalid\nintent_key: ${agreement.materialKey}`);
		if (failure === "stale") writeFileSync(join(f.cwd, "src.ts"), "export const value = 2;\n");
		expect(closeChange(f.cwd, f.change, { force: true }).ok).toBe(false);
	});
	test("refuses symlinked change roots", () => {
		const f = fixture(); const target = fixture();
		symlinkSync(target.cwd, join(f.cwd, "openspec"));
		expect(record(f.cwd).exitCode).toBe(1);
		expect(readAgreement(target.dir).kind).toBe("absent");
	});
	test("summary accepts exact commands recorded only in required_check rows", () => {
		const f = fixture(); const { agreement } = JSON.parse(record(f.cwd).text); ready(f.dir, agreement.materialKey);
		verifyReport(f.dir, `status: pass\nintent_key: ${agreement.materialKey}\nrequired_check: {"command":"bun test","exitCode":0}`);
		expect(runSummaryCommand(f.cwd, [f.change], JSON.stringify({ content: "Done", commands: ["bun test"] })).exitCode).toBe(0);
		expect(runSummaryCommand(f.cwd, [f.change], JSON.stringify({ content: "Done", commands: ["bun run build"] })).exitCode).toBe(1);
	});
	for (const result of ['{"command":"bun test","exitCode":null}', '{"command":"bun test"}', 'not JSON', '{"command":"","exitCode":0}']) test(`invalid required result blocks summary: ${result}`, () => {
		const f = fixture(); const { agreement } = JSON.parse(record(f.cwd).text); ready(f.dir, agreement.materialKey);
		verifyReport(f.dir, `status: pass\nintent_key: ${agreement.materialKey}\nrequired_check: ${result}\nExecuted: bun test`);
		expect(runSummaryCommand(f.cwd, [f.change], JSON.stringify({ content: "Done", commands: ["bun test"] })).exitCode).toBe(1);
	});
	test("generated agents know Claude writes phase keys and close uses its structured writer", () => {
		const surface = compileClaudeSurface();
		for (const [name, prompt] of Object.entries(surface.agents).filter(([name]) => name.startsWith("sdd-"))) {
			expect(prompt, name).not.toContain("never copy hashes yourself");
			expect(prompt).toContain("ein-cc-sdd intent <change> show");
		}
		expect(surface.agents["sdd-close.md"]).toContain("ein-cc-sdd summary");
		expect(surface.coordinator).not.toContain("return to Pi to complete discovery");
	});
});
