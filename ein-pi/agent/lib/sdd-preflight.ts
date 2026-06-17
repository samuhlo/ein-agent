import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AGENT_DIR } from "../extensions/ein-paths";
import { type TddMode, readTddMode } from "./tdd";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

export type SddExecutionMode = "interactive" | "auto";
export type SddArtifactStore = "openspec" | "engram" | "both";
export type SddChainedPrStrategy =
	| "auto-forecast"
	| "ask-always"
	| "single-pr-default"
	| "force-chained";
export interface SddPreflightPreferences {
	executionMode: SddExecutionMode;
	artifactStore: SddArtifactStore;
	chainedPrStrategy: SddChainedPrStrategy;
	reviewBudgetLines: number;
	tddMode: TddMode;
	engramAvailable: boolean;
	prompted: boolean;
}

interface SddPreflightCallbacks {
	pi: ExtensionAPI;
	installAssets?: (cwd: string) =>
		| {
				agents: number;
				chains: number;
				support: number;
				skipped: number;
				installed: number;
		  }
		| Promise<{
				agents: number;
				chains: number;
				support: number;
				skipped: number;
				installed: number;
		  }>;
	applyModelConfig?: (
		cwd: string,
	) =>
		| { updated: number; skipped: number; invalidPath?: string }
		| Promise<{ updated: number; skipped: number; invalidPath?: string }>;
}

const DEFAULT_SDD_PREFLIGHT: SddPreflightPreferences = {
	executionMode: "interactive",
	artifactStore: "openspec",
	chainedPrStrategy: "auto-forecast",
	reviewBudgetLines: 400,
	tddMode: "auto",
	engramAvailable: false,
	prompted: false,
};

const sddPreflightBySession = new Map<string, SddPreflightPreferences>();
const sddPreflightInFlight = new Map<string, Promise<SddPreflightPreferences>>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyDirectoryFiles(
	sourceDir: string,
	targetDir: string,
	force: boolean,
): { copied: number; skipped: number } {
	if (!existsSync(sourceDir)) return { copied: 0, skipped: 0 };
	mkdirSync(targetDir, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = join(sourceDir, entry.name);
		const targetPath = join(targetDir, entry.name);
		if (entry.isDirectory()) {
			const child = copyDirectoryFiles(sourcePath, targetPath, force);
			copied += child.copied;
			skipped += child.skipped;
			continue;
		}
		if (!entry.isFile()) continue;
		if (!force && existsSync(targetPath)) {
			skipped += 1;
			continue;
		}
		writeFileSync(targetPath, readFileSync(sourcePath));
		copied += 1;
	}
	return { copied, skipped };
}

export function installSddAssets(
	_cwd: string,
	force: boolean,
): { agents: number; chains: number; support: number; skipped: number; installed: number } {
	const agents = copyDirectoryFiles(
		join(ASSETS_DIR, "agents"),
		join(AGENT_DIR, "agents"),
		force,
	);
	const chains = copyDirectoryFiles(
		join(ASSETS_DIR, "chains"),
		join(AGENT_DIR, "chains"),
		force,
	);
	const support = copyDirectoryFiles(
		join(ASSETS_DIR, "support"),
		join(AGENT_DIR, "gentle-ai", "support"),
		force,
	);
	return {
		agents: agents.copied + agents.skipped,
		chains: chains.copied + chains.skipped,
		support: support.copied + support.skipped,
		skipped: agents.skipped + chains.skipped + support.skipped,
		installed: agents.copied + chains.copied + support.copied,
	};
}

// Cuenta archivos de assets/ (agents, chains) que faltan o difieren de la
// copia instalada en AGENT_DIR. Usado por /ein:status para detectar drift.
export function sddGlobalAssetDriftCount(): number {
	let stale = 0;
	for (const subdir of ["agents", "chains"] as const) {
		const assetDir = join(ASSETS_DIR, subdir);
		if (!existsSync(assetDir)) continue;
		for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const installedPath = join(AGENT_DIR, subdir, entry.name);
			try {
				if (!existsSync(installedPath)) {
					stale += 1;
					continue;
				}
				if (
					readFileSync(join(assetDir, entry.name), "utf8") !==
					readFileSync(installedPath, "utf8")
				) {
					stale += 1;
				}
			} catch {
				stale += 1;
			}
		}
	}
	return stale;
}

