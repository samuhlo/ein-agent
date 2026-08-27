import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contrato offline del README. Su propósito no ha cambiado: impedir que el
// README afirme cosas sobre release, instalación o arquitectura que las fuentes
// del repositorio contradicen.
//
// Lo que SÍ cambió (2026-08): el README dejó de declarar un número de versión y
// pasó a enlazar `releases/latest`. La versión que no se escribe no se queda
// desfasada, así que aquí se invierte la comprobación: antes se exigía que el
// literal coincidiera; ahora se prohíbe el literal. La coherencia de versión
// entre CHANGELOG, package.json, version.ts y el workflow se sigue verificando,
// que es donde vive de verdad.
//
// También se retiraron las aserciones atadas a nombres de sección concretos
// (`UPDATE_DECK`, `RELEASE`, `SOURCE_OF_TRUTH`): el README se reorganizó al
// mover su contenido extenso a `docs-site/`. Se conservan las que comprueban
// hechos, no maquetación.

const REPO_ROOT = join(import.meta.dir, "..");
const README_PATH = join(REPO_ROOT, "README.md");
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const INSTALLER_PACKAGE_PATH = join(REPO_ROOT, "installer", "package.json");
const INSTALLER_VERSION_PATH = join(REPO_ROOT, "installer", "src", "core", "version.ts");
const RELEASE_WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "installer-release.yml");
const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash";
const REPOSITORY_URL = "https://github.com/samuhlo/ein-agent";
const DOCS_URL = "https://samuhlo.github.io/ein-agent/";

function firstRelease(changelog: string): { version: string; date: string } {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)\] - (\d{4}-\d{2}-\d{2})$/m);
  if (!match) throw new Error("CHANGELOG.md no contiene una primera cabecera de release compatible");
  return { version: match[1], date: match[2] };
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

  test("mantiene un único SemVer coherente entre las fuentes locales", () => {
    const versionMarker = installerVersion.match(/INSTALLER_VERSION\s*=\s*"([^"]+)"/);

    expect(release.version).toBe(installerPackage.version);
    expect(versionMarker?.[1]).toBe(release.version);
    expect(installerPackage).not.toHaveProperty("einDisplayVersion");
    expect(changelog).toContain("`installer-v*`");
    expect(workflow).toContain('"installer-v*"');
  });

  test("el README no fija versiones: enlaza la release vigente", () => {
    // Un literal de versión en el README envejece en silencio. Ya pasó: llegó a
    // declarar v0.40.0 con el instalador en 0.42.0. Prohibirlo es más barato que
    // vigilarlo.
    expect(readme).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(readme).toContain(`${REPOSITORY_URL}/releases/latest`);
    expect(readme).not.toContain("einDisplayVersion");
  });

  test("pone el bootstrap antes de la arquitectura y usa la ruta buena", () => {
    const escaped = INSTALL_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const commandMatches = readme.match(new RegExp(escaped, "g")) ?? [];

    expect(readme).toMatch(/<h1><code>\.\/EIN\.sh<\/code><\/h1>/);
    expect(commandMatches).toHaveLength(1);
    expect(readme).not.toContain("https://raw.githubusercontent.com/samuhlo/ein-agent/main/install.sh");
    for (const choice of ["Pi", "Claude Code", "Both"]) expect(readme).toContain(choice);
    expect(readme.indexOf("## // 00_ QUICK_START")).toBeLessThan(readme.indexOf("## // 04_ BLUEPRINT"));
  });

  test("describe los tres destinos y mantiene aislados los runtimes vanilla", () => {
    for (const value of ["ein-pi", "ein-cc", "~/.pi-ein/agent", "~/.claude-ein", "~/.pi/agent", "~/.claude"]) {
      expect(readme).toContain(value);
    }
  });

  test("declara la cadena SDD y las fuentes arquitectónicas actuales", () => {
    expect(readme).toContain("openspec/changes/<cambio>/");
    for (const phase of ["scope", "map", "design", "tasks", "apply", "verify", "close"]) {
      expect(readme).toContain(phase);
    }
    expect(readme).toContain("`ein-pi/core/` (contenido portable, agnóstico del runtime)");
    expect(readme).toContain("`ein-pi/core/` + `ein-pi/agent/` son la única fuente versionada del workbench");
  });

  test("enlaza la documentación publicada", () => {
    expect(readme).toContain(DOCS_URL);
    // Las páginas que un README de descubrimiento no puede dejar de ofrecer.
    for (const page of ["00-start/getting-started/", "05-debug/known-limitations/"]) {
      expect(readme).toContain(`${DOCS_URL}${page}`);
    }
  });

  test("conserva la firma visual y no cuela marketing", () => {
    expect(readme).toMatch(/^## \/\/ \d{2}_ /m);
    expect(readme).toContain("> _note:");
    expect(readme).toContain("DESIGNED & CODED BY");
    expect(readme).toContain("Lugo, Galicia");
    expect(readme).not.toMatch(/img\.shields\.io|LIVE_DEMO/i);
    expect(readme).not.toMatch(/brew\s+install\s+ein\b/i);
  });

  test("solo usa URLs de dominios propios", () => {
    const urls = readme.match(/https?:\/\/[^)\s"<]+/g) ?? [];

    expect(urls).toEqual(
      expect.arrayContaining([INSTALL_COMMAND.split(" ")[2], `${REPOSITORY_URL}/releases/latest`, DOCS_URL]),
    );
    expect(
      urls.every(
        (url) =>
          url.startsWith("https://github.com/samuhlo") ||
          url.startsWith("https://raw.githubusercontent.com/samuhlo/") ||
          url.startsWith("https://samuhlo.github.io/ein-agent"),
      ),
    ).toBe(true);
  });
});
