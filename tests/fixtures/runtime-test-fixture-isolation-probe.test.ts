import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ProbeResult = {
	owner: string;
	agentHome: string;
	markers: string[];
};

const WORKER = join(import.meta.dir, "runtime-test-fixture-isolation-probe-worker.ts");
const PROBE_TIMEOUT_MS = 5_000;
const OWNER_PREFIX = "ein-runtime-test-owner-";

function ownerRoots(): string[] {
	return readdirSync(tmpdir())
		.filter((name) => name.startsWith(OWNER_PREFIX))
		.sort()
		.map((name) => join(tmpdir(), name));
}

async function runSignalWorker(signal: "SIGINT" | "SIGTERM"): Promise<{ root: string; report: string }> {
	const reportDir = mkdtempSync(join(tmpdir(), "ein-fixture-signal-"));
	const reportPath = join(reportDir, "report.json");
	const env = { ...process.env } as Record<string, string>;
	delete env.EIN_PI_AGENT_HOME;
	delete env.EIN_PI_CONFIG_HOME;
	env.EIN_FIXTURE_PROBE_MODE = "signal";
	env.EIN_FIXTURE_PROBE_SIGNAL = signal;
	env.EIN_FIXTURE_PROBE_REPORT = reportPath;
	const child = Bun.spawn([process.execPath, "run", WORKER], {
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		const [exitCode] = await Promise.all([child.exited, new Response(child.stdout).text()]);
		if (!existsSync(reportPath)) {
			const stderr = await new Response(child.stderr).text();
			throw new Error(`signal worker ${signal} failed: ${stderr}`);
		}
		const reportText = readFileSync(reportPath, "utf8");
		const report = JSON.parse(reportText.split("\n", 1)[0]!) as { root: string; agentHome: string };
		return { root: report.root, report: reportText };
	} finally {
		child.kill();
		rmSync(reportDir, { recursive: true, force: true });
	}
}

async function runProbeWorker(owner: string, barrier: string, namespace: string): Promise<ProbeResult> {
	const env = { ...process.env } as Record<string, string>;
	delete env.EIN_PI_AGENT_HOME;
	delete env.EIN_PI_CONFIG_HOME;
	env.EIN_FIXTURE_PROBE_BARRIER = barrier;
	env.EIN_FIXTURE_PROBE_NAMESPACE = namespace;
	env.EIN_FIXTURE_PROBE_OWNER = owner;
	const child = Bun.spawn([process.execPath, "run", WORKER], {
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = new Response(child.stdout).text();
	const errors = new Response(child.stderr).text();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;
	const completed = Promise.all([child.exited, output, errors]);
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			timedOut = true;
			child.kill();
			reject(new Error(`probe worker ${owner} timed out`));
		}, PROBE_TIMEOUT_MS);
	});
	try {
		const [exitCode, stdout, stderr] = await Promise.race([completed, timeout]);
		if (exitCode !== 0) throw new Error(`probe worker ${owner} failed: ${stderr || stdout}`);
		return JSON.parse(stdout.trim()) as ProbeResult;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		if (timedOut) await completed;
		else await child.exited.catch(() => undefined);
	}
}

async function runNormalBunTest(): Promise<{ exitCode: number; stderr: string }> {
	const env = { ...process.env } as Record<string, string>;
	delete env.EIN_PI_AGENT_HOME;
	delete env.EIN_PI_CONFIG_HOME;
	const child = Bun.spawn(
		[process.execPath, "test", "tests/runtime-test-fixture-isolation.test.ts"],
		{ env, stdout: "pipe", stderr: "pipe" },
	);
	const output = new Response(child.stdout).text();
	const errors = new Response(child.stderr).text();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;
	const completed = Promise.all([child.exited, output, errors]);
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			timedOut = true;
			child.kill();
			reject(new Error("normal bun test child timed out"));
		}, PROBE_TIMEOUT_MS);
	});
	try {
		const [exitCode, , stderr] = await Promise.race([completed, timeout]);
		return { exitCode, stderr };
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		if (timedOut) await completed;
		else await child.exited.catch(() => undefined);
	}
}

describe("runtime fixture isolation probe", () => {
	test("independent owners do not share the cached runtime home", async () => {
		const barrier = mkdtempSync(join(tmpdir(), "ein-fixture-probe-"));
		const namespace = `probe-${barrier.slice(barrier.lastIndexOf("/") + 1)}`;
		try {
			const results = await Promise.all([
				runProbeWorker("alpha", barrier, namespace),
				runProbeWorker("beta", barrier, namespace),
			]);
			expect(new Set(results.map((result) => result.agentHome)).size).toBe(2);
			expect(results[0]?.markers).toEqual(["alpha"]);
			expect(results[1]?.markers).toEqual(["beta"]);
		} finally {
			const sharedHome = join(tmpdir(), "ein-agent-tests", "agent");
			for (const owner of ["alpha", "beta"]) {
				rmSync(join(sharedHome, "sessions", `${namespace}-${owner}`), {
					recursive: true,
					force: true,
				});
			}
			rmSync(barrier, { recursive: true, force: true });
			expect(existsSync(barrier)).toBe(false);
		}
	});

	test("normal bun test completion removes the preload owner root", async () => {
		const before = ownerRoots();
		const result = await runNormalBunTest();
		expect(result.exitCode).toBe(0);
		expect(ownerRoots()).toEqual(before);
	});

	test("cleans owned state on SIGINT and SIGTERM before exit", async () => {
		for (const signal of ["SIGINT", "SIGTERM"] as const) {
			const result = await runSignalWorker(signal);
			expect(existsSync(result.root)).toBe(false);
			expect(result.report).toContain("child-killed");
			expect(result.report).toContain("resource-closed");
		}
	});
});