export function isSddPreflightTrigger(text: string): boolean {
	const trimmed = text.trim();
	if (/^\/sdd(?:[-:][^\s]*)?(?:\s|$)/i.test(trimmed)) return true;
	if (/[?？]\s*$/.test(trimmed)) return false;
	if (
		/\b(?:don't|do\s+not|not\s+use|never\s+use|without\s+using|sin\s+usar|no\s+(?:quiero|queremos|vamos\s+a)?\s*usar)\s+sdd\b/i.test(
			trimmed,
		)
	) {
		return false;
	}
	return [
		/^(?:please\s+)?(?:use|run|start)\s+(?:the\s+|an?\s+)?sdd(?:\s+(?:flow|process|workflow|plan))?\b/i,
		/^(?:please\s+)?(?:do|handle|implement)\b.+\b(?:with|using)\s+(?:the\s+|an?\s+)?sdd\b/i,
		/^(?:por\s+favor[\s,]+)?(?:vamos|vayamos)\s+con\s+(?:el\s+)?sdd\b/i,
		/^(?:por\s+favor[\s,]+)?(?:usa|usá|usemos|corre|corré|arranca|arrancá|inicia|iniciá|empeza|empezá)\s+(?:el\s+)?sdd\b/i,
		/^(?:por\s+favor[\s,]+)?(?:hacelo|hazlo|hacerlo)\s+(?:con|usando)\s+(?:el\s+)?sdd\b/i,
	].some((pattern) => pattern.test(trimmed));
}

export function sddPreflightSessionKey(ctx: ExtensionContext): string {
	const manager = (ctx as unknown as { sessionManager?: unknown }).sessionManager;
	if (isRecord(manager)) {
		const getSessionFile = manager.getSessionFile;
		if (typeof getSessionFile === "function") {
			const value = getSessionFile.call(manager);
			if (typeof value === "string" && value.length > 0) return value;
		}
		const getSessionId = manager.getSessionId;
		if (typeof getSessionId === "function") {
			const value = getSessionId.call(manager);
			if (typeof value === "string" && value.length > 0) return value;
		}
	}
	return ctx.cwd;
}

function hasWritableEngramTool(pi: ExtensionAPI): boolean {
	try {
		const getActiveTools = (pi as unknown as { getActiveTools?: () => unknown[] })
			.getActiveTools;
		if (typeof getActiveTools !== "function") return false;
		const tools = getActiveTools.call(pi);
		return tools.some((tool) => {
			const name =
				typeof tool === "string"
					? tool
					: isRecord(tool) && typeof tool.name === "string"
						? tool.name
						: "";
			return (
				name === "mem_save" ||
				name === "engram_mem_save" ||
				name.endsWith(".mem_save") ||
				name.endsWith(".engram_mem_save")
			);
		});
	} catch {
		return false;
	}
}

function normalizeSddReviewBudget(value: string): number {
	const parsed = Number.parseInt(value.trim(), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 400;
}

// Decisión de TDD por TAREA cuando el modo global es "ask". El parent no
// recupera control entre design y apply dentro de un chain, así que el "ask"
// se resuelve de forma DETERMINISTA aquí (un ctx.ui.select real), no como
// instrucción de prompt al padre (que en un chain nunca dispara).
const tddRunOverride = new Map<string, TddMode>();

// Modo de TDD sin preguntar: override de la tarea si existe; si el global es
// "ask" pero aún no se preguntó, cae a "auto" (no bloquea ni asume estricto).
function resolveTddNoAsk(ctx: ExtensionContext): TddMode {
	const override = tddRunOverride.get(sddPreflightSessionKey(ctx));
	if (override) return override;
	const global = readTddMode(ctx.cwd);
	return global === "ask" ? "auto" : global;
}

// Pregunta el TDD de la tarea cuando el global es "ask". Lo llama el input hook
// en cada disparo explícito de SDD → se pregunta por tarea, no una vez por
// sesión. No-op si no hay UI o el modo no es "ask".
export async function askRunTddMode(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI || readTddMode(ctx.cwd) !== "ask") return;
	const picked = await ctx.ui.select(
		"TDD estricto para esta tarea SDD (UI/visual/trivial → off)",
		["off", "strict"],
	);
	const mode: TddMode = picked === "strict" ? "strict" : "off";
	const key = sddPreflightSessionKey(ctx);
	tddRunOverride.set(key, mode);
	const cached = sddPreflightBySession.get(key);
	if (cached) cached.tddMode = mode;
	ctx.ui.notify(`TDD para esta tarea: ${mode}`, "info");
}

async function collectSddPreflightPreferences(
	ctx: ExtensionContext,
	engramAvailable: boolean,
): Promise<SddPreflightPreferences> {
	if (!ctx.hasUI) return { ...DEFAULT_SDD_PREFLIGHT, tddMode: resolveTddNoAsk(ctx), engramAvailable };
	const executionMode = await ctx.ui.select("SDD execution mode", [
		"interactive",
		"auto",
	]);
	const artifactOptions = engramAvailable
		? ["openspec", "engram", "both"]
		: ["openspec"];
	const artifactStore = await ctx.ui.select("SDD artifact store", artifactOptions);
	const chainedPrStrategy = await ctx.ui.select("SDD PR chaining", [
		"auto-forecast",
		"ask-always",
		"single-pr-default",
		"force-chained",
	]);
	const reviewBudgetLines = normalizeSddReviewBudget(
		(await ctx.ui.input("SDD review budget lines", "400")) ?? "400",
	);
	return {
		executionMode:
			executionMode === "auto" ? "auto" : DEFAULT_SDD_PREFLIGHT.executionMode,
		artifactStore:
			artifactStore === "engram" || artifactStore === "both"
				? artifactStore
				: DEFAULT_SDD_PREFLIGHT.artifactStore,
		chainedPrStrategy:
			chainedPrStrategy === "ask-always" ||
			chainedPrStrategy === "single-pr-default" ||
			chainedPrStrategy === "force-chained"
				? chainedPrStrategy
				: DEFAULT_SDD_PREFLIGHT.chainedPrStrategy,
		reviewBudgetLines,
		tddMode: resolveTddNoAsk(ctx),
		engramAvailable,
		prompted: true,
	};
}

