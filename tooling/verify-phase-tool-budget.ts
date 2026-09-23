import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { subagentModulePath } from "../installer/src/core/subagent-module-path.ts";

const packageRoot = process.argv[2];
if (!packageRoot) throw new Error("Uso: bun tooling/verify-phase-tool-budget.ts <pi-subagents-package-root>");

const hostRequire = createRequire(import.meta.url);
const peerLink = join(packageRoot, "node_modules/@earendil-works");
let linkedHostPeers = false;
if (!existsSync(peerLink)) {
	mkdirSync(join(packageRoot, "node_modules"), { recursive: true });
	symlinkSync(join(import.meta.dir, "../node_modules/@earendil-works"), peerLink, "dir");
	linkedHostPeers = true;
	process.on("exit", () => { if (linkedHostPeers) unlinkSync(peerLink); });
}

const runtimePath = subagentModulePath(packageRoot, "src/runs/shared/subagent-prompt-runtime.ts");

const { default: registerChildRuntime } = hostRequire(runtimePath) as {
	default: (pi: unknown, config: Record<string, unknown>) => void;
};
if (typeof registerChildRuntime !== "function") throw new Error("pi-subagents no ofrece el runtime inyectable; no se puede comprobar el límite sin proveedor");

type ToolHandler = (event: { toolName: string }) => unknown;
const handlers = new Map<string, ToolHandler[]>();
const nudges: string[] = [];
const pi = {
	on(event: string, handler: ToolHandler) {
		const current = handlers.get(event) ?? [];
		current.push(handler);
		handlers.set(event, current);
	},
	getAllTools: () => [],
	events: {},
	sendUserMessage(message: string) { nudges.push(message); },
};
registerChildRuntime(pi, {
	depth: 1,
	fanoutChild: false,
	fast: false,
	waitTool: { enabled: false, defaultTimeoutMs: 10_000 },
	toolBudget: { hard: 30, soft: 24, block: ["read", "grep", "find", "ls", "bash"] },
});
const toolHandlers = handlers.get("tool_call") ?? [];
if (toolHandlers.length === 0) throw new Error("El child runtime no registró el límite de herramientas");

function gate(toolName: string): unknown {
	let blocked: unknown;
	for (const handler of toolHandlers) blocked ??= handler({ toolName });
	return blocked;
}

if (gate("write") !== undefined) throw new Error("La primera escritura fue bloqueada");
for (let call = 2; call <= 30; call += 1) {
	if (gate(call % 2 === 0 ? "read" : "grep") !== undefined) throw new Error(`La llamada ${call} fue bloqueada antes de hard=30`);
}
const blocked = gate("read") as { block?: boolean; reason?: string } | undefined;
if (!blocked?.block || !blocked.reason?.includes("hard 30")) throw new Error("La lectura 31 no fue bloqueada por el hook real del runner");
if (!nudges.some((message) => message.includes("soft 24"))) throw new Error("El runner no emitió el aviso soft=24");

const root = mkdtempSync(join(tmpdir(), "ein-phase-budget-"));
try {
	if (gate("write") !== undefined) throw new Error("write quedó bloqueado después de agotar la investigación");
	const artifact = join(root, "map.md");
	writeFileSync(artifact, "status: partial\nbudget_exceeded: true\n");
	if (!readFileSync(artifact, "utf8").includes("status: partial")) throw new Error("No se conservó el artefacto parcial");
} finally {
	rmSync(root, { recursive: true, force: true });
}

console.log("Presupuesto del runner comprobado: 30 llamadas admitidas, lectura 31 bloqueada y escritura parcial posterior disponible.");
if (linkedHostPeers) {
	unlinkSync(peerLink);
	linkedHostPeers = false;
}
