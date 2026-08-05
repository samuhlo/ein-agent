// =============================================================================
// TESTS: cc-ein guard — precedencia de decisión (deny → confirm → allow → none)
// -----------------------------------------------------------------------------
// Cubre los escenarios del delta harness-discipline (grupo 003):
//   guard-decision-precedence, guard-envelope-degrades-open,
//   guard-sdd-state-is-advisory, guard-ignores-cross-harness-delivery-grants
// Llama a `resolveGuardDecision()` (la función pura que `guardCmd()` envuelve
// para stdin/stdout) directamente — sin subproceso, sin mocks de I/O real.
// =============================================================================

import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_CONFIG_HOME = join(tmpdir(), "ein-agent-tests", "harness-discipline-guardrails");
process.env.EIN_PI_CONFIG_HOME = TEST_CONFIG_HOME;

const { resolveGuardDecision, buildStatusOutput } = await import("../cc-ein/sdd-cli/cli.ts");
const { grantDelegatedDelivery, deliveryGrantPath } = await import("../ein-pi/agent/lib/guardrails.ts");
const { execFileSync } = await import("node:child_process");

function hookInput(command: string): string {
	return JSON.stringify({ tool_input: { command } });
}

let dir: string;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	rmSync(deliveryGrantPath(), { force: true });
});

function freshCwd(): string {
	dir = mkdtempSync(join(tmpdir(), "harness-discipline-"));
	return dir;
}

// Cwd con un change SDD activo en fase `tasks`, para probar el texto advisory.
function cwdWithActiveChange(change: string, phase: "tasks" | "apply"): string {
	const cwd = freshCwd();
	const changeDir = join(cwd, "openspec", "changes", change);
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(join(changeDir, "tasks.md"), "# tasks\nstatus: ready\n");
	if (phase === "apply") writeFileSync(join(changeDir, "apply-progress.md"), "status: partial\n");
	return cwd;
}

describe("resolveGuardDecision — decision precedence", () => {
	test("deny wins over allow: a destructive command is never auto-approved", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("rm -rf /"), cwd);
		expect(result?.decision).toBe("deny");
	});

	test("confirm wins over allow: git push requests confirmation, not allow", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git push origin main"), cwd);
		expect(result?.decision).toBe("ask");
	});

	test("allow-listed read-only command is allowed when nothing else matches", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git status"), cwd);
		expect(result?.decision).toBe("allow");
	});

	test("mixed deny+allow segments: deny wins (rm alongside a safe git status)", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git status && rm -rf /"), cwd);
		expect(result?.decision).toBe("deny");
	});

	test("mixed confirm+allow segments: confirm wins (git add . && git push)", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git add . && git push"), cwd);
		expect(result?.decision).toBe("ask");
	});

	test("mixed confirm+deny segments: deny still wins (deny is checked first)", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git push && rm -rf /"), cwd);
		expect(result?.decision).toBe("deny");
	});

	test("all-allow segments (git status && git diff): allow", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git status && git diff"), cwd);
		expect(result?.decision).toBe("allow");
	});

	test("command matching none of the three tables emits no decision", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("echo hello"), cwd);
		expect(result).toBeNull();
	});
});

describe("resolveGuardDecision — envelope degrades open on malformed input", () => {
	test("invalid JSON emits no decision", () => {
		const cwd = freshCwd();
		expect(resolveGuardDecision("not json {{{", cwd)).toBeNull();
	});

	test("valid JSON missing tool_input.command emits no decision", () => {
		const cwd = freshCwd();
		expect(resolveGuardDecision(JSON.stringify({ tool_input: {} }), cwd)).toBeNull();
	});

	test("empty command string emits no decision", () => {
		const cwd = freshCwd();
		expect(resolveGuardDecision(hookInput(""), cwd)).toBeNull();
	});

	test("decision object contains only verified fields (no extra keys)", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git status"), cwd);
		expect(result && Object.keys(result).sort()).toEqual(["decision", "reason"]);
	});
});

describe("resolveGuardDecision — SDD state is advisory only", () => {
	test("no active change: same decision as a normal command, state only in reason", () => {
		const cwd = freshCwd();
		const result = resolveGuardDecision(hookInput("git status"), cwd);
		expect(result?.decision).toBe("allow");
		expect(result?.reason).toContain("sin cambio activo");
	});

	test("active change in tasks phase: reason mentions the change and phase, decision unchanged", () => {
		const cwd = cwdWithActiveChange("harness-discipline", "tasks");
		const result = resolveGuardDecision(hookInput("git status"), cwd);
		expect(result?.decision).toBe("allow");
		expect(result?.reason).toContain("harness-discipline");
	});

	test("SDD state enriches deny/confirm reasons too, without changing the decision", () => {
		const cwd = cwdWithActiveChange("harness-discipline", "tasks");
		const deny = resolveGuardDecision(hookInput("rm -rf /"), cwd);
		expect(deny?.decision).toBe("deny");
		expect(deny?.reason).toContain("harness-discipline");

		const ask = resolveGuardDecision(hookInput("git push"), cwd);
		expect(ask?.decision).toBe("ask");
		expect(ask?.reason).toContain("harness-discipline");
	});
});

describe("resolveGuardDecision — no cross-harness delivery-grant consumption", () => {
	test("a Pi delivery-grant file left on disk does not bypass confirmation for git push", () => {
		const cwd = freshCwd();
		grantDelegatedDelivery(cwd);
		const result = resolveGuardDecision(hookInput("git push origin main"), cwd);
		expect(result?.decision).toBe("ask");
	});
});

