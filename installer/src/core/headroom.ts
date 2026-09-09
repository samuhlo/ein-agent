import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { HEADROOM_RELEASE, HEADROOM_PYTHON, headroomHomeForAgent, inspectManagedHeadroom, maintainHeadroom } from "../../../shared/ports/headroom.ts";
import { lookPath, run } from "./exec.ts";
import type { InstallStep } from "./deps.ts";

export const HEADROOM_INSTALL_NOTICE = "Headroom (opcional, recomendado): reduce el contexto de salidas grandes conservando los datos. Aproximadamente 420 MiB de dependencias, más caché y Python/uv si faltan. Las actualizaciones conservan versiones anteriores para poder volver atrás.";
export type HeadroomInstallFlags = { headroom?: boolean; noHeadroom?: boolean; yes: boolean; dryRun: boolean };
export type HeadroomInstallOptions = {
  interactive?: boolean;
  confirm?: (notice: string) => Promise<boolean>;
  present?: (agentDir: string) => boolean;
  install?: (agentDir: string) => Promise<InstallStep>;
};
export function hasManagedHeadroom(agentDir: string): boolean { return !!inspectManagedHeadroom(headroomHomeForAgent(agentDir)); }

/** Separate optional transaction, disclosed before core installation. V1 core
 * journals retain their meaning; a completed Hypa step never implies Headroom. */
export async function chooseHeadroom(flags: HeadroomInstallFlags, agentDir: string, options: HeadroomInstallOptions = {}): Promise<{ selected: boolean; detail: string }> {
  if (flags.noHeadroom) return { selected: false, detail: "Headroom: omitido por --no-headroom; se conserva cualquier instalación existente." };
  if (flags.headroom) return { selected: true, detail: `${HEADROOM_INSTALL_NOTICE} Se instalará después de verificar el núcleo de Ein.` };
  if ((options.present ?? hasManagedHeadroom)(agentDir)) return { selected: false, detail: "Headroom: instalación gestionada existente; se conserva. El updater comprobará su versión." };
  if (flags.dryRun) return { selected: false, detail: `${HEADROOM_INSTALL_NOTICE} Selección explícita: --headroom; este dry-run no lo instala.` };
  if (flags.yes || !options.interactive || !options.confirm) return { selected: false, detail: "Headroom: opcional no seleccionado; --yes no lo instala. Se puede añadir con --headroom." };
  return { selected: await options.confirm(HEADROOM_INSTALL_NOTICE), detail: HEADROOM_INSTALL_NOTICE };
}

type InstallDependencies = { run?: typeof run; findUv?: () => string | null; maintain?: typeof maintainHeadroom };
export async function installHeadroom(agentDir: string, deps: InstallDependencies = {}): Promise<InstallStep> {
  const home = headroomHomeForAgent(agentDir), tools = join(home, "tools");
  const execute = deps.run ?? run;
  try {
    const uv = (deps.findUv ?? (() => lookPath("uv", [tools])))();
    if (!uv) {
      mkdirSync(home, { recursive: true });
      const bootstrap = mkdtempSync(join(home, "uv-bootstrap-")), script = join(bootstrap, "install.sh");
      try {
        const download = await execute("curl", ["--fail", "--location", "--silent", "--show-error", "https://astral.sh/uv/0.12.1/install.sh", "--output", script], { timeoutMs: 60_000 });
        if (!download.ok) return { ok: false, detail: "Headroom: no se pudo preparar uv; el núcleo de Ein está instalado." };
        const install = await execute("sh", [script], { env: { UV_UNMANAGED_INSTALL: tools, UV_NO_MODIFY_PATH: "1" }, timeoutMs: 120_000 });
        if (!install.ok || !existsSync(join(tools, "uv"))) return { ok: false, detail: "Headroom: falló la instalación privada de uv; no se cambiaron perfiles de shell." };
      } finally { rmSync(bootstrap, { recursive: true, force: true }); }
    }
    const environment = { ...process.env, EIN_PI_AGENT_HOME: agentDir, PI_CODING_AGENT_DIR: agentDir, EIN_HEADROOM_SERVICE_DIR: home };
    const detail = await (deps.maintain ?? maintainHeadroom)("update", HEADROOM_RELEASE, environment);
    return { ok: true, detail: `Headroom ${HEADROOM_RELEASE} comprobado (Python ${HEADROOM_PYTHON}). ${detail}` };
  } catch (error) {
    return { ok: false, detail: `Headroom no instalado/actualizado; Ein sigue disponible. ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function refreshHeadroom(agentDir: string, deps: InstallDependencies = {}): Promise<InstallStep> {
  const installed = inspectManagedHeadroom(headroomHomeForAgent(agentDir));
  if (!installed) return { ok: true, detail: "Headroom no gestionado: no se instala durante update." };
  // User-selected newer/prerelease versions must never be downgraded by Ein.
  if (!/^\d+\.\d+\.\d+$/.test(installed.version)) return { ok: true, detail: `Headroom ${installed.version}: se conserva la versión personalizada.` };
  const current = installed.version.split(".").map(Number), target = HEADROOM_RELEASE.split(".").map(Number);
  const difference = current.map((n, index) => n - target[index]!).find((n) => n !== 0) ?? 0;
  if (difference > 0) return { ok: true, detail: `Headroom ${installed.version}: más reciente que la versión probada por Ein; no se rebaja.` };
  return installHeadroom(agentDir, deps);
}
