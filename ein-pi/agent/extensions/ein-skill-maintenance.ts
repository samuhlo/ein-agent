// =============================================================================
// EIN SKILL MAINTENANCE
// =============================================================================
// Mantenedor curado de skills. Dos grupos:
//   - downloaded: traidas desde repos publicos de confianza declarados en
//     stack-profile.json
//   - local: skills propias de Ein, sincronizadas desde el repo ein-agent de GitHub
// Reconcilia contra skills-lock.json (hashes de contenido) y limpia downloaded
// que no pertenezcan al set core+secondary del perfil.
// =============================================================================

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, slashCommand } from "./ein-brand";
import { AGENT_DIR, DOWNLOADED_SKILLS_DIR, LOCAL_SKILLS_DIR } from "./ein-paths";
import { t, tf } from "../lib/i18n/strings";

// --- tipos --------------------------------------------------------------------

type CatalogEntry = { repo: string; skill: string };

type StackProfile = {
  name: string;
  version: number;
  core: string[];
  secondary: string[];
  catalog: Record<string, CatalogEntry>;
};

// Discriminador: downloaded lleva { repo, skill }; local lleva { repo, path }.
type LockSource = { repo: string; skill?: string; path?: string };

type LockEntry = {
  name: string;
  source: LockSource;
  hash: string;
  installedAt: string;
};

type LockFile = {
  version: number;
  updatedAt: string;
  entries: Record<string, LockEntry>;
};

type SyncStatus = "installed" | "updated" | "unchanged";

type SyncResult = { ok: boolean; status: SyncStatus; message: string };

type InstalledSkill = { path: string; source: "local" | "downloaded" };

// --- constantes --------------------------------------------------------------

const SKILLS_DIR = join(AGENT_DIR, "skills");
const PROFILE_PATH = join(SKILLS_DIR, "stack-profile.json");
const LOCK_PATH = join(SKILLS_DIR, "skills-lock.json");

// Fuente de verdad para skills locales.
const LOCAL_REPO = "samuhlo/ein-agent";
const LOCAL_REPO_SKILLS_PATH = "ein-pi/agent/skills/local";

// FAIL CLOSED -> Si stack-profile.json falta o no parsea, devolvemos el minimo
// vital; el perfil en disco es la fuente de verdad real.
const FALLBACK_PROFILE: StackProfile = {
  name: "ein-web-motion-stack",
  version: 1,
  core: [],
  secondary: [],
  catalog: {},
};

// --- helpers ------------------------------------------------------------------

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureFiles(): void {
  mkdirSync(SKILLS_DIR, { recursive: true });
  mkdirSync(DOWNLOADED_SKILLS_DIR, { recursive: true });
  mkdirSync(LOCAL_SKILLS_DIR, { recursive: true });
  if (!existsSync(LOCK_PATH)) {
    const empty: LockFile = { version: 1, updatedAt: new Date().toISOString(), entries: {} };
    writeFileSync(LOCK_PATH, JSON.stringify(empty, null, 2), "utf8");
  }
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
  ensureFiles();
  if (!existsSync(PROFILE_PATH)) return FALLBACK_PROFILE;
  try {
    const raw: unknown = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
    if (!isRecord(raw)) return FALLBACK_PROFILE;
    const core = Array.isArray(raw.core) ? raw.core.filter((x): x is string => typeof x === "string") : [];
    const secondary = Array.isArray(raw.secondary)
      ? raw.secondary.filter((x): x is string => typeof x === "string")
      : [];
    return {
      name: typeof raw.name === "string" ? raw.name : FALLBACK_PROFILE.name,
      version: typeof raw.version === "number" ? raw.version : 1,
      core: core.map(normalize),
      secondary: secondary.map(normalize),
      catalog: parseCatalog(raw.catalog),
    };
  } catch {
    return FALLBACK_PROFILE;
  }
}

function loadLock(): LockFile {
  ensureFiles();
  try {
    const parsed: unknown = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    if (isRecord(parsed) && isRecord(parsed.entries)) {
      return {
        version: 1,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        entries: parsed.entries as Record<string, LockEntry>,
      };
    }
  } catch {
    // fall through
  }
  return { version: 1, updatedAt: new Date().toISOString(), entries: {} };
}

