import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = process.argv[2];
if (!packageRoot) throw new Error("Usage: verify-agent-discovery-isolation.ts <pi-subagents directory>");
if (!process.env.EIN_DISCOVERY_PROBE_HOME) {
	const sandbox = mkdtempSync(join(tmpdir(), "ein-routing-smoke-"));
	try {
		const child = Bun.spawnSync(["bun", import.meta.path, resolve(packageRoot)], {
			env: { ...process.env, HOME: sandbox, EIN_DISCOVERY_PROBE_HOME: sandbox }, stdout: "pipe", stderr: "pipe",
		});
		if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr));
		console.log(new TextDecoder().decode(child.stdout).trim());
	} finally { rmSync(sandbox, { recursive: true, force: true }); }
	process.exit(0);
}
const home = process.env.EIN_DISCOVERY_PROBE_HOME;
const agentHome = join(home, ".pi-ein/agent");
const donor = join(home, "work/source"), target = join(home, "work/destination");
const legacy = join(home, ".pi/agents/sdd-apply.md");
const canonical = join(agentHome, "agents/sdd-apply.md");
const project = join(donor, ".pi/agents/sdd-apply.md");
try {
	for (const dir of [join(home, ".pi/agents"), join(agentHome, "agents"), join(donor, ".git"), join(donor, ".pi/agents"), target]) mkdirSync(dir, { recursive: true });
	const definition = (model: string, body: string) => `---\nname: sdd-apply\ndescription: fixture\nmodel: ${model}\nthinking: low\ntools: ${body === "CURRENT_CONTRACT" ? "read, grep" : "read"}\n---\n\n${body}\n`;
	writeFileSync(legacy, definition("minimax/MiniMax-M2.7", "OLD_CONTRACT"));
	writeFileSync(canonical, definition("fixture/selected", "CURRENT_CONTRACT"));
	writeFileSync(project, definition("fixture/old-project", "PROJECT_CONTRACT"));
	writeFileSync(join(agentHome, "settings.json"), JSON.stringify({ subagents: { disableBuiltins: true } }));
	writeFileSync(join(home, ".pi/settings.json"), JSON.stringify({ subagents: { agentOverrides: { "sdd-apply": { model: "minimax/MiniMax-M2.7" } } } }));
	const originalLegacy = readFileSync(legacy, "utf8");
	const originalSettings = readFileSync(join(home, ".pi/settings.json"), "utf8");
	process.env.PI_CODING_AGENT_DIR = agentHome;
	process.env.EIN_PI_AGENT_HOME = agentHome;
	process.env.EIN_PI_CONFIG_HOME = join(home, ".pi/ein");
	process.env.PI_OFFLINE = "1";
	const { normalizeAgentDiscoveryScope } = await import("../ein-pi/agent/lib/agent-discovery-scope.ts");
	const { applyModelConfigAsync, listDiscoverableAgents } = await import("../ein-pi/agent/lib/model-config.ts");
	const { resolveSubagentLaunchContract } = await import(pathToFileURL(join(resolve(packageRoot), "src/api/preflight.ts")).href);
	const availableModels = ["minimax/MiniMax-M2.7", "fixture/selected", "fixture/changed", "fixture/old-project"].map((fullId) => ({ fullId, provider: fullId.split("/")[0], id: fullId.split("/")[1], reasoning: true }));
	const input = { agent: "sdd-apply", task: "Read the fixture", cwd: target, context: "fresh", skill: false, output: false, artifacts: false, availableModels };
	const before = await resolveSubagentLaunchContract(input);
	assert(before.ok, JSON.stringify(before));
	const legacyWasSelected = before.contract.agent.filePath === legacy;
	assert(legacyWasSelected || before.contract.agent.filePath === canonical);
	if (legacyWasSelected) assert(before.contract.model.startsWith("minimax/"));
	assert(normalizeAgentDiscoveryScope(input, donor));
	const after = await resolveSubagentLaunchContract(input);
	assert(after.ok, JSON.stringify(after));
	assert.equal(after.contract.agent.filePath, canonical);
	assert(after.contract.model.startsWith("fixture/selected"));
	assert(after.contract.tools.declaredBuiltin.includes("grep"));
	assert(readFileSync(after.contract.agent.filePath, "utf8").includes("CURRENT_CONTRACT"));
	assert.equal(listDiscoverableAgents(target).find((agent) => agent.name === "sdd-apply")?.filePath, canonical);
	await applyModelConfigAsync(donor, { "sdd-apply": { model: "fixture/changed", thinking: "low" } });
	const changed = await resolveSubagentLaunchContract(input);
	assert(changed.ok, JSON.stringify(changed));
	assert(changed.contract.model.startsWith("fixture/changed"));
	assert.equal(changed.contract.agent.filePath, canonical);
	const localInput = { ...input, agentScope: "both", cwd: donor };
	assert.equal(normalizeAgentDiscoveryScope(localInput, donor), false);
	const local = await resolveSubagentLaunchContract(localInput);
	assert(local.ok, JSON.stringify(local));
	assert.equal(local.contract.agent.filePath, project);
	assert(local.contract.model.startsWith("fixture/changed"));
	assert(readFileSync(project, "utf8").includes("PROJECT_CONTRACT"));
	assert.equal(readFileSync(legacy, "utf8"), originalLegacy);
	assert.equal(readFileSync(join(home, ".pi/settings.json"), "utf8"), originalSettings);
	console.log(`Agent discovery isolation: legacy selection before normalization=${legacyWasSelected}; selected model and current contract survive directory and model changes.`);
} finally { rmSync(home, { recursive: true, force: true }); }
