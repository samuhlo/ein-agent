// =============================================================================
// EIN SKILL MAINTENANCE
// =============================================================================
// Refresca los skills curados desde sus repos fuente, para el comando manual
// `/ein:skills`. Dos grupos declarados en stack-profile.json:
//   - local: skills propias de Ein (sincronizadas desde el repo ein-agent).
//   - downloaded: set curado de repos públicos de confianza (catálogo).
//
// Es un CURADOR, no un runtime: los skills viven vendorizados/desplegados y Pi
// los descubre nativo (settings.json `skills` + enableSkillCommands). Esto solo
// los pone al día con un `git clone --sparse` + copiar. Sin lock file, sin
// hashes, sin reconcile — clonar trae lo último, copiar sobrescribe. Lo no
// listado en el perfil se cubre con Context7 on-demand.
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, slashCommand } from "./ein-brand";
import { DOWNLOADED_SKILLS_DIR, LOCAL_SKILLS_DIR } from "./ein-paths";
import { t, tf } from "../lib/i18n/strings";

type CatalogEntry = { repo: string; skill: string };
type StackProfile = { name: string; version: number; core: string[]; secondary: string[]; catalog: Record<string, CatalogEntry> };
type InstalledSkill = { path: string; source: "local" | "downloaded" };

const PROFILE_PATH = join(DOWNLOADED_SKILLS_DIR, "..", "stack-profile.json");
const LOCAL_REPO = "samuhlo/ein-agent";
const LOCAL_REPO_SKILLS_PATH = "ein-pi/agent/skills/local";

const FALLBACK_PROFILE: StackProfile = { name: "ein-web-motion-stack", version: 1, core: [], secondary: [], catalog: {} };

function normalize(input: string): string {
	return input.trim().toLowerCase();
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureDirs(): void {
	mkdirSync(DOWNLOADED_SKILLS_DIR, { recursive: true });
	mkdirSync(LOCAL_SKILLS_DIR, { recursive: true });
}

function parseCatalog(value: unknown): Record<string, CatalogEntry> {
	const out: Record<string, CatalogEntry> = {};
	if (!isRecord(value)) return out;
	for (const [key, entry] of Object.entries(value)) {
		if (isRecord(entry) && typeof entry.repo === "string" && typeof entry.skill === "string") {
			out[normalize(key)] = { repo: entry.repo, skill: entry.skill };
		}
	}
	return out;
}

function loadProfile(): StackProfile {
	ensureDirs();
	if (!existsSync(PROFILE_PATH)) return FALLBACK_PROFILE;
	try {
		const raw: unknown = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
		if (!isRecord(raw)) return FALLBACK_PROFILE;
		const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").map(normalize) : []);
		return {
			name: typeof raw.name === "string" ? raw.name : FALLBACK_PROFILE.name,
			version: typeof raw.version === "number" ? raw.version : 1,
			core: strings(raw.core),
			secondary: strings(raw.secondary),
			catalog: parseCatalog(raw.catalog),
		};
	} catch {
		return FALLBACK_PROFILE;
	}
}

function listInstalled(): Map<string, InstalledSkill> {
	const out = new Map<string, InstalledSkill>();
	for (const { root, source } of [
		{ root: LOCAL_SKILLS_DIR, source: "local" as const },
		{ root: DOWNLOADED_SKILLS_DIR, source: "downloaded" as const },
	]) {
		if (!existsSync(root)) continue;
		for (const entry of readdirSync(root)) {
			const dir = join(root, entry);
			try {
				if (statSync(dir).isDirectory() && existsSync(join(dir, "SKILL.md"))) out.set(normalize(entry), { path: dir, source });
			} catch { /* ignora entradas ilegibles */ }
		}
	}
	return out;
}

function copySkillFolder(sourceDir: string, targetDir: string): void {
	rmSync(targetDir, { recursive: true, force: true });
	cpSync(sourceDir, targetDir, { recursive: true });
}

// Busca el directorio de un skill (que contenga SKILL.md) dentro de un clon.
function findSkillDir(root: string, skill: string): string | null {
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		if (current.endsWith(`/${skill}`) && existsSync(join(current, "SKILL.md"))) return current;
		let entries: string[] = [];
		try { entries = readdirSync(current); } catch { continue; }
		for (const entry of entries) {
			if (entry === ".git" || entry === "node_modules" || entry === "dist" || entry === "build") continue;
			const full = join(current, entry);
			try { if (statSync(full).isDirectory()) stack.push(full); } catch { /* ignora */ }
		}
	}
	return null;
}

