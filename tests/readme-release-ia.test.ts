import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const README_PATH = join(REPO_ROOT, "README.md");
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const INSTALLER_PACKAGE_PATH = join(REPO_ROOT, "installer", "package.json");
const INSTALLER_VERSION_PATH = join(REPO_ROOT, "installer", "src", "core", "version.ts");
const INSTALLER_SCRIPT_PATH = join(REPO_ROOT, "installer", "install.sh");
const RELEASE_WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "installer-release.yml");
const INSTALL_COMMAND = "curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash";

function firstRelease(changelog: string): { version: string; date: string; anchor: string } {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/m);
  if (!match) throw new Error("CHANGELOG.md no contiene una primera cabecera de release compatible");

  const [, version, date] = match;
  const heading = `${version} - ${date}`;
  const anchor = heading.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  return { version, date, anchor };
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
  const installerPackage = JSON.parse(readFileSync(INSTALLER_PACKAGE_PATH, "utf8")) as { version: string };
  const installerVersion = readFileSync(INSTALLER_VERSION_PATH, "utf8");
  const installerScript = readFileSync(INSTALLER_SCRIPT_PATH, "utf8");
  const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
  const release = firstRelease(changelog);
  const quickInstall = section(readme, "## // INSTALACIÓN RÁPIDA", "## // 000. MODOS DE TRABAJO");
  const releaseSummary = section(readme, "## // ÚLTIMA RELEASE REGISTRADA", "## // 000. MODOS DE TRABAJO");
  const modelGuide = section(readme, "## // 004. MODELOS", "## // 005. ESTÉTICA DEL OUTPUT");
  const detailedInstallation = section(readme, "## // 010. INSTALACIÓN", "## // 011. COMANDOS `ein`");

  test("alinea versión, fecha y anchor con las fuentes locales canónicas", () => {
    const versionMarker = installerVersion.match(/INSTALLER_VERSION\s*=\s*"([^"]+)"/);

    expect(release.version).toBe(installerPackage.version);
    expect(versionMarker?.[1]).toBe(release.version);
    expect(releaseSummary).toContain(release.version);
    expect(releaseSummary).toContain(release.date);
    expect(releaseSummary).toContain(`CHANGELOG.md#${release.anchor}`);
    expect(release.anchor).toBe("0320---2026-07-31");
    expect(changelog).toContain("`installer-v*`");
    expect(workflow).toContain('"installer-v*"');
  });

  test("describe la release como registrada y no como publicada", () => {
    expect(releaseSummary).toContain("Última release registrada según el registro canónico local");
    expect(releaseSummary).not.toContain("Última release publicada");
  });

  test("mantiene una entrada progresiva con un único bootstrap y destino semántico", () => {
    const beforeConcepts = readme.slice(0, readme.indexOf("## // 000. MODOS DE TRABAJO"));
    const commandMatches = readme.match(new RegExp(INSTALL_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [];

    expect(beforeConcepts).toContain("Ein");
    expect(quickInstall).toContain("```bash");
    expect(quickInstall).toContain(INSTALL_COMMAND);
    expect(commandMatches).toHaveLength(1);
    expect(quickInstall).toContain("[Ver instalación detallada](#instalacion-detallada)");
    expect(readme).toContain('<a id="instalacion-detallada"></a>');
  });

  test("resume exactamente tres hechos de la primera release", () => {
    const bullets = releaseSummary.match(/^[-*] /gm) ?? [];

    expect(bullets).toHaveLength(3);
    expect(releaseSummary).toContain("799 a ~180 líneas");
    expect(releaseSummary).toContain("lección de acceptance");
    expect(releaseSummary).toContain("tool determinista");
    expect(releaseSummary).toContain("git inline");
    expect(releaseSummary).toContain("5 a 3 preguntas");
    expect(releaseSummary).toContain("models-panel");
  });

  test("guía por capacidad: sin presets, con recomendación por rol y decisión humana", () => {
    for (const criterion of ["arquitectura", "ambigüedad", "revisión adversarial", "alto riesgo", "acotado", "bien especificado", "repetitivo", "mecánico"]) {
      expect(modelGuide.toLowerCase()).toContain(criterion);
    }
    expect(modelGuide).toContain("/ein:models");
    // Los presets de modelos se eliminaron: hardcodear nombres se pudre.
    expect(modelGuide).not.toContain("/ein:models:full");
    expect(modelGuide).not.toContain("/ein:models:lite");
    expect(modelGuide).toContain("recomendación por rol");
    expect(modelGuide).toContain("decides tú");
    expect(modelGuide).toContain("no hace fallback automático");
    expect(`${modelGuide}\n${releaseSummary}`).not.toMatch(/gpt-5\.5|MiniMax-M3|MiniMax-M2\.7/);
  });

  test("describe el inicio de la TUI condicionado por plataforma", () => {
    expect(installerScript).toContain('elif [ "$OS" = "linux" ] && [ -e /dev/tty ]; then');
    expect(installerScript).toContain('ok "Listo. Ejecuta ${BOLD}${GOLD}ein${RESET} para empezar."');
    expect(detailedInstallation).toContain("Linux reabre la TUI si hay una terminal disponible; en macOS te pedirá ejecutar `ein` para empezar.");
    expect(detailedInstallation).not.toContain("descarga el binario de la última release y abre la TUI");
  });

  test("no promueve Homebrew y conserva el tag de publicación genérico", () => {
    expect(readme).not.toMatch(/brew\s+install\s+ein\b/i);
    expect(readme).not.toMatch(/Homebrew.{0,120}\bEin\b|\bEin\b.{0,120}Homebrew/i);
    expect(readme).toContain("installer-v<semver>");
    expect(readme).not.toContain("actualiza Pi");
    expect(readme).toContain("OpenSpec sigue siendo canónico");
    expect(readme).toContain("fallos no bloqueantes");
  });
});
