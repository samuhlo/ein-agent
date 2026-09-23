import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";

const PACKAGE_VERSION = "0.68.0";
const root = mkdtempSync(join(tmpdir(), "ein-delegation-admission-"));

try {
	const install = Bun.spawnSync(["bun", "add", "--exact", `pi-subagents@${PACKAGE_VERSION}`], {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (install.exitCode !== 0) throw new Error(new TextDecoder().decode(install.stderr));
	const packageRoot = join(root, "node_modules", "pi-subagents");
	const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
		version?: string;
		exports?: Record<string, string>;
	};
	if (manifest.version !== PACKAGE_VERSION) throw new Error(`expected pi-subagents ${PACKAGE_VERSION}, found ${manifest.version ?? "missing"}`);
	if (!manifest.exports?.["./delegation"]) throw new Error("pi-subagents does not expose its documented delegation API");
	const publicDelegation = await import(join(packageRoot, manifest.exports["./delegation"]));
	if (publicDelegation.SUBAGENT_DELEGATION_REQUEST_EVENT !== "prompt-template:subagent:request") throw new Error("unexpected public delegation protocol");
	const publicExports = Object.keys(manifest.exports);
	const injectableRunner = publicExports.some((name) => /workflow.*runner|scripted-workflow/i.test(name));

	const handlers = new Map<string, Function>();
	let persistenceAttempts = 0;
	let phaseReceiptAttempts = 0;
	let launchAttempts = 0;
	registerToolCallGate({
		on(name: string, handler: Function) { handlers.set(name, handler); },
		appendEntry() { persistenceAttempts += 1; },
	} as never, {
		scoutTracking: new Map(),
		rememberPhaseRun() { phaseReceiptAttempts += 1; },
	});
	const hook = handlers.get("tool_call");
	if (!hook) throw new Error("tool_call gate was not registered");
	const ctx = {
		cwd: root,
		hasUI: false,
		ui: { notify() {}, select: async () => "off" },
		sessionManager: { getSessionId: () => "delegation-admission-probe" },
	};
	const invoke = async (input: Record<string, unknown>, id: string) => {
		const result = await hook({ toolName: "subagent", toolCallId: id, input }, ctx);
		if (!result?.block) launchAttempts += 1;
		return result;
	};

	for (const [index, input] of [
		{ workflowScript: `return runs.run("dynamic", { agent: chosenAgent, task: "write" })` },
		{ workflowScript: `return runs.all([{key:"known",agent:"worker",task:"read"},{key:"dynamic",agent:chosenAgent,task:"write"}])` },
		{ tasks: [{ agent: "worker", task: "read" }] },
		{ steps: [{ agent: "worker", task: "read" }] },
		{ chain: [{ agent: "worker", task: "read" }] },
	].entries()) {
		const result = await invoke(input, `rejected-${index}`);
		if (!result?.block) throw new Error(`rejected fixture ${index} reached the launcher`);
	}
	if (launchAttempts !== 0 || persistenceAttempts !== 0 || phaseReceiptAttempts !== 0) throw new Error("a rejected delegation produced an effect");

	const task = "read byte-for-byte\nwith \\n and ${literal}";
	const valid = { workflowScript: `return runs.run("valid", { agent: "worker", task: ${JSON.stringify(task)} })` };
	const result = await invoke(valid, "valid");
	if (result?.block || Number(launchAttempts) !== 1 || Number(phaseReceiptAttempts) !== 0) throw new Error("the valid delegation did not reach the launcher exactly once");
	if (!String(valid.workflowScript).includes(JSON.stringify(task))) throw new Error("the valid task changed during normalization");

	console.log(JSON.stringify({
		ok: true,
		rejectedLaunches: 0,
		validLaunches: launchAttempts,
		piSubagents: manifest.version,
		publicDelegationApi: true,
		realRunnerExecution: injectableRunner ? "available-not-used" : "unavailable-public-api",
		limitation: injectableRunner ? undefined : "pi-subagents 0.68.0 exposes delegation transport types but no public injectable workflow runner; a provider-free real child launch cannot be claimed",
	}));
} finally {
	if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}
