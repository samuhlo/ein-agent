import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const barrier = process.env.EIN_FIXTURE_PROBE_BARRIER;
const namespace = process.env.EIN_FIXTURE_PROBE_NAMESPACE;
const ownerName = process.env.EIN_FIXTURE_PROBE_OWNER;
const mode = process.env.EIN_FIXTURE_PROBE_MODE;
const signal = process.env.EIN_FIXTURE_PROBE_SIGNAL as "SIGINT" | "SIGTERM" | undefined;
const reportPath = process.env.EIN_FIXTURE_PROBE_REPORT;
if (mode !== "signal" && (!barrier || !namespace || !ownerName)) {
	throw new Error("probe worker configuration is incomplete");
}

process.env.EIN_FIXTURE_MANUAL_PRELOAD = "1";
await import("../preload-env.ts");

if (mode === "signal") {
	if (!signal || !reportPath) throw new Error("signal probe configuration is incomplete");
	const { getRuntimeTestOwner } = await import("./runtime-test-fixture");
	const runtimeOwner = getRuntimeTestOwner();
	runtimeOwner.setEnv("EIN_FIXTURE_SIGNAL_SENTINEL", "temporary");
	writeFileSync(join(runtimeOwner.agentHome, "signal-owned.txt"), "owned");
	writeFileSync(reportPath, JSON.stringify({ root: runtimeOwner.root, agentHome: runtimeOwner.agentHome }));
	runtimeOwner.registerChild({
		kill: () => appendFileSync(reportPath, "\nchild-killed"),
		exited: Promise.resolve(0),
	});
	runtimeOwner.registerResource({ close: () => appendFileSync(reportPath, "\nresource-closed") });
	process.kill(process.pid, signal);
	await Bun.sleep(200);
	process.exit(1);
}

const owner = ownerName!;
const { getRuntimeTestOwner } = await import("./runtime-test-fixture");
const runtimeOwner = getRuntimeTestOwner();
const { AGENT_DIR } = await import("../../ein-pi/agent/extensions/ein-paths");
const { listRecentSessions } = await import("../../ein-pi/agent/lib/sessions");

const ownerNamespace = join(AGENT_DIR, "sessions", `${namespace}-${owner}`);
const markerPath = join(ownerNamespace, `${owner}.jsonl`);
const readyPath = join(barrier, `${owner}.ready`);
const goPath = join(barrier, "go");

try {
	mkdirSync(ownerNamespace, { recursive: true });
	writeFileSync(
		markerPath,
		`${JSON.stringify({ type: "session", id: owner, cwd: `/probe/${owner}` })}\n`,
	);
	writeFileSync(readyPath, owner);
	const deadline = Date.now() + 4_000;
	while (readdirSync(barrier).filter((entry) => entry.endsWith(".ready")).length < 2) {
		if (Date.now() > deadline) throw new Error("probe barrier timed out");
		await Bun.sleep(1);
	}
	writeFileSync(goPath, "go");
	while (!existsSync(goPath)) await Bun.sleep(1);
	const markers = listRecentSessions(10)
		.map((session) => session.id)
		.filter((id) => id === "alpha" || id === "beta")
		.sort();
	process.stdout.write(JSON.stringify({ owner, agentHome: AGENT_DIR, markers }));
} finally {
	rmSync(ownerNamespace, { recursive: true, force: true });
	await runtimeOwner.dispose();
}
