import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateScoutReport } from "../ein-pi/agent/lib/scout-contract.ts";

const ROOT = join(import.meta.dir, "..");
const SCOUT_SOURCE = join(ROOT, "ein-pi", "core", "agents", "ein-scout.md");
const EIN_AI_EXTENSION = join(ROOT, "ein-pi", "agent", "extensions", "ein-ai.ts");
const OBSERVER_EXTENSION = join(import.meta.dir, "fixtures", "scout-live-smoke-observer.ts");
const EVIDENCE_FILE = "controlled-evidence.txt";

type SmokeConfiguration = {
	model: string;
	credentialEnv: string;
	credential: string;
	piBinary: string;
};

function unavailable(reason: string): never {
	throw new Error(`Live smoke unavailable: ${reason}`);
}

function smokeConfiguration(): SmokeConfiguration {
	const model = process.env.EIN_SCOUT_SMOKE_MODEL;
	const credentialEnv = process.env.EIN_SCOUT_SMOKE_CREDENTIAL_ENV;
	if (!model || !credentialEnv) {
		unavailable("set EIN_SCOUT_SMOKE_MODEL and EIN_SCOUT_SMOKE_CREDENTIAL_ENV before running this opt-in command.");
	}
	if (!/^[A-Z_][A-Z0-9_]*$/.test(credentialEnv) || !process.env[credentialEnv]) {
		unavailable("set EIN_SCOUT_SMOKE_CREDENTIAL_ENV to the name of a present provider credential environment variable.");
	}

	const piBinary = process.env.EIN_SCOUT_SMOKE_PI_BIN ?? "pi";
	if (!Bun.which(piBinary) && !existsSync(piBinary)) {
		unavailable(`Pi executable '${piBinary}' was not found; set EIN_SCOUT_SMOKE_PI_BIN to an explicit executable path.`);
	}
	return { model, credentialEnv, credential: process.env[credentialEnv]!, piBinary };
}

function reportPayload(details: unknown): unknown {
	if (
		typeof details !== "object" ||
		details === null ||
		Array.isArray(details) ||
		(details as { mode?: unknown }).mode !== "single" ||
		!Array.isArray((details as { results?: unknown }).results) ||
		(details as { results: unknown[] }).results.length !== 1
	) {
		throw new Error("Live smoke failed: observer did not capture one direct scout result.");
	}

	const result = (details as { results: unknown[] }).results[0];
	if (
		typeof result !== "object" ||
		result === null ||
		Array.isArray(result) ||
		(result as { structuredOutputFailed?: unknown }).structuredOutputFailed === true ||
		!("structuredOutput" in result) ||
		(result as { structuredOutput?: unknown }).structuredOutput === undefined
	) {
		throw new Error("Live smoke failed: direct scout result has no usable structured output.");
	}
	return (result as { structuredOutput: unknown }).structuredOutput;
}

function isolatedEnvironment(config: SmokeConfiguration, root: string, observerOutput: string): Record<string, string> {
	const home = join(root, "home");
	const agentHome = join(root, "agent");
	const einHome = join(root, "ein");
	const sessions = join(root, "sessions");
	for (const directory of [home, agentHome, einHome, sessions]) mkdirSync(directory, { recursive: true });

	return {
		PATH: process.env.PATH ?? "",
		HOME: home,
		XDG_CACHE_HOME: join(root, "cache"),
		XDG_CONFIG_HOME: join(root, "config"),
		XDG_DATA_HOME: join(root, "data"),
		PI_CODING_AGENT_DIR: agentHome,
		EIN_PI_AGENT_HOME: agentHome,
		EIN_PI_CONFIG_HOME: einHome,
		EIN_SCOUT_SMOKE_ROOT: root,
		EIN_SCOUT_SMOKE_OBSERVER_PATH: observerOutput,
		EIN_SCOUT_SMOKE_MODEL: config.model,
		[config.credentialEnv]: config.credential,
	};
}

async function run(): Promise<void> {
	const config = smokeConfiguration();
	const root = mkdtempSync(join(tmpdir(), "ein-scout-live-smoke-"));
	let cleaned = false;
	try {
		const project = join(root, "project");
		const agents = join(root, "agent", "agents");
		const observerOutput = join(root, "observer", "tool-result.json");
		mkdirSync(project, { recursive: true });
		mkdirSync(agents, { recursive: true });
		mkdirSync(join(root, "observer"), { recursive: true });
		copyFileSync(SCOUT_SOURCE, join(agents, "ein-scout.md"));
		writeFileSync(join(project, EVIDENCE_FILE), "The controlled scout smoke evidence is exactly this file.\n");

		const env = isolatedEnvironment(config, root, observerOutput);
		const version = Bun.spawnSync([config.piBinary, "--version"], { cwd: project, env });
		if (version.exitCode !== 0) throw new Error("Live smoke failed: Pi version check did not complete in the isolated environment.");

		const process = Bun.spawn([
			config.piBinary,
			"--no-extensions",
			"-e", "npm:pi-subagents",
			"-e", EIN_AI_EXTENSION,
			"-e", OBSERVER_EXTENSION,
			"--session-dir", join(root, "sessions"),
			"--no-context-files",
			"--no-skills",
			"--tools", "subagent",
			"--model", config.model,
			"-p", `Call ein-scout exactly once. Ask it to inspect only ${EVIDENCE_FILE}, then return its structured result unchanged.`,
		], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
		const exitCode = await process.exited;
		if (exitCode !== 0) throw new Error(`Live smoke failed: isolated Pi parent exited with code ${exitCode}.`);
		if (!existsSync(observerOutput)) throw new Error("Live smoke failed: observer captured no tracked ein-scout tool result.");

		const captured = JSON.parse(readFileSync(observerOutput, "utf8")) as { observations?: { details?: unknown; isError?: unknown }[] };
		if (!Array.isArray(captured.observations) || captured.observations.length !== 1) {
			throw new Error("Live smoke failed: observer did not capture exactly one tracked ein-scout tool result.");
		}
		const observed = captured.observations[0]!;
		if (observed.isError === true) throw new Error("Live smoke failed: tracked ein-scout tool result was an error.");
		const report = validateScoutReport([reportPayload(observed.details)], project);
		if (!report.references.every((reference) => reference.path === EVIDENCE_FILE)) {
			throw new Error("Live smoke failed: validated scout report cited data outside the controlled evidence file.");
		}

		console.log(`Live smoke passed: Pi ${version.stdout.toString().trim()}, requested npm:pi-subagents, validated direct handoff, cleanup pending.`);
	} finally {
		rmSync(root, { recursive: true, force: true });
		cleaned = !existsSync(root);
		console.log(`Live smoke cleanup: ${cleaned ? "removed isolated temporary root" : "failed to remove isolated temporary root"}.`);
	}
}

run().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : "Live smoke failed: unknown error.");
	process.exitCode = 1;
});