function shallowClone(repo: string, targetDir: string, sparsePath?: string): void {
	const args = ["clone", "--depth", "1", "--filter=blob:none"];
	if (sparsePath) args.push("--sparse");
	args.push(`https://github.com/${repo}.git`, targetDir);
	execFileSync("git", args, { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: "ignore", timeout: 60_000 });
	if (sparsePath) {
		try { execFileSync("git", ["-C", targetDir, "sparse-checkout", "set", sparsePath], { stdio: "ignore", timeout: 30_000 }); } catch { /* el clone blobless ya trae el árbol */ }
	}
}

// Instala/refresca un skill del catálogo: clona su repo, copia la carpeta. Sin
// hash ni lock — el clon trae lo último y la copia sobrescribe.
function installFromCatalog(skillName: string, profile: StackProfile): { ok: boolean; message: string } {
	const key = normalize(skillName);
	const source = profile.catalog[key];
	if (!source) return { ok: false, message: `\`${key}\` no está en el catálogo. Añádelo a stack-profile.json o usa Context7.` };
	const tempRoot = join(tmpdir(), `pi-skill-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	const repoDir = join(tempRoot, "repo");
	mkdirSync(tempRoot, { recursive: true });
	try {
		shallowClone(source.repo, repoDir);
		const skillDir = findSkillDir(repoDir, source.skill) ?? findSkillDir(repoDir, key);
		if (!skillDir) return { ok: false, message: `clonado ${source.repo}, pero no encuentro ${source.skill}/SKILL.md.` };
		copySkillFolder(skillDir, join(DOWNLOADED_SKILLS_DIR, key));
		return { ok: true, message: `${key} ← ${source.repo}#${source.skill}` };
	} catch (error) {
		return { ok: false, message: `${key}: ${error instanceof Error ? error.message : String(error)}` };
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
}

function updateDownloaded(profile: StackProfile, onProgress?: (line: string) => void): string[] {
	const installed = listInstalled();
	const lines: string[] = [];
	let ok = 0;
	let noCatalog = 0;
	let failed = 0;
	for (const skill of [...profile.core, ...profile.secondary]) {
		if (installed.get(skill)?.source === "local") continue; // las locales van por su repo
		if (!profile.catalog[skill]) { lines.push(`- ${skill}: sin catálogo (usa Context7)`); noCatalog += 1; continue; }
		onProgress?.(`↓ ${skill}…`);
		const result = installFromCatalog(skill, profile);
		lines.push(`- ${result.ok ? "OK" : "FAIL"} ${result.message}`);
		if (result.ok) ok += 1;
		else failed += 1;
	}
	return [tf("skills.dl.counts2", `- Bajadas: ${ok} OK · ${noCatalog} sin catálogo · ${failed} fallos`, ok, noCatalog, failed), "", ...lines];
}

function updateLocalFromRepo(onProgress?: (line: string) => void): string[] {
	const tempRoot = join(tmpdir(), `pi-local-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	const repoDir = join(tempRoot, "repo");
	mkdirSync(tempRoot, { recursive: true });
	let count = 0;
	try {
		onProgress?.(t("skills.local.cloning", "Clonando ein-agent (skills locales)…"));
		shallowClone(LOCAL_REPO, repoDir, LOCAL_REPO_SKILLS_PATH);
		const remoteLocalDir = join(repoDir, LOCAL_REPO_SKILLS_PATH);
		if (!existsSync(remoteLocalDir)) return [`- Local: FAIL no encuentro ${LOCAL_REPO_SKILLS_PATH} en ${LOCAL_REPO}`];
		for (const entry of readdirSync(remoteLocalDir)) {
			const remoteSkillDir = join(remoteLocalDir, entry);
			try {
				if (!statSync(remoteSkillDir).isDirectory() || !existsSync(join(remoteSkillDir, "SKILL.md"))) continue;
			} catch { continue; }
			copySkillFolder(remoteSkillDir, join(LOCAL_SKILLS_DIR, entry));
			count += 1;
		}
	} catch (error) {
		return [`- Local: FAIL ${error instanceof Error ? error.message : String(error)}`];
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
	return [tf("skills.local.summary2", `- Locales (${LOCAL_REPO}@main): ${count} copiadas`, LOCAL_REPO, count)];
}

function statusReport(profile: StackProfile): string {
	const installed = listInstalled();
	const allowed = new Set([...profile.core, ...profile.secondary]);
	const coreMissing = profile.core.filter((name) => !installed.has(name));
	const extras = [...installed.entries()].filter(([name, meta]) => meta.source === "downloaded" && !allowed.has(name)).map(([name]) => name).sort();
	const local = [...installed.values()].filter((m) => m.source === "local").length;
	const downloaded = [...installed.values()].filter((m) => m.source === "downloaded").length;
	const lines = [
		"// 000. skills",
		tf("skills.status.profile", `- Perfil: ${profile.name} (v${profile.version})`, profile.name, profile.version),
		tf("skills.status.counts", `- Instaladas: ${local} locales · ${downloaded} bajadas`, local, downloaded),
		tf("skills.status.core2", `- Core: ${profile.core.length - coreMissing.length}/${profile.core.length}`, profile.core.length - coreMissing.length, profile.core.length),
		"",
	];
	if (coreMissing.length) lines.push(tf("skills.status.missing_core", `- Faltan core: ${coreMissing.join(", ")}`, coreMissing.join(", ")));
	if (extras.length) lines.push(tf("skills.status.offstack", `- Fuera de stack: ${extras.join(", ")}`, extras.join(", ")));
	if (!coreMissing.length && !extras.length) lines.push(t("skills.status.ok", "- Estado OK: stack alineado."));
	lines.push("", tf("skills.status.commands", `- Comandos: ${slashCommand("skills")} update [--local|--downloaded] | add <skill> | clean [--yes]`, slashCommand("skills")));
	lines.push(t("skills.status.context7", "- Lo no listado en el perfil se cubre con Context7 on-demand."));
	return lines.join("\n");
}

function cleanSkills(profile: StackProfile, force: boolean): string {
	const installed = listInstalled();
	const allowed = new Set([...profile.core, ...profile.secondary]);
	const candidates = [...installed.entries()].filter(([name, meta]) => meta.source === "downloaded" && !allowed.has(name)).map(([name, meta]) => ({ name, path: meta.path })).sort((a, b) => a.name.localeCompare(b.name));
	if (!candidates.length) return t("skills.clean.nothing", "// 000. skills clean\n- Nada que limpiar en downloaded/.");
	if (!force) {
		return [
			"// 000. skills clean",
			tf("skills.clean.count", `- ${candidates.length} skills fuera de stack en downloaded/.`, candidates.length),
			tf("skills.clean.run", `- Ejecuta ${slashCommand("skills")} clean --yes para borrarlas.`, slashCommand("skills")),
			tf("skills.clean.candidates", `- Candidatas: ${candidates.map((c) => c.name).join(", ")}`, candidates.map((c) => c.name).join(", ")),
		].join("\n");
	}
	for (const candidate of candidates) rmSync(candidate.path, { recursive: true, force: true });
	return ["// 000. skills clean", tf("skills.clean.removed", `- Eliminadas: ${candidates.length}`, candidates.length), tf("skills.clean.list", `- Lista: ${candidates.map((c) => c.name).join(", ")}`, candidates.map((c) => c.name).join(", "))].join("\n");
}

export default function einSkillMaintenance(pi: ExtensionAPI): void {
	pi.registerCommand(commandName("skills"), {
		description: t("cmd.skills.description", "Gestion de skills: status, update [--local|--downloaded], add, clean"),
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify(tf("busy.retry", `El agente esta ocupado. Reintenta ${slashCommand("skills")} al terminar.`, slashCommand("skills")), "warning");
				return;
			}
			const profile = loadProfile();
			const tokens = (args || "").trim().split(/\s+/).filter(Boolean);
			const action = normalize(tokens[0] || "status");

			if (action === "status") {
				ctx.ui.notify(statusReport(profile), "info");
				return;
			}
			if (action === "add") {
				const result = installFromCatalog(tokens[1] || "", profile);
				ctx.ui.notify(`// 000. skills add\n- ${result.ok ? "OK" : "FAIL"} ${result.message}`, "info");
				return;
			}
			if (action === "clean") {
				ctx.ui.notify(cleanSkills(profile, tokens.includes("--yes")), "info");
				return;
			}
			if (action === "update") {
				const onlyLocal = tokens.includes("--local");
				const onlyDownloaded = tokens.includes("--downloaded");
				ctx.ui.notify(t("skills.updating", "// 000. updating skills\nClonando fuentes, puede tardar…"), "info");
				const out: string[] = ["// 000. skills update"];
				if (!onlyDownloaded) out.push(...updateLocalFromRepo((line) => ctx.ui.notify(line, "info")));
				if (!onlyLocal) out.push(...updateDownloaded(profile, (line) => ctx.ui.notify(line, "info")));
				ctx.ui.notify(out.join("\n"), "info");
				return;
			}
			ctx.ui.notify(["// 000. skills", tf("skills.usage", `- Uso: ${slashCommand("skills")} [status|update [--local|--downloaded]|add <skill>|clean [--yes]]`, slashCommand("skills"))].join("\n"), "info");
		},
	});
}
