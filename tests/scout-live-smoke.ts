import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptTrackedScoutResult, normalizeScoutLaunch, type ScoutTracking } from "../ein-pi/agent/lib/scout-contract.ts";
import { readAccountingReport } from "../ein-pi/agent/lib/session-accounting-store.ts";
import { REQUIRED_PI_PACKAGES } from "../shared/contracts/runtime-compat.ts";

const ROOT = join(import.meta.dir, "..");
const SCOUT_SOURCE = join(ROOT, "runtime", "agents", "ein-scout.md");
const EIN_AI_EXTENSION = join(ROOT, "ein-pi", "agent", "extensions", "ein-ai.ts");
const OBSERVER_EXTENSION = join(import.meta.dir, "fixtures", "scout-live-smoke-observer.ts");
const EVIDENCE_FILE = "controlled-evidence.txt";
const PI_SUBAGENTS_SPEC = REQUIRED_PI_PACKAGES.find(({ name }) => name === "pi-subagents")!.spec;

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

function isolatedEnvironment(config: SmokeConfiguration, root: string, observerOutput: string): { env: Record<string, string>; agentHome: string; sessions: string } {
	const home = join(root, "home");
	const agentHome = join(root, "agent");
	const einHome = join(root, "ein");
	// GUARD -> `sessionsRoot()` resuelve `EIN_PI_AGENT_HOME/sessions`; si esta
	// ruta y el flag `--session-dir` de Pi divergen, el lector de contabilidad
	// mira un directorio vacío y el anti-fallback pasa en vacío (D6).
	const sessions = join(agentHome, "sessions");
	for (const directory of [home, agentHome, einHome, sessions]) mkdirSync(directory, { recursive: true });

	const env = {
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
	return { env, agentHome, sessions };
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

		const { env, agentHome, sessions } = isolatedEnvironment(config, root, observerOutput);
		const version = Bun.spawnSync([config.piBinary, "--version"], { cwd: project, env });
		if (version.exitCode !== 0) throw new Error("Live smoke failed: Pi version check did not complete in the isolated environment.");

		// Fan-out de una sola llamada, tres ramas de solo lectura sobre EL MISMO
		// fichero: las tres deben citar `EVIDENCE_FILE`, así la aserción de citas
		// del final sigue siendo estricta (D5).
		const fanoutPrompt = [
			`Call ein-scout exactly once with a read-only fan-out of exactly three branches.`,
			`All three branches must inspect only ${EVIDENCE_FILE} and run in the foreground.`,
			`Branch 1: quote the literal contents of ${EVIDENCE_FILE}.`,
			`Branch 2: report the exact number of lines in ${EVIDENCE_FILE}.`,
			`Branch 3: confirm there is no other evidence file in the project besides ${EVIDENCE_FILE}.`,
			`Return the structured result unchanged.`,
		].join(" ");

		const piProcess = Bun.spawn([
			config.piBinary,
			"--no-extensions",
			"-e", PI_SUBAGENTS_SPEC,
			"-e", EIN_AI_EXTENSION,
			"-e", OBSERVER_EXTENSION,
			"--session-dir", sessions,
			"--no-context-files",
			"--no-skills",
			"--tools", "subagent",
			"--model", config.model,
			"-p", fanoutPrompt,
		], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
		const exitCode = await piProcess.exited;
		if (exitCode !== 0) throw new Error(`Live smoke failed: isolated Pi parent exited with code ${exitCode}.`);
		if (!existsSync(observerOutput)) throw new Error("Live smoke failed: observer captured no tracked ein-scout tool result.");

		const captured = JSON.parse(readFileSync(observerOutput, "utf8")) as {
			observations?: { toolCallId?: unknown; input?: unknown; details?: unknown; isError?: unknown }[];
		};
		// Anti-reintento -> con fan-out sigue habiendo UNA sola tool call; una
		// segunda observación solo puede venir de un relanzamiento (D5).
		if (!Array.isArray(captured.observations) || captured.observations.length !== 1) {
			throw new Error("Live smoke failed: observer did not capture exactly one tracked ein-scout tool result.");
		}
		const observed = captured.observations[0]!;
		if (typeof observed.toolCallId !== "string") throw new Error("Live smoke failed: tracked observation is missing its toolCallId.");
		if (observed.isError === true) throw new Error("Live smoke failed: tracked ein-scout tool result was an error.");

		// Camino de producción -> se siembra el tracking y se acepta el
		// resultado exactamente como hace `ein-tool-call-gate`, sin reimplementar
		// validación por rama (D5, D7).
		const tracking: ScoutTracking = new Map();
		normalizeScoutLaunch(observed.input, observed.toolCallId, tracking);
		const accepted = acceptTrackedScoutResult(tracking, observed.toolCallId, observed.details, observed.isError === true, project);
		// `acceptTrackedScoutResult` devuelve un `Report` pelado cuando el
		// tracking solo vio una rama -> eso significa que el padre lanzó 1 rama,
		// no 3, y el mensaje lo nombra (D5).
		if (!accepted || !("branches" in accepted)) {
			throw new Error(`Live smoke failed: esperaba 3 ramas, el fan-out devolvió ${accepted ? 1 : 0}.`);
		}
		if (accepted.branches.length !== 3 || accepted.dropped.length !== 0) {
			throw new Error(
				`Live smoke failed: esperaba 3 ramas aceptadas y 0 descartadas, obtuvo ${accepted.branches.length} aceptadas y ${accepted.dropped.length} descartadas.`,
			);
		}
		for (const branch of accepted.branches) {
			if (!branch.report.references.every((reference: { path: string }) => reference.path === EVIDENCE_FILE)) {
				throw new Error(`Live smoke failed: la rama "${branch.task}" citó evidencia fuera del fichero controlado.`);
			}
		}

		// Anti-fallback con evidencia positiva -> ausencia de datos NUNCA cuenta
		// como ausencia de fallback (D6, D7). Se adopta el home aislado alrededor
		// de la lectura porque `readAccountingReport()` resuelve su root por
		// llamada, y se restaura después para no filtrar estado al proceso.
		const previousAgentHome = process.env.EIN_PI_AGENT_HOME;
		process.env.EIN_PI_AGENT_HOME = agentHome;
		let report: ReturnType<typeof readAccountingReport>;
		try {
			report = readAccountingReport();
		} finally {
			if (previousAgentHome === undefined) delete process.env.EIN_PI_AGENT_HOME;
			else process.env.EIN_PI_AGENT_HOME = previousAgentHome;
		}
		if (report.store !== "present" || report.overall.runs < 1) {
			throw new Error("Live smoke failed: la contabilidad no observó ningún run: no hay evidencia de qué modelo corrió.");
		}
		if (report.overall.outcomes.modelFallbacks.count !== 0 || report.overall.outcomes.modelFallbacks.undetermined !== 0) {
			throw new Error(
				`Live smoke failed: la contabilidad declaró fallback de modelo (count: ${report.overall.outcomes.modelFallbacks.count}, undetermined: ${report.overall.outcomes.modelFallbacks.undetermined}).`,
			);
		}

		console.log(`Live smoke passed: Pi ${version.stdout.toString().trim()}, requested ${PI_SUBAGENTS_SPEC}, validated 3-branch fan-out, cleanup pending.`);
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