function tddPreflightLine(mode: TddMode): string {
	switch (mode) {
		case "off":
			return "- Strict TDD: OFF for this work — do NOT run the RED/GREEN/TRIANGULATE/REFACTOR cycle. Implement directly with minimal, focused changes. This OVERRIDES `openspec/config.yaml` `strict_tdd`. (Chosen for trivial/visual/low-risk work; don't waste tokens on a TDD loop.)";
		case "strict":
			return "- Strict TDD: ON (forced) — follow RED → GREEN → TRIANGULATE → REFACTOR with evidence in `apply-progress.md`, regardless of project config.";
		case "ask":
			// No debería llegar: el modo "ask" se resuelve a off/strict por tarea
			// (askRunTddMode) antes de renderizar. Fallback seguro = config.
			return "- Strict TDD: AUTO — follow `openspec/config.yaml` `strict_tdd` (default behavior).";
		default:
			return "- Strict TDD: AUTO — follow `openspec/config.yaml` `strict_tdd` (default behavior).";
	}
}

export function renderSddPreflightPrompt(prefs: SddPreflightPreferences): string {
	const sourceLine = prefs.prompted
		? "The user already chose these SDD preferences for this Pi session. Reuse them unless the user explicitly changes them."
		: "No interactive UI was available for SDD preflight, so these default preferences were applied for this Pi session. Ask the user before making delivery decisions that depend on them.";
	return [
		"## SDD Session Preflight",
		sourceLine,
		`- Execution mode: ${prefs.executionMode}`,
		`- Artifact store: ${prefs.artifactStore}${prefs.engramAvailable ? "" : " (Engram unavailable in this session)"}`,
		`- Chained PR strategy: ${prefs.chainedPrStrategy}`,
		`- Review budget: ${prefs.reviewBudgetLines} changed lines`,
		tddPreflightLine(prefs.tddMode),
		"- If task/workload forecasts conflict with these preferences, pause before sdd-apply and ask the user for a delivery decision.",
	].join("\n");
}

export async function ensureSddPreflight(
	ctx: ExtensionContext,
	callbacks: SddPreflightCallbacks,
): Promise<SddPreflightPreferences> {
	const sessionKey = sddPreflightSessionKey(ctx);
	const existing = sddPreflightBySession.get(sessionKey);
	if (existing) return existing;
	const inFlight = sddPreflightInFlight.get(sessionKey);
	if (inFlight) return inFlight;
	const promise = (async () => {
		const engramAvailable = hasWritableEngramTool(callbacks.pi);
		const prefs = await collectSddPreflightPreferences(ctx, engramAvailable);
		const result =
			(await callbacks.installAssets?.(ctx.cwd)) ??
			installSddAssets(ctx.cwd, false);
		const modelResult = (await callbacks.applyModelConfig?.(ctx.cwd)) ?? {
			updated: 0,
			skipped: 0,
		};
		if (ctx.hasUI) {
			const modelRoutingLine = modelResult.invalidPath
				? `Model routing skipped: ${modelResult.invalidPath} is invalid JSON or not an object.`
				: `Model-routed agents updated: ${modelResult.updated}`;
			ctx.ui.notify(
				[
					"Gentle AI SDD preflight complete.",
					`Mode: ${prefs.executionMode}`,
					`Artifacts: ${prefs.artifactStore}`,
					`PR chaining: ${prefs.chainedPrStrategy}`,
					`Review budget: ${prefs.reviewBudgetLines} changed lines`,
					`Strict TDD: ${prefs.tddMode}`,
					`Preference source: ${prefs.prompted ? "user prompt" : "defaults (no interactive UI available)"}`,
					`Global SDD assets ready: ${result.agents} agent(s), ${result.chains} chain(s), ${result.support} support file(s) available (${result.skipped} already present).`,
					modelRoutingLine,
				].join("\n"),
				modelResult.invalidPath ? "warning" : "info",
			);
		}
		sddPreflightBySession.set(sessionKey, prefs);
		return prefs;
	})();
	sddPreflightInFlight.set(sessionKey, promise);
	try {
		return await promise;
	} finally {
		sddPreflightInFlight.delete(sessionKey);
	}
}

export function getSddPreflightPreferences(
	ctx: ExtensionContext,
): SddPreflightPreferences | undefined {
	return sddPreflightBySession.get(sddPreflightSessionKey(ctx));
}
