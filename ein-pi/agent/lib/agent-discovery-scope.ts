import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

function directory(path: string): boolean {
	try { return statSync(path).isDirectory(); } catch { return false; }
}

/** Home configuration is user state, never an inherited project definition. */
export function findProjectAgentRoot(cwd: string, home = homedir()): string | null {
	let current = resolve(cwd);
	const userHome = resolve(home);
	const candidates: string[] = [];
	const projectRoots = new Set<string>();
	let bounded = true;
	let gitRoot: string | null = null;
	while (true) {
		if (current === userHome) bounded = false;
		if (directory(join(current, ".pi")) || directory(join(current, ".agents"))) {
			candidates.push(current);
			if (bounded) projectRoots.add(current);
		}
		if (existsSync(join(current, ".git"))) { gitRoot ??= current; bounded = false; }
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	// Match native nearest/git-root policy before applying Ein's isolation boundary.
	let selected = candidates[0] ?? null;
	for (const [index, candidate] of candidates.entries()) {
		const path = join(candidate, ".pi/settings.json");
		if (!existsSync(path)) continue;
		const settings = JSON.parse(readFileSync(path, "utf8"));
		const policy = settings?.subagents?.projectRootResolution;
		if (policy === undefined) continue;
		if (policy === "nearest") break;
		if (policy !== "git-root") throw new Error(`Invalid projectRootResolution in ${path}`);
		selected = candidates.slice(index).find((root) => root === gitRoot)
			?? (existsSync(join(candidate, ".git")) ? candidate : selected);
		break;
	}
	return selected && projectRoots.has(selected) ? selected : null;
}

export function normalizeAgentDiscoveryScope(input: unknown, cwd: string, home = homedir()): boolean {
	if (!input || typeof input !== "object" || Array.isArray(input)) return false;
	const value = input as Record<string, unknown>;
	// Management operations must not be redirected from project writes to user writes.
	if (value.action !== undefined && value.action !== "list") return false;
	if (value.agentScope === "user") return false;
	if (value.agentScope !== undefined && value.agentScope !== "both" && value.agentScope !== "project") return false;
	const target = typeof value.cwd === "string" ? resolve(cwd, value.cwd) : cwd;
	if (findProjectAgentRoot(target, home)) return false;
	if (value.agentScope === "project") throw new Error(`No project agent configuration inside ${target} or its repository; refusing ancestor user definitions. Use agentScope: user for installed agents.`);
	value.agentScope = "user";
	return true;
}
