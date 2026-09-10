import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, initTheme, parseFrontmatter, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const [payload, cwd, agentDir] = process.argv.slice(2) as [string, string, string];
initTheme("dark");
const results = [];
for (const role of ["scope", "map", "design", "tasks", "apply", "verify", "close"]) {
	const agentPath = join(payload, `agents/sdd-${role}.md`);
	const { frontmatter } = parseFrontmatter<Record<string, string>>(readFileSync(agentPath, "utf8"));
	const tools = frontmatter.tools!.split(",").map((name) => name.trim());
	const extensionPaths = (frontmatter.subagentOnlyExtensions ?? "").split(",").filter(Boolean).map((path) => resolve(dirname(agentPath), path.trim()));
	const settingsManager = SettingsManager.inMemory({});
	const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, noSkills: true,
		noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: extensionPaths });
	await loader.reload();
	if (loader.getExtensions().errors.length) throw new Error(JSON.stringify(loader.getExtensions().errors));
	const sessions = join(agentDir, role); mkdirSync(sessions, { recursive: true });
	const { session } = await createAgentSession({ cwd, agentDir, tools, settingsManager, resourceLoader: loader, sessionManager: SessionManager.create(cwd, sessions) });
	try {
		await session.bindExtensions({ mode: "print" });
		const active = session.getActiveToolNames();
		const missing = tools.filter((name) => !active.includes(name));
		if (missing.length) throw new Error(`${role} missing tools: ${missing.join(", ")}`);
		const bash = session.agent.state.tools.find((tool) => tool.name === "bash");
		let output: unknown; let protectedCommand: unknown;
		if (bash) {
			const args = { command: "git log -1 --oneline" };
			const toolCall = { type: "toolCall" as const, id: `probe-${role}`, name: "bash", arguments: args };
			await session.agent.beforeToolCall!({ toolCall, args } as never);
			if (args.command !== "git log -1 --oneline") throw new Error(`${role}: shell command was rewritten`);
			const result = await bash.execute(toolCall.id, args);
			await session.agent.afterToolCall!({ toolCall, args, result, isError: false } as never);
			output = result.content;
			const guarded = { command: "git push --force origin main" };
			protectedCommand = await session.agent.beforeToolCall!({ toolCall: { ...toolCall, id: `guard-${role}`, arguments: guarded }, args: guarded } as never);
			if (!(protectedCommand as any)?.block || !/Ein safety policy blocked/.test((protectedCommand as any).reason)) throw new Error(`${role}: guard did not block`);
		}
		results.push({ role, active, protectedCommand, output });
	} finally { session.dispose(); }
}
console.log(JSON.stringify(results));