// =============================================================================
// TESTS: cc-ein status — repository bootstrap and working-tree reporting (004)
// -----------------------------------------------------------------------------
// `buildStatusOutput()` es la función pura que envuelve `statusCmd()`: hace el
// bootstrap best-effort de `git init` y añade la línea de working tree
// (`renderWorkingTreeLine`) exactamente una vez. Sin subproceso: se llama
// directo, igual que `resolveGuardDecision`.
// =============================================================================

function withOpenspecChanges(cwd: string): void {
	mkdirSync(join(cwd, "openspec", "changes"), { recursive: true });
}

describe("buildStatusOutput — repository bootstrap", () => {
	test("outside a repo, with openspec/changes present, initializes git", () => {
		const cwd = freshCwd();
		withOpenspecChanges(cwd);
		buildStatusOutput(cwd);
		expect(existsSync(join(cwd, ".git"))).toBe(true);
	});

	test("outside a repo, with no openspec/changes, does NOT initialize git", () => {
		const cwd = freshCwd();
		buildStatusOutput(cwd);
		expect(existsSync(join(cwd, ".git"))).toBe(false);
	});

	test("already inside a repo, never reinitializes (idempotent)", () => {
		const cwd = freshCwd();
		withOpenspecChanges(cwd);
		execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		const before = readdirSync(join(cwd, ".git")).sort();
		buildStatusOutput(cwd);
		const after = readdirSync(join(cwd, ".git")).sort();
		expect(after).toEqual(before);
	});

	test("CC_EIN_NO_GIT_INIT suppresses initialization", () => {
		const cwd = freshCwd();
		withOpenspecChanges(cwd);
		process.env.CC_EIN_NO_GIT_INIT = "1";
		try {
			buildStatusOutput(cwd);
		} finally {
			delete process.env.CC_EIN_NO_GIT_INIT;
		}
		expect(existsSync(join(cwd, ".git"))).toBe(false);
	});

	test("CI suppresses initialization", () => {
		const cwd = freshCwd();
		withOpenspecChanges(cwd);
		const prevCI = process.env.CI;
		process.env.CI = "1";
		try {
			buildStatusOutput(cwd);
		} finally {
			if (prevCI === undefined) delete process.env.CI;
			else process.env.CI = prevCI;
		}
		expect(existsSync(join(cwd, ".git"))).toBe(false);
	});

	test("init failure (destination not writable) is caught and reported, never thrown", () => {
		const cwd = freshCwd();
		withOpenspecChanges(cwd);
		chmodSync(cwd, 0o500); // read+execute only: git init cannot create .git here
		let output = "";
		try {
			expect(() => {
				output = buildStatusOutput(cwd);
			}).not.toThrow();
		} finally {
			chmodSync(cwd, 0o700); // restore so afterEach's rmSync can clean up
		}
		expect(existsSync(join(cwd, ".git"))).toBe(false);
		expect(output).toContain("repo: none");
	});
});

describe("buildStatusOutput — working-tree reporting channel", () => {
	test("dirty working tree: the working-tree line is visible in status output", () => {
		const cwd = freshCwd();
		execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		writeFileSync(join(cwd, "dirty.txt"), "uncommitted");
		const output = buildStatusOutput(cwd);
		expect(output).toContain("Working tree: UNCOMMITTED changes present.");
	});

	test("clean working tree: the sober clean line is present, not the dirty warning", () => {
		const cwd = freshCwd();
		execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		execFileSync("git", ["config", "user.email", "test@example.com"], { cwd, stdio: "ignore" });
		execFileSync("git", ["config", "user.name", "Test"], { cwd, stdio: "ignore" });
		writeFileSync(join(cwd, "committed.txt"), "content");
		execFileSync("git", ["add", "."], { cwd, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "init"], { cwd, stdio: "ignore" });
		const output = buildStatusOutput(cwd);
		expect(output).toContain("Working tree: clean (no uncommitted changes).");
		expect(output).not.toContain("UNCOMMITTED");
	});

	test("the working-tree line appears exactly once in the output", () => {
		const cwd = freshCwd();
		execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		writeFileSync(join(cwd, "dirty.txt"), "uncommitted");
		const output = buildStatusOutput(cwd);
		const occurrences = output.split("Working tree:").length - 1;
		expect(occurrences).toBe(1);
	});
});

// -----------------------------------------------------------------------------
// Grupo 007: cc-ein/settings.json — allowlist de subcomandos de git de solo lectura
// -----------------------------------------------------------------------------
describe("cc-ein/settings.json permissions", () => {
	const settingsPath = join(fileURLToPath(new URL("..", import.meta.url)), "cc-ein", "settings.json");
	const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
		permissions: { allow: string[]; deny: string[] };
	};

	test("allow contains only status, diff, and log", () => {
		expect(settings.permissions.allow).toEqual([
			"Bash(git status:*)",
			"Bash(git diff:*)",
			"Bash(git log:*)",
		]);
	});

	test("allow does NOT contain branch, commit, or add (flag-aware, guard-only)", () => {
		expect(settings.permissions.allow).not.toContain("Bash(git branch:*)");
		expect(settings.permissions.allow).not.toContain("Bash(git commit:*)");
		expect(settings.permissions.allow).not.toContain("Bash(git add:*)");
	});

	test("deny is unchanged: force-push variants and destructive rm -rf patterns", () => {
		expect(settings.permissions.deny).toEqual([
			"Bash(git push --force:*)",
			"Bash(git push -f:*)",
			"Bash(git push --force-with-lease:*)",
			"Bash(rm -rf /:*)",
			"Bash(rm -rf ~:*)",
		]);
	});
});