function saveLock(lock: LockFile): void {
  lock.updatedAt = new Date().toISOString();
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2), "utf8");
}

function listInstalled(): Map<string, InstalledSkill> {
  const out = new Map<string, InstalledSkill>();
  const roots: Array<{ root: string; source: "local" | "downloaded" }> = [
    { root: LOCAL_SKILLS_DIR, source: "local" },
    { root: DOWNLOADED_SKILLS_DIR, source: "downloaded" },
  ];
  for (const root of roots) {
    if (!existsSync(root.root)) continue;
    for (const entry of readdirSync(root.root)) {
      const dir = join(root.root, entry);
      if (!statSync(dir).isDirectory()) continue;
      if (existsSync(join(dir, "SKILL.md"))) out.set(normalize(entry), { path: dir, source: root.source });
    }
  }
  return out;
}

function folderHash(root: string): string {
  const files: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const relative = `${prefix}${name}`;
      if (statSync(full).isDirectory()) walk(full, `${relative}/`);
      else files.push(relative);
    }
  };
  walk(root, "");
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative);
    hash.update(readFileSync(join(root, relative)));
  }
  return hash.digest("hex");
}

function copySkillFolder(sourceDir: string, targetDir: string): void {
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

function findSkillDir(root: string, skill: string): string | null {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    if (current.endsWith(`/${skill}`) && existsSync(join(current, "SKILL.md"))) return current;
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules" || entry === "dist" || entry === "build") continue;
      const full = join(current, entry);
      try {
        if (statSync(full).isDirectory()) stack.push(full);
      } catch {
        continue;
      }
    }
  }
  return null;
}

function shallowClone(repo: string, targetDir: string, sparsePath?: string): void {
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (sparsePath) args.push("--sparse");
  args.push(`https://github.com/${repo}.git`, targetDir);
  execFileSync("git", args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: "ignore",
    timeout: 60_000,
  });
  if (sparsePath) {
    try {
      execFileSync("git", ["-C", targetDir, "sparse-checkout", "set", sparsePath], {
        stdio: "ignore",
        timeout: 30_000,
      });
    } catch {
      // BLINDAJE -> Si sparse-checkout falla, el clone blobless ya trae todo el
      // arbol; seguimos adelante.
    }
  }
}

// --- downloaded: skills de catalogo -----------------------------------------

