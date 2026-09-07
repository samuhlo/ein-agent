import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, initTheme, parseFrontmatter, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

// Run in an isolated process: Pi caches extension modules and owns runtime state.
const [agentPath, cwd, agentDir] = process.argv.slice(2) as [string, string, string];
const { frontmatter } = parseFrontmatter<Record<string, string>>(readFileSync(agentPath, "utf8"));
const tools = frontmatter.tools!.split(",").map((name) => name.trim());
const extensionPaths = (frontmatter.subagentOnlyExtensions ?? "").split(",").filter(Boolean).map((path) => resolve(dirname(agentPath), path.trim()));
const settingsManager = SettingsManager.inMemory({});
initTheme("dark");
const loader = new DefaultResourceLoader({
	cwd, agentDir, settingsManager, noExtensions: true,
	noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
	additionalExtensionPaths: extensionPaths,
});
await loader.reload();
const extensions = loader.getExtensions();
if (extensions.errors.length) throw new Error(JSON.stringify(extensions.errors));
const { session } = await createAgentSession({ cwd, agentDir, tools, settingsManager, resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd) });
try {
	await session.bindExtensions({ mode: "print" });
	const active = session.getActiveToolNames();
	const missing = tools.filter((name) => !active.includes(name));
	if (missing.length) throw new Error(`Cleaner child tools unavailable: ${missing.join(", ")}`);
	const evidenceTool = session.agent.state.tools.find((tool) => tool.name === "ein_cleaner_evidence")!;
	const result = await evidenceTool.execute("cleaner-child-probe", { scope: { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] } });
	console.log(JSON.stringify({ active, registered: extensions.extensions.flatMap((extension) => [...extension.tools.keys()]), handlers: extensions.extensions.flatMap((extension) => [...extension.handlers.keys()]), evidence: result.details }));
} finally {
	session.dispose();
}
