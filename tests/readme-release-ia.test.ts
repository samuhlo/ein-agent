import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const README_PATH = join(REPO_ROOT, "README.md");
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const INSTALLER_PACKAGE_PATH = join(REPO_ROOT, "installer", "package.json");
const INSTALLER_VERSION_PATH = join(REPO_ROOT, "installer", "src", "core", "version.ts");
const RELEASE_WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "installer-release.yml");
const INSTALL_COMMAND = "curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash";
const REPOSITORY_URL = "https://github.com/samuhlo/ein-agent";

function firstRelease(changelog: string): { version: string; date: string; anchor: string } {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/m);
  if (!match) throw new Error("CHANGELOG.md no contiene una primera cabecera de release compatible");

  const [, version, date] = match;
  const heading = `${version} - ${date}`;
  const anchor = heading.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  return { version, date, anchor };
}

function readmeReleaseVersion(readme: string): string {
  const match = readme.match(/\[EIN v(\d+\.\d+\.\d+)\]\(https:\/\/github\.com\/samuhlo\/ein-agent\/releases\/tag\/installer-v\1\)/);
  if (!match) throw new Error("README.md no contiene una release enlazada compatible");
  return match[1];
}

function section(readme: string, heading: string, nextHeading: string): string {
  const start = readme.indexOf(heading);
  const end = readme.indexOf(nextHeading, start);
  if (start === -1 || end === -1) throw new Error(`No se pudo delimitar ${heading}`);
  return readme.slice(start, end);
}