function installFromCatalog(skillName: string, profile: StackProfile): SyncResult {
  const key = normalize(skillName);
  const source = profile.catalog[key];
  if (!source) {
    return {
      ok: false,
      status: "unchanged",
      message: `No encuentro \`${key}\` en el catalogo. Editalo en ${PROFILE_PATH} o usa Context7.`,
    };
  }

  const tempRoot = join(tmpdir(), `pi-skill-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const repoDir = join(tempRoot, "repo");
  const destinationDir = join(DOWNLOADED_SKILLS_DIR, key);
  mkdirSync(tempRoot, { recursive: true });

  try {
    shallowClone(source.repo, repoDir);
    const skillDir = findSkillDir(repoDir, source.skill) ?? findSkillDir(repoDir, key);
    if (!skillDir) {
      return {
        ok: false,
        status: "unchanged",
        message: `Clonado ${source.repo}, pero no encuentro ${source.skill}/SKILL.md.`,
      };
    }

    const remoteHash = folderHash(skillDir);
    const lock = loadLock();
    const currentLock = lock.entries[key];
    const hadInstall = existsSync(destinationDir);
    let currentInstalledHash = "";
    if (hadInstall) {
      try {
        currentInstalledHash = folderHash(destinationDir);
      } catch {
        currentInstalledHash = "";
      }
    }

    if (currentLock?.hash === remoteHash || (currentInstalledHash && currentInstalledHash === remoteHash)) {
      if (!currentLock) {
        lock.entries[key] = { name: key, source, hash: remoteHash, installedAt: new Date().toISOString() };
        saveLock(lock);
      }
      return {
        ok: true,
        status: "unchanged",
        message: `Sin cambios \`${key}\` (${source.skill}, ${remoteHash.slice(0, 12)}).`,
      };
    }

    copySkillFolder(skillDir, destinationDir);
    const finalHash = folderHash(destinationDir);
    lock.entries[key] = { name: key, source, hash: finalHash, installedAt: new Date().toISOString() };
    saveLock(lock);
    return {
      ok: true,
      status: hadInstall ? "updated" : "installed",
      message: `${hadInstall ? "Actualizada" : "Instalada"} \`${key}\` desde ${source.repo} (${source.skill}, ${finalHash.slice(0, 12)}).`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, status: "unchanged", message: `Fallo \`${key}\`: ${reason}` };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function updateDownloaded(profile: StackProfile, onProgress?: (line: string) => void): string[] {
  const installed = listInstalled();
  const targets = [...profile.core, ...profile.secondary];
  const lines: string[] = [];
  let installedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedLocal = 0;
  let noCatalog = 0;
  let failed = 0;

  for (const skill of targets) {
    const meta = installed.get(skill);
    if (meta && meta.source === "local") {
      skippedLocal += 1; // CORTE -> las locales las gestiona updateLocalFromRepo
      continue;
    }
    const source = profile.catalog[skill];
    if (!source) {
      lines.push(tf("skills.dl.no_catalog", `- ${skill}: WARN sin catalogo (usa Context7)`, skill));
      noCatalog += 1;
      continue;
    }
    onProgress?.(`Updating ${skill}...`);
    const result = installFromCatalog(skill, profile);
    lines.push(`- ${skill} -> ${source.repo}#${source.skill}: ${result.ok ? "OK" : "FAIL"} ${result.message}`);
    if (!result.ok) failed += 1;
    else if (result.status === "installed") installedCount += 1;
    else if (result.status === "updated") updatedCount += 1;
    else unchangedCount += 1;
  }

  return [
    tf("skills.dl.reviewed", `- Bajadas revisadas: ${targets.length - skippedLocal}`, targets.length - skippedLocal),
    tf("skills.dl.counts", `- Instaladas: ${installedCount} | Actualizadas: ${updatedCount} | Sin cambios: ${unchangedCount}`, installedCount, updatedCount, unchangedCount),
    tf("skills.dl.fails", `- Sin catalogo: ${noCatalog} | Fallos: ${failed}`, noCatalog, failed),
    "",
    ...lines,
  ];
}

// --- local: skills desde ein-agent -------------------------------------------

function updateLocalFromRepo(onProgress?: (line: string) => void): string[] {
  const lines: string[] = [];
  const tempRoot = join(tmpdir(), `pi-local-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const repoDir = join(tempRoot, "repo");
  mkdirSync(tempRoot, { recursive: true });
  let installedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  try {
    onProgress?.(t("skills.local.cloning", "Clonando ein-agent (skills locales)..."));
    shallowClone(LOCAL_REPO, repoDir, LOCAL_REPO_SKILLS_PATH);
    const remoteLocalDir = join(repoDir, LOCAL_REPO_SKILLS_PATH);
    if (!existsSync(remoteLocalDir)) {
      return [tf("skills.local.notfound", `- Local: FAIL no encuentro ${LOCAL_REPO_SKILLS_PATH} en ${LOCAL_REPO}`, LOCAL_REPO_SKILLS_PATH, LOCAL_REPO)];
    }

    const lock = loadLock();
    for (const entry of readdirSync(remoteLocalDir)) {
      const remoteSkillDir = join(remoteLocalDir, entry);
      if (!statSync(remoteSkillDir).isDirectory()) continue;
      if (!existsSync(join(remoteSkillDir, "SKILL.md"))) continue;

      const key = normalize(entry);
      const destDir = join(LOCAL_SKILLS_DIR, entry);
      const remoteHash = folderHash(remoteSkillDir);
      const hadInstall = existsSync(destDir);
      const currentHash = hadInstall ? folderHash(destDir) : "";

      if (currentHash === remoteHash) {
        unchangedCount += 1;
        continue;
      }
      copySkillFolder(remoteSkillDir, destDir);
      lock.entries[key] = {
        name: key,
        source: { repo: LOCAL_REPO, path: `${LOCAL_REPO_SKILLS_PATH}/${entry}` },
        hash: folderHash(destDir),
        installedAt: new Date().toISOString(),
      };
      if (hadInstall) updatedCount += 1;
      else installedCount += 1;
      lines.push(`- ${key}: ${hadInstall ? t("skills.item.updated", "actualizada") : t("skills.item.installed", "instalada")}`);
    }
    saveLock(lock);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`- Local: FAIL ${reason}`];
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return [
    tf("skills.local.summary", `- Locales (desde ${LOCAL_REPO}@main): instaladas ${installedCount} | actualizadas ${updatedCount} | sin cambios ${unchangedCount}`, LOCAL_REPO, installedCount, updatedCount, unchangedCount),
    ...lines,
  ];
}

// --- reconcile: lock + status ------------------------------------------------

// BLINDAJE -> Re-hashear todo y reescribir el lock garantiza que refleja la
// realidad en disco. Downloaded conserva su fuente del catalogo; local, su
// repo/path.
function reconcileLock(profile: StackProfile): void {
  const installed = listInstalled();
  const lock = loadLock();
  for (const [name, meta] of installed) {
    const hash = folderHash(meta.path);
    const existing = lock.entries[name];
    if (meta.source === "downloaded") {
      const source = profile.catalog[name];
      if (!source) continue; // out-of-catalog extra; leave for status/clean to flag
      lock.entries[name] = { name, source, hash, installedAt: existing?.installedAt ?? new Date().toISOString() };
    } else {
      lock.entries[name] = {
        name,
        source: existing?.source ?? { repo: LOCAL_REPO, path: `${LOCAL_REPO_SKILLS_PATH}/${name}` },
        hash,
        installedAt: existing?.installedAt ?? new Date().toISOString(),
      };
    }
  }
  // Drop lock entries for skills no longer installed.
  for (const name of Object.keys(lock.entries)) {
    if (!installed.has(name)) delete lock.entries[name];
  }
  saveLock(lock);
}

function statusReport(profile: StackProfile): string {
  const installed = listInstalled();
  const allowed = new Set([...profile.core, ...profile.secondary]);
  const coreMissing = profile.core.filter((name) => !installed.has(name));
  const secondaryInstalled = profile.secondary.filter((name) => installed.has(name)).length;
  const extras = [...installed.entries()]
    .filter(([name, meta]) => meta.source === "downloaded" && !allowed.has(name))
    .map(([name]) => name)
    .sort();

  const lock = loadLock();
  const drift: string[] = [];
  for (const [name, meta] of installed) {
    const entry = lock.entries[name];
    if (!entry) {
      drift.push(tf("skills.status.nolock", `${name}: sin lock`, name));
      continue;
    }
    if (folderHash(meta.path) !== entry.hash) drift.push(tf("skills.status.hashchanged", `${name}: hash cambiado`, name));
  }

  const localCount = [...installed.values()].filter((m) => m.source === "local").length;
  const downloadedCount = [...installed.values()].filter((m) => m.source === "downloaded").length;

  const lines = [
    "/// 000. SKILLS",
    tf("skills.status.profile", `- Perfil: ${profile.name} (v${profile.version})`, profile.name, profile.version),
    tf("skills.status.local_installed", `- Locales instaladas: ${localCount}`, localCount),
    tf("skills.status.downloaded_installed", `- Bajadas instaladas: ${downloadedCount}`, downloadedCount),
    tf("skills.status.core", `- Core: ${profile.core.length - coreMissing.length}/${profile.core.length} | Secundarias: ${secondaryInstalled}/${profile.secondary.length}`, profile.core.length - coreMissing.length, profile.core.length, secondaryInstalled, profile.secondary.length),
    tf("skills.status.offstack_count", `- Fuera de stack (downloaded): ${extras.length}`, extras.length),
    "",
  ];
  if (coreMissing.length) lines.push(tf("skills.status.missing_core", `- Faltan core: ${coreMissing.join(", ")}`, coreMissing.join(", ")));
  if (extras.length) lines.push(tf("skills.status.offstack", `- Fuera de stack: ${extras.join(", ")}`, extras.join(", ")));
  if (drift.length) lines.push(tf("skills.status.drift", `- Drift de hash: ${drift.join(" | ")}`, drift.join(" | ")));
  if (!coreMissing.length && !extras.length && !drift.length) {
    lines.push(t("skills.status.ok", "- Estado OK: stack alineado, lock sin drift."));
  }
  lines.push("");
  lines.push(
    tf("skills.status.commands", `- Comandos: ${slashCommand("skills")} update [--local|--downloaded] | add <skill> | clean [--yes]`, slashCommand("skills")),
  );
  lines.push(t("skills.status.context7", "- Lo no listado en el perfil se cubre con Context7 on-demand."));
  return lines.join("\n");
}

function addSkill(rawName: string, profile: StackProfile): string {
  const name = normalize(rawName);
  if (!name) return tf("skills.add.usage", `Uso: ${slashCommand("skills")} add <skill>`, slashCommand("skills"));
  const result = installFromCatalog(name, profile);
  return `/// 000. SKILLS ADD\n- ${result.ok ? "OK" : "FAIL"} ${result.message}`;
}

function cleanSkills(profile: StackProfile, force: boolean): string {
  const installed = listInstalled();
  const allowed = new Set([...profile.core, ...profile.secondary]);
  const candidates = [...installed.entries()]
    .filter(([name, meta]) => meta.source === "downloaded" && !allowed.has(name))
    .map(([name, meta]) => ({ name, path: meta.path }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!candidates.length) return t("skills.clean.nothing", "/// 000. SKILLS CLEAN\n- Nada que limpiar en downloaded/.");
  if (!force) {
    return [
      "/// 000. SKILLS CLEAN",
      tf("skills.clean.count", `- ${candidates.length} skills fuera de stack en downloaded/.`, candidates.length),
      tf("skills.clean.run", `- Ejecuta ${slashCommand("skills")} clean --yes para borrarlas.`, slashCommand("skills")),
      tf("skills.clean.candidates", `- Candidatas: ${candidates.map((c) => c.name).join(", ")}`, candidates.map((c) => c.name).join(", ")),
    ].join("\n");
  }
  const lock = loadLock();
  const removed: string[] = [];
  for (const candidate of candidates) {
    rmSync(candidate.path, { recursive: true, force: true });
    delete lock.entries[candidate.name];
    removed.push(candidate.name);
  }
  saveLock(lock);
  return ["/// 000. SKILLS CLEAN", tf("skills.clean.removed", `- Eliminadas: ${removed.length}`, removed.length), tf("skills.clean.list", `- Lista: ${removed.join(", ")}`, removed.join(", "))].join("\n");
}

// --- comando ------------------------------------------------------------------

export default function einSkillMaintenance(pi: ExtensionAPI): void {
  pi.registerCommand(commandName("skills"), {
    description: t(
      "cmd.skills.description",
      "Gestion de skills: status, update [--local|--downloaded], add, clean",
    ),
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          tf(
            "busy.retry",
            `El agente esta ocupado. Reintenta ${slashCommand("skills")} al terminar.`,
            slashCommand("skills"),
          ),
          "warning",
        );
        return;
      }
      const profile = loadProfile();
      const tokens = (args || "").trim().split(/\s+/).filter(Boolean);
      const action = normalize(tokens[0] || "status");

      if (action === "status") {
        ctx.ui.notify(statusReport(profile), "info");
        return;
      }

      if (action === "update") {
        const onlyLocal = tokens.includes("--local");
        const onlyDownloaded = tokens.includes("--downloaded");
        ctx.ui.notify(t("skills.updating", "/// 000. UPDATING SKILLS\nClonando fuentes, puede tardar..."), "info");
        const out: string[] = ["/// 000. SKILLS UPDATE"];
        if (!onlyDownloaded) out.push(...updateLocalFromRepo((line) => ctx.ui.notify(line, "info")));
        if (!onlyLocal) out.push(...updateDownloaded(profile, (line) => ctx.ui.notify(line, "info")));
        reconcileLock(profile);
        out.push("", "- Lock reconciliado.");
        ctx.ui.notify(out.join("\n"), "info");
        return;
      }

      if (action === "add") {
        ctx.ui.notify(addSkill(tokens[1] || "", profile), "info");
        return;
      }

      if (action === "clean") {
        ctx.ui.notify(cleanSkills(profile, tokens.includes("--yes")), "info");
        return;
      }

      ctx.ui.notify(
        [
          "/// 000. SKILLS",
          tf(
            "skills.usage",
            `- Uso: ${slashCommand("skills")} [status|update [--local|--downloaded]|add <skill>|clean [--yes]]`,
            slashCommand("skills"),
          ),
        ].join("\n"),
        "info",
      );
    },
  });
}