describe("contrato offline del README para release e instalación", () => {
  const readme = readFileSync(README_PATH, "utf8");
  const changelog = readFileSync(CHANGELOG_PATH, "utf8");
  const installerPackage = JSON.parse(readFileSync(INSTALLER_PACKAGE_PATH, "utf8")) as {
    version: string;
    [key: string]: unknown;
  };
  const installerVersion = readFileSync(INSTALLER_VERSION_PATH, "utf8");
  const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
  const release = firstRelease(changelog);
  const readmeVersion = readmeReleaseVersion(readme);
  const quickStart = section(readme, "## // 00_ QUICK_START", "## // 01_ RUNTIME_SURFACE");
  const runtimeSurface = section(readme, "## // 01_ RUNTIME_SURFACE", "## // 02_ UPDATE_DECK");
  const updateDeck = section(readme, "## // 02_ UPDATE_DECK", "## // 03_ SDD_ENGINE");
  const sddEngine = section(readme, "## // 03_ SDD_ENGINE", "## // 04_ BLUEPRINT");
  const blueprint = section(readme, "## // 04_ BLUEPRINT", "## // 05_ COMMAND_DECK");
  const releaseGuide = section(readme, "## // 06_ RELEASE", "## // 07_ SOURCE_OF_TRUTH");

  test("alinea la release unificada y el SemVer único con las fuentes locales", () => {
    const versionMarker = installerVersion.match(/INSTALLER_VERSION\s*=\s*"([^"]+)"/);

    expect(release.version).toBe("0.42.0");
    expect(release.version).toBe(installerPackage.version);
    expect(versionMarker?.[1]).toBe(release.version);
    expect(installerPackage).not.toHaveProperty("einDisplayVersion");
    expect(readme).not.toContain("einDisplayVersion");
    expect(readme).not.toMatch(/versi[oó]n (?:pública|visible|técnica|del instalador)/i);
    expect(readme).not.toContain("dos nombres de la misma publicación");
    expect(readme).toContain(`EIN v${readmeVersion}`);
    expect(readme).toContain(`installer-v${readmeVersion}`);
    expect(readme).toContain(`${REPOSITORY_URL}/releases/tag/installer-v${readmeVersion}`);
    expect(readme).not.toContain("0.34.0");
    expect(readme).not.toContain("0.33.1");
    expect(release.anchor).toBe("0420---2026-08-05");
    expect(changelog).toContain("`installer-v*`");
    expect(changelog).toContain("Superseded for Claude installs");
    expect(changelog).toContain("materialización BunFS");
    expect(workflow).toContain('"installer-v*"');
  });

  test("pone el bootstrap y el selector de runtime antes de la arquitectura", () => {
    const commandMatches = readme.match(new RegExp(INSTALL_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [];

    expect(readme).toMatch(/<h1><code>\.\/EIN\.sh<\/code><\/h1>/);
    expect(quickStart).toContain("```bash");
    expect(quickStart).toContain(INSTALL_COMMAND);
    expect(commandMatches).toHaveLength(1);
    expect(readme).not.toContain("https://raw.githubusercontent.com/samuhlo/ein-agent/main/install.sh");
    for (const choice of ["Pi", "Claude Code", "Both"]) expect(quickStart).toContain(choice);
    expect(readme.indexOf("## // 00_ QUICK_START")).toBeLessThan(readme.indexOf("## // 04_ BLUEPRINT"));
  });

  test("describe los tres destinos y mantiene aislados los runtimes vanilla", () => {
    for (const value of [
      "pi-ein",
      "cc-ein",
      "~/.pi-ein/agent",
      "~/.claude-ein",
      "~/.pi/agent",
      "~/.claude",
      "PI_CODING_AGENT_DIR",
      "EIN_PI_AGENT_HOME",
      "CLAUDE_CONFIG_DIR",
      "~/.config/fish/functions/",
      "bun pi-ein/migrate.ts --dry",
      "backup `.tar.gz`",
    ]) {
      expect(runtimeSurface).toContain(value);
    }
  });

  test("mantiene separados los comandos de actualización verificados", () => {
    expect(updateDeck).toContain("pi-ein update --all");
    expect(updateDeck).toContain("ein update");
    expect(updateDeck).toContain("bun cc-ein/sync.ts");
    expect(updateDeck).toContain("backup y rollback");
  });

  test("explica SDD, OpenSpec, subagentes y las fuentes arquitectónicas actuales", () => {
    for (const value of [
      "openspec/changes/<cambio>/",
      "sdd-scope",
      "sdd-map",
      "sdd-design",
      "sdd-tasks",
      "sdd-apply",
      "sdd-verify",
      "sdd-close",
      "subagentes",
      "OpenSpec es el registro completo y canónico",
    ]) {
      expect(sddEngine).toContain(value);
    }
    expect(blueprint).toContain("LAYER | TECH | IMPLEMENTATION DETAIL");
    expect(blueprint).toContain("`ein-pi/core/` (contenido portable, agnóstico del runtime)");
    expect(blueprint).toContain("`ein-pi/core/` + `ein-pi/agent/` son la única fuente versionada del workbench");
  });

  test("conserva la firma visual y la ruta de publicación por GitHub Actions", () => {
    expect(readme).toMatch(/^## \/\/ \d{2}_ /m);
    expect(readme).toContain("> _note:");
    expect(readme).toContain("| LAYER | TECH | IMPLEMENTATION DETAIL |");
    expect(readme).toContain("DESIGNED & CODED BY");
    expect(readme).toContain("Lugo, Galicia");
    expect(releaseGuide).toContain("installer-v<semver>");
    expect(releaseGuide).toContain(".github/workflows/installer-release.yml");
    expect(releaseGuide).toContain("GitHub Actions");
    expect(readme).not.toMatch(/img\.shields\.io|LIVE_DEMO/i);
    expect(readme).not.toMatch(/brew\s+install\s+ein\b/i);
  });

  test("solo usa URLs resueltas del repositorio, bootstrap y release", () => {
    const urls = readme.match(/https?:\/\/[^)\s"<]+/g) ?? [];
    expect(urls).toEqual(expect.arrayContaining([
      INSTALL_COMMAND.split(" ")[2],
      REPOSITORY_URL,
      `${REPOSITORY_URL}/releases/tag/installer-v${readmeVersion}`,
    ]));
    expect(urls.every((url) => url.startsWith("https://github.com/samuhlo") || url.startsWith("https://raw.githubusercontent.com/samuhlo/"))).toBe(true);
  });
});
